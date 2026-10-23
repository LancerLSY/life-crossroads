import { crisisActive, validMyanmarSnapshot } from '../simulation/myanmar.ts'
import { isGameState } from '../game/engine.ts'
import type { Focus, GameState } from '../game/types.ts'
import { createSimulation, validateSimulation } from '../simulation/core.ts'
import type { Simulation } from '../simulation/types.ts'

export interface ClockState {
  fraction: number
  speed: 1 | 2 | 4 | 8 | 12 | 16
  paused: boolean
  autoDecision: boolean
  fastForward: boolean
  focusWeights: Partial<Record<Focus, number>>
}

export interface Snapshot { state: GameState; simulation: Simulation }
export interface Branch extends Snapshot {
  id: string
  name: string
  createdAt: string
  parentId?: string
  forkYear?: number
  snapshots: Snapshot[]
  yearStart?: Snapshot
  stage: 'setup' | 'certificate' | 'playing'
  clock: ClockState
}
export interface SaveFile { version: 2; activeBranchId: string; branches: Branch[] }

export const STORAGE_KEY = 'otherlife-save-v2'
export const MAX_SAVE_BYTES = 4_000_000
const TARGET_SAVE_BYTES = 3_500_000
export const MAX_BRANCHES = 8
const MAX_SNAPSHOTS = 24
const FOCUSES = new Set(['balance', 'study', 'career', 'social', 'health'])
const encoder = new TextEncoder()
export const uid = () => globalThis.crypto.randomUUID()

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, maximum: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= maximum
const defaultClock = (): ClockState => ({ fraction: 0, speed: 1, paused: true, autoDecision: false, fastForward: false, focusWeights: {} })

export function initialSave(): SaveFile {
  const result = createSimulation()
  const id = uid()
  return { version: 2, activeBranchId: id, branches: [{ id, name: '最初的人生', createdAt: new Date().toISOString(), ...result, snapshots: [], stage: 'setup', clock: defaultClock() }] }
}

function validClock(value: unknown): value is ClockState {
  if (!record(value) || typeof value.fraction !== 'number' || !Number.isFinite(value.fraction) || value.fraction < 0 || value.fraction >= 1
    || ![1, 2, 4, 8, 12, 16].includes(value.speed as number) || typeof value.paused !== 'boolean'
    || typeof value.autoDecision !== 'boolean' || typeof value.fastForward !== 'boolean' || !record(value.focusWeights)) return false
  let total = 0
  for (const [focus, weight] of Object.entries(value.focusWeights)) {
    if (!FOCUSES.has(focus) || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1) return false
    total += weight
  }
  return total <= 1 + 1e-6
}

function validSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || !isGameState(value.state) || !validateSimulation(value.simulation)) return false
  const { state, simulation } = value
  if (!validMyanmarSnapshot(state, simulation)) return false
  const lastYear = simulation.years.at(-1)
  return state.config.startAge === 0 && simulation.config.birthYear === state.config.birthYear
    && simulation.config.seed === state.config.seed && simulation.config.intelligence === state.config.intelligence
    && simulation.years.length === state.age + 1 && lastYear?.age === state.age && lastYear.year === state.year
    && lastYear.alive === !state.ended
}

function sameLife(snapshot: Snapshot, branch: Snapshot): boolean {
  return snapshot.state.id === branch.state.id && snapshot.state.config.birthYear === branch.state.config.birthYear
}

