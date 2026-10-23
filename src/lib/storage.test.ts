import { myanmarRoll } from '../simulation/myanmar.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceSimulation, createSimulation, resolveSimulationDecision, spend } from '../simulation/core.ts'
import type { SimulationResult } from '../simulation/types.ts'
import { forkBranch, initialSave, loadSave, MAX_BRANCHES, MAX_SAVE_BYTES, mergeSave, parseSave, renameBranch, serializeSave, STORAGE_KEY, updateBranch, validSave } from './storage.ts'
import type { ClockState, SaveFile, Snapshot } from './storage.ts'

const clock = (): ClockState => ({ fraction: 0, speed: 1, paused: true, autoDecision: false, fastForward: false, focusWeights: {} })
const clone = <T,>(value: T): T => structuredClone(value)
function fixture(seed = 1): SaveFile {
  const result = createSimulation({ seed, countryId: 'JPN', birthYear: 2000 })
  return { version: 2, activeBranchId: 'root', branches: [{ id: 'root', name: '原本的人生', createdAt: '2026-10-22T00:00:00Z', ...result, snapshots: [], stage: 'playing', clock: clock() }] }
}
function next(result: SimulationResult): SimulationResult {
  return advanceSimulation(result.state, result.simulation, result.state.currentEvent.choices[0]?.id)
}
function progress(save: SaveFile, count: number): SaveFile {
  for (let i = 0; i < count && !save.branches[0].state.ended; i++) {
    const result = next(save.branches[0])
    save = updateBranch(save, result.state, result.simulation, true)
  }
  return save
}
function padded(snapshot: Snapshot): Snapshot {
  const result = clone(snapshot)
  result.state.people = Array.from({ length: 12 }, (_, personIndex) => ({
    ...clone(result.state.people[personIndex] ?? result.state.people[0]), id: result.state.people[personIndex]?.id ?? `reader-${personIndex}`,
    messages: Array.from({ length: 40 }, (_, index) => ({ id: `message-${index}`, role: index % 2 ? 'assistant' as const : 'user' as const, text: '人'.repeat(2000), year: result.state.config.birthYear })),
  }))
  return result
}

test('parseSave validates UTF-8 size, JSON, version, unsafe fields and data consistency', () => {
  const save = fixture()
  assert.deepEqual(parseSave(JSON.stringify(save)), save)
  assert.throws(() => parseSave('{'), /JSON/)
  assert.throws(() => parseSave(JSON.stringify({ ...save, version: 1 })), /版本/)
  assert.throws(() => parseSave(JSON.stringify({ ...save, activeBranchId: 'missing' })), /损坏/)
  const raw = JSON.stringify({ ...save, filler: '人'.repeat(1_400_000) })
  assert.ok(raw.length < MAX_SAVE_BYTES)
  assert.throws(() => parseSave(raw), /4 MB/)
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const polluted = JSON.stringify({ ...save, extra: { [key]: { polluted: true } } })
    assert.throws(() => parseSave(polluted), /不安全/)
  }
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false)
})

test('renameBranch trims names, enforces boundaries and preserves all unrelated branch data', () => {
  const save = forkBranch(fixture(), fixture().branches[0])
  const before = clone(save)
  const renamed = renameBranch(save, 'root', '  新的人生  ')
  assert.equal(renamed.branches[0].name, '新的人生')
  assert.equal(renamed.branches[0].state, save.branches[0].state)
  assert.equal(renamed.branches[1], save.branches[1])
  assert.equal(renamed.activeBranchId, save.activeBranchId)
  assert.deepEqual(save, before)
  assert.equal(renameBranch(save, 'root', '人'.repeat(60)).branches[0].name.length, 60)
  for (const name of ['', ' \n\t ', '人'.repeat(61)]) assert.throws(() => renameBranch(save, 'root', name), /1 至 60/)
  assert.throws(() => renameBranch(save, 'missing', '名字'), /找不到/)
})

