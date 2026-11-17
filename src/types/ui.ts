import type { TaskInstance } from './models'

export interface TaskGroup {
  id: string
  label: string
  tone?: 'default' | 'late'
  items: TaskInstance[]
}