export function validSave(value: unknown): value is SaveFile {
  try {
    if (!record(value) || value.version !== 2 || !text(value.activeBranchId, 100) || !Array.isArray(value.branches)
      || value.branches.length < 1 || value.branches.length > MAX_BRANCHES) return false
    const branches: Branch[] = []
    for (const candidate of value.branches) {
      if (!record(candidate) || !text(candidate.id, 100) || !text(candidate.name, 60) || !text(candidate.createdAt, 40)
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate.createdAt)
        || !Number.isFinite(Date.parse(candidate.createdAt)) || !validSnapshot(candidate)
        || !['setup', 'certificate', 'playing'].includes(candidate.stage as string) || !validClock(candidate.clock)
        || !Array.isArray(candidate.snapshots) || candidate.snapshots.length > MAX_SNAPSHOTS) return false
      if (candidate.parentId !== undefined && !text(candidate.parentId, 100)) return false
      if (candidate.forkYear !== undefined && (typeof candidate.forkYear !== 'number' || !Number.isInteger(candidate.forkYear)
        || candidate.forkYear < candidate.state.config.birthYear || candidate.forkYear > candidate.state.year)) return false
      if ((candidate.parentId === undefined) !== (candidate.forkYear === undefined)) return false
      if (candidate.yearStart !== undefined) {
        const point = candidate.yearStart
        if (!validSnapshot(point) || !sameLife(point, candidate) || point.state.year !== candidate.state.year
          || point.state.config.seed !== candidate.state.config.seed || !point.state.currentEvent.choices.length
          || candidate.state.currentEvent.choices.length !== 0 && !crisisActive(candidate.simulation)) return false
      }
      let previousYear = -Infinity
      for (const point of candidate.snapshots) {
        if (!validSnapshot(point) || !sameLife(point, candidate) || point.state.year <= previousYear || point.state.year >= candidate.state.year) return false
        previousYear = point.state.year
      }
      branches.push(candidate as unknown as Branch)
    }
    const byId = new Map(branches.map(branch => [branch.id, branch]))
    if (byId.size !== branches.length || !byId.has(value.activeBranchId)) return false
    for (const branch of branches) {
      if (branch.parentId !== undefined) {
        const parent = byId.get(branch.parentId)
        if (!parent || parent.id === branch.id || !sameLife(branch, parent) || branch.forkYear! > parent.state.year) return false
      }
      const seen = new Set<string>()
      let ancestor: Branch | undefined = branch
      while (ancestor?.parentId !== undefined) {
        if (seen.has(ancestor.id)) return false
        seen.add(ancestor.id)
        ancestor = byId.get(ancestor.parentId)
      }
    }
    return true
  } catch { return false }
}

export function loadSave(): SaveFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && raw.length <= MAX_SAVE_BYTES && encoder.encode(raw).byteLength <= MAX_SAVE_BYTES) {
      const parsed: unknown = JSON.parse(raw)
      if (validSave(parsed)) return parsed
    }
  } catch { /* A new newborn save also works when browser storage is unavailable. */ }
  return initialSave()
}

export function parseSave(raw: string): SaveFile {
  if (encoder.encode(raw).byteLength > MAX_SAVE_BYTES) throw new Error('存档文件超过 4 MB，请选择更小的备份。')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('存档不是有效的 JSON 文件，请选择导出的人生备份。')
  }
  // Reject dangerous property names at any depth before accepting external data.
  const pending: unknown[] = [parsed]
  while (pending.length) {
    const value = pending.pop()
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('存档包含不安全的字段，无法导入。')
        if (child !== null && typeof child === 'object') pending.push(child)
      }
    }
  }
  if (record(parsed) && parsed.version !== 2) throw new Error('存档版本不受支持，请使用第 2 版人生备份。')
  if (!validSave(parsed)) throw new Error('存档数据不完整或已损坏，请检查人生、时间线与时钟记录。')
  return parsed
}

function checkCompleteSave(save: SaveFile): void {
  if (!validSave(save)) throw new Error('存档数据不完整，无法保存此更改。')
  // Unlike export, edits and merging must never prune existing rewind points.
  if (encoder.encode(JSON.stringify(save)).byteLength > MAX_SAVE_BYTES) throw new Error('合并或更名后的存档超过 4 MB，无法保存完整记录。')
}

export function renameBranch(save: SaveFile, id: string, name: string): SaveFile {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 60) throw new Error('时间线名称需为 1 至 60 个字符，不能只包含空白。')
  if (!save.branches.some(branch => branch.id === id)) throw new Error('找不到要更名的时间线。')
  const result = { ...save, branches: save.branches.map(branch => branch.id === id ? { ...branch, name: trimmed } : branch) }
  checkCompleteSave(result)
  return result
}

export function mergeSave(current: SaveFile, incoming: SaveFile): SaveFile {
  if (!validSave(current) || !validSave(incoming)) throw new Error('当前存档或导入备份不完整，无法合并。')
  if (current.branches.length + incoming.branches.length > MAX_BRANCHES) throw new Error('合并后超过 8 条时间线，无法导入整个备份。请减少时间线后再试。')
  const used = new Set([...current.branches, ...incoming.branches].map(branch => branch.id))
  const ids = new Map<string, string>()
  for (const branch of incoming.branches) {
    let id = uid()
    while (used.has(id)) id = uid()
    used.add(id)
    ids.set(branch.id, id)
  }
  const imported = structuredClone(incoming.branches).map(branch => {
    branch.id = ids.get(branch.id)!
    if (branch.parentId !== undefined) branch.parentId = ids.get(branch.parentId)!
    branch.clock = { ...branch.clock, paused: true, fastForward: false }
    return branch
  })
  const result = { ...current, branches: [...current.branches, ...imported] }
  checkCompleteSave(result)
  return result
}

