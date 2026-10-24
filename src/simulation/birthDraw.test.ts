import assert from 'node:assert/strict'
import test from 'node:test'
import { isGameState } from '../game/engine.ts'
import { createBirthDraw } from './birthDraw.ts'
import { COUNTRIES } from './countries.ts'
import { createSimulation, validateSimulation } from './core.ts'
import type { FoundationConfig } from './types.ts'

test('birth draw ignores supplied identity and seed and matches only the fresh seed', t => {
  const random = t.mock.method(globalThis.crypto, 'getRandomValues', (array: Uint32Array) => {
    array[0] = 918
    return array
  })
  const allowed: Partial<FoundationConfig> = { world: 'past', birthYear: 2000, drawMode: 'population', paceMinutes: 90, softMode: false, intelligence: 73, homeCountryId: 'CHN' }
  const expected = createSimulation({ ...allowed, seed: 918 })
  random.mock.resetCalls()
  const forcedCountry = expected.simulation.birth.countryId === 'JPN' ? 'IND' : 'JPN'
  const actual = createBirthDraw({ ...allowed, seed: 1, name: '指定姓名不能生效', countryId: forcedCountry })

  assert.deepEqual(actual, expected)
  assert.ok(random.mock.callCount() >= 1)
  assert.equal(actual.simulation.config.seed, 918)
  assert.equal(Object.hasOwn(actual.simulation.config, 'name'), false)
  assert.equal(Object.hasOwn(actual.simulation.config, 'countryId'), false)
  assert.notEqual(actual.state.config.name, '指定姓名不能生效')
  assert.notEqual(actual.simulation.birth.countryId, forcedCountry)
  for (const key of Object.keys(allowed) as (keyof FoundationConfig)[]) {
    assert.equal(actual.simulation.config[key], allowed[key])
  }
})

test('each draw requests a new crypto seed even when the caller repeats a seed', t => {
  let seed = 0
  const random = t.mock.method(globalThis.crypto, 'getRandomValues', (array: Uint32Array) => {
    array[0] = seed
    return array
  })
  const first = createBirthDraw({ seed: 42 })
  assert.ok(random.mock.callCount() >= 1)
  random.mock.resetCalls()
  seed = 4294967295
  const second = createBirthDraw({ seed: 42 })
  assert.ok(random.mock.callCount() >= 1)
  assert.equal(first.simulation.config.seed, 0)
  assert.equal(second.simulation.config.seed, 4294967295)
})

test('drawn lives begin at birth with valid human attributes and their full family', t => {
  t.mock.method(globalThis.crypto, 'getRandomValues', (array: Uint32Array) => {
    array[0] = 124
    return array
  })
  const { state, simulation } = createBirthDraw({ birthYear: 1990 })
  const { birth } = simulation
  assert.equal(state.age, 0)
  assert.equal(state.config.startAge, 0)
  assert.equal(state.year, 1990)
  assert.ok(state.config.name.trim().length > 0)
  assert.ok(COUNTRIES.some(country => country.id === birth.countryId))
  assert.ok(['女', '男'].includes(birth.sex))
  assert.ok(Number.isInteger(birth.familyQuintile) && birth.familyQuintile >= 1 && birth.familyQuintile <= 5)
  assert.equal(typeof birth.urban, 'boolean')
  assert.ok(Number.isInteger(birth.siblings) && birth.siblings >= 0 && birth.siblings <= 5)
  assert.equal(state.people.length, birth.siblings + 2)
  for (const id of ['mother', 'father'] as const) {
    const parent = birth.parents[id]
    const person = state.people.find(person => person.id === id)
    assert.ok(parent.name.trim() && parent.occupation.trim())
    assert.ok(parent.age >= 15 && parent.age <= 70)
    assert.equal(person?.name, parent.name)
    assert.equal(person?.age, parent.age)
  }
  assert.equal(state.stats.knowledge, 0)
  assert.ok(Object.values(state.stats).every(value => Number.isFinite(value) && value >= 0 && value <= 100))
  assert.ok(isGameState(state))
  assert.ok(validateSimulation(simulation))
})

test('teenage parents have age-appropriate narrative occupations without changing the family draw', () => {
  const { state, simulation: { birth } } = createSimulation({ seed: 89, countryId: 'CHN', birthYear: 2000 })

  assert.equal(state.config.name, '李雨宁')
  assert.equal(birth.sex, '女')
  assert.equal(birth.familyQuintile, 4)
  assert.equal(birth.urban, true)
  assert.equal(birth.siblings, 1)
  assert.deepEqual(
    Object.values(birth.parents).map(parent => ({ name: parent.name, age: parent.age })),
    [{ name: '赵星月', age: 16 }, { name: '周时安', age: 16 }],
  )
  for (const parent of Object.values(birth.parents)) {
    assert.doesNotMatch(parent.occupation, /教师|医护人员/, `${parent.age}-year-old ${parent.name} cannot be assigned a qualified profession`)
  }
})

test('adult parent occupations and downstream name draws retain their seeded results', () => {
  const { simulation: { birth } } = createSimulation({ seed: 0, countryId: 'CHN', birthYear: 2000 })

  assert.deepEqual(birth.parents, {
    mother: { name: '林星月', age: 31, occupation: '医护人员' },
    father: { name: '黄远山', age: 31, occupation: '技术工作者' },
  })
})