test('merging same IDs imports independent copies, remaps ancestry and pauses every imported clock', () => {
  const current = fixture(1)
  const source = fixture(2)
  let incoming = forkBranch(source, source.branches[0])
  incoming = forkBranch(incoming, incoming.branches[1])
  for (const branch of incoming.branches) {
    branch.clock.paused = false
    branch.clock.fastForward = true
  }
  const currentBefore = clone(current)
  const incomingBefore = clone(incoming)
  const result = mergeSave(current, incoming)
  assert.ok(validSave(result))
  assert.equal(result.activeBranchId, current.activeBranchId)
  assert.equal(result.branches[0], current.branches[0])
  const imported = result.branches.slice(1)
  const oldIds = new Set([...current.branches, ...incoming.branches].map(branch => branch.id))
  assert.ok(imported.every(branch => !oldIds.has(branch.id)))
  assert.equal(new Set(result.branches.map(branch => branch.id)).size, 4)
  assert.equal(imported[1].parentId, imported[0].id)
  assert.equal(imported[2].parentId, imported[1].id)
  assert.notDeepEqual(imported[0].state, current.branches[0].state)
  for (const [index, branch] of imported.entries()) {
    assert.deepEqual(branch.state, incoming.branches[index].state)
    assert.deepEqual(branch.simulation, incoming.branches[index].simulation)
    assert.equal(branch.clock.paused, true)
    assert.equal(branch.clock.fastForward, false)
  }
  imported[0].simulation.economy.cash += 1
  imported[0].state.people[0].memories.push('新副本')
  assert.deepEqual(current, currentBefore)
  assert.deepEqual(incoming, incomingBefore)
})

test('merge refuses excess capacity or bytes without dropping branches or rewind points', () => {
  let current = fixture()
  for (let i = 1; i < MAX_BRANCHES; i++) current = forkBranch(current, current.branches[0])
  const before = clone(current)
  assert.throws(() => mergeSave(current, fixture(2)), /8 条/)
  assert.deepEqual(current, before)
  const source = progress(fixture(), 2)
  const large = { ...source, branches: [{ ...source.branches[0], snapshots: source.branches[0].snapshots.map(padded) }] }
  assert.ok(validSave(large))
  assert.throws(() => mergeSave(fixture(2), large), /4 MB/)
  assert.equal(large.branches[0].snapshots.length, 2)
  assert.throws(() => mergeSave(fixture(), { ...fixture(), activeBranchId: 'missing' }), /不完整/)
})

test('initial v2 save creates a paused current-world newborn with four peers and setup stage', () => {
  const save = initialSave()
  assert.equal(save.version, 2)
  assert.equal(STORAGE_KEY, 'otherlife-save-v2')
  assert.equal(save.branches[0].state.age, 0)
  assert.equal(save.branches[0].simulation.peers.length, 4)
  assert.equal(save.branches[0].simulation.config.world, 'present')
  assert.equal(save.branches[0].stage, 'setup')
  assert.deepEqual(save.branches[0].clock, clock())
  assert.ok(validSave(save))
})

test('advancing captures the full previous state and simulation without mutating the save', () => {
  const original = fixture()
  const before = clone(original)
  const result = next(original.branches[0])
  const save = updateBranch(original, result.state, result.simulation, true)
  assert.deepEqual(original, before)
  assert.equal(save.branches[0].state.year, 2001)
  assert.deepEqual(save.branches[0].snapshots[0], { state: before.branches[0].state, simulation: before.branches[0].simulation })
  assert.ok(validSave(save))
  const unchangedYear = updateBranch(save, save.branches[0].state, save.branches[0].simulation, true)
  assert.equal(unchangedYear.branches[0].snapshots.length, 1)
})

