import assert from 'node:assert/strict'
import test from 'node:test'
import { createLife, interact, resolveChoice, isGameState, setFocus } from './engine.ts'
import { evolveWorld, recordWorldAction, worldThreadEvent, validateWorldThreads } from './world.ts'
import type { GameState, WorldThread } from './types.ts'
import { applyRelationshipAssessments } from './relationships.ts'

const life = (): GameState => {
  const s = createLife({ seed: 7, startAge: 20, intelligence: 100 })
  return { ...s, worldUpdatedYear: s.year, currentEvent: { ...s.currentEvent, choices: [] } }
}
const plan = (s: GameState): WorldThread => ({ id: 'causal-plan', personId: s.people[0]!.id, title: '一起整理相册', cause: '今年对方提出整理相册的邀请。', stage: 1, status: 'active', direction: 'support', impact: '邀请尚未落实。', startedYear: s.year, nextYear: s.year + 1, domain: 'family' })
const year = (s: GameState): GameState => ({ ...s, year: s.year + 1, age: s.age + 1, currentEvent: { ...s.currentEvent, year: s.year + 1, age: s.age + 1, choices: [] } })
const target = (s: GameState) => s.worldThreads!.find(t => t.id === 'causal-plan')!

test('elapsed years never complete an untouched plan; prolonged inactivity has an explicit outcome', () => {
  let s = life(); s.worldThreads = [plan(s)]
  for (let i = 0; i < 2; i++) s = evolveWorld(year(s))
  assert.equal(target(s).stage, 1)
  assert.equal(target(s).status, 'active')
  s = evolveWorld(year(s))
  assert.equal(target(s).outcome, 'lapsed')
  assert.equal(target(s).stage, 1)
  assert.doesNotMatch(target(s).impact, /顺利完成|计划落地/)
})

test('real contributions in distinct years complete a plan and preserve a chronological trail', () => {
  let s = life(); s.worldThreads = [plan(s)]
  s.currentEvent = worldThreadEvent(s)!
  s = resolveChoice(s, s.currentEvent.choices[0]!.id)
  assert.equal(target(s).stage, 2)
  assert.equal(target(s).status, 'active')
  assert.ok(!worldThreadEvent(s)?.choices.some(c => c.id.includes('causal-plan')))
  s = evolveWorld(year(s)); s.currentEvent = worldThreadEvent(s, 'causal-plan')!
  s = resolveChoice(s, s.currentEvent.choices[0]!.id)
  assert.equal(target(s).outcome, 'completed')
  assert.ok(target(s).milestones!.filter(m => m.kind === 'action').length >= 2)
  assert.ok(s.worldFacts!.some(f => f.kind === 'outcome' && f.summary.includes('相册')))
})

test('a deferral survives neutral conversation and cannot be immediately reoffered', () => {
  let s = life(); s.worldThreads = [plan(s)]; s.currentEvent = worldThreadEvent(s)!
  s = resolveChoice(s, s.currentEvent.choices.find(c => c.id.endsWith(':wait'))!.id)
  const before = structuredClone(target(s))
  s = interact(s, s.people[0]!.id, '你好')
  assert.equal(target(s).impact, before.impact)
  assert.deepEqual(target(s).milestones, before.milestones)
  assert.equal(target(s).nextYear, s.year + 1)
  assert.ok(!worldThreadEvent(s)?.choices.some(c => c.id.includes('causal-plan')))
})

test('new hostility refreshes displayed world options and rejects a stale success choice before rewards', () => {
  let s = life(); s.worldThreads = [{ ...plan(s), stage: 2 }]; s.currentEvent = worldThreadEvent(s)!
  const stale = s.currentEvent.choices[0]!.id
  s = interact(s, s.people[0]!.id, '闭嘴')
  assert.equal(target(s).direction, 'conflict')
  assert.ok(s.currentEvent.choices.some(c => c.id.endsWith(':repair')))
  const before = structuredClone(s)
  assert.throws(() => resolveChoice(s, stale))
  assert.deepEqual(s, before)
})

test('personal paid actions do not invent a participant or displace three unfinished plans', () => {
  const s = life()
  const personal = recordWorldAction(s, { kind: 'health', amount: 123, location: '中国' })
  assert.equal(personal.worldThreads![0]!.personId, undefined)
  assert.doesNotMatch(personal.worldThreads![0]!.cause, /参与者|母亲/)
  const busy = { ...s, worldThreads: [0, 1, 2].map(i => ({ ...plan(s), id: `open-${i}` })) }
  const result = recordWorldAction(busy, { kind: 'health', amount: 123, location: '中国' })
  assert.deepEqual(result.worldThreads, busy.worldThreads)
  assert.ok(result.worldFacts!.some(f => f.kind === 'health' && f.summary.includes('123')))
})