export function updateBranch(save: SaveFile, state: GameState, simulation: Simulation, snapshot = false): SaveFile {
  const incoming = { state, simulation }
  if (!validSnapshot(incoming)) throw new Error('人生与世界数据不一致，无法保存这一步。')
  const current = save.branches.find(branch => branch.id === save.activeBranchId)
  // An async response from a previous branch must not write into the newly selected future.
  if (!current || !sameLife(incoming, current) || state.config.seed !== current.state.config.seed || state.year < current.state.year) return save
  let snapshots = current.snapshots
  let yearStart = current.yearStart
  if (state.year === current.state.year && current.state.currentEvent.choices.length > 0
    && state.currentEvent.choices.length === 0 && !yearStart) {
    yearStart = structuredClone({ state: current.state, simulation: current.simulation })
  }
  if (snapshot && state.year > current.state.year) {
    const point = structuredClone(yearStart ?? { state: current.state, simulation: current.simulation })
    snapshots = [...snapshots.filter(item => item.state.year !== point.state.year), point]
      .sort((a, b) => a.state.year - b.state.year).slice(-MAX_SNAPSHOTS)
  }
  if (state.year > current.state.year) yearStart = undefined
  return { ...save, branches: save.branches.map(branch => {
    if (branch.id !== current.id) return branch
    const updated = { ...branch, state, simulation, snapshots }
    if (yearStart) updated.yearStart = yearStart
    else delete updated.yearStart
    return updated
  }) }
}

export function forkBranch(save: SaveFile, snapshot: Snapshot): SaveFile {
  if (!validSave(save)) throw new Error('当前存档不完整，无法创建时间分支。')
  if (save.branches.length >= MAX_BRANCHES) throw new Error('已保存 8 条时间线。请先导出存档，再开启新的旅程。')
  const parent = save.branches.find(branch => branch.id === save.activeBranchId)!
  if (!validSnapshot(snapshot) || !sameLife(snapshot, parent) || snapshot.state.year > parent.state.year) throw new Error('请选择这条人生中已经发生的年份。')
  const result = structuredClone({ state: snapshot.state, simulation: snapshot.simulation })
  let seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
  while (seed === result.state.config.seed || seed === parent.state.config.seed) seed = (seed + 1) >>> 0
  result.state.config.seed = seed
  result.simulation.config.seed = seed
  const id = uid()
  const branch: Branch = {
    id, name: `如果那一年 · ${result.state.year}`, parentId: parent.id, forkYear: result.state.year,
    createdAt: new Date().toISOString(), ...result,
    snapshots: structuredClone(parent.snapshots.filter(point => point.state.year < result.state.year)), stage: 'playing',
    clock: { ...parent.clock, fraction: 0, paused: true, fastForward: false, focusWeights: {} },
  }
  return { ...save, activeBranchId: id, branches: [...save.branches, branch] }
}

export function serializeSave(save: SaveFile): string {
  if (!validSave(save)) throw new Error('存档数据不完整，无法导出。')
  let bounded = save
  let json = JSON.stringify(bounded)
  let bytes = encoder.encode(json).byteLength
  while (bytes > TARGET_SAVE_BYTES) {
    let oldestBranch = -1
    let oldestYear = Infinity
    for (const [index, branch] of bounded.branches.entries()) {
      const point = branch.snapshots[0]
      if (point && point.state.year < oldestYear) { oldestYear = point.state.year; oldestBranch = index }
    }
    if (oldestBranch < 0) break
    bounded = { ...bounded, branches: bounded.branches.map((branch, index) => index === oldestBranch ? { ...branch, snapshots: branch.snapshots.slice(1) } : branch) }
    json = JSON.stringify(bounded)
    bytes = encoder.encode(json).byteLength
  }
  if (bytes > MAX_SAVE_BYTES) throw new Error('当前人生记录超过 4 MB，无法导出完整存档。')
  return json
}

export function downloadSave(save: SaveFile): void {
  const blob = new Blob([serializeSave(save)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `人生岔路-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
