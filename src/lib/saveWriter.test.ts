import test from 'node:test'
import assert from 'node:assert/strict'
import { createSaveWriter as createBrowserSaveWriter, SaveConflictError, SAVE_WRITE_LOCK } from './saveWriter.ts'
import type { SaveWriterOptions } from './saveWriter.ts'
import { initialSave, loadSaveResult, STORAGE_KEY } from './storage.ts'

const createSaveWriter = (options: SaveWriterOptions) => createBrowserSaveWriter({
  runWithLock: task => Promise.resolve(task()),
  ...options,
})

function memoryStorage(initial: string | null = 'birth') {
  let raw = initial
  let readError = false
  let writeError = false
  const writes: string[] = []
  return {
    get raw() { return raw },
    set raw(value: string | null) { raw = value },
    get readError() { return readError },
    set readError(value: boolean) { readError = value },
    get writeError() { return writeError },
    set writeError(value: boolean) { writeError = value },
    writes,
    getItem(key: string) {
      assert.equal(key, STORAGE_KEY)
      if (readError) throw new Error('read failed')
      return raw
    },
    setItem(key: string, value: string) {
      assert.equal(key, STORAGE_KEY)
      if (writeError) throw new Error('write failed')
      raw = value
      writes.push(value)
    },
  }
}

function serialLock() {
  let tail = Promise.resolve()
  let held = 0
  let maximumHeld = 0
  const runWithLock: NonNullable<SaveWriterOptions['runWithLock']> = <T,>(task: () => T | Promise<T>) => {
    const next = tail.then(async () => {
      held++
      maximumHeld = Math.max(maximumHeld, held)
      try { return await task() } finally { held-- }
    })
    tail = next.then(() => {}, () => {})
    return next
  }
  return { runWithLock, get maximumHeld() { return maximumHeld } }
}

test('an older page cannot overwrite a newer page and remains frozen after conflict', async () => {
  const storage = memoryStorage()
  const oldPage = createSaveWriter({ storage, baseline: storage.raw })
  const newPage = createSaveWriter({ storage, baseline: storage.raw })
  await newPage.write('age 2')
  await assert.rejects(oldPage.write('birth'), SaveConflictError)
  assert.equal(storage.raw, 'age 2')
  assert.equal(oldPage.conflicted, true)
  storage.raw = 'birth'
  await assert.rejects(oldPage.write('still stale'), SaveConflictError)
  assert.deepEqual(storage.writes, ['age 2'])
})

test('recovery also uses its exact rejected raw as baseline and cannot overwrite a later repair', async () => {
  const storage = memoryStorage('{')
  const recoveryPage = createSaveWriter({ storage, baseline: '{' })
  const repairedPage = createSaveWriter({ storage, baseline: '{' })
  await repairedPage.write('repaired backup')
  assert.equal(recoveryPage.checkCurrent(), false)
  await assert.rejects(recoveryPage.write('new newborn'), SaveConflictError)
  assert.equal(storage.raw, 'repaired backup')
})

test('same-page queued writes advance the baseline in request order and compare inside the shared lock', async () => {
  const storage = memoryStorage()
  const lock = serialLock()
  const writer = createSaveWriter({ storage, baseline: storage.raw, runWithLock: lock.runWithLock })
  await Promise.all([writer.write('age 1'), writer.write('age 2'), writer.write('age 3')])
  assert.deepEqual(storage.writes, ['age 1', 'age 2', 'age 3'])
  assert.equal(writer.checkCurrent(), true)
  assert.equal(writer.conflicted, false)
  assert.equal(lock.maximumHeld, 1)
})

test('two writers sharing an injectable lock serialize concurrent commits and reject the stale queued future', async () => {
  const storage = memoryStorage()
  const lock = serialLock()
  const first = createSaveWriter({ storage, baseline: storage.raw, runWithLock: lock.runWithLock })
  const second = createSaveWriter({ storage, baseline: storage.raw, runWithLock: lock.runWithLock })
  const outcomes = await Promise.allSettled([first.write('first new future'), second.write('second stale future'), first.write('first next year')])
  assert.equal(outcomes[0].status, 'fulfilled')
  assert.equal(outcomes[1].status, 'rejected')
  if (outcomes[1].status === 'rejected') assert.ok(outcomes[1].reason instanceof SaveConflictError)
  assert.equal(outcomes[2].status, 'fulfilled')
  assert.deepEqual(storage.writes, ['first new future', 'first next year'])
  assert.equal(lock.maximumHeld, 1)
})

