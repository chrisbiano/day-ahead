import WidgetKit
import SwiftUI

/*
 Day Ahead's home-screen widgets.

 The widget process cannot reach Supabase, cannot see the user's session, and
 cannot read anything the WebView stored. It renders whatever the app last wrote
 into the shared App Group container — see WidgetBridgePlugin.swift and
 src/lib/widgetSnapshot.js, which decides the content.

 Everything shown here is therefore already formatted: times are strings, the
 ordering is settled, the list is trimmed. That keeps the two surfaces from
 drifting apart, and means changing WHAT the widget says is a web deploy —
 only changing how it LOOKS needs Xcode.
 */

// MARK: - The snapshot the app hands over

struct DayItem: Codable, Hashable {
    let title: String
    let time: String
    let kind: String          // "task" | "event"
    let subtaskTotal: Int
    let subtaskDone: Int
}

struct DaySnapshot: Codable {
    let date: String
    let updatedAt: String
    let items: [DayItem]
    let total: Int
    // Optional so an older snapshot written before these existed still decodes
    // rather than failing outright and blanking the widget.
    let timedTotal: Int?
    let anytimeTotal: Int?
    let needsReply: Int?

    var timed: [DayItem] { items.filter { $0.kind != "anytime" } }
    var anytime: [DayItem] { items.filter { $0.kind == "anytime" } }

    static let empty = DaySnapshot(date: "", updatedAt: "", items: [], total: 0,
                                   timedTotal: 0, anytimeTotal: 0, needsReply: 0)

    static func load() -> DaySnapshot {
        guard
            let store = UserDefaults(suiteName: "group.app.dayahead"),
            let json = store.string(forKey: "todaySnapshot"),
            let data = json.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(DaySnapshot.self, from: data)
        else { return .empty }
        return decoded
    }

    /// Sample content for the widget gallery, where a real snapshot doesn't
    /// exist yet. Showing an empty box in the picker makes the widget look
    /// broken before it has ever been added.
    static let preview = DaySnapshot(
        date: "", updatedAt: "",
        items: [
            DayItem(title: "Lost Saints", time: "10:30 AM", kind: "task", subtaskTotal: 3, subtaskDone: 1),
            DayItem(title: "Client Work", time: "1:00 PM", kind: "task", subtaskTotal: 2, subtaskDone: 0),
            DayItem(title: "Rosie pickup", time: "4:30 PM", kind: "event", subtaskTotal: 0, subtaskDone: 0),
            DayItem(title: "Call the venue back", time: "", kind: "anytime", subtaskTotal: 0, subtaskDone: 0)
        ],
        total: 4, timedTotal: 3, anytimeTotal: 1, needsReply: 3
    )
}

// MARK: - Timeline

