import assert from 'node:assert/strict'
import test from 'node:test'
import { isGameState } from '../game/engine.ts'
import { advanceSimulation, createSimulation, migrate, resolveSimulationDecision, setInvestment, spend, validateSimulation } from './core.ts'
import { crisisActive, myanmarRoll, visitMyanmar } from './myanmar.ts'
import type { SimulationResult } from './types.ts'

let fixture = createSimulation({ seed: 918, countryId: 'JPN', birthYear: 2000 })
while (fixture.state.age < 18 && !fixture.state.ended) fixture = advanceSimulation(fixture.state, fixture.simulation, fixture.state.currentEvent.choices[0]?.id)
assert.equal(fixture.state.age, 18)
assert.equal(fixture.state.ended, false)
function adult(seed = 1): SimulationResult {
  const result = structuredClone(fixture)
  result.simulation.config.seed = seed
  result.simulation.economy.cash = 1e8
  return result
}
function arrive(seed: number): SimulationResult {
  const r = adult(seed)
  return spend(r.simulation, r.state, 'travel', 100, 'MMR')
}
function act(r: SimulationResult, action: string): SimulationResult {
  return resolveSimulationDecision(r.state, r.simulation, r.state.currentEvent.choices.find(c => c.id.endsWith(`:${action}`))!.id)
}

test('fictional arrival distribution is near 80% over 10,000 seeds', () => {
  const count = Array.from({ length: 10000 }, (_, seed) => myanmarRoll(seed, 1)).filter(n => n < .8).length
  assert.ok(count > 7850 && count < 8150, `${count}/10000`)
})

test('safe arrival, cooldown, ordinary travel, birth country and age gates', () => {
  const safe = Array.from({ length: 100 }, (_, n) => n).find(n => myanmarRoll(n, 1) >= .8)!
  let r = arrive(safe)
  assert.equal(crisisActive(r.simulation), false)
  assert.match(r.simulation.notes.at(-1)!.text, /平安/)
  r = spend(r.simulation, r.state, 'travel', 100, 'MMR')
  assert.equal(r.simulation.myanmarVisits, 1)
  const base = adult()
  assert.equal(spend(base.simulation, base.state, 'travel', 100).simulation.myanmarVisits, undefined)
  const local = { ...base.simulation, currentCountryId: 'MMR', birth: { ...base.simulation.birth, countryId: 'MMR' } }
  assert.equal(spend(local, base.state, 'travel', 100, 'MMR').simulation.myanmarVisits, undefined)
  assert.equal(visitMyanmar({ ...base.state, age: 17 }, base.simulation, 'travel:2017:MMR').simulation.myanmarVisits, undefined)
  const newborn = createSimulation({ seed: 2, countryId: 'MMR' })
  assert.equal(newborn.simulation.crisis, undefined)
})

test('failed payment and migration leave originals intact; funded migration triggers', () => {
  const base = adult()
  base.simulation.economy.cash = 1
  const before = structuredClone(base)
  assert.throws(() => spend(base.simulation, base.state, 'travel', 100, 'MMR'), /现金不足/)
  assert.throws(() => migrate(base.state, base.simulation, 'MMR'), /现金不足/)
  assert.deepEqual(base, before)
  base.simulation.economy.cash = 1e8
  const moved = migrate(base.state, base.simulation, 'MMR')
  assert.equal(moved.simulation.myanmarVisits, 1)
  assert.equal(moved.simulation.currentCountryId, 'MMR')
})

