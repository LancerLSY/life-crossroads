import assert from 'node:assert/strict'
import test from 'node:test'
import { createLife } from './engine.ts'
import { evolveWorld, recordWorldAction, validateWorldThreads, worldThreadEvent } from './world.ts'
import type { GameState, WorldThread } from './types.ts'

const life = (seed = 3): GameState => {
  const state = createLife({ seed, startAge: 20, intelligence: 100 })
  return { ...state, currentEvent: { ...state.currentEvent, choices: [] } }
}
const thread = (state: GameState): WorldThread => ({ id: 'example', personId: state.people[0]!.id, title: '共同计划', cause: '一次谈话', stage: 1, status: 'active', direction: 'support', impact: '正在推进', startedYear: state.year, nextYear: state.year + 1 })
const followingYear = (state: GameState): GameState => ({ ...state, age: state.age + 1, year: state.year + 1 })

test('world outcomes replay by seed without mutating state or advancing years', () => {
  const state = life()
  const snapshot = structuredClone(state)
  assert.deepEqual(evolveWorld(state), evolveWorld(structuredClone(state)))
  assert.deepEqual(state, snapshot)
  assert.equal(evolveWorld(state).year, state.year)
  assert.equal(evolveWorld(state).age, state.age)
  assert.deepEqual(evolveWorld(evolveWorld(state)), evolveWorld(state))
})

test('trust, closeness, and recent hurt change the actual follow-up choices', () => {
  const state = life()
  state.worldThreads = [thread(state)]
  state.worldUpdatedYear = state.year
  const changed = (trust: number, closeness: number) => evolveWorld({ ...state, people: state.people.map(person => ({ ...person, trust, closeness })) })
  assert.equal(changed(90, 90).worldThreads![0]!.direction, 'support')
  assert.equal(changed(45, 45).worldThreads![0]!.direction, 'distance')
  assert.equal(changed(10, 10).worldThreads![0]!.direction, 'conflict')
  assert.match(worldThreadEvent(changed(90, 90))!.choices[0]!.id, /engage$/)
  assert.match(worldThreadEvent(changed(10, 10))!.choices[0]!.id, /repair$/)
  const hurt = changed(90, 90)
  hurt.people[0]!.relationshipHistory = [{ id: 'hurt', year: state.year, source: 'chat', key: 'hurt', reason: '直接攻击伤害信任', closenessDelta: -5, trustDelta: -7 }]
  assert.equal(evolveWorld(hurt).worldThreads![0]!.direction, 'conflict')
})

test('intelligence zero creates nothing; higher intelligence increases seeded incidence', () => {
  const count = (intelligence: number) => Array.from({ length: 200 }, (_, seed) => {
    const state = life(seed)
    state.config.intelligence = intelligence
    return evolveWorld(state).worldThreads!.length
  }).reduce((sum, n) => sum + n, 0)
  assert.equal(count(0), 0)
  assert.ok(count(100) > count(30))
})

test('unresolved plans continue annually and choices close or complete them', () => {
  let state = life()
  state.worldThreads = [thread(state)]
  state.worldUpdatedYear = state.year
  state = evolveWorld(followingYear(state))
  assert.equal(state.worldThreads!.find(item => item.id === 'example')!.stage, 2)
  const event = worldThreadEvent(state)!
  state = evolveWorld(state, event.choices[0])
  assert.equal(state.worldThreads!.find(item => item.id === 'example')!.status, 'resolved')
  const manual = life()
  manual.worldThreads = [thread(manual)]
  manual.worldUpdatedYear = manual.year
  const closed = evolveWorld(manual, worldThreadEvent(manual)!.choices[2])
  assert.equal(closed.worldThreads![0]!.status, 'resolved')
})

test('deceased people close existing plans and never initiate new ones', () => {
  const state = life()
  state.worldThreads = [thread(state)]
  state.people = state.people.map(person => ({ ...person, role: person.role + ' · 已离世' }))
  const next = evolveWorld(state)
  assert.equal(next.worldThreads!.length, 1)
  assert.equal(next.worldThreads![0]!.status, 'resolved')
  assert.equal(worldThreadEvent(next), undefined)
})

