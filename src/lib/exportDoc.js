/* Turn a Day Ahead export into something a person can actually read.
 *
 * The first version handed over raw JSON. That satisfies a portability
 * requirement and helps almost nobody: the reason someone downloads their data
 * before deleting an account is to KEEP it — to read the checklist from a shoot
 * eighteen months ago, or hand a client the notes from a job. A file you have to
 * parse to use isn't a copy of your work, it's a receipt for it.
 *
 * So the default export is a self-contained HTML document: opens in any browser,
 * prints to PDF, needs nothing installed and no internet. JSON stays available
 * for anyone who genuinely wants to move the data into another tool.
 */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function prettyDate(iso) {
  if (!iso) return 'No date'
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// A subtask is "live" unless it was deleted outright. Carried-over ones are
// marked rather than hidden — a checklist that silently loses items would
// misrepresent what the day actually held.
const liveSubs = (subs) => (Array.isArray(subs) ? subs.filter(s => !s?.deletedAt || s?.leftover) : [])

function renderSubtasks(subs) {
  const live = liveSubs(subs)
  if (live.length === 0) return ''
  return `<ul class="subs">${live.map(s => `
      <li class="${s.done ? 'done' : ''}">
        <span class="box">${s.done ? '✓' : ''}</span>${esc(s.title)}${
          s.leftover ? ' <em class="tag">carried over</em>' : ''
        }</li>`).join('')}</ul>`
}

function renderTasks(tasks) {
  const live = tasks.filter(t => !t.deleted_at)
  if (live.length === 0) return '<p class="empty">No tasks.</p>'

  const byDate = new Map()
  for (const t of live) {
    const k = t.date || ''
    if (!byDate.has(k)) byDate.set(k, [])
    byDate.get(k).push(t)
  }
  // Newest first — the recent past is what people actually look for.
  const keys = [...byDate.keys()].sort((a, b) => String(b).localeCompare(String(a)))

  return keys.map(k => {
    const rows = byDate.get(k).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
    return `
    <section class="day">
      <h3>${esc(prettyDate(k))}</h3>
      ${rows.map(t => `
        <div class="task ${t.completed ? 'done' : ''}">
          <p class="title">
            <span class="box">${t.completed ? '✓' : ''}</span>
            ${esc(t.title)}
            ${t.is_urgent ? '<em class="tag urgent">urgent</em>' : ''}
          </p>
          ${(t.time || t.duration) ? `<p class="meta">${esc(t.time || '')}${
            t.duration ? ` · ${t.duration} min` : ''
          }${t.recurrence ? ` · repeats ${esc(t.recurrence)}` : ''}</p>` : ''}
          ${renderSubtasks(t.subtasks)}
        </div>`).join('')}
    </section>`
  }).join('')
}

function renderNotes(notes) {
  const withContent = notes.filter(n => liveSubs(n.subtasks).length > 0 || n.done)
  if (withContent.length === 0) return '<p class="empty">No calendar checklists.</p>'
  const sorted = [...withContent].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return sorted.map(n => `
    <div class="task ${n.done ? 'done' : ''}">
      <p class="title">
        <span class="box">${n.done ? '✓' : ''}</span>
        ${esc(n.title || 'Calendar block')}
      </p>
      <p class="meta">${esc(prettyDate(n.date))}${n.time ? ` · ${esc(n.time)}` : ''}</p>
      ${renderSubtasks(n.subtasks)}
    </div>`).join('')
}

function renderMailboxes(accounts) {
  if (accounts.length === 0) return '<p class="empty">No connected mailboxes.</p>'
  return accounts.map(a => `
    <div class="task">
      <p class="title">${esc(a.email)}</p>
      ${a.purpose ? `<p class="meta">What it's for: ${esc(a.purpose)}</p>` : ''}
      ${a.display_name ? `<p class="meta">Sends as: ${esc(a.display_name)}</p>` : ''}
      ${a.signature ? `<div class="sig">${a.signature}</div>` : ''}
    </div>`).join('')
}

export function buildExportHtml(payload) {
  const {
    account, exportedAt,
    tasks = [], event_notes = [], connected_accounts = [],
    task_templates = [], user_prefs = [],
  } = payload

  const when = new Date(exportedAt || Date.now()).toLocaleString(undefined, {
    dateStyle: 'long', timeStyle: 'short',
  })
  const liveTasks = tasks.filter(t => !t.deleted_at)
  const doneCount = liveTasks.filter(t => t.completed).length
  const prefs = user_prefs[0] || null

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Day Ahead export${account ? ` · ${esc(account)}` : ''}</title>
<style>
  :root { --ink:#1A1A1C; --muted:#5A5956; --faint:#8B8A85; --line:#E4E2DC; --accent:#8A6A12; }
  * { box-sizing:border-box; }
  body { margin:0; background:#fff; color:var(--ink); line-height:1.6;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; }
  .wrap { max-width:46rem; margin:0 auto; padding:3rem 1.5rem 4rem; }
  h1 { font-family:Georgia,'Times New Roman',serif; font-weight:normal; font-size:2rem; margin:0 0 .3rem; }
  h2 { font-family:Georgia,'Times New Roman',serif; font-weight:normal; font-size:1.4rem;
       margin:2.5rem 0 .75rem; padding-bottom:.4rem; border-bottom:1px solid var(--line); }
  h3 { font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--faint);
       margin:1.6rem 0 .5rem; font-weight:600; }
  .sub { color:var(--muted); margin:0 0 .2rem; }
  .stats { color:var(--faint); font-size:.85rem; margin:.6rem 0 0; }
  .task { padding:.5rem 0; border-bottom:1px solid #F3F2EE; }
  .task:last-child { border-bottom:0; }
  .title { margin:0; font-weight:500; }
  .task.done .title { color:var(--muted); text-decoration:line-through; }
  .meta { margin:.15rem 0 0 1.5rem; color:var(--faint); font-size:.85rem; }
  .box { display:inline-block; width:1.05rem; height:1.05rem; border:1px solid #C9C7C0;
         border-radius:3px; margin-right:.45rem; text-align:center; line-height:1rem;
         font-size:.75rem; color:var(--accent); vertical-align:-2px; }
  .subs { list-style:none; margin:.35rem 0 0 1.5rem; padding:0; }
  .subs li { color:var(--muted); font-size:.92rem; margin:.15rem 0; }
  .subs li.done { text-decoration:line-through; color:var(--faint); }
  .tag { font-style:normal; font-size:.7rem; text-transform:uppercase; letter-spacing:.06em;
         color:var(--faint); border:1px solid var(--line); border-radius:3px; padding:0 .3rem; margin-left:.3rem; }
  .tag.urgent { color:#A2412F; border-color:#E8CFC8; }
  .sig { margin:.5rem 0 0 1.5rem; padding:.6rem .8rem; border-left:2px solid var(--line); }
  .sig img { max-width:100%; height:auto; }
  .empty { color:var(--faint); font-style:italic; }
  footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--line);
           color:var(--faint); font-size:.8rem; }
  @media print {
    body { font-size:11pt; }
    .wrap { padding:0; max-width:none; }
    h2 { break-after:avoid; }
    .task, .day { break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>Day Ahead</h1>
  <p class="sub">${account ? esc(account) : 'Your data'}</p>
  <p class="stats">Exported ${esc(when)} · ${liveTasks.length} task${liveTasks.length === 1 ? '' : 's'}${
    liveTasks.length ? ` (${doneCount} completed)` : ''
  } · ${connected_accounts.length} mailbox${connected_accounts.length === 1 ? '' : 'es'}</p>

  <h2>Tasks</h2>
  ${renderTasks(tasks)}

  <h2>Calendar checklists</h2>
  ${renderNotes(event_notes)}

  <h2>Mailboxes</h2>
  ${renderMailboxes(connected_accounts)}

  ${task_templates.length ? `<h2>Templates</h2>${task_templates.map(t => `
    <div class="task"><p class="title">${esc(t.title)}</p>${renderSubtasks(t.subtasks)}</div>`).join('')}` : ''}

  ${prefs ? `<h2>Preferences</h2>
  <div class="task">
    <p class="meta" style="margin-left:0">
      Daily brief: ${prefs.morning_brief ? 'on' : 'off'}${prefs.brief_time ? ` at ${esc(prefs.brief_time)}` : ''}${
        prefs.timezone ? ` · ${esc(prefs.timezone)}` : ''
      }
    </p>
  </div>` : ''}

  <footer>
    This file is yours to keep — it needs no internet and no account.
    Google access tokens are deliberately excluded: they are credentials rather than
    your content, and they stop working the moment the account is deleted.
  </footer>
</div>
</body>
</html>`
}