test('updates cannot overwrite a different active branch or move the active life backwards', () => {
  const original = fixture()
  const other = fixture(99).branches[0]
  const switched: SaveFile = { ...original, activeBranchId: 'other', branches: [...original.branches, { ...other, id: 'other' }] }
  const pending = next(original.branches[0])
  assert.equal(updateBranch(switched, pending.state, pending.simulation, true), switched)
  const progressed = progress(original, 2)
  assert.equal(updateBranch(progressed, original.branches[0].state, original.branches[0].simulation), progressed)
  const badSimulation = { ...pending.simulation, economy: { ...pending.simulation.economy, cash: NaN } }
  assert.throws(() => updateBranch(original, pending.state, badSimulation))
})

test('forking preserves the original future, economy, identities and independent state/simulation seeds', () => {
  const original = progress(fixture(), 8)
  const before = clone(original)
  const point = original.branches[0].snapshots[4]
  const forked = forkBranch(original, point)
  const branch = forked.branches[1]
  assert.deepEqual(original, before)
  assert.deepEqual(forked.branches[0], before.branches[0])
  assert.equal(branch.state.id, point.state.id)
  assert.equal(branch.state.config.birthYear, point.state.config.birthYear)
  assert.equal(branch.state.year, point.state.year)
  assert.equal(branch.simulation.config.seed, branch.state.config.seed)
  assert.notEqual(branch.state.config.seed, point.state.config.seed)
  assert.deepEqual(branch.simulation.economy, point.simulation.economy)
  assert.deepEqual(branch.simulation.birth, point.simulation.birth)
  assert.deepEqual(branch.simulation.peers, point.simulation.peers)
  assert.equal(branch.parentId, original.activeBranchId)
  assert.equal(branch.forkYear, point.state.year)
  assert.equal(branch.stage, 'playing')
  assert.equal(branch.clock.fraction, 0)
  assert.equal(branch.clock.paused, true)
  assert.ok(branch.snapshots.every(snapshot => snapshot.state.year < point.state.year))
  assert.ok(branch.snapshots.every(snapshot => snapshot.state.config.seed === snapshot.simulation.config.seed))
  assert.ok(branch.snapshots.some(snapshot => snapshot.state.config.seed !== branch.state.config.seed))
  branch.state.people[0].memories.push('独立分支')
  branch.simulation.economy.cash += 1
  branch.simulation.peers[0].years[0].happiness = 1
  assert.deepEqual(original, before)
  assert.ok(validSave(forked))
  const staleFuture = next(before.branches[0])
  assert.equal(updateBranch(forked, staleFuture.state, staleFuture.simulation), forked)
})

test('branch archives stop at eight without changing the original future', () => {
  let save = fixture()
  const snapshot = { state: save.branches[0].state, simulation: save.branches[0].simulation }
  for (let i = 1; i < 8; i++) save = forkBranch(save, snapshot)
  assert.equal(save.branches.length, 8)
  assert.ok(validSave(save))
  const before = clone(save)
  assert.throws(() => forkBranch(save, snapshot), /8/)
  assert.deepEqual(save, before)
})

test('v2 validation rejects invalid branch, parent and clock metadata', () => {
  const save = fixture()
  const branch = save.branches[0]
  const invalidBranches = [
    { ...branch, id: '' }, { ...branch, name: ' ' }, { ...branch, createdAt: 'not-a-date' },
    { ...branch, parentId: 'missing', forkYear: 2000 }, { ...branch, parentId: 'root', forkYear: 2000 },
    { ...branch, forkYear: 2000.5 }, { ...branch, forkYear: 2001 }, { ...branch, stage: 'unknown' },
    ...[NaN, Infinity, -1, 1].map(fraction => ({ ...branch, clock: { ...clock(), fraction } })),
    { ...branch, clock: { ...clock(), speed: 3 } }, { ...branch, clock: { ...clock(), paused: 'true' } },
    { ...branch, clock: { ...clock(), focusWeights: { study: .7, health: .4 } } },
    { ...branch, clock: { ...clock(), focusWeights: { study: NaN } } },
    { ...branch, clock: { ...clock(), focusWeights: { unknown: .3 } } },
  ]
  for (const invalid of invalidBranches) assert.equal(validSave({ ...save, branches: [invalid] }), false)
  assert.equal(validSave({ ...save, activeBranchId: 'missing' }), false)
  assert.equal(validSave({ ...save, branches: [branch, branch] }), false)
  assert.equal(validSave({ ...save, branches: Array.from({ length: 9 }, (_, i) => ({ ...branch, id: `b-${i}` })) }), false)
  assert.equal(validSave({ ...save, version: 1 }), false)
  assert.equal(validSave(null), false)
  const second = { ...clone(branch), id: 'second', parentId: 'root', forkYear: 2000 }
  const cyclic = { ...save, branches: [{ ...branch, parentId: 'second', forkYear: 2000 }, second] }
  assert.equal(validSave(cyclic), false)
})