test('young children do not initiate plans and school-age plans contain age-appropriate activities', () => {
  const infant = { ...life(), age: 3 }
  assert.equal(evolveWorld(infant).worldThreads!.length, 0)
  const child = Array.from({ length: 30 }, (_, seed) => evolveWorld(createLife({ seed, startAge: 8, intelligence: 100 }))).find(state => state.worldThreads!.length)!
  assert.ok(child)
  assert.match(child.worldThreads![0]!.cause, /照片|散步|书|练习|邀请|物品/)
  assert.ok(worldThreadEvent(child)!.choices.every(choice => choice.effects.wealth === undefined))
})

test('decades of continuation retain bounded active and resolved records and allow interwoven plans', () => {
  let state = life()
  let linked = false
  for (let index = 0; index < 60; index++) {
    state = evolveWorld(state)
    const threads = state.worldThreads!
    linked ||= threads.some(item => item.relatedThreadId)
    assert.ok(threads.filter(item => item.status === 'active').length <= 3)
    assert.ok(threads.filter(item => item.status === 'resolved').length <= 6)
    assert.ok(validateWorldThreads(threads, state.year, new Set(state.people.map(person => person.id))))
    state = followingYear(state)
  }
  assert.ok(linked)
})

test('save extension accepts legacy absence and rejects malformed or unbounded records', () => {
  const state = life()
  assert.equal(validateWorldThreads(undefined, state.year), true)
  assert.equal(validateWorldThreads([thread(state)], state.year), true)
  for (const bad of [null, {}, [null], [{ ...thread(state), impact: 2 }], [{ ...thread(state), stage: 7 }], Array(10).fill(thread(state)), [{ ...thread(state), nextYear: state.year + 20 }]]) {
    assert.equal(validateWorldThreads(bad, state.year), false)
  }
})

test('paid actions have distinct next-year choices and never create money or advance time', () => {
  const original = life()
  const labels = new Set<string>()
  const titles = new Set<string>()
  for (const kind of ['health', 'study', 'social', 'travel', 'home', 'repay', 'invest', 'migrate'] as const) {
    const state = recordWorldAction(original, { kind, amount: 123.45, location: '日本' })
    const action = state.worldThreads!.find(thread => thread.id.startsWith(`action-${kind}-`))!
    assert.match(action.cause, /123.45 PPP美元/)
    assert.match(action.cause, /日本/)
    assert.deepEqual(state.stats, original.stats)
    assert.equal(state.year, original.year)
    const following = evolveWorld(followingYear(state))
    const event = worldThreadEvent(following)!
    assert.ok(event.choices[0]!.id.startsWith(`world:${action.id}:`))
    labels.add(event.choices[0]!.label)
    titles.add(event.title)
  }
  assert.equal(labels.size, 8)
  assert.equal(titles.size, 8)
  assert.equal(original.worldThreads, undefined)
})

test('repeated spending keeps records bounded and preserves an unresolved displayed choice', () => {
  let state = recordWorldAction(life(), { kind: 'study', amount: 100, location: '日本' })
  state.currentEvent = worldThreadEvent(state)!
  const pending = state.currentEvent.choices[0]!.id
  for (let index = 0; index < 25; index++) {
    state = recordWorldAction(state, { kind: 'travel', amount: 100, location: `地点${index}` })
    assert.ok(validateWorldThreads(state.worldThreads, state.year))
    assert.ok(state.worldThreads!.some(thread => thread.status === 'active' && pending.startsWith(`world:${thread.id}:`)))
  }
  const repeated = recordWorldAction(state, { kind: 'travel', amount: 100, location: '地点24' })
  assert.equal(repeated.worldThreads!.length, state.worldThreads!.length)
  assert.equal(repeated.worldThreads!.at(-1)!.stage, 1)
})
