/**
 * Checks the database behaviour the sync engine relies on (local stack).
 *  - updated_at is set by the server, also on insert;
 *  - the keyset page filter used by pulls is valid PostgREST and returns
 *    exactly the rows after the last one seen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.SUPABASE_URL
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const password = 'Daynest-test-123'
let user

beforeAll(async () => {
  const email = `sync-${randomUUID().slice(0, 8)}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const db = createClient(URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: e2 } = await db.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  user = { id: data.user.id, db }
})

afterAll(async () => {
  if (user) await admin.auth.admin.deleteUser(user.id)
})

describe('sync queries', () => {
  it('ignores a device clock on insert: updated_at comes from the server', async () => {
    const future = '2099-01-01T00:00:00Z'
    const { data, error } = await user.db
      .from('tasks')
      .insert({ id: randomUUID(), title: 'Clock test', updated_at: future })
      .select('updated_at')
      .single()
    expect(error).toBeNull()
    expect(Date.parse(data.updated_at)).toBeLessThan(Date.parse('2090-01-01'))
  })

  it('pages with the keyset filter without skipping or repeating rows', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: randomUUID(), title: `Page ${i}` }))
    const { error } = await user.db.from('tasks').insert(rows)
    expect(error).toBeNull()

    const seen = []
    let after = null
    for (let guard = 0; guard < 20; guard++) {
      let q = user.db.from('tasks').select('id,updated_at').order('updated_at').order('id').limit(3)
      if (after) q = q.or(`updated_at.gt."${after.t}",and(updated_at.eq."${after.t}",id.gt.${after.id})`)
      const { data, error: e } = await q
      expect(e).toBeNull()
      seen.push(...data.map((r) => r.id))
      if (data.length < 3) break
      const last = data[data.length - 1]
      after = { t: last.updated_at, id: last.id }
    }
    const { count } = await user.db.from('tasks').select('id', { count: 'exact', head: true })
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen.length).toBe(count)
  })
})