test('crisis blocks bypass and survives JSON roundtrip without reroll; choices resolve immediately', () => {
  const seed = Array.from({ length: 100 }, (_, n) => n).find(n => myanmarRoll(n, 1) < .8)!
  const r = arrive(seed)
  assert.equal(r.simulation.economy.cash, 1e8 - 100)
  assert.ok(isGameState(r.state))
  assert.ok(validateSimulation(r.simulation))
  assert.throws(() => advanceSimulation(r.state, r.simulation), /危机/)
  assert.throws(() => spend(r.simulation, r.state, 'health', 1), /危机/)
  assert.throws(() => migrate(r.state, r.simulation, 'USA'), /危机/)
  assert.throws(() => setInvestment(r.simulation, 'bonds'), /危机/)
  assert.deepEqual(visitMyanmar(r.state, r.simulation, 'travel:2018:MMR'), r)
  const a = act(r, 'help')
  const b = act(JSON.parse(JSON.stringify(r)), 'help')
  assert.deepEqual(a, b)
  assert.equal(a.state.age, r.state.age)
  assert.equal(a.simulation.crisis?.phase, 'help')
  assert.throws(() => resolveSimulationDecision(a.state, a.simulation, r.state.currentEvent.choices[0]!.id), /失效/)
})

test('rescued, injured and dead branches are reproducible, preserve the year and restore pending events', () => {
  const found = new Set<string>()
  for (let seed = 0; seed < 500 && found.size < 3; seed++) {
    if (myanmarRoll(seed, 1) >= .8) continue
    const start = arrive(seed)
    const r = act(act(act(start, 'help'), 'escape'), 'help')
    assert.deepEqual(r, act(act(act(JSON.parse(JSON.stringify(start)), 'help'), 'escape'), 'help'))
    const outcome = r.simulation.crisis!.outcome!
    found.add(outcome)
    assert.equal(r.state.age, 18)
    assert.equal(r.state.turn, start.state.turn)
    assert.equal(r.simulation.years.length, start.simulation.years.length)
    assert.equal(r.simulation.crisis?.phase, 'resolved')
    assert.ok(isGameState(r.state))
    assert.ok(validateSimulation(r.simulation), outcome)
    if (outcome === 'dead') {
      assert.equal(r.state.ended, true)
      assert.equal(r.simulation.years.at(-1)!.alive, false)
      assert.equal(r.simulation.years.at(-1)!.marker, 'death')
      assert.equal(r.simulation.cause, '嘎腰子')
    } else {
      assert.deepEqual(r.state.currentEvent, start.simulation.crisis!.resumeEvent)
      if (outcome === 'injured') {
        assert.equal(r.simulation.myanmarInjury, true)
        const next = advanceSimulation(r.state, r.simulation, r.state.currentEvent.choices[0]?.id)
        assert.ok(next.state.stats.health <= 65)
      }
    }
    assert.throws(() => resolveSimulationDecision(r.state, r.simulation, start.state.currentEvent.choices[0]!.id))
  }
  assert.deepEqual([...found].sort(), ['dead', 'injured', 'rescued'])
})

test('legacy saves remain valid and malformed suspended events are rejected', () => {
  assert.ok(validateSimulation(fixture.simulation))
  const seed = Array.from({ length: 100 }, (_, n) => n).find(n => myanmarRoll(n, 1) < .8)!
  const r = arrive(seed)
  const bad = structuredClone(r.simulation)
  bad.crisis!.resumeEvent.choices = [{ id: 'invalid', label: 'x', hint: 'x', effects: { health: NaN } }]
  assert.equal(validateSimulation(bad), false)
  bad.crisis!.resumeEvent = null as never
  assert.equal(validateSimulation(bad), false)
})

test('permanent injury caps same-year medical spending and event rewards', () => {
  const r = adult()
  r.simulation.myanmarInjury = true
  r.state.stats.health = 64
  const treated = spend(r.simulation, r.state, 'health', 1e6)
  assert.equal(treated.state.stats.health, 65)
  assert.equal(treated.simulation.years.at(-1)!.health, 65)
  r.state.currentEvent.choices = [{ id: 'healing', label: '疗养', hint: '休养', effects: { health: 20 } }]
  const resolved = resolveSimulationDecision(r.state, r.simulation, 'healing')
  assert.equal(resolved.state.stats.health, 65)
  assert.equal(resolved.simulation.years.at(-1)!.health, 65)
})