test('read and write failures never move the baseline, freeze the writer or poison its retry queue', async () => {
  const storage = memoryStorage()
  const writer = createSaveWriter({ storage, baseline: storage.raw })
  storage.readError = true
  assert.throws(() => writer.checkCurrent(), /read failed/)
  await assert.rejects(writer.write('age 1'), /read failed/)
  assert.equal(writer.conflicted, false)
  storage.readError = false
  storage.writeError = true
  await assert.rejects(writer.write('age 1'), /write failed/)
  assert.equal(writer.conflicted, false)
  assert.equal(storage.raw, 'birth')
  storage.writeError = false
  await writer.write('age 1')
  await writer.write('age 2')
  assert.deepEqual(storage.writes, ['age 1', 'age 2'])
})

test('external deletion freezes an existing page while an absent initial save accepts its first write', async () => {
  const storage = memoryStorage()
  const existing = createSaveWriter({ storage, baseline: storage.raw })
  storage.raw = null
  assert.equal(existing.checkCurrent(), false)
  await assert.rejects(existing.write('old future'), SaveConflictError)
  const fresh = createSaveWriter({ storage, baseline: null })
  await fresh.write('new birth')
  assert.equal(storage.raw, 'new birth')
})

test('a failed initial read never adopts unseen storage as its baseline', async () => {
  const storage = memoryStorage('unseen old life')
  const writer = createSaveWriter({ storage, baseline: undefined })
  assert.throws(() => writer.checkCurrent(), /读取|基线/)
  await assert.rejects(writer.write('newborn fallback'), /读取|基线/)
  assert.equal(writer.conflicted, false)
  assert.equal(storage.raw, 'unseen old life')
  assert.deepEqual(storage.writes, [])
})

test('same-page order is retained even if an injected lock runner would schedule requests out of order', async () => {
  const storage = memoryStorage()
  let requests = 0
  const deferred: Array<() => void> = []
  const runWithLock: NonNullable<SaveWriterOptions['runWithLock']> = <T,>(task: () => T | Promise<T>) => {
    requests++
    return new Promise<T>((resolve, reject) => {
      deferred.push(() => { Promise.resolve().then(task).then(resolve, reject) })
    })
  }
  const writer = createSaveWriter({ storage, baseline: storage.raw, runWithLock })
  const first = writer.write('year 1')
  const second = writer.write('year 2')
  const third = writer.write('year 3')
  await Promise.resolve()
  assert.equal(requests, 1)
  deferred.shift()!()
  await first
  await Promise.resolve()
  assert.equal(requests, 2)
  deferred.shift()!()
  await second
  await Promise.resolve()
  assert.equal(requests, 3)
  deferred.shift()!()
  await third
  assert.deepEqual(storage.writes, ['year 1', 'year 2', 'year 3'])
})

test('default browser lock has the shared save key and falls back safely without navigator', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const names: string[] = []
  const storage = memoryStorage()
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
      request: async (name: string, task: () => unknown) => { names.push(name); return task() },
    } } })
    await createBrowserSaveWriter({ storage, baseline: storage.raw }).write('with lock')
    assert.deepEqual(names, [SAVE_WRITE_LOCK])
    Reflect.deleteProperty(globalThis, 'navigator')
    await createBrowserSaveWriter({ storage, baseline: storage.raw }).write('without navigator')
    assert.equal(storage.raw, 'without navigator')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})

test('loading returns the exact raw baseline for valid, rejected, empty and unavailable storage', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    for (const raw of [JSON.stringify(initialSave()), '{', '', null]) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => raw } })
      const loaded = loadSaveResult()
      assert.equal(loaded.baseline, raw)
      assert.equal(!!loaded.recovery, raw === '{' || raw === '')
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('denied') } })
    assert.equal(loadSaveResult().baseline, undefined)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