test('validation rejects mismatched simulation configs and cross-life, duplicate, unordered or future snapshots', () => {
  const save = progress(fixture(), 3)
  const branch = save.branches[0]
  const first = branch.snapshots[0]
  const invalids = [
    { ...branch, simulation: { ...branch.simulation, config: { ...branch.simulation.config, intelligence: 21 } } },
    { ...branch, simulation: { ...branch.simulation, config: { ...branch.simulation.config, seed: 15 } } },
    { ...branch, simulation: { ...branch.simulation, years: branch.simulation.years.slice(0, -1) } },
    { ...branch, snapshots: [{ ...first, state: { ...first.state, id: 'different-life' } }] },
    { ...branch, snapshots: [first, first] },
    { ...branch, snapshots: [...branch.snapshots].reverse() },
    { ...branch, snapshots: [...branch.snapshots, { state: branch.state, simulation: branch.simulation }] },
    { ...branch, snapshots: [{ ...first, simulation: branch.simulation }] },
    { ...branch, snapshots: [{ ...first, simulation: { ...first.simulation, config: { ...first.simulation.config, intelligence: 5 } } }] },
  ]
  for (const invalid of invalids) assert.equal(validSave({ ...save, branches: [invalid] }), false)
  const future = next(branch)
  assert.equal(validSave({ ...save, branches: [{ ...branch, snapshots: [future] }] }), false)
  assert.throws(() => forkBranch(save, future))
  assert.throws(() => forkBranch(save, { ...first, state: { ...first.state, id: 'different-life' } }))
})

test('rewind points remain capped at24 across an independently surviving long life', () => {
  let save: SaveFile | undefined
  for (let seed = 1; seed <= 30; seed++) {
    const candidate = progress(fixture(seed), 36)
    if (candidate.branches[0].state.age >= 36) { save = candidate; break }
  }
  assert.ok(save, 'A durable deterministic seed must exercise the snapshot cap')
  const branch = save.branches[0]
  assert.equal(branch.snapshots.length, 24)
  assert.equal(new Set(branch.snapshots.map(point => point.state.year)).size, 24)
  assert.equal(branch.snapshots[0].state.year, branch.state.year - 24)
  assert.ok(validSave(save))
})

test('UTF-8 export pruning preserves current branches and the newest rewind point', () => {
  const original = progress(fixture(), 3)
  const save = { ...original, branches: [{ ...original.branches[0], snapshots: original.branches[0].snapshots.map(padded) }] }
  assert.ok(validSave(save))
  const unpruned = JSON.stringify(save)
  assert.ok(unpruned.length < MAX_SAVE_BYTES, 'Character length alone would incorrectly accept this archive')
  assert.ok(new TextEncoder().encode(unpruned).byteLength > MAX_SAVE_BYTES)
  const exported = serializeSave(save)
  const parsed: unknown = JSON.parse(exported)
  assert.ok(validSave(parsed))
  assert.ok(new TextEncoder().encode(exported).byteLength <= 3_500_000)
  assert.deepEqual(parsed.branches[0].state, save.branches[0].state)
  assert.deepEqual(parsed.branches[0].simulation, save.branches[0].simulation)
  assert.equal(parsed.branches[0].snapshots.length, 1)
  assert.equal(parsed.branches[0].snapshots[0].state.year, 2002)
  assert.equal(save.branches[0].snapshots.length, 3)
})