test('a later safe arrival preserves the completed crisis and persistent injury', () => {
  const seed = Array.from({ length: 1000 }, (_, n) => n).find(n => myanmarRoll(n, 1) < .8 && myanmarRoll(n, 2) >= .8 && myanmarRoll(n, 1, 'fatal-route') >= .9 && myanmarRoll(n, 1, 'survivor-injury') < .5)!
  const resolved = act(act(act(arrive(seed), 'help'), 'escape'), 'help')
  const safe = visitMyanmar(resolved.state, resolved.simulation, 'migrate:2018:MMR')
  assert.equal(safe.simulation.myanmarVisits, 2)
  assert.deepEqual(safe.simulation.crisis, resolved.simulation.crisis)
  assert.equal(safe.simulation.myanmarInjury, true)
  assert.ok(validateSimulation(safe.simulation))
})


test('conditional fatal probability is 90% and combined probability is 72% across 10k seeds', () => {
  let captive = 0
  let fatal = 0
  for (let seed = 0; seed < 10000; seed++) {
    if (myanmarRoll(seed, 1) >= .8) continue
    captive++
    if (myanmarRoll(seed, 1, 'fatal-route') < .9) fatal++
  }
  assert.ok(Math.abs(fatal / captive - .9) < .015)
  assert.ok(Math.abs(fatal / 10000 - .72) < .02)
})

test('three concrete actions keep arrival fate fixed across all action paths and save reloads', () => {
  for (const fatalRoute of [true, false]) {
    const seed = Array.from({ length: 500 }, (_, n) => n).find(n => myanmarRoll(n, 1) < .8 && (myanmarRoll(n, 1, 'fatal-route') < .9) === fatalRoute)!
    const start = arrive(seed)
    assert.equal(start.simulation.crisis!.fatalRoute, fatalRoute)
    for (const a of ['help', 'observe', 'escape']) for (const b of ['help', 'observe', 'escape']) for (const c of ['help', 'observe', 'escape']) {
      let r = JSON.parse(JSON.stringify(start)) as SimulationResult
      for (const [index, action] of [a, b, c].entries()) {
        r = act(r, action)
        assert.equal(r.simulation.crisis!.fatalRoute, fatalRoute)
        assert.equal(r.state.ended, index === 2 && fatalRoute)
        assert.equal(r.state.age, start.state.age)
        assert.ok(validateSimulation(r.simulation))
        r = JSON.parse(JSON.stringify(r)) as SimulationResult
      }
      assert.equal(r.simulation.crisis!.phase, 'resolved')
      assert.equal(r.simulation.crisis!.outcome === 'dead', fatalRoute)
      assert.equal(r.simulation.crisis!.history.length, 3)
      if (fatalRoute) assert.equal(r.simulation.cause, '嘎腰子')
    }
  }
})


test('system trip records are tagged as events while personal reflections retain their authorship', () => {
  const safeSeed = Array.from({ length: 100 }, (_, n) => n).find(n => myanmarRoll(n, 1) >= .8)!
  const safe = arrive(safeSeed)
  assert.equal(safe.simulation.notes.at(-1)!.kind, 'event')
  const captiveSeed = Array.from({ length: 100 }, (_, n) => n).find(n => myanmarRoll(n, 1) < .8)!
  const ended = act(act(act(arrive(captiveSeed), 'help'), 'help'), 'help')
  assert.equal(ended.simulation.notes.at(-1)!.kind, 'event')
  const personal = structuredClone(safe.simulation)
  personal.notes.push({ age: 18, text: '我希望明年能看到更多风景。' })
  assert.equal(personal.notes.at(-1)!.kind, undefined)
  assert.ok(validateSimulation(personal))
  personal.notes.at(-1)!.kind = 'system' as never
  assert.equal(validateSimulation(personal), false)
})
