import test from 'node:test'
import assert from 'node:assert/strict'
import { createLife, interact } from './engine.ts'

test('neutral conversation and quoted insults do not award or punish trust', () => {
  const state = createLife({ seed: 42 })
  for (const text of ['今天是星期几？', '我不会叫你笨蛋', '他对我说“你是废物”，我很难过']) {
    const next = interact(state, 'friend', text)
    assert.equal(next.people.find(p => p.id === 'friend')!.trust, state.people.find(p => p.id === 'friend')!.trust)
  }
})
test('same-year repeated care cannot farm relationship or happiness', () => {
  const state = createLife({ seed: 42 })
  const first = interact(state, 'friend', '我很关心你')
  const second = interact(first, 'friend', '我很关心你')
  assert.equal(second.people[2]!.trust, first.people[2]!.trust)
  assert.equal(second.stats.happiness, first.stats.happiness)
})

import { advanceYear, isGameState, performRelationshipAction } from './engine.ts'
import { classifyReaction, settleCommitments } from './relationships.ts'
const friend = (s: ReturnType<typeof createLife>) => s.people.find(p => p.id === 'friend')!
const nextYear = (s: ReturnType<typeof createLife>) => advanceYear({ ...s, currentEvent: { ...s.currentEvent, choices: [] } })
test('boundaries, insults, care and limited apologies have different consequences', () => {
  const original = createLife({ seed: 12 })
  const boundary = interact(original, 'friend', '我不能答应你，这次需要休息')
  assert.equal(friend(boundary).trust, friend(original).trust)
  const hurt = interact(original, 'friend', '你这个笨蛋')
  const apology = performRelationshipAction(hurt, 'friend', 'apologize')
  assert.ok(friend(apology).trust < friend(original).trust)
  assert.equal(friend(performRelationshipAction(apology, 'friend', 'apologize')).trust, friend(apology).trust)
  assert.equal(classifyReaction('我不能承诺陪你', { intent: 'promise', commitment: 'company', reason: '误判' }).intent, 'boundary')
})
test('positive yearly cap survives bounded history and preserves the next year', () => {
  let state = createLife({ seed: 12 })
  const original = state
  for (let i = 0; i < 80; i++) state = interact(state, 'friend', `问候${i}`, undefined, { intent: 'care', reason: '关心近况' })
  assert.equal(friend(state).closeness - friend(original).closeness, 12)
  assert.equal(friend(state).trust - friend(original).trust, 10)
  assert.equal(state.stats.happiness - original.stats.happiness, 4)
  assert.ok(friend(state).relationshipHistory!.length <= 16)
  assert.ok(isGameState(state))
  const later = nextYear(state)
  assert.ok(friend(interact(later, 'friend', '我很关心你')).trust > friend(later).trust)
})
test('promises can be fulfilled in either year and only expire after the complete due year', () => {
  const original = createLife({ seed: 12 })
  const promised = performRelationshipAction(original, 'friend', 'promise-company')
  assert.equal(friend(promised).trust, friend(original).trust)
  const fulfilled = performRelationshipAction(promised, 'friend', 'company')
  assert.equal(friend(fulfilled).commitments![0]!.status, 'fulfilled')
  assert.deepEqual(performRelationshipAction(fulfilled, 'friend', 'company').people, fulfilled.people)
  const due = nextYear(promised)
  assert.equal(friend(due).commitments![0]!.status, 'pending')
  assert.equal(friend(performRelationshipAction(due, 'friend', 'company')).commitments![0]!.status, 'fulfilled')
  const expired = nextYear(due)
  assert.equal(friend(expired).commitments![0]!.status, 'broken')
  assert.deepEqual(settleCommitments(expired), expired)
  assert.ok(isGameState(expired))
})
test('legacy saves load; malformed relationship extensions fail validation', () => {
  const original = createLife({ seed: 12 })
  assert.ok(isGameState(original))
  const state = performRelationshipAction(original, 'friend', 'promise-help')
  assert.ok(isGameState(state))
  friend(state).commitments![0]!.dueYear += 2
  assert.equal(isGameState(state), false)
  assert.throws(() => performRelationshipAction(createLife({ startAge: 0 }), 'mother', 'help'))
})
test('raw quoted insults do not determine world direction, actions can repair real hurt', () => {
  let state = createLife({ startAge: 30, seed: 7 })
  state.people = state.people.map(p => p.id === 'friend' ? { ...p, trust: 85, closeness: 85 } : p)
  state.worldThreads = [{ id: 'test', personId: 'friend', title: '共同计划', cause: '共同经历', stage: 1, status: 'active', direction: 'support', impact: '继续合作', startedYear: state.year, nextYear: state.year + 1 }]
  state = interact(state, 'friend', '闭嘴')
  assert.equal(state.worldThreads![0]!.direction, 'conflict')
  state = interact(state, 'friend', '你好')
  assert.equal(state.worldThreads![0]!.direction, 'conflict')
  for (const action of ['apologize', 'listen', 'company', 'help'] as const) state = performRelationshipAction(state, 'friend', action)
  assert.equal(state.worldThreads![0]!.direction, 'distance')
  state = nextYear(state)
  for (const action of ['listen', 'company', 'help'] as const) state = performRelationshipAction(state, 'friend', action)
  assert.equal(friend(state).relationshipStrain, 0)
  assert.equal(state.worldThreads!.find(thread => thread.id === 'test')!.direction, 'support')
})