test('only a completed relevant experience can become a predecessor', () => {
  const s = life()
  const wrong = { ...plan(s), id: 'unrelated', domain: 'family' as const, status: 'resolved' as const, outcome: 'completed' as const }
  const noLink = recordWorldAction({ ...s, worldThreads: [wrong] }, { kind: 'study', amount: 20, location: '中国' })
  assert.equal(noLink.worldThreads!.at(-1)!.relatedThreadId, undefined)
  const health = recordWorldAction(s, { kind: 'health', amount: 20, location: '中国' }).worldThreads![0]!
  const follow = recordWorldAction({ ...s, worldThreads: [{ ...health, status: 'resolved', stage: 3, outcome: 'completed' }] }, { kind: 'health', amount: 30, location: '中国' })
  assert.equal(follow.worldThreads!.at(-1)!.relatedThreadId, health.id)
})

test('continuity is recorded even when narrative intelligence is zero and repeated spending cannot farm progress', () => {
  const s = life(); s.config.intelligence = 0
  const quiet = recordWorldAction(s, { kind: 'study', amount: 25, location: '中国' })
  assert.equal(quiet.worldThreads?.length ?? 0, 0)
  assert.equal(quiet.worldFacts!.length, 1)
  let rich = life()
  for (let i = 0; i < 20; i++) rich = recordWorldAction(rich, { kind: 'study', amount: 25, location: '中国' })
  assert.equal(rich.worldThreads!.length, 1)
  assert.equal(rich.worldThreads![0]!.stage, 1)
  assert.equal(rich.worldFacts!.length, 1)
})

test('bad health blocks demanding follow-up and exact resources remain visible in the context', () => {
  const s = life(); s.stats.health = 20; s.worldThreads = [plan(s)]
  const event = worldThreadEvent(s)!
  assert.ok(!event.choices.some(c => c.id.endsWith(':engage')))
  assert.match(event.description, /身体|健康/)
})

test('working on one plan consumes the available year and changing focus refreshes care constraints', () => {
  let s = life(); s.worldThreads = [plan(s), { ...plan(s), id: 'other-plan' }]
  s.currentEvent = worldThreadEvent(s, 'causal-plan')!
  s = resolveChoice(s, s.currentEvent.choices[0]!.id)
  s.currentEvent = { ...s.currentEvent, choices: [] }
  const blocked = worldThreadEvent(s, 'other-plan')!
  assert.ok(!blocked.choices.some(c => c.id.endsWith(':engage')))
  assert.match(blocked.description, /今年已经投入另一项计划/)
  const family = life(); family.worldThreads = [{ ...plan(family), stage: 2 }]; family.focus = 'career'
  family.worldContext = { year: family.year, location: family.config.location, occupation: '服务工作者', education: '中学毕业', cash: 100, debt: 0, annualIncome: 100, annualExpenses: 90, dependents: 2 }
  family.currentEvent = worldThreadEvent(family)!
  assert.ok(!family.currentEvent.choices.some(c => c.id.endsWith(':engage')))
  assert.ok(setFocus(family, 'social').currentEvent.choices.some(c => c.id.endsWith(':engage')))
})

test('an actual later payment closes a stale displayed action instead of offering double rewards', () => {
  let s = recordWorldAction(life(), { kind: 'study', amount: 100, location: '中国' })
  s = evolveWorld(year(s)); s.currentEvent = worldThreadEvent(s)!
  const choice = s.currentEvent.choices[0]!.id
  s = recordWorldAction(s, { kind: 'study', amount: 50, location: '中国' })
  assert.equal(s.worldThreads!.find(t => t.id.startsWith('action-study-'))!.stage, 2)
  assert.equal(s.currentEvent.choices.length, 0)
  assert.throws(() => resolveChoice(s, choice))
})

test('legacy resolved-in-place choices retain their deferral without inventing past work', () => {
  const s = life(); s.worldThreads = [plan(s)]
  s.currentEvent = { ...s.currentEvent, id: 'world:causal-plan:2026', description: '一次旧的邀请。\n你选择了：说明近况，约好以后再谈。', choices: [] }
  const continued = evolveWorld(s)
  assert.equal(target(continued).lastActionYear, s.year)
  assert.ok(!worldThreadEvent(continued)?.choices.some(c => c.id.includes('causal-plan')))
  assert.equal(target(continued).stage, 1)
})

