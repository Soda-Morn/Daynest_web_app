import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseBackup } from '@/services/backup'

describe('sample data generator', () => {
  it('produces a backup the app imports without dropping anything', () => {
    const script = resolve(__dirname, '../scripts/make-sample-data.mjs')
    const json = execFileSync(process.execPath, [script, '--stdout'], { encoding: 'utf8' })
    const raw = JSON.parse(json)
    const backup = parseBackup(json)
    expect(backup.tasks).toHaveLength(raw.tasks.length)
    expect(backup.calendars).toHaveLength(5)
    expect(backup.lists).toHaveLength(5)
    expect(backup.tasks.filter((t) => t.recurrence)).toHaveLength(5)
    expect(backup.tasks.some((t) => t.description && t.startTime)).toBe(true)
  })
})
