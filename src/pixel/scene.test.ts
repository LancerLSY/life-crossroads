import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulation } from '../simulation/core.ts'
import { deriveSceneModel, personAppearance, renderPortrait, renderScene, SCENE_HEIGHT, SCENE_WIDTH } from './scene.ts'

const initial = createSimulation({ seed: 1917, countryId: 'CHN' })
const copy = () => structuredClone(initial)

test('scene is deterministic, immutable and completely paints the native canvas', () => {
  const { state, simulation } = copy()
  const before = JSON.stringify({ state, simulation })
  const first = renderScene(deriveSceneModel(state, simulation))
  const again = renderScene(deriveSceneModel(state, simulation))
  assert.deepEqual(first, again)
  assert.equal(JSON.stringify({ state, simulation }), before)
  assert.equal(first.width, SCENE_WIDTH)
  assert.equal(first.height, SCENE_HEIGHT)
  assert.equal(first.pixels.length, SCENE_WIDTH * SCENE_HEIGHT * 4)
  assert.ok(first.pixels.every((value, index) => index % 4 !== 3 || value === 255))
  assert.ok(first.people.every(person => person.x >= 0 && person.y >= 0 && person.x + person.width <= first.width && person.y + person.height <= first.height))
})

test('the household excludes friends and departed family while retaining partners and children', () => {
  const { state, simulation } = copy()
  const basePerson = state.people[0]!
  state.people = [
    { ...basePerson, id: 'mother', role: '母亲 · 已离世' },
    { ...basePerson, id: 'friend', name: '访客', role: '老朋友' },
    { ...basePerson, id: 'acquaintance', name: '伴侣', role: '伴侣' },
    { ...basePerson, id: 'former', name: '往事', role: '前伴侣' },
    { ...basePerson, id: 'child-1', name: '女儿', role: '孩子 · 女儿', age: 1 },
  ]
  const model = deriveSceneModel(state, simulation)
  assert.deepEqual(model.people.map(person => person.id), ['self', 'acquaintance', 'child-1'])
  assert.match(model.caption, /中国/)
  assert.match(model.caption, /伴侣/)
  assert.doesNotMatch(model.caption, /访客|往事|已离世/)
})

test('young children cannot receive adult work props and growing changes their sprite', () => {
  const { state, simulation } = copy()
  simulation.occupation = '专业技术人员'
  state.age = 0
  const baby = renderScene(deriveSceneModel(state, simulation))
  assert.equal(deriveSceneModel(state, simulation).prop, 'toys')
  state.age = 10
  assert.equal(deriveSceneModel(state, simulation).prop, 'school')
  const child = renderScene(deriveSceneModel(state, simulation))
  state.age = 30
  assert.equal(deriveSceneModel(state, simulation).prop, 'work')
  const adult = renderScene(deriveSceneModel(state, simulation))
  assert.ok(baby.people.find(person => person.self)!.height < child.people.find(person => person.self)!.height)
  assert.ok(child.people.find(person => person.self)!.height < adult.people.find(person => person.self)!.height)
  assert.ok(baby.people.find(person => person.self)!.height <= 10)
  assert.ok(adult.people.find(person => person.self)!.height >= 18 && adult.people.find(person => person.self)!.height <= 22)
  assert.ok(adult.people.find(person => person.self)!.width >= 10)
  simulation.retired = true
  assert.equal(deriveSceneModel(state, simulation).prop, 'bench')
})

test('home, urban setting, migration, mood and theme visibly respond to save changes', () => {
  const { state, simulation } = copy()
  simulation.birth.familyQuintile = 3
  simulation.birth.urban = true
  const city = renderScene(deriveSceneModel(state, simulation))
  simulation.birth.urban = false
  const country = renderScene(deriveSceneModel(state, simulation))
  assert.notDeepEqual(city.pixels, country.pixels)
  simulation.economy.homeOwned = true
  assert.equal(deriveSceneModel(state, simulation).home, 'house')
  const house = renderScene(deriveSceneModel(state, simulation))
  assert.notDeepEqual(country.pixels, house.pixels)
  simulation.economy.homeValue = 400_000
  assert.equal(deriveSceneModel(state, simulation).home, 'villa')
  assert.notDeepEqual(house.pixels, renderScene(deriveSceneModel(state, simulation)).pixels)
  simulation.currentCountryId = 'EGY'
  const moved = deriveSceneModel(state, simulation)
  assert.equal(moved.climate, 'arid')
  assert.match(moved.caption, /埃及/)
  assert.notDeepEqual(house.pixels, renderScene(moved).pixels)
  state.stats.happiness = 20
  assert.equal(deriveSceneModel(state, simulation).weather, 'overcast')
  const rainy = renderScene(deriveSceneModel(state, simulation))
  assert.notDeepEqual(rainy.pixels, renderScene(deriveSceneModel(state, simulation, true)).pixels)
})

test('ending removes the protagonist and creates a memorial with surviving family', () => {
  const { state, simulation } = copy()
  const before = renderScene(deriveSceneModel(state, simulation))
  state.ended = true
  const model = deriveSceneModel(state, simulation)
  const after = renderScene(model)
  assert.equal(model.prop, 'memorial')
  assert.equal(model.time, 'evening')
  assert.ok(after.people.length > 0)
  assert.ok(after.people.every(person => !person.self))
  assert.notDeepEqual(before.pixels, after.pixels)
})

test('large households stay bounded and all hitboxes remain inside the scene', () => {
  const { state, simulation } = copy()
  state.people = Array.from({ length: 20 }, (_, index) => ({ ...state.people[0]!, id: `child-${index}`, role: '孩子 · 女儿', name: `小禾${index}`, age: index }))
  for (const ended of [false, true]) {
    state.ended = ended
    const model = deriveSceneModel(state, simulation)
    const frame = renderScene(model)
    assert.equal(frame.people.length, 10)
    assert.ok(frame.people.every(person => person.x >= 0 && person.y >= 0 && person.x + person.width <= frame.width && person.y + person.height <= frame.height))
    if (ended) assert.ok(frame.people.every(person => person.x + person.width <= 99 || person.x > 106))
  }
})

test('portrait and scene share identity colors, preserve identity through age and support both themes', () => {
  const name = '陈晚晴'
  const young = personAppearance(name, 25, '母亲', '女')
  const old = personAppearance(name, 75, '母亲', '女')
  assert.deepEqual(young.skin, old.skin)
  assert.deepEqual(young.shirt, old.shirt)
  assert.notDeepEqual(young.hair, old.hair)
  assert.deepEqual(personAppearance(name, 25, '你').shirt, personAppearance(name, 25, 'me').shirt)
  assert.notDeepEqual(personAppearance(name, 25, '你').shirt, young.shirt)
  const portrait = renderPortrait({ name, age: 25, role: '母亲', sex: '女' })
  assert.equal(portrait.width, 24)
  assert.equal(portrait.height, 32)
  assert.deepEqual(portrait, renderPortrait({ name, age: 25, role: '母亲', sex: '女' }))
  assert.notDeepEqual(portrait.pixels, renderPortrait({ name, age: 25, role: '母亲', sex: '女', dark: true }).pixels)
  const skinIndex = (9 * 24 + 11) * 4
  assert.deepEqual(Array.from(portrait.pixels.slice(skinIndex, skinIndex + 3)), young.skin)
})