test('an NPC can feel neglected after repeated real delay; model analysis is grounded and cannot be replayed', () => {
  let s = life(); s.worldThreads = [plan(s)]
  s = evolveWorld(year(evolveWorld(year(s))))
  const evidence = s.worldFacts!.find(f => f.id === `review:causal-plan:${s.year}`)!
  assert.ok(evidence)
  const person = s.people[0]!
  const assessment = { personId: person.id, intent: 'neglected' as const, evidenceId: evidence.id, reason: '两次年度回顾都没有实际跟进，对方感到自己一直在等待。' }
  const changed = applyRelationshipAssessments(s, [assessment])
  const after = changed.people[0]!
  assert.equal(after.closeness, person.closeness - 2)
  assert.equal(after.trust, person.trust - 1)
  assert.ok(after.relationshipStrain! > 0)
  assert.deepEqual(applyRelationshipAssessments(changed, [assessment]), changed)
  const alternate = { ...changed, worldThreads: [...changed.worldThreads!, { ...target(changed), id: 'second-plan' }], worldFacts: [...changed.worldFacts!, { ...evidence, id: `review:second-plan:${s.year}` }] }
  assert.deepEqual(applyRelationshipAssessments(alternate, [{ ...assessment, evidenceId: `review:second-plan:${s.year}` }]), alternate)
  for (const forged of [{ ...assessment, evidenceId: 'invented' }, { ...assessment, personId: 'unknown' }, { ...assessment, intent: 'appreciated' as const }]) assert.deepEqual(applyRelationshipAssessments(s, [forged]), s)
  const future = { ...s, worldFacts: s.worldFacts!.map(f => ({ ...f, year: s.year + 1 })) }
  assert.deepEqual(applyRelationshipAssessments(future, [assessment]), future)
})

test('proactive appreciation requires actual work and recalling hurt never punishes it twice', () => {
  let s = life(); s.worldThreads = [plan(s)]; s.currentEvent = worldThreadEvent(s)!
  s = resolveChoice(s, s.currentEvent.choices[0]!.id)
  const person = s.people[0]!
  const appreciated = applyRelationshipAssessments(s, [{ personId: person.id, intent: 'appreciated', evidenceId: `decision:causal-plan:${s.year}`, reason: '看见对方留出时间实际推进了计划。' }])
  assert.equal(appreciated.people[0]!.trust, person.trust + 1)
  const hurt = interact(s, person.id, '闭嘴')
  const cause = hurt.worldFacts!.find(f => f.kind === 'relationship' && f.summary.includes('攻击'))!
  const remembered = applyRelationshipAssessments(hurt, [{ personId: person.id, intent: 'hurt', evidenceId: cause.id, reason: '对方仍然记得刚才被攻击的不适。' }])
  assert.equal(remembered.people[0]!.trust, hurt.people[0]!.trust)
  assert.equal(remembered.people[0]!.closeness, hurt.people[0]!.closeness)
})

test('new causal fields are optional for legacy saves but malformed chronology and outcomes are rejected', () => {
  const s = life(); s.worldThreads = [plan(s)]
  assert.ok(isGameState(s))
  for (const change of [{ outcome: 'completed' }, { stalledYears: 4 }, { milestones: [{ year: s.year + 1, kind: 'action', text: '来自未来的行动' }] }, { lastActionYear: s.year + 1 }]) {
    assert.equal(validateWorldThreads([{ ...plan(s), ...change }], s.year), false)
  }
  const recorded = recordWorldAction(s, { kind: 'health', amount: 25, location: '中国' })
  assert.ok(isGameState(recorded))
  assert.ok(isGameState(JSON.parse(JSON.stringify(recorded))))
  assert.equal(isGameState({ ...recorded, worldFacts: [{ ...recorded.worldFacts![0], year: s.year + 1 }] }), false)
})

test('infant NPCs do not propose adult-like shared plans', () => {
  const s = life(); s.worldUpdatedYear = undefined; s.people = [{ ...s.people[0]!, id: 'child-1', role: '孩子 · 女儿', age: 0 }]
  assert.equal(evolveWorld(s).worldThreads!.length, 0)
})
