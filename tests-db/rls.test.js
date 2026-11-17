/**
 * Database security tests against a real Supabase (local stack).
 * Run with: npm run test:db   (starts nothing; needs `npx supabase start`).
 *
 * Creates two users and proves Row Level Security keeps them apart:
 * reads, updates, deletes, forged ownership, cross-user foreign keys,
 * ownership changes, anonymous access and storage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY // test-only: creates/deletes the test users

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const client = () => createClient(URL, ANON, { auth: { persistSession: false } })

const password = 'Daynest-test-123'
let A
let B

async function makeUser(label) {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `User ${label}` },
  })
  if (error) throw error
  const db = client()
  const { error: e2 } = await db.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  return { id: data.user.id, db }
}

let aList
let aCategory
let aTask
let aHabit

beforeAll(async () => {
  A = await makeUser('a')
  B = await makeUser('b')
  const { data: lists } = await A.db.from('lists').select('id').limit(1)
  const { data: cats } = await A.db.from('categories').select('id').limit(1)
  aList = lists[0].id
  aCategory = cats[0].id
  const { data: t, error } = await A.db
    .from('tasks')
    .insert({ title: 'A private task', list_id: aList, category_id: aCategory, start_date: '2026-11-20', start_time: '09:00' })
    .select('id')
    .single()
  if (error) throw error
  aTask = t.id
  const { data: h, error: he } = await A.db.from('habits').insert({ name: 'A habit' }).select('id').single()
  if (he) throw he
  aHabit = h.id
})

afterAll(async () => {
  if (A) await admin.auth.admin.deleteUser(A.id)
  if (B) await admin.auth.admin.deleteUser(B.id)
})

describe('new accounts', () => {
  it('get a profile, settings and starter calendars/lists from the signup trigger', async () => {
    const { data: p } = await A.db.from('profiles').select('full_name').single()
    expect(p?.full_name).toBe('User a')
    const { data: s } = await A.db.from('user_settings').select('theme,week_start').single()
    expect(s).toMatchObject({ theme: 'system', week_start: 0 })
    const { count: c } = await A.db.from('categories').select('*', { count: 'exact', head: true })
    const { count: l } = await A.db.from('lists').select('*', { count: 'exact', head: true })
    expect([c, l]).toEqual([5, 5])
  })
})

describe('isolation between users', () => {
  it('B cannot read A’s tasks, lists, calendars, habits, profile or settings', async () => {
    for (const table of ['tasks', 'lists', 'categories', 'habits', 'profiles', 'user_settings']) {
      const { data, error } = await B.db.from(table).select('*')
      expect(error).toBeNull()
      const ids = (data ?? []).map((r) => r.user_id ?? r.id)
      expect(ids, table).not.toContain(A.id)
    }
    const { data } = await B.db.from('tasks').select('id').eq('id', aTask)
    expect(data).toEqual([])
  })

  it('B cannot update or delete A’s task', async () => {
    const upd = await B.db.from('tasks').update({ title: 'hacked' }).eq('id', aTask).select('id')
    expect(upd.data).toEqual([])
    const del = await B.db.from('tasks').delete().eq('id', aTask).select('id')
    expect(del.data).toEqual([])
    const { data } = await A.db.from('tasks').select('title').eq('id', aTask).single()
    expect(data?.title).toBe('A private task')
  })

  it('B cannot create rows owned by A', async () => {
    const { error } = await B.db.from('tasks').insert({ user_id: A.id, title: 'forged' })
    expect(error?.code).toBe('42501') // RLS violation
  })

  it('B cannot attach a task to A’s list or calendar', async () => {
    const r1 = await B.db.from('tasks').insert({ title: 'sneaky', list_id: aList })
    expect(r1.error?.code).toBe('23503') // composite FK (list_id, user_id)
    const r2 = await B.db.from('tasks').insert({ title: 'sneaky', category_id: aCategory })
    expect(r2.error?.code).toBe('23503')
  })

  it('B cannot log A’s habit or set reminders on A’s task', async () => {
    const r1 = await B.db.from('habit_logs').insert({ habit_id: aHabit, completed_date: '2026-11-17' })
    expect(r1.error).not.toBeNull()
    const r2 = await B.db.from('reminders').insert({ task_id: aTask, reminder_time: new Date().toISOString() })
    expect(r2.error).not.toBeNull()
  })

  it('owners cannot hand a row to someone else', async () => {
    const { error } = await A.db.from('tasks').update({ user_id: B.id }).eq('id', aTask)
    expect(error).not.toBeNull()
    const { data } = await A.db.from('tasks').select('id').eq('id', aTask)
    expect(data).toHaveLength(1)
  })

  it('signed-out visitors cannot read any table', async () => {
    const anon = client()
    for (const table of ['tasks', 'lists', 'categories', 'profiles', 'user_settings', 'habits', 'events', 'reminders']) {
      const { data, error } = await anon.from(table).select('id').limit(1)
      expect(!!error || (data ?? []).length === 0, table).toBe(true)
    }
  })

  it('profile pictures are private to their owner', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
    const own = await A.db.storage.from('avatars').upload(`${A.id}/t.png`, png, { contentType: 'image/png' })
    expect(own.error).toBeNull()
    const foreign = await B.db.storage.from('avatars').upload(`${A.id}/evil.png`, png, { contentType: 'image/png' })
    expect(foreign.error).not.toBeNull()
    const read = await B.db.storage.from('avatars').download(`${A.id}/t.png`)
    expect(read.error).not.toBeNull()
    await A.db.storage.from('avatars').remove([`${A.id}/t.png`])
  })
})

describe('data rules', () => {
  it('rejects invalid tasks and duplicate calendar names', async () => {
    expect((await A.db.from('tasks').insert({ title: '   ' })).error?.code).toBe('23514')
    expect((await A.db.from('tasks').insert({ title: 'x', priority: 'extreme' })).error?.code).toBe('23514')
    expect((await A.db.from('tasks').insert({ title: 'x', start_date: '2026-11-20', due_date: '2026-11-19' })).error?.code).toBe('23514')
    expect((await A.db.from('categories').insert({ name: 'personal', color: '#8b72a8' })).error?.code).toBe('23505')
  })

  it('optimistic concurrency: a stale revision does not overwrite newer data', async () => {
    const { data: t } = await A.db.from('tasks').insert({ title: 'rev test' }).select('id,rev').single()
    const first = await A.db.from('tasks').update({ title: 'device 1', rev: 2 }).eq('id', t.id).eq('rev', 1).select('id')
    expect(first.data).toHaveLength(1)
    const stale = await A.db.from('tasks').update({ title: 'device 2 (stale)', rev: 2 }).eq('id', t.id).eq('rev', 1).select('id')
    expect(stale.data).toEqual([])
    const { data } = await A.db.from('tasks').select('title,rev,updated_at').eq('id', t.id).single()
    expect(data?.title).toBe('device 1')
  })

  it('updated_at and rev are maintained by the database', async () => {
    const { data: t } = await A.db.from('tasks').insert({ title: 'stamps' }).select('id,rev,updated_at').single()
    await new Promise((r) => setTimeout(r, 20))
    const { data: u } = await A.db.from('tasks').update({ title: 'stamps 2', rev: 1 }).eq('id', t.id).select('rev,updated_at').single()
    expect(u.rev).toBe(2) // bumped even though the client sent the old value
    expect(u.updated_at > t.updated_at).toBe(true)
  })
})

describe('performance', () => {
  it('handles thousands of tasks and pages them quickly', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      title: `Bulk task ${i}`,
      start_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      category_id: aCategory,
    }))
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await A.db.from('tasks').insert(rows.slice(i, i + 1000))
      expect(error).toBeNull()
    }
    const t0 = performance.now()
    const { data, error } = await A.db.from('tasks').select('id,title,start_date,updated_at').order('updated_at').order('id').range(0, 999)
    const ms = performance.now() - t0
    expect(error).toBeNull()
    expect(data).toHaveLength(1000)
    expect(ms).toBeLessThan(1500)
    // B still sees none of them.
    const { count } = await B.db.from('tasks').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)
  })
})