test('minimal oversized archives fail rather than silently discarding current branches', () => {
  const save = fixture()
  const pair = padded(save.branches[0])
  const branch = { ...save.branches[0], ...pair }
  const oversized: SaveFile = { ...save, branches: [branch, { ...clone(branch), id: 'second' }] }
  assert.ok(validSave(oversized))
  assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).byteLength > MAX_SAVE_BYTES)
  assert.throws(() => serializeSave(oversized), /4|存档|导出/)
})

test('bounded exported saves round-trip and loadSave rejects invalid or byte-oversized stored JSON', () => {
  const save = progress(fixture(), 2)
  assert.deepEqual(JSON.parse(serializeSave(save)), save)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let raw = serializeSave(save)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => raw } })
  try {
    assert.deepEqual(loadSave(), save)
    raw = JSON.stringify({ ...save, activeBranchId: 'missing' })
    assert.ok(validSave(loadSave()))
    assert.equal(loadSave().branches[0].state.age, 0)
    raw = JSON.stringify({ ...save, filler: '人'.repeat(1_400_000) })
    assert.ok(raw.length < MAX_SAVE_BYTES)
    assert.ok(new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES)
    assert.equal(loadSave().branches[0].stage, 'setup')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})


test('rewind preserves the unresolved year start before a same-year decision and can choose another path', () => {
  const original = progress(fixture(), 6)
  const before = clone({ state: original.branches[0].state, simulation: original.branches[0].simulation })
  assert.ok(before.state.currentEvent.choices.length > 1)
  const resolved = resolveSimulationDecision(before.state, before.simulation, before.state.currentEvent.choices[0].id)
  const selected = updateBranch(original, resolved.state, resolved.simulation)
  assert.deepEqual(selected.branches[0].yearStart, before)
  assert.equal(selected.branches[0].state.currentEvent.choices.length, 0)
  const afterChat = updateBranch(selected, { ...resolved.state, stats: { ...resolved.state.stats, happiness: 90 } }, resolved.simulation)
  assert.deepEqual(afterChat.branches[0].yearStart, before)
  const advanced = next(afterChat.branches[0])
  const progressed = updateBranch(afterChat, advanced.state, advanced.simulation, true)
  assert.equal(progressed.branches[0].yearStart, undefined)
  const point = progressed.branches[0].snapshots.at(-1)!
  assert.deepEqual(point, before)
  const forked = forkBranch(progressed, point)
  const branch = forked.branches.at(-1)!
  assert.equal(branch.yearStart, undefined)
  assert.equal(branch.state.currentEvent.choices.length, before.state.currentEvent.choices.length)
  const alternative = resolveSimulationDecision(branch.state, branch.simulation, before.state.currentEvent.choices[1].id)
  assert.notEqual(alternative.simulation.education, resolved.simulation.education)
  assert.equal(alternative.state.age, before.state.age)
  assert.ok(validSave(progressed))
  assert.ok(validSave(forked))
})

