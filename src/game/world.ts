import { relationshipStrain } from './relationships.ts'
import type { Choice, GameState, LifeEvent, Person, WorldActionKind, WorldFact, WorldThread } from './types.ts'

function draw(state: GameState, key: string): number {
  let value = state.config.seed >>> 0
  for (const char of `${state.year}:${key}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x45d9f3b) >>> 0
  value ^= value >>> 16
  return (value >>> 0) / 4294967296
}
const present = (person: Person) => !person.role.includes('已离世')
const impacts = {
  support: '彼此愿意合作，但计划仍需要实际投入才能完成。',
  distance: '彼此还需要了解，具体行动比口头保证更能建立联系。',
  conflict: '已有分歧尚未修复，需要先处理关系，再考虑共同计划。',
}
function direction(person?: Person): WorldThread['direction'] {
  if (!person) return 'support'
  const strain = relationshipStrain(person)
  const score = (person.trust + person.closeness) / 2
  if (score < 30 || strain >= 5) return 'conflict'
  return strain > 0 || score < 60 ? 'distance' : 'support'
}

function premise(state: GameState, person: Person): Pick<WorldThread, 'title' | 'cause' | 'domain'> {
  const family = /mother|father|sibling|child/.test(person.id) || /家人|伴侣/.test(person.role)
  const domain = family ? 'family' : state.age < 18 || /老师|前辈/.test(person.role) ? 'learning' : 'community'
  const themes = domain === 'family' ? [
    ['一起整理相册', '对方提出一起整理旧照片，是否开始、能否完成，还需要你们安排时间。'],
    ['为家人留一个下午', '对方提出抽出一个下午聊聊近况，这是一项新的邀请，尚未落实。'],
  ] : domain === 'learning' ? [
    ['把兴趣做成一件小作品', '对方提出一起练习一项兴趣、做一件小作品，还需要确定具体安排。'],
    ['一次新的交流邀请', '对方邀请你交流最近学到的东西，先从一次力所能及的练习开始。'],
  ] : [
    ['一起改善身边的小事', '对方提出一起关注社区里的一个小问题，还在等待你的回应。'],
    ['一次需要分工的小合作', '对方想试做一件小事，邀请你先商量分工和各自能投入的时间。'],
  ]
  const [title, proposal] = themes[Math.floor(draw(state, `theme:${person.id}`) * themes.length)]!
  const evidence = person.relationshipHistory?.at(-1)
  const invitation = `${person.name}${proposal.replace(/^对方/, '')}`
  const cause = evidence ? `${evidence.year}年，${evidence.reason} 在这段关系的基础上，${invitation}` : invitation
  return { title: `${person.name}：${title}`, cause: cause.slice(0, 1000), domain }
}

export interface WorldAction { kind: WorldActionKind; amount: number; location: string; personId?: string }
const actionStories: Record<WorldAction['kind'], { title: string; cause: string; impact: string; followup: string; effects: Choice['effects'] }> = {
  health: { title: '把照顾身体变成习惯', cause: '投入了健康照护', impact: '身体的变化需要持续记录，已经支付照护费用并不等于疾病痊愈。', followup: '记录近况，约一次轻松活动', effects: { health: 2, happiness: 1 } },
  study: { title: '学过的东西有了用处', cause: '投入了学习', impact: '新学到的知识留下一个实践题目，下次可以带着作品请人交流。', followup: '做一件小作品，交流学习心得', effects: { knowledge: 3 } },
  social: { title: '聚会之后的下一次邀请', cause: '安排了一次社交活动', impact: '相聚时聊到的共同兴趣，有机会延续成一次具体合作。', followup: '邀请对方一起完成小计划', effects: { happiness: 3 } },
  travel: { title: '旅途带回来的故事', cause: '安排了一次旅行', impact: '沿途的见闻和相遇可以整理成故事，也为之后的联系留下话题。', followup: '整理旅行记录，继续了解当地', effects: { knowledge: 2, happiness: 2 } },
  home: { title: '新家门外的生活', cause: '支付了购房首付', impact: '安顿下来之后，如何熟悉邻里、安排共同空间成了新的小课题。', followup: '熟悉邻里，商量生活安排', effects: { happiness: 2 } },
  repay: { title: '还款之后的新约定', cause: '偿还了贷款', impact: '还款让你重新看待日常预算，可以和信任的人交流如何安排时间与生活。', followup: '复盘预算，约定可持续的日常', effects: { happiness: 2 } },
  invest: { title: '第一份观察记录', cause: '增加了投资投入', impact: '投入之后需要记录观察、理解风险；这次讨论不会自动买卖或保证收益。', followup: '交流风险，整理观察记录', effects: { knowledge: 2 } },
  migrate: { title: '新城市里的第一条熟路', cause: '支付了搬迁费用并迁居', impact: '新的住处和日常路线需要慢慢熟悉；迁居不代表已经融入当地生活。', followup: '请教当地生活，探索日常路线', effects: { knowledge: 3, happiness: 1 } },
}
function actionStory(thread: WorldThread) {
  const kind = thread.id.match(/^action-([a-z]+)-/)?.[1] as WorldActionKind | undefined
  return kind && Object.hasOwn(actionStories, kind) ? actionStories[kind] : undefined
}
const domains: Record<WorldActionKind, NonNullable<WorldThread['domain']>> = {
  health: 'health', study: 'learning', social: 'community', travel: 'travel', home: 'family', repay: 'finance', invest: 'finance', migrate: 'relocation',
}
function fact(state: GameState, entry: WorldFact): GameState {
  const people = new Set(state.people.map(p => p.id))
  const facts = (state.worldFacts ?? []).filter(f => f.id !== entry.id).map(f => {
    if (!f.personId || people.has(f.personId)) return f
    const copy = { ...f }; delete copy.personId; return copy
  })
  const id = entry.id.length <= 180 ? entry.id : `${entry.id.slice(0, 160)}-${Math.floor(draw(state, entry.id) * 4294967296).toString(36)}`
  return { ...state, worldFacts: [...facts.filter(f => f.id !== id), { ...entry, id, summary: entry.summary.slice(0, 320) }].slice(-48) }
}

/** Capture only new, actually settled relationship changes; old memories are never re-enacted. */
export function recordWorldChanges(before: GameState, after: GameState): GameState {
  let next = after
  for (const person of after.people) {
    const prior = new Set(before.people.find(p => p.id === person.id)?.relationshipHistory?.map(e => e.id) ?? [])
    for (const entry of person.relationshipHistory ?? []) if (!prior.has(entry.id)) {
      next = fact(next, { id: `relationship:${entry.id}`, year: entry.year, kind: 'relationship', personId: person.id,
        summary: `${person.name}：${entry.reason}（亲密${entry.closenessDelta >= 0 ? '+' : ''}${entry.closenessDelta}，信任${entry.trustDelta >= 0 ? '+' : ''}${entry.trustDelta}）` })
    }
  }
  return next
}
function note(thread: WorldThread, year: number, kind: NonNullable<WorldThread['milestones']>[number]['kind'], text: string) {
  thread.milestones = [...(thread.milestones ?? [{ year: thread.startedYear, kind: 'origin' as const, text: thread.cause.slice(0, 240) }]), { year, kind, text: text.slice(0, 240) }].slice(-8)
}
function finish(state: GameState, thread: WorldThread, outcome: NonNullable<WorldThread['outcome']>, text: string): GameState {
  thread.status = 'resolved'; thread.outcome = outcome; thread.impact = text
  note(thread, state.year, 'outcome', text)
  return fact(state, { id: `outcome:${thread.id}`, year: state.year, kind: 'outcome', summary: `「${thread.title}」：${text}`, ...(thread.personId ? { personId: thread.personId } : {}) })
}
function related(threads: WorldThread[], personId: string | undefined, domain: WorldThread['domain'], location: string) {
  return threads.filter(t => t.outcome === 'completed' && t.domain === domain && t.personId === personId && (!t.location || t.location === location)).at(-1)
}
function blocked(state: GameState, thread: WorldThread): string | undefined {
  if (thread.direction === 'conflict') return '已有分歧还没有修复，需要先倾听并重新商量边界。'
  if (state.stats.health < 35 && thread.domain !== 'health') return '眼下身体状况不佳，需要先照顾健康，再投入这项安排。'
  const context = state.worldContext?.year === state.year ? state.worldContext : undefined
  if (context && context.dependents >= 2 && state.focus === 'career' && thread.stage >= 2) return '工作重心与家中未成年孩子的照护占用了精力，需要先调整重心或商量安排。'
  if ((state.worldThreads ?? []).some(other => other.id !== thread.id && other.lastActionYear === state.year && other.milestones?.some(m => m.year === state.year && m.kind === 'action'))) return '今年已经投入另一项计划，需要留到下一年再作实际推进。'
  return undefined
}
function ready(state: GameState, thread: WorldThread) {
  return thread.status === 'active' && thread.lastActionYear !== state.year && (thread.startedYear === state.year || thread.nextYear <= state.year)
}
function contribute(state: GameState, thread: WorldThread, text: string): GameState {
  thread.stage = Math.min(3, thread.stage + 1) as WorldThread['stage']
  thread.lastActionYear = state.year; thread.lastEvaluatedYear = state.year; thread.stalledYears = 0; thread.nextYear = state.year + 1
  thread.impact = `${text}${thread.stage < 3 ? '已经迈出实际一步，下一阶段还需要在之后的年份继续投入。' : ''}`
  note(thread, state.year, 'action', thread.impact)
  return thread.stage === 3 ? finish(state, thread, 'completed', '你们的实际投入让计划完成，前后经过已留在记录中。'.replace('你们的', thread.personId ? '你们的' : '你的')) : state
}

/** Completed spending is evidence; it neither invents companions nor replaces another open plan. */
export function recordWorldAction(original: GameState, action: WorldAction): GameState {
  if (original.ended || original.age < 6 || !Number.isFinite(action.amount) || action.amount <= 0 || !Object.hasOwn(actionStories, action.kind)) return original
  if (original.age < 18 && ['home', 'repay', 'invest', 'migrate'].includes(action.kind)) return original
  const location = action.location.slice(0, 100)
  const person = original.people.find(p => p.id === action.personId && present(p))
  const story = actionStories[action.kind]
  const id = `action-${action.kind}-${original.year}-${Math.floor(draw(original, location) * 4294967296).toString(36)}`
  const cause = `${original.year}年，你在${location}${story.cause}，本次实际支出或投入${action.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} PPP美元。${person ? `${person.name}实际参与了这次活动。` : '这是你自己的安排。'}`
  let state = fact(original, { id, year: original.year, kind: action.kind, summary: cause, location, ...(person ? { personId: person.id } : {}) })
  if (state.config.intelligence <= 0) return state
  const threads = (state.worldThreads ?? []).map(t => ({ ...t }))
  const existing = threads.find(t => t.status === 'active' && t.id.startsWith(`action-${action.kind}-`) && t.location === location && t.personId === person?.id)
  if (existing) {
    // Another receipt alone is not another year of work or a guaranteed cure/return.
    const lastReceipt = existing.milestones?.at(-1)
    if (lastReceipt?.year !== state.year || lastReceipt.text !== cause.slice(0, 240)) note(existing, state.year, 'origin', cause)
    if (state.year > existing.startedYear && ready(state, existing) && !blocked(state, existing)) state = contribute(state, existing, '你在后续年份再次作出实际投入。')
  } else if (threads.filter(t => t.status === 'active').length < 3) {
    const domain = domains[action.kind]
    const prior = related(threads, person?.id, domain, location)
    const threadId = threads.some(t => t.id === id) ? `${id}-next` : id
    const origin = `${prior ? `此前「${prior.title}」已完成，相关经验可以用于这次安排。` : ''}${cause}`
    threads.push({ id: threadId, ...(person ? { personId: person.id } : {}), title: `${location}：${story.title}`.slice(0, 140), cause: origin,
      stage: 1, status: 'active', direction: direction(person), impact: `${story.impact}后续仍需实际行动。`, startedYear: state.year, nextYear: state.year + 1,
      domain, location, lastEvaluatedYear: state.year, stalledYears: 0, milestones: [{ year: state.year, kind: 'origin', text: origin.slice(0, 240) }], ...(prior ? { relatedThreadId: prior.id } : {}),
    })
  }
  return evolveWorld({ ...state, worldUpdatedYear: state.year, worldThreads: bounded(threads) })
}
function bounded(threads: WorldThread[]): WorldThread[] {
  const kept = [...threads.filter(t => t.status === 'resolved').slice(-6), ...threads.filter(t => t.status === 'active').slice(-3)]
  const ids = new Set(kept.map(t => t.id))
  return kept.map(t => { if (!t.relatedThreadId || ids.has(t.relatedThreadId)) return t; const copy = { ...t }; delete copy.relatedThreadId; return copy })
}

/** Revalidate immediately before local rewards, including choices rendered before a conversation. */
export function worldChoiceAvailable(state: GameState, choice: Choice): boolean {
  if (!choice.id.startsWith('world:')) return true
  const thread = state.worldThreads?.find(t => choice.id.startsWith(`world:${t.id}:`))
  if (!thread || !ready(state, thread)) return false
  if (thread.personId && !state.people.some(p => p.id === thread.personId && present(p))) return false
  const action = choice.id.slice(`world:${thread.id}:`.length)
  const person = state.people.find(p => p.id === thread.personId)
  const current = { ...thread, direction: direction(person) }
  return ['wait', 'close', 'repair'].includes(action) || action === 'engage' && !blocked(state, current)
}

/** Time reviews an unfinished plan; only actual actions can complete it. */
export function evolveWorld(original: GameState, choice?: Choice): GameState {
  let state = original
  const peopleIds = new Set(state.people.map(p => p.id))
  if (state.worldFacts?.some(f => f.personId && !peopleIds.has(f.personId))) state = { ...state, worldFacts: state.worldFacts.map(f => {
    if (!f.personId || peopleIds.has(f.personId)) return f
    const remembered = { ...f }; delete remembered.personId; return remembered
  }) }
  const annual = state.worldUpdatedYear !== state.year
  const threads = (state.worldThreads ?? []).filter(t => !t.personId || state.people.some(p => p.id === t.personId)).map(t => ({ ...t }))
  if (state.ended) return { ...state, worldThreads: bounded(threads) }
  for (const thread of threads) {
    if (thread.status === 'resolved') continue
    if (!choice?.id.startsWith(`world:${thread.id}:`) && thread.lastActionYear === undefined && state.currentEvent.id.startsWith(`world:${thread.id}:`) && state.currentEvent.choices.length === 0 && state.currentEvent.description.includes('\n你选择了：')) {
      thread.lastActionYear = state.year
      thread.nextYear = Math.max(thread.nextYear, state.year + 1)
    }
    const person = state.people.find(p => p.id === thread.personId)
    if (thread.personId && person && !present(person)) { state = finish(state, thread, 'interrupted', '参与者已离世，计划在这里中断；没有把未完成的事情记作成功。'); continue }
    const route = direction(person)
    if (thread.direction !== route) {
      thread.direction = route
      const reason = person?.relationshipHistory?.at(-1)?.reason
      thread.impact = `${reason ? `${reason} ` : ''}${thread.personId ? impacts[route] : '自己的安排仍需实际推进。'}`
      note(thread, state.year, 'relationship', thread.impact)
    }
    const action = choice?.id.startsWith(`world:${thread.id}:`) ? choice.id.slice(`world:${thread.id}:`.length) : undefined
    if (action && ready(state, thread)) {
      const evidence = `你选择了「${choice!.label}」。`
      state = fact(state, { id: `decision:${thread.id}:${state.year}`, year: state.year, kind: 'decision', summary: `「${thread.title}」：${evidence}`, ...(thread.personId ? { personId: thread.personId } : {}) })
      if (action === 'close') state = finish(state, thread, 'withdrawn', '你明确结束了这项安排，保留已有经历，不把放弃当成完成。')
      else if (action === 'engage' && !blocked(state, thread)) state = contribute(state, thread, evidence)
      else {
        thread.lastActionYear = state.year; thread.lastEvaluatedYear = state.year; thread.nextYear = state.year + 1
        thread.impact = action === 'repair' ? '你先回应了已有分歧，关系仍需实际修复；共同计划尚未完成。' : '你说明了近况，决定留到下一年再谈；计划仍然未完成。'
        note(thread, state.year, action === 'repair' ? 'relationship' : 'delay', thread.impact)
      }
    } else if (state.config.intelligence > 0 && state.year >= thread.nextYear && (thread.lastEvaluatedYear ?? state.worldUpdatedYear ?? thread.startedYear) < state.year) {
      thread.lastEvaluatedYear = state.year
      thread.stalledYears = Math.min(3, (thread.stalledYears ?? 0) + 1)
      state = fact(state, { id: `review:${thread.id}:${state.year}`, year: state.year, kind: 'decision', summary: `「${thread.title}」已连续${thread.stalledYears}次年度回顾没有新的实际推进。`, ...(thread.personId ? { personId: thread.personId } : {}) })
      if (thread.stalledYears >= 3) state = finish(state, thread, 'lapsed', '这项安排连续多年没有实际推进，已搁置；旧的结果仍会作为经历保留。')
      else {
        thread.impact = blocked(state, thread) ?? `又过了一年，${thread.stage === 1 ? '邀请仍未落实' : '已有投入还没有形成最终结果'}。需要实际行动，等待不会自动完成计划。`
        note(thread, state.year, 'delay', thread.impact)
      }
    }
  }
  if (annual && state.config.intelligence > 0 && state.age >= 6 && threads.filter(t => t.status === 'active').length < 3 && draw(state, 'start') < state.config.intelligence / 100 * .85) {
    const available = state.people.filter(person => present(person) && person.age >= 6 && !threads.some(t => t.personId === person.id && (t.status === 'active' || state.year - t.startedYear < 4)))
    const person = available[Math.floor(draw(state, 'person') * available.length)]
    if (person) {
      const story = premise(state, person)
      const previous = related(threads, person.id, story.domain, state.config.location)
      const cause = `${previous ? `此前「${previous.title}」已经完成，真实的合作经验让这次新邀请有了基础。` : ''}${story.cause}`
      threads.push({ id: `${state.config.seed}-${state.year}-${person.id}`, personId: person.id, ...story, cause,
        stage: 1, status: 'active', direction: direction(person), impact: impacts[direction(person)], startedYear: state.year, nextYear: state.year + 1,
        location: state.config.location, lastEvaluatedYear: state.year, stalledYears: 0, milestones: [{ year: state.year, kind: 'origin', text: cause.slice(0, 240) }], ...(previous ? { relatedThreadId: previous.id } : {}),
      })
    }
  }
  state = { ...state, worldThreads: bounded(threads), worldUpdatedYear: state.year }
  const pending = state.currentEvent.choices.find(c => c.id.startsWith('world:'))
  if (pending) {
    const current = state.worldThreads?.find(t => pending.id.startsWith(`world:${t.id}:`))
    const refreshed = current && worldThreadEvent(state, current.id)
    if (refreshed && JSON.stringify(refreshed.choices) !== JSON.stringify(state.currentEvent.choices)) state = { ...state, currentEvent: refreshed }
    else if (current && (current.status === 'resolved' || current.lastActionYear === state.year)) state = { ...state, currentEvent: { ...state.currentEvent, description: `${state.currentEvent.description}\n${current.impact}`.slice(0, 3000), choices: [], source: 'local' } }
  }
  return state
}

export function worldThreadEvent(state: GameState, preferredId?: string): LifeEvent | undefined {
  if (state.ended || state.age < 6 || state.config.intelligence <= 0) return undefined
  if (state.currentEvent.choices.some(c => c.id.startsWith('sim:') || c.id.includes('-action-'))) return undefined
  const candidates = state.worldThreads?.filter(t => ready(state, t) && (!t.personId || state.people.some(p => p.id === t.personId && present(p))))
  const thread = preferredId ? candidates?.find(t => t.id === preferredId) : candidates?.find(t => t.id.startsWith('action-')) ?? candidates?.[0]
  if (!thread) return undefined
  const prefix = `world:${thread.id}:`
  const problem = blocked(state, thread)
  const repair = thread.direction === 'conflict'
  const story = actionStory(thread)
  const context = state.worldContext
  const constraints = context?.year === state.year ? [context.occupation, context.dependents ? `家中有${context.dependents}位未成年孩子` : '', context.debt > context.annualIncome * 2 && context.debt > context.cash ? '已有债务仍需安排' : ''].filter(Boolean).join('；') : ''
  const choices: Choice[] = [
    ...(!problem || repair ? [{ id: prefix + (repair ? 'repair' : 'engage'), label: repair ? '先把分歧说清，再商量安排' : story?.followup ?? '留出时间，实际推进这项安排', hint: repair ? '先修复关系，不会直接完成计划' : '本年投入一次，之后仍需继续跟进', effects: repair ? {} : story?.effects ?? { happiness: 2, knowledge: 1 }, ...(thread.personId ? { personId: thread.personId, relationshipDelta: repair ? 2 : 2 } : {}) }] : []),
    { id: prefix + 'wait', label: problem && !repair ? '先处理眼前的困难，明年再谈' : '说明近况，留到下一年再谈', hint: '保留计划和等待经过，不会自动完成', effects: {} },
    { id: prefix + 'close', label: '坦诚结束这项安排', hint: '记为主动放下，保留前后的经历', effects: {} },
  ]
  return { id: `${prefix}${state.year}`, year: state.year, age: state.age, kind: 'world', source: 'local', title: thread.title + (thread.stage === 2 ? '，还需要下一步' : ''), description: `${thread.cause}\n${thread.impact}${problem ? `\n${problem}` : ''}${constraints ? `\n眼下的生活：${constraints}。` : ''}`, choices }
}

const short = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
export function validateWorldContext(value: unknown, year: number, location: string): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return v.year === year && v.location === location && short(v.location, 100) && short(v.occupation, 100) && short(v.education, 100)
    && ['cash', 'debt', 'annualIncome', 'annualExpenses'].every(k => number(v[k], 0, 1e12)) && number(v.dependents, 0, 12) && Number.isInteger(v.dependents)
}
export function validateWorldFacts(value: unknown, firstYear: number, year: number, peopleIds: Set<string>): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > 48) return false
  const ids = new Set<string>()
  return value.every(v => {
    if (!v || typeof v !== 'object' || !short(v.id, 180) || ids.has(v.id) || !Number.isInteger(v.year) || v.year < firstYear || v.year > year || !short(v.summary, 320)
      || ![...Object.keys(actionStories), 'relationship', 'decision', 'outcome'].includes(v.kind) || v.personId !== undefined && !peopleIds.has(v.personId) || v.location !== undefined && !short(v.location, 100)) return false
    ids.add(v.id); return true
  })
}
export function validateWorldThreads(value: unknown, year: number, peopleIds?: Set<string>): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > 9) return false
  const ids = new Set<string>()
  const references = new Map(value.filter(v => v && typeof v === 'object').map(v => [v.id, v.startedYear]))
  let active = 0, resolved = 0
  return value.every(t => {
    if (!t || typeof t !== 'object' || Array.isArray(t) || !short(t.id, 180) || ids.has(t.id) || t.personId !== undefined && (!short(t.personId, 100) || peopleIds && !peopleIds.has(t.personId))) return false
    ids.add(t.id)
    if (!short(t.title, 140) || !short(t.cause, 1000) || !short(t.impact, 1000) || ![1, 2, 3].includes(t.stage) || !['support', 'distance', 'conflict'].includes(t.direction)) return false
    if (t.status === 'active') active++; else if (t.status === 'resolved') resolved++; else return false
    if (active > 3 || resolved > 6 || !Number.isInteger(t.startedYear) || t.startedYear < 1900 || t.startedYear > year || !Number.isInteger(t.nextYear) || t.nextYear < t.startedYear || t.nextYear > year + 3) return false
    if (t.domain !== undefined && !['family', 'learning', 'community', 'health', 'finance', 'travel', 'relocation'].includes(t.domain) || t.location !== undefined && !short(t.location, 100)) return false
    if (t.lastActionYear !== undefined && (!Number.isInteger(t.lastActionYear) || t.lastActionYear < t.startedYear || t.lastActionYear > year) || t.lastEvaluatedYear !== undefined && (!Number.isInteger(t.lastEvaluatedYear) || t.lastEvaluatedYear < t.startedYear || t.lastEvaluatedYear > year)) return false
    if (t.stalledYears !== undefined && (!Number.isInteger(t.stalledYears) || t.stalledYears < 0 || t.stalledYears > 3)) return false
    if (t.outcome !== undefined && (t.status !== 'resolved' || !['completed', 'withdrawn', 'lapsed', 'interrupted'].includes(t.outcome))) return false
    if (t.milestones !== undefined && (!Array.isArray(t.milestones) || t.milestones.length > 8 || !t.milestones.every((m: Record<string, unknown>, i: number) => m && typeof m === 'object' && Number.isInteger(m.year) && (m.year as number) >= t.startedYear && (m.year as number) <= year && (!i || (m.year as number) >= t.milestones[i - 1].year) && ['origin', 'action', 'delay', 'relationship', 'outcome'].includes(m.kind as string) && short(m.text, 240)))) return false
    return t.relatedThreadId === undefined || short(t.relatedThreadId, 180) && t.relatedThreadId !== t.id && references.has(t.relatedThreadId) && references.get(t.relatedThreadId) <= t.startedYear
  })
}