struct Entry: TimelineEntry {
    let date: Date
    let snapshot: DaySnapshot
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        // The gallery preview gets sample content; a real placement gets real data.
        completion(Entry(date: Date(), snapshot: context.isPreview ? .preview : DaySnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        /* Re-render on the half hour rather than once a day.
           "Next up" is only correct until the next thing starts, and the app may
           not be opened in between — so the widget has to move on by itself.
           The app also pushes a reload whenever the day changes; this is the
           floor under that, for the hours nobody opens anything. */
        let now = Date()
        var entries: [Entry] = []
        let snapshot = DaySnapshot.load()
        for half in 0..<8 {
            if let t = Calendar.current.date(byAdding: .minute, value: half * 30, to: now) {
                entries.append(Entry(date: t, snapshot: snapshot))
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - Look

private let ground = Color(red: 0.043, green: 0.043, blue: 0.047)   // #0B0B0C
private let accent = Color(red: 0.961, green: 0.784, blue: 0.471)   // #F5C878
private let faint  = Color(white: 0.62)

/// The next thing that hasn't started, else the first thing of the day.
private func nextUp(_ s: DaySnapshot) -> DayItem? { s.items.first }

struct NextUpView: View {
    let entry: Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("NEXT UP")
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.8)
                .foregroundColor(faint)

            if let item = nextUp(entry.snapshot) {
                if !item.time.isEmpty {
                    Text(item.time)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(accent)
                }
                Text(item.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                if item.subtaskTotal > 0 {
                    Text("\(item.subtaskDone)/\(item.subtaskTotal) done")
                        .font(.system(size: 11))
                        .foregroundColor(faint)
                }
            } else {
                Text("Nothing scheduled")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(faint)
            }

            Spacer(minLength: 0)

            if entry.snapshot.total > 1 {
                Text("\(entry.snapshot.total) today")
                    .font(.system(size: 10))
                    .foregroundColor(faint)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/* The medium widget answers "what is my day", not "what is next".
 *
 * The schedule owns the body; the two counts that are not schedule — loose
 * tasks and unanswered mail — sit side by side along the bottom in stroked
 * capsules, the same outline the app uses on its cards. That keeps the timed
 * rows reading as one list instead of trailing off into things that have no
 * time, and buys room for a fourth row.
 *
 * Counts rather than titles down there on purpose: at half width an
 * auto-generated title like "Reply: Manychat — Brutally honest advice…"
 * truncates to noise, and the number is the part you act on.
 */
struct TimelineView: View {
    let entry: Entry

    private var timed: [DayItem] { Array(entry.snapshot.timed.prefix(4)) }
    private var openCount: Int { entry.snapshot.anytimeTotal ?? entry.snapshot.anytime.count }
    private var replies: Int { entry.snapshot.needsReply ?? 0 }

    private func capsuleRow(_ icon: String, _ text: String, _ tint: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .foregroundColor(tint)
            Text(text)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(tint.opacity(0.35), lineWidth: 1)
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("TODAY")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(0.8)
                    .foregroundColor(faint)
                Spacer()
                if entry.snapshot.total > 0 {
                    Text("\(entry.snapshot.total)")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(faint)
                }
            }

            if timed.isEmpty {
                Spacer(minLength: 0)
                Text(entry.snapshot.total == 0 && replies == 0
                     ? "Nothing left today"
                     : "Nothing at a set time")
                    .font(.system(size: 13))
                    .foregroundColor(faint)
                Spacer(minLength: 0)
            } else {
                ForEach(timed, id: \.self) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.time)
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundColor(accent)
                            .frame(width: 58, alignment: .leading)
                        Text(item.title)
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if item.subtaskTotal > 0 {
                            Text("\(item.subtaskDone)/\(item.subtaskTotal)")
                                .font(.system(size: 10))
                                .foregroundColor(faint)
                        }
                    }
                }
                Spacer(minLength: 0)
            }

            // The two things that aren't the schedule, side by side.
            if replies > 0 || openCount > 0 {
                HStack(spacing: 8) {
                    if replies > 0 {
                        capsuleRow("envelope.fill",
                                   "\(replies) need\(replies == 1 ? "s" : "") a reply",
                                   accent)
                    }
                    if openCount > 0 {
                        capsuleRow("circle.dashed",
                                   "\(openCount) open task\(openCount == 1 ? "" : "s")",
                                   Color(white: 0.72))
                    }
                }
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Widgets

/// containerBackground is required from iOS 17; without it a widget renders
/// with no background at all on modern systems.
private extension View {
    @ViewBuilder func dayAheadBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(ground, for: .widget)
        } else {
            ZStack { ground; self }
        }
    }
}

struct NextUpWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DayAheadNextUp", provider: Provider()) { entry in
            NextUpView(entry: entry).dayAheadBackground()
        }
        .configurationDisplayName("Next up")
        .description("The next thing on your day.")
        .supportedFamilies([.systemSmall])
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DayAheadToday", provider: Provider()) { entry in
            TimelineView(entry: entry).dayAheadBackground()
        }
        .configurationDisplayName("Today")
        .description("Your schedule at a glance.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct DayAheadWidgets: WidgetBundle {
    var body: some Widget {
        NextUpWidget()
        TodayWidget()
    }
}
