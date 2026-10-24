import { STORAGE_KEY } from './storage.ts'

export const SAVE_WRITE_LOCK = `${STORAGE_KEY}:write`

export class SaveConflictError extends Error {
  constructor() {
    super('其他页面已更新或移除了存档，此页已停止保存。请先备份当前进度，再重新载入最新记录。')
    this.name = 'SaveConflictError'
  }
}

export interface SaveWriterOptions {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  baseline: string | null | undefined
  key?: string
  runWithLock?: <T>(task: () => T | Promise<T>) => Promise<T>
}

export function createSaveWriter(options: SaveWriterOptions) {
  const key = options.key ?? STORAGE_KEY
  const lockName = key === STORAGE_KEY ? SAVE_WRITE_LOCK : `${key}:write`
  const runWithLock: NonNullable<SaveWriterOptions['runWithLock']> = options.runWithLock ?? (task => {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(lockName, () => Promise.resolve().then(task))
    // Without Web Locks, keep the raw comparison and write in one synchronous task.
    return Promise.resolve(task())
  })
  let baseline = options.baseline
  let conflicted = false
  let queue = Promise.resolve()

  function checkCurrent(): boolean {
    if (conflicted) return false
    // A failed initial read gives no permission to replace unseen existing data.
    if (baseline === undefined) throw new Error('尚未读取到原有存档基线，请重新载入后再保存。')
    if (options.storage.getItem(key) !== baseline) {
      conflicted = true
      return false
    }
    return true
  }

  function write(raw: string): Promise<void> {
    const pending = queue.then(() => runWithLock(() => {
      if (!checkCurrent()) throw new SaveConflictError()
      options.storage.setItem(key, raw)
      baseline = raw
    }))
    // A rejected write must not poison later retry requests from this page.
    queue = pending.catch(() => {})
    return pending
  }

  return { write, checkCurrent, get conflicted() { return conflicted } }
}
