import { isGameState } from '../game/engine.ts'
import type { GameState, LifeEvent } from '../game/types.ts'
import type { Simulation, SimulationResult } from './types.ts'

export interface MyanmarCrisis {
  phase: 'captive' | 'help' | 'escape' | 'resolved'
  fatalRoute: boolean
  visit: number
  history: string[]
  injured: boolean
  outcome?: 'rescued' | 'injured' | 'dead'
  resumeEvent: LifeEvent
}

const FICTION = '虚构隐藏剧情：80%为到访触发概率；被绑架后90%进入致命器官伤害路线、10%脱险。两项均为游戏参数，不代表任何现实地区的风险统计。'
const cap = (n: number) => Math.max(0, Math.min(100, n))
export const crisisActive = (simulation: Simulation) => !!simulation.crisis && simulation.crisis.phase !== 'resolved'

/** Each arrival and each stage has its own stable random stream, independent of rendering. */
export function myanmarRoll(seed: number, visit: number, stage = 'arrival'): number {
  let h = 2166136261
  for (const c of `myanmar-fiction:${visit}:${stage}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  let n = ((seed ^ h) >>> 0) + 0x6d2b79f5
  n = Math.imul(n ^ n >>> 15, 1 | n)
  n ^= n + Math.imul(n ^ n >>> 7, 61 | n)
  return ((n ^ n >>> 14) >>> 0) / 4294967296
}

function sync(state: GameState, simulation: Simulation): SimulationResult {
  const last = simulation.years.at(-1)
  return { state, simulation: { ...simulation, years: last ? [...simulation.years.slice(0, -1), { ...last, health: state.stats.health, happiness: state.stats.happiness, title: state.currentEvent.title, alive: !state.ended, ...(state.ended ? { marker: 'death' as const } : {}) }] : [] } }
}

function crisisEvent(state: GameState, crisis: MyanmarCrisis): LifeEvent {
  const options: [string, string, string][] = crisis.phase === 'captive'
    ? [['help', '寻找求助机会', '尝试让外界知道你的处境'], ['observe', '低调观察，保存体力', '等待可能的援助'], ['escape', '尝试逃离控制', '寻找离开危险的机会']]
    : crisis.phase === 'help'
      ? [['help', '向偶遇的旅人求助', '让尚未传出的消息继续向外传递'], ['observe', '停下来照顾同行者', '在短暂脱险时互相支持'], ['escape', '跟随远处的呼喊', '尝试与外界重新取得联系']]
      : crisis.phase === 'escape'
        ? [['help', '再次呼救', '把最后的希望交给正在接近的援助'], ['observe', '扶着同行者等待救援', '在失联之后坚持到最后'], ['escape', '向救援灯光走去', '努力完成这段逃生旅程']]
        : []
  const first = crisis.history[0] === 'help' ? '你设法传出了求助消息，却很快与外界失去联系。' : crisis.history[0] === 'observe' ? '你与另一名受困者互相扶持，终于等来一个短暂离开的机会。' : '你曾短暂脱离控制，却在陌生的路途中再次失去方向。'
  const second = crisis.history[1] === 'help' ? '偶遇的旅人答应寻找援助，随后又失去了联络。' : crisis.history[1] === 'observe' ? '你陪同行者熬过了漫长等待，远处终于出现了救援的灯光。' : '你循着呼喊前行，几次以为能够获救，却始终未能抵达安全地点。'
  const title = crisis.phase === 'captive' ? '隐藏意外 · 消失的行程' : crisis.phase === 'help' ? '隐藏意外 · 短暂的自由' : crisis.phase === 'escape' ? '隐藏意外 · 最后的灯光' : crisis.outcome === 'dead' ? '隐藏意外 · 未能归来' : crisis.outcome === 'injured' ? '隐藏意外 · 带着伤痕归来' : '隐藏意外 · 终于获救'
  const description = crisis.phase === 'captive'
    ? '一次看似普通的行程突然中断。你遭到电诈团伙绑架，被限制自由，并被强迫参与诈骗。此刻，你首先需要活下来。'
    : crisis.phase === 'help' ? `${first}${crisis.fatalRoute ? '此前遭到的非法器官摘取已造成严重伤害，你仍抱着获救的希望继续前行。' : '你身心俱疲，仍在努力寻找能够相信的援助。'}`
      : crisis.phase === 'escape' ? `${second}${crisis.fatalRoute ? '伤情持续恶化。你经历了求救、失联和短暂脱险，此刻仍不愿放弃。' : '漫长的逃生旅程接近终点，援助终于可能抵达。'}`
        : crisis.outcome === 'dead' ? '经历求救、失联和短暂脱险后，你未能等到及时救治。非法器官摘取造成的伤害夺去了你的生命。死亡原因：嘎腰子。'
          : crisis.outcome === 'injured' ? '你终于获救。严重伤害留下长期身体损伤，但你活着离开了这场噩梦。'
            : '外界援助终于抵达，你脱离了控制。这段曲折经历仍留下了心理创伤。'
  return { id: `surprise:mmr:${crisis.visit}:${crisis.phase}`, year: state.year, age: state.age, kind: 'choice', title, description: `${description}\n${FICTION}`, choices: options.map(([id, label, hint]) => ({ id: `surprise:mmr:${crisis.visit}:${crisis.phase}:${id}`, label, hint, effects: {} })), source: 'local' }
}

/** Caller must have completed payment and verified an actual foreign arrival.
 * Each travel/migration route draws at most once per calendar year (explicit cooldown). */
export function visitMyanmar(state: GameState, previous: Simulation, arrivalKey: string): SimulationResult {
  if (state.ended || state.age < 18 || crisisActive(previous) || (previous.myanmarVisitKeys?.includes(arrivalKey) || previous.myanmarLastVisitKey === arrivalKey)) return { state, simulation: previous }
  const visit = (previous.myanmarVisits ?? 0) + 1
  let simulation: Simulation = { ...previous, myanmarVisits: visit, myanmarLastVisitKey: arrivalKey, myanmarVisitKeys: [...(previous.myanmarVisitKeys ?? []), arrivalKey] }
  if (myanmarRoll(simulation.config.seed, visit) >= .8) {
    simulation = { ...simulation, notes: [...simulation.notes, { age: state.age, kind: 'event' as const, text: '隐藏行程 · 你平安完成了这次缅甸到访，留下了当地的旅行见闻。（虚构剧情的20%平安分支）' }].slice(-500) }
    return { state, simulation }
  }
  const crisis: MyanmarCrisis = { phase: 'captive', fatalRoute: myanmarRoll(simulation.config.seed, visit, 'fatal-route') < .9, visit, history: [], injured: false, resumeEvent: structuredClone(state.currentEvent) }
  simulation = { ...simulation, crisis }
  return sync({ ...state, currentEvent: crisisEvent(state, crisis) }, simulation)
}

export function resolveMyanmarDecision(state: GameState, previous: Simulation, choiceId: string): SimulationResult {
  const prior = previous.crisis
  if (state.ended || !prior || !crisisActive(previous) || !state.currentEvent.choices.some(c => c.id === choiceId) || !crisisEvent(state, prior).choices.some(c => c.id === choiceId)) throw new Error('这项危机选择已经失效。')
  const action = choiceId.split(':').at(-1)!
  const crisis: MyanmarCrisis = { ...prior, history: [...prior.history, action] }
  let next: GameState = { ...state, stats: { ...state.stats } }
  let simulation: Simulation = { ...previous, crisis }
  if (prior.phase === 'captive') {
    crisis.phase = 'help'
    next.stats.happiness = cap(next.stats.happiness - 12)
    next.stats.health = cap(next.stats.health - (action === 'escape' ? 6 : 2))
  } else if (prior.phase === 'help') {
    crisis.phase = 'escape'
    next.stats.health = cap(next.stats.health - (prior.fatalRoute ? 18 : 4))
    next.stats.happiness = cap(next.stats.happiness - 8)
  } else if (prior.phase === 'escape') {
    // Fate was drawn at arrival: actions change the journey, never the 90% parameter.
    crisis.outcome = prior.fatalRoute ? 'dead' : myanmarRoll(previous.config.seed, prior.visit, 'survivor-injury') < .5 ? 'injured' : 'rescued'
    crisis.injured = crisis.outcome === 'injured'
    crisis.phase = 'resolved'
    const outcome = crisis.outcome
    const injured = crisis.injured
    const summary = outcome === 'dead' ? '在虚构隐藏剧情中经历求救、失联与短暂脱险，最终因非法器官摘取造成的伤害死亡。死亡原因：嘎腰子。' : outcome === 'injured' ? '遭电诈团伙绑架后历经求救、失联与脱险，获救后仍留下严重且持久的身体伤害。' : '遭电诈团伙绑架后获救，仍需要时间修复心理创伤。'
    simulation = { ...simulation, ...(injured ? { myanmarInjury: true } : {}), notes: [...simulation.notes, { age: state.age, kind: 'event' as const, text: summary }].slice(-500) }
    next.stats.health = outcome === 'dead' ? 0 : cap(next.stats.health - (injured ? 38 : 5))
    next.stats.happiness = cap(next.stats.happiness - (injured ? 25 : 12))
    next.worldMessages = [...next.worldMessages, { id: `surprise:mmr:${prior.visit}:memory`, speaker: state.config.name, text: summary, year: state.year }].slice(-40)
    if (outcome === 'dead') {
      simulation.cause = '嘎腰子'
      next = { ...next, ended: true, ending: `${state.config.name}的一生在${state.year}年、${state.age}岁时结束。${summary}`, currentEvent: { ...crisisEvent(next, crisis), kind: 'life', choices: [] } }
    } else next.currentEvent = structuredClone(prior.resumeEvent)
    return sync(next, simulation)
  }
  next.currentEvent = crisisEvent(next, crisis)
  return sync(next, simulation)
}

/** Validate the suspended event as carefully as an active event before restoring it. */
export function validateMyanmarData(value: Simulation): boolean {
  const bounded = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max
  if (value.myanmarInjury !== undefined && typeof value.myanmarInjury !== 'boolean') return false
  if (value.myanmarVisits !== undefined && (!Number.isSafeInteger(value.myanmarVisits) || value.myanmarVisits < 1 || value.myanmarVisits > 10000)) return false
  if (value.myanmarLastVisitKey !== undefined && (!bounded(value.myanmarLastVisitKey, 100) || value.myanmarVisits === undefined)) return false
  if (value.myanmarVisitKeys !== undefined && (!Array.isArray(value.myanmarVisitKeys) || value.myanmarVisitKeys.length > 222 || !value.myanmarVisitKeys.every(key => bounded(key, 100)) || new Set(value.myanmarVisitKeys).size !== value.myanmarVisitKeys.length)) return false
  const c = value.crisis
  if (!c) return c === undefined
  if (!['captive', 'help', 'escape', 'resolved'].includes(c.phase) || !Number.isInteger(c.visit) || c.visit < 1 || (c.phase === 'resolved' ? c.visit > (value.myanmarVisits ?? 0) : c.visit !== value.myanmarVisits) || typeof c.fatalRoute !== 'boolean' || typeof c.injured !== 'boolean' || !Array.isArray(c.history) || c.history.length > 3 || !c.history.every(h => ['help', 'observe', 'escape'].includes(h))) return false
  const length = { captive: 0, help: 1, escape: 2, resolved: 3 }[c.phase]
  if (c.history.length !== length) return false
  if (length < 3 ? c.outcome !== undefined || c.injured : !['rescued', 'injured', 'dead'].includes(c.outcome!) || c.injured !== (c.outcome === 'injured')) return false
  if (c.phase === 'resolved' && c.fatalRoute !== (c.outcome === 'dead')) return false
  const e = c.resumeEvent
  if (!e || typeof e !== 'object' || !bounded(e.id, 180) || !Number.isInteger(e.age) || e.age < 18 || e.age > (value.years.at(-1)?.age ?? 0) || e.year !== value.config.birthYear + e.age || !['life', 'choice', 'relationship', 'world'].includes(e.kind) || !bounded(e.title, 140) || !bounded(e.description, 3000) || !['local', 'deepseek'].includes(e.source) || !Array.isArray(e.choices) || e.choices.length > 6) return false
  if (c.phase !== 'resolved' && e.age !== value.years.at(-1)?.age) return false
  return e.choices.every(choice => choice && bounded(choice.id, 180) && bounded(choice.label, 100) && bounded(choice.hint, 160) && choice.effects && typeof choice.effects === 'object' && !Array.isArray(choice.effects) && Object.entries(choice.effects).every(([k, v]) => ['health', 'happiness', 'knowledge', 'wealth'].includes(k) && typeof v === 'number' && Number.isFinite(v) && v >= -25 && v <= 25) && (choice.personId === undefined || bounded(choice.personId, 160)) && (choice.relationshipDelta === undefined || choice.personId !== undefined && Number.isFinite(choice.relationshipDelta) && Math.abs(choice.relationshipDelta) <= 15)) && new Set(e.choices.map(choice => choice.id)).size === e.choices.length
}


/** Cross-object invariants cannot be checked by either save validator alone. */
export function validMyanmarSnapshot(state: GameState, simulation: Simulation): boolean {
  const crisis = simulation.crisis
  const surprise = state.currentEvent.id.startsWith('surprise:mmr:') || state.currentEvent.choices.some(c => c.id.startsWith('surprise:mmr:'))
  if (!crisis) return !surprise
  if (state.age < 18) return false
  if (crisis.phase === 'resolved') {
    if (crisis.outcome === 'dead') return state.ended && state.age === crisis.resumeEvent.age && simulation.years.at(-1)?.alive === false && simulation.cause === '嘎腰子'
    return !surprise
  }
  if (state.ended || !isGameState({ ...state, currentEvent: crisis.resumeEvent })) return false
  const expected = crisisEvent(state, crisis)
  return state.currentEvent.id === expected.id && state.currentEvent.age === crisis.resumeEvent.age && state.currentEvent.choices.length === expected.choices.length && state.currentEvent.choices.every((choice, index) => {
    const canonical = expected.choices[index]
    return choice.id === canonical.id && choice.label === canonical.label && choice.hint === canonical.hint && Object.keys(choice.effects).length === 0 && choice.personId === undefined && choice.relationshipDelta === undefined
  })
}