test('pending year starts round-trip, remain protected on export, and reject inconsistent metadata', () => {
  const original = progress(fixture(), 6)
  const branch = original.branches[0]
  const resolved = resolveSimulationDecision(branch.state, branch.simulation, branch.state.currentEvent.choices[0].id)
  const pending = updateBranch(original, resolved.state, resolved.simulation)
  const saved = pending.branches[0]
  const point = saved.yearStart!
  assert.deepEqual(JSON.parse(serializeSave(pending)), pending)
  assert.ok(validSave(pending))
  const enlarged = { ...pending, branches: [{ ...saved, snapshots: saved.snapshots.slice(-2).map(padded), yearStart: padded(point) }] }
  assert.ok(validSave(enlarged))
  const exported: unknown = JSON.parse(serializeSave(enlarged))
  assert.ok(validSave(exported))
  assert.equal(exported.branches[0].snapshots.length, 0)
  assert.deepEqual(exported.branches[0].yearStart, enlarged.branches[0].yearStart)
  const invalids = [
    { ...saved, yearStart: { ...point, state: { ...point.state, id: 'other-life' } } },
    { ...saved, yearStart: { ...point, state: { ...point.state, config: { ...point.state.config, seed: 77 } }, simulation: { ...point.simulation, config: { ...point.simulation.config, seed: 77 } } } },
    { ...saved, yearStart: { state: resolved.state, simulation: resolved.simulation } },
    { ...saved, yearStart: branch.snapshots[0] },
    { ...saved, state: branch.state, simulation: branch.simulation },
    { ...saved, yearStart: null },
  ]
  for (const invalid of invalids) assert.equal(validSave({ ...pending, branches: [invalid] }), false)
  const forked = forkBranch(pending, saved)
  assert.equal(forked.branches.at(-1)!.yearStart, undefined)
  assert.ok(validSave(forked))
})


test('hidden-crisis imports reject mismatched events, orphaned contacts and revived fatal outcomes', () => {
  const save = progress(fixture(918), 18)
  const branch = save.branches[0]
  let seed = 0
  while (!(myanmarRoll(seed, 1) < .8 && myanmarRoll(seed, 1, 'fatal-route') < .9)) seed++
  branch.state.config.seed = seed
  branch.simulation.config.seed = seed
  branch.simulation.economy.cash = 1e8
  const arrival = spend(branch.simulation, branch.state, 'travel', 100, 'MMR')
  Object.assign(branch, arrival)
  delete branch.yearStart
  assert.ok(validSave(save))
  for (const mutation of [
    (b: typeof branch) => { b.state.currentEvent.id = 'ordinary-event' },
    (b: typeof branch) => { b.state.currentEvent.choices[0].id = 'surprise:mmr:999:help:escape' },
    (b: typeof branch) => { b.state.currentEvent.choices = [] },
    (b: typeof branch) => { b.simulation.crisis!.resumeEvent.choices = [{ id: 'lost-person', label: '对话', hint: '交流', effects: {}, personId: 'missing-person' }] },
  ]) {
    const bad = clone(save)
    mutation(bad.branches[0])
    assert.equal(validSave(bad), false)
  }
  let current = arrival
  for (const action of ['help', 'escape', 'help']) current = resolveSimulationDecision(current.state, current.simulation, current.state.currentEvent.choices.find(c => c.id.endsWith(`:${action}`))!.id)
  Object.assign(branch, current)
  assert.equal(branch.state.ended, true)
  assert.ok(validSave(save))
  branch.state.ended = false
  delete branch.state.ending
  branch.simulation.years.at(-1)!.alive = true
  assert.equal(validSave(save), false)
})

test('a crisis after an annual choice preserves a valid rewind point through its resolution', () => {
  let save = progress(fixture(918), 18)
  let b = save.branches[0]
  let seed = 0
  while (!(myanmarRoll(seed, 1) < .8 && myanmarRoll(seed, 1, 'fatal-route') >= .9)) seed++
  b.state.config.seed = seed
  b.simulation.config.seed = seed
  b.simulation.economy.cash = 1e8
  const annual = resolveSimulationDecision(b.state, b.simulation, b.state.currentEvent.choices[0].id)
  save = updateBranch(save, annual.state, annual.simulation)
  const before = clone(save.branches[0].yearStart)
  b = save.branches[0]
  let r = spend(b.simulation, b.state, 'travel', 100, 'MMR')
  save = updateBranch(save, r.state, r.simulation)
  assert.ok(validSave(save))
  for (const action of ['help', 'help', 'help']) {
    r = resolveSimulationDecision(r.state, r.simulation, r.state.currentEvent.choices.find(c => c.id.endsWith(`:${action}`))!.id)
    save = updateBranch(save, r.state, r.simulation)
    assert.ok(validSave(save))
    assert.deepEqual(save.branches[0].yearStart, before)
  }
})
