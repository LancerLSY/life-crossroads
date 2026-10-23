import { relationshipStrain } from './relationships.ts'
import type { Choice, GameState, LifeEvent, Person, WorldThread } from './types.ts'

// Separate keyed draws keep replay stable even when another subsystem consumes randomness.
function draw(state: GameState, key: string): number {
  let value = state.config.seed >>> 0
  for (const char of `${state.year}:${key}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x45d9f3b) >>> 0
  value ^= value >>> 16
  return (value >>> 0) / 4294967296
}
const present = (person: Person) => !person.role.includes('已离世')
function direction(_state: GameState, person: Person): WorldThread['direction'] {
  const strain = relationshipStrain(person)
  const score = (person.trust + person.closeness) / 2
  if (score < 30 || strain >= 5) return 'conflict'
  if (strain > 0) return 'distance'
  return score >= 60 ? 'support' : 'distance'
}
const impacts = {
  support: '信任让共同计划继续推进，也为下一次合作留下机会。',
  distance: '彼此还需要更多了解，共同计划推进较慢；一次主动联系仍可能改变走向。',
  conflict: '未说清的分歧拖慢了共同计划，需要倾听与重新约定边界。',
}
function premise(state: GameState, person: Person, route: WorldThread['direction']): { title: string; cause: string } {
  const family = /mother|father|sibling|child/.test(person.id) || /家人|伴侣/.test(person.role)
  const young = state.age < 18
  const themes: [string, string][] = route === 'conflict'
    ? young
      ? [['借来的东西去了哪里', '一件借来的小物品没有按时归还，你们对当时的约定记得不一样。'], ['没等到的同行', '约好一起散步的那天，有人没有等到对方，误会还没说开。']]
      : [['被误解的一次分工', '共同活动的分工没有说清，双方都以为另一人会负责收尾。'], ['落空的邀请', '上次的邀请迟迟没有回应，对方以为你不愿再一起参加活动。']]
    : route === 'distance'
      ? [['一个还没回应的邀请', '对方试探着提起一次共同活动，彼此都还不确定能否迈出下一步。'], ['一段还不熟悉的往事', '对方想把自己的一段旧事整理下来，却还拿不准是否要邀请你一起参与。']]
      : family
        ? [['相册里的另一段故事', '翻旧照片时，家人提起一段你没听过的往事，想和你一起把它记录下来。'], ['为家人留一个下午', '最近一次体贴的回应，让家人提出定期一起散步、聊聊近况的约定。']]
        : young || /老师|前辈/.test(person.role)
          ? [['一本书带来的邀请', '你们聊过的兴趣被记住了，对方邀请你一起读一本书，再做一件小作品。'], ['有人愿意陪你练习', '对方看见了你的努力，愿意陪你练习一项技能，并在小活动里分享成果。']]
          : [['熟人推荐的小机会', '对方愿意把你介绍给兴趣小组，先从一次合作活动互相了解。'], ['一起改善身边的小事', '你们注意到社区里一个可以改善的小问题，打算约几位熟人一起试试。']]
  const theme = themes[Math.floor(draw(state, `theme:${person.id}`) * themes.length)]!
  return { title: `${person.name}：${theme[0]}`, cause: `${person.name}提起一件事：${theme[1]}` }
}

export interface WorldAction {
  kind: 'health' | 'study' | 'social' | 'travel' | 'home' | 'repay' | 'invest' | 'migrate'
  amount: number
  location: string
  personId?: string
}

const actionStories: Record<WorldAction['kind'], { title: string; cause: string; impact: string; followup: string; effects: Choice['effects'] }> = {
  health: { title: '把照顾身体变成习惯', cause: '投入了健康照护', impact: '身体的变化值得持续记录，也有人愿意陪你坚持合适的日常活动。', followup: '记录近况，约一次轻松活动', effects: { health: 2, happiness: 1 } },
  study: { title: '学过的东西有了用处', cause: '投入了学习', impact: '新学到的知识留下一个实践题目，下次可以带着作品请人交流。', followup: '做一件小作品，交流学习心得', effects: { knowledge: 3 } },
  social: { title: '聚会之后的下一次邀请', cause: '安排了一次社交活动', impact: '相聚时聊到的共同兴趣，有机会延续成一次具体合作。', followup: '邀请对方一起完成小计划', effects: { happiness: 3 } },
  travel: { title: '旅途带回来的故事', cause: '安排了一次旅行', impact: '沿途的见闻和相遇可以整理成故事，也为之后的联系留下话题。', followup: '整理旅行故事，与同行者交流', effects: { knowledge: 2, happiness: 2 } },
  home: { title: '新家门外的生活', cause: '支付了购房首付', impact: '安顿下来之后，如何熟悉邻里、安排共同空间成了新的小课题。', followup: '熟悉邻里，商量生活安排', effects: { happiness: 2 } },
  repay: { title: '还款之后的新约定', cause: '偿还了贷款', impact: '还款让你重新看待日常预算，可以和信任的人交流如何安排时间与生活。', followup: '复盘预算，约定可持续的日常', effects: { happiness: 2 } },
  invest: { title: '第一份观察记录', cause: '增加了投资投入', impact: '投入之后需要记录观察、理解风险；这次讨论不会自动买卖或保证收益。', followup: '交流风险，整理观察记录', effects: { knowledge: 2 } },
  migrate: { title: '新城市里的第一条熟路', cause: '支付了搬迁费用并迁居', impact: '新的住处、语言和日常路线需要慢慢熟悉，身边的联系会影响适应过程。', followup: '请教当地生活，探索日常路线', effects: { knowledge: 3, happiness: 1 } },
}
function actionStory(thread: WorldThread) {
  const kind = thread.id.match(/^action-([a-z]+)-/)?.[1] as WorldAction['kind'] | undefined
  return kind && Object.hasOwn(actionStories, kind) ? actionStories[kind] : undefined
}

/** Record an already completed, paid action. Never charges money or advances time. */
export function recordWorldAction(state: GameState, action: WorldAction): GameState {
  if (state.ended || state.age < 6 || state.config.intelligence <= 0 || !Number.isFinite(action.amount) || action.amount <= 0 || !Object.hasOwn(actionStories, action.kind)) return state
  if (state.age < 18 && ['home', 'repay', 'invest', 'migrate'].includes(action.kind)) return state
  const people = state.people.filter(present)
  const person = people.find(person => person.id === action.personId)
    ?? (action.kind === 'study' ? people.find(person => /老师|前辈/.test(person.role)) : undefined)
    ?? [...people].sort((a, b) => b.trust + b.closeness - a.trust - a.closeness)[0]
  if (!person) return state
  const story = actionStories[action.kind]
  const location = action.location.slice(0, 100)
  const id = `action-${action.kind}-${state.year}-${Math.floor(draw(state, location) * 4294967296).toString(36)}`
  const threads = (state.worldThreads ?? []).map(thread => ({ ...thread }))
  const existing = threads.find(thread => thread.id === id)
  const route = direction(state, person)
  const cause = `${state.year}年，你在${location}${story.cause}，本次实际支出或投入${action.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} PPP美元。${person.name}是这条后续联系的参与者。`
  if (existing) {
    // Repeating a purchase is not a way to skip years or repeatedly finish a story.
    existing.cause = cause
    existing.impact = `你又为这件事采取了行动。${story.impact}`
  } else {
    const linked = state.config.intelligence >= 80 ? threads.filter(thread => thread.direction === 'support').at(-1) : undefined
    if (threads.filter(thread => thread.status === 'active').length >= 3) {
      const displaced = threads.find(thread => thread.status === 'active' && !state.currentEvent.choices.some(choice => choice.id.startsWith(`world:${thread.id}:`)))
      if (!displaced) return state
      displaced.status = 'resolved'
      displaced.impact = '新的安排占用了注意力，这项旧计划暂时告一段落。'
    }
    threads.push({ id, personId: person.id, title: `${location}：${story.title}`.slice(0, 140), cause: `${linked ? `此前「${linked.title}」留下的联系延续到了这次行动。` : ''}${cause}`,
      stage: 1, status: 'active', direction: route, impact: `${story.impact}${impacts[route]}`, startedYear: state.year, nextYear: state.year + 1,
      ...(linked ? { relatedThreadId: linked.id } : {}),
    })
  }
  return { ...state, worldUpdatedYear: state.year, worldThreads: bounded(threads) }
}

function bounded(threads: WorldThread[]): WorldThread[] {
  const retained = [...threads.filter(thread => thread.status === 'resolved').slice(-6), ...threads.filter(thread => thread.status === 'active').slice(-3)]
  const ids = new Set(retained.map(thread => thread.id))
  for (const thread of retained) if (thread.relatedThreadId && !ids.has(thread.relatedThreadId)) delete thread.relatedThreadId
  return retained
}

/** Call after annual simulation (including mortality), chat, or choice resolution.
 * Same-year calls only react to relationships/explicit choices; never advance time.
 * Existing choice effects remain owned by the engine. */
export function evolveWorld(state: GameState, choice?: Choice): GameState {
  const retained = (state.worldThreads ?? []).filter(thread => state.people.some(person => person.id === thread.personId)).map(thread => ({ ...thread }))
  if (state.ended) return { ...state, worldThreads: bounded(retained) }
  const intelligence = Math.max(0, Math.min(100, state.config.intelligence)) / 100
  const annual = state.worldUpdatedYear !== state.year
  let threads = retained
  for (const thread of threads) {
    if (thread.status === 'resolved') continue
    const person = state.people.find(item => item.id === thread.personId)
    if (!person || !present(person)) {
      thread.status = 'resolved'
      thread.impact = '共同计划停在这里，已有的经历成为记忆。'
      continue
    }
    thread.direction = direction(state, person)
    thread.impact = `${actionStory(thread)?.impact ?? ''}${impacts[thread.direction]}`
    const action = choice?.id.startsWith(`world:${thread.id}:`) ? choice.id.slice(`world:${thread.id}:`.length) : undefined
    if (action === 'close') {
      thread.status = 'resolved'
      thread.impact = '你明确结束了这项约定，双方可以把精力留给其他事情。'
    } else if (action === 'engage' || action === 'repair') {
      thread.stage = Math.min(3, thread.stage + 1) as WorldThread['stage']
      thread.nextYear = state.year + 1
      if (thread.stage === 3) {
        thread.status = 'resolved'
        thread.impact = action === 'repair' ? '你们谈清分歧，为这段共同经历收好了尾。' : '共同计划落地，这段经历成为下一次互相支持的基础。'
      }
    } else if (action === 'wait') {
      thread.nextYear = state.year + 1
      thread.impact = '你为这件事留出了等待的时间，下次节点再作决定。'
    } else if (annual && intelligence > 0 && state.year >= thread.nextYear) {
      thread.stage = Math.min(3, thread.stage + 1) as WorldThread['stage']
      thread.nextYear = state.year + (intelligence >= 0.8 ? 1 : 2)
      if (thread.stage === 3) {
        thread.status = 'resolved'
        thread.impact = thread.direction === 'support' ? '持续的信任让计划顺利完成，你们多了一段共同经历。' : '这项计划暂时告一段落，尚未靠近的距离仍留在关系中。'
      }
    }
  }
  if (annual && intelligence > 0 && state.age >= 6 && threads.filter(thread => thread.status === 'active').length < 3 && draw(state, 'start') < intelligence * 0.85) {
    const available = state.people.filter(person => present(person) && !threads.some(thread => thread.status === 'active' && thread.personId === person.id))
    const person = available[Math.floor(draw(state, 'person') * available.length)]
    if (person) {
      const linked = intelligence >= 0.8 && draw(state, 'link') < intelligence * 0.65 ? threads.filter(thread => thread.direction === 'support' && thread.personId !== person.id).at(-1) : undefined
      const route = direction(state, person)
      const story = premise(state, person, route)
      threads.push({
        id: `${state.config.seed}-${state.year}-${person.id}`, personId: person.id,
        title: story.title,
        cause: `${linked ? `此前「${linked.title}」留下的联系，让这件事有了继续发展的机会。` : ''}${story.cause}`,
        stage: 1, status: 'active', direction: route, impact: impacts[route], startedYear: state.year, nextYear: state.year + (intelligence >= 0.8 ? 1 : 2),
        ...(linked ? { relatedThreadId: linked.id } : {}),
      })
    }
  }
  threads = bounded(threads)
  return { ...state, worldThreads: threads, worldUpdatedYear: state.year }
}

/** Optional event; caller must preserve education/family and other mandatory events.
 * Calling this does not consume or resolve the thread. */
export function worldThreadEvent(state: GameState): LifeEvent | undefined {
  if (state.ended || state.age < 6 || state.config.intelligence <= 0) return undefined
  if (state.currentEvent.choices.some(choice => choice.id.startsWith('sim:') || choice.id.includes('-action-'))) return undefined
  const candidates = state.worldThreads?.filter(item => item.status === 'active' && (item.startedYear === state.year || item.stage === 2) && state.people.some(person => person.id === item.personId && present(person)))
  const thread = candidates?.find(item => item.id.startsWith('action-')) ?? candidates?.[0]
  if (!thread) return undefined
  const prefix = `world:${thread.id}:`
  const support = thread.direction === 'support'
  const story = actionStory(thread)
  return {
    id: `${prefix}${state.year}`, year: state.year, age: state.age, kind: 'world', source: 'local',
    title: thread.title + (thread.stage === 2 ? '，有了后续' : ''), description: `${thread.cause}\n${thread.impact}`,
    choices: [
      { id: prefix + (support ? 'engage' : 'repair'), label: story ? `${support ? '' : '听听对方，再'}${story.followup}` : support ? '一起把约定推进一步' : '听听对方，重新商量约定', hint: '让这段关系影响共同计划的下一步', effects: story?.effects ?? (support ? { happiness: 3, knowledge: 2 } : { happiness: 1 }), personId: thread.personId, relationshipDelta: support ? 3 : 5 },
      { id: prefix + 'wait', label: '说明近况，约好以后再谈', hint: '保留线索，下一年再考虑', effects: {}, personId: thread.personId, relationshipDelta: 1 },
      { id: prefix + 'close', label: '坦诚结束这项约定', hint: '结束计划，尊重彼此的时间', effects: {}, personId: thread.personId, relationshipDelta: 0 },
    ],
  }
}

/** Optional save extension: old saves may omit it entirely. */
export function validateWorldThreads(value: unknown, year: number, peopleIds?: Set<string>): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > 9) return false
  const ids = new Set<string>()
  let active = 0
  let resolved = 0
  const short = (value: unknown, limit: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
  const references = new Map(value.filter(item => item && typeof item === 'object').map(item => [item.id, item.startedYear]))
  return value.every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const thread = item as Record<string, unknown>
    if (!short(thread.id, 180) || ids.has(thread.id as string) || !short(thread.personId, 100) || (peopleIds && !peopleIds.has(thread.personId as string))) return false
    ids.add(thread.id as string)
    if (!short(thread.title, 140) || !short(thread.cause, 1000) || !short(thread.impact, 1000)) return false
    if (![1, 2, 3].includes(thread.stage as number) || !['support', 'distance', 'conflict'].includes(thread.direction as string)) return false
    if (thread.status === 'active') active++
    else if (thread.status === 'resolved') resolved++
    else return false
    return active <= 3 && resolved <= 6
      && Number.isInteger(thread.startedYear) && (thread.startedYear as number) <= year && (thread.startedYear as number) >= 1900
      && Number.isInteger(thread.nextYear) && (thread.nextYear as number) >= (thread.startedYear as number) && (thread.nextYear as number) <= year + 3
      && (thread.relatedThreadId === undefined || short(thread.relatedThreadId, 180) && thread.relatedThreadId !== thread.id && references.has(thread.relatedThreadId) && references.get(thread.relatedThreadId) <= (thread.startedYear as number))
  })
}