test('model cannot invent a personal promise from greetings, quotations or a refusal', () => {
  const original = createLife({ seed: 12 })
  for (const text of ['你好', '他说“我保证明年陪你”', '我不能承诺陪你', '我不会陪你']) {
    const next = interact(original, 'friend', text, '收到', { intent: 'promise', commitment: 'company', reason: '模型误判为约定' })
    assert.equal(friend(next).commitments?.length ?? 0, 0)
  }
  const actual = interact(original, 'friend', '我保证明年陪你散步', undefined, { intent: 'promise', commitment: 'company', reason: '明确约好陪伴' })
  assert.equal(friend(actual).commitments![0]!.status, 'pending')
})
test('reusing an earlier same-year action cannot fulfill a subsequent promise', () => {
  const acted = performRelationshipAction(createLife({ seed: 12 }), 'friend', 'company')
  const promised = performRelationshipAction(acted, 'friend', 'promise-company')
  const repeated = performRelationshipAction(promised, 'friend', 'company')
  assert.equal(friend(repeated).commitments![0]!.status, 'pending')
  assert.equal(friend(repeated).trust, friend(promised).trust)
  const due = nextYear(repeated)
  const fulfilled = performRelationshipAction(due, 'friend', 'company')
  assert.equal(friend(fulfilled).commitments![0]!.status, 'fulfilled')
  const replayed = performRelationshipAction(fulfilled, 'friend', 'company')
  assert.deepEqual(replayed.people, fulfilled.people)
})
test('save history delta bounds match the server contract', () => {
  const state = performRelationshipAction(createLife({ seed: 12 }), 'friend', 'listen')
  const entry = friend(state).relationshipHistory![0]!
  for (const field of ['closenessDelta', 'trustDelta'] as const) {
    const original = entry[field]
    for (const invalid of [-16, 16, 100]) {
      entry[field] = invalid
      assert.equal(isGameState(state), false)
    }
    entry[field] = original
  }
  assert.ok(isGameState(state))
})

import { resolveChoice } from './engine.ts'
test('targeted choice records actual bounded deltas alongside chat history without using its yearly cap', () => {
  let state = interact(createLife({ seed: 12 }), 'friend', '我很关心你')
  state = { ...state, people: state.people.map(p => p.id === 'friend' ? { ...p, closeness: 99, trust: 98, relationshipStrain: 7 } : p), currentEvent: { ...state.currentEvent, choices: [{ id: 'targeted-choice', label: '一起完成小计划', hint: '留下共同经历', personId: 'friend', relationshipDelta: 8, effects: {} }] } }
  const beforeLedger = friend(state).relationshipYear
  const next = resolveChoice(state, 'targeted-choice')
  const records = friend(next).relationshipHistory!
  assert.ok(records.some(h => h.source === 'chat'))
  const entry = records.at(-1)!
  assert.equal(entry.source, 'experience')
  assert.equal(entry.closenessDelta, 1)
  assert.equal(entry.trustDelta, 2)
  assert.equal(friend(next).relationshipStrain, 6)
  assert.match(entry.reason, /一起完成小计划/)
  assert.ok(entry.id.length <= 180)
  assert.deepEqual(friend(next).relationshipYear, beforeLedger)
  assert.ok(isGameState(next))
  assert.throws(() => resolveChoice(next, 'targeted-choice'))
  const later = advanceYear(next)
  assert.equal(friend(later).relationshipHistory!.filter(h => h.key === entry.key).length, 1)
})
test('negative targeted choices record clamped losses and leave other people untouched', () => {
  const original = createLife({ seed: 12 })
  const state = { ...original, people: original.people.map(p => p.id === 'friend' ? { ...p, closeness: 2, trust: 1 } : p), currentEvent: { ...original.currentEvent, choices: [{ id: 'distance-choice', label: '暂时保持距离', hint: '各自冷静', personId: 'friend', relationshipDelta: -8, effects: {} }] } }
  const next = resolveChoice(state, 'distance-choice')
  assert.equal(friend(next).relationshipHistory!.at(-1)!.closenessDelta, -2)
  assert.equal(friend(next).relationshipHistory!.at(-1)!.trustDelta, -1)
  assert.equal(friend(next).relationshipStrain, 1)
  assert.deepEqual(next.people.filter(p => p.id !== 'friend'), state.people.filter(p => p.id !== 'friend'))
  assert.ok(isGameState(next))
})

