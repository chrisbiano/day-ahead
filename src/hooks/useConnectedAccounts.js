import { useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

/* Connected mailboxes (metadata only — tokens live server-side and are
   unreadable from the browser by design). */
export default function useConnectedAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    const { data, error } = await supabase
      .from('connected_accounts')
      .select('id, email, provider, status, purpose, signature, display_name, created_at')
      .order('created_at', { ascending: true })
    if (error) console.error('Load connected accounts failed:', error)
    setAccounts(data || [])
    setLoading(false)
  }, [])

  /* What this mailbox is for, in Chris's words — handed to Claude as context
     when it triages. Optimistic, and rolled back on failure: a purpose you
     think you saved but didn't would quietly skew every verdict afterward. */
  const setPurpose = useCallback(async (id, purpose) => {
    const previous = accounts
    const clean = purpose.trim() || null
    setAccounts(prev => prev.map(a => (a.id === id ? { ...a, purpose: clean } : a)))
    const { error } = await supabase
      .from('connected_accounts')
      .update({ purpose: clean })
      .eq('id', id)
    if (error) {
      console.error('Saving mailbox purpose failed:', error)
      setAccounts(previous)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  }, [accounts])

  /* The signature and sender name that go out on replies from this mailbox.
     Stored here rather than read from Gmail so Day Ahead doesn't have to hold
     the restricted gmail.settings.basic scope — see lib/connect.js. Optimistic
     with rollback, same as purpose: believing you saved a signature you didn't
     means every reply afterwards goes out bare. */
  const setSignature = useCallback(async (id, { signature, displayName }) => {
    const previous = accounts
    const patch = {
      signature: (signature ?? '').trim() || null,
      display_name: (displayName ?? '').trim() || null,
    }
    setAccounts(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)))
    const { error } = await supabase
      .from('connected_accounts')
      .update(patch)
      .eq('id', id)
    if (error) {
      console.error('Saving signature failed:', error)
      setAccounts(previous)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  }, [accounts])

  useEffect(() => { refresh() }, [refresh])

  // Deleting the account cascades to its tokens (ON DELETE CASCADE).
  const disconnect = useCallback(async (id) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
    const { error } = await supabase.from('connected_accounts').delete().eq('id', id)
    if (error) {
      console.error('Disconnect failed:', error)
      refresh()
    }
  }, [refresh])

  return { accounts, loading, refresh, disconnect, setPurpose, setSignature }
}