test('neutral conversation cannot erase unresolved hurt by evicting history', () => {
  let state = createLife({ seed: 12, startAge: 30 })
  state.people = state.people.map(p => p.id === 'friend' ? { ...p, trust: 90, closeness: 90 } : p)
  state.worldThreads = [{ id: 'hurt-thread', personId: 'friend', title: '共同计划', cause: '共同经历', stage: 1, status: 'active', direction: 'support', impact: '合作', startedYear: state.year, nextYear: state.year + 1 }]
  state = interact(state, 'friend', '闭嘴')
  for (let i = 0; i < 20; i++) state = interact(state, 'friend', `普通天气记录${i}`)
  assert.equal(state.worldThreads![0]!.direction, 'conflict')
  assert.match(friend(state).mood, /空间|修复|距离/)
})

test('only actual positive trust gains gradually repair strain, including fulfilled promises', () => {
  let state = interact(createLife({ seed: 12 }), 'friend', '闭嘴')
  assert.equal(friend(state).relationshipStrain, 7)
  state = performRelationshipAction(state, 'friend', 'company')
  assert.equal(friend(state).relationshipStrain, 6)
  const same = performRelationshipAction(state, 'friend', 'company')
  assert.equal(friend(same).relationshipStrain, 6)
  state = performRelationshipAction(state, 'friend', 'promise-help')
  assert.equal(friend(state).relationshipStrain, 6)
  state = performRelationshipAction(state, 'friend', 'help')
  assert.equal(friend(state).relationshipStrain, 3)
  assert.equal(friend(state).commitments![0]!.status, 'fulfilled')
  const capped = { ...state, people: state.people.map(p => p.id === 'friend' ? { ...p, trust: 100 } : p) }
  const noGain = performRelationshipAction(capped, 'friend', 'listen')
  assert.equal(friend(noGain).relationshipStrain, 3)
  assert.ok(isGameState(noGain))
})
test('legacy strain is optional and existing damage initializes conservatively; invalid strain is rejected', () => {
  const original = createLife({ seed: 12 })
  assert.ok(isGameState(original))
  const hurt = interact(original, 'friend', '闭嘴')
  delete friend(hurt).relationshipStrain
  assert.ok(isGameState(hurt))
  const neutral = interact(hurt, 'friend', '今天天气一般')
  assert.equal(friend(neutral).relationshipStrain, 7)
  for (const invalid of [-1, 101, NaN]) {
    friend(neutral).relationshipStrain = invalid
    assert.equal(isGameState(neutral), false)
  }
})

test('explicit unique personal promise fills a missing model commitment without inventing one', () => {
  const original = createLife({ seed: 12 })
  const reaction = { intent: 'promise' as const, reason: '主角明确承诺明年陪散步，小满接受并顺势追问近况' }
  const state = interact(original, 'friend', '我保证明年陪你散步。', undefined, reaction)
  assert.equal(friend(state).commitments![0]!.kind, 'company')
  assert.equal(friend(state).commitments![0]!.status, 'pending')
  const help = interact(original, 'friend', '我保证明年帮你整理书籍。', undefined, reaction)
  assert.equal(friend(help).commitments![0]!.kind, 'help')
  for (const text of ['你好', '他说“我保证明年陪你散步。”', '我不能保证明年陪你散步。', '我保证明年陪你散步并帮你搬家。']) {
    const next = interact(original, 'friend', text, undefined, reaction)
    assert.equal(friend(next).commitments?.length ?? 0, 0)
  }
  const mismatch = interact(original, 'friend', '我保证明年陪你散步。', undefined, { ...reaction, commitment: 'help' })
  assert.equal(friend(mismatch).commitments?.length ?? 0, 0)
})
