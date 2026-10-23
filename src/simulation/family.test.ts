import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleWeightedIndex } from './family.ts'

test('weighted sampling preserves input mass and excludes zero mass', () => {
  const frequencies = [0, 0, 0, 0]
  for (let index = 0; index < 10000; index++) frequencies[sampleWeightedIndex([1, 0, 2, 7], () => (index + .5) / 10000)]!++
  assert.deepEqual(frequencies, [1000, 0, 2000, 7000])
  assert.equal(sampleWeightedIndex([0, 2, 0], () => 0), 1)
  assert.equal(sampleWeightedIndex([0, 2, 0], () => 1 - Number.EPSILON), 1)
})

test('invalid weights and random fractions fail explicitly', () => {
  for (const weights of [[], [0, 0], [-1, 2], [NaN], [Infinity]]) assert.throws(() => sampleWeightedIndex(weights, () => .5), RangeError)
  for (const fraction of [-.1, 1, NaN, Infinity]) assert.throws(() => sampleWeightedIndex([1], () => fraction), RangeError)
})

import familyData from './family-data.json' with { type: 'json' }
import { conditionalGroupWeights, nearestSurveys, probabilities, sampleFamily } from './family.ts'
import { createSimulation, validateSimulation } from './core.ts'

function seededRandom(seed: number) {
  let value = seed
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}

test('DHS wealth frequencies follow births rather than equal household quintiles', () => {
  const survey = familyData.surveys.find(survey => survey.countryCode === 'KEN' && survey.wealth.length === 5)!
  assert.ok(survey)
  const expected = probabilities(survey.wealth.map(group => group.count))
  const counts = [0, 0, 0, 0, 0]
  const random = seededRandom(98123)
  for (let index = 0; index < 30000; index++) counts[sampleFamily('KEN', survey.surveyYear, random).familyQuintile - 1]!++
  counts.forEach((count, index) => assert.ok(Math.abs(count / 30000 - expected[index]!) < .012))
})

test('conditional age weights use birth counts and birth order and stay normalized', () => {
  const weights = conditionalGroupWeights([{ label: 'a', count: 10, birthOrder: [20, 80] }, { label: 'b', count: 40, birthOrder: [50, 50] }], 1)
  assert.deepEqual(weights, [8, 20])
  assert.deepEqual(probabilities(weights), [2 / 7, 5 / 7])
})

test('reference selection never counts repeat surveys as extra countries', () => {
  const survey = familyData.surveys[0]!
  const variants = [2000, 2010, 2020].map(surveyYear => ({ ...survey, surveyYear }))
  assert.deepEqual(nearestSurveys(variants, 2014).map(item => item.surveyYear), [2010])
  assert.deepEqual(nearestSurveys(variants, 2015).map(item => item.surveyYear), [2020])
})

test('family draws reproduce and disclose reference countries, tail groups and age proxies', () => {
  assert.deepEqual(sampleFamily('CHN', 1980, seededRandom(77)), sampleFamily('CHN', 1980, seededRandom(77)))
  const random = seededRandom(123)
  for (let index = 0; index < 500; index++) {
    const family = sampleFamily('CHN', 1980, random)
    assert.equal(family.metadata.countryMatch, false)
    assert.equal(family.metadata.evidence, 'survey-proxy')
    assert.ok(family.motherAge >= 15 + family.siblings && family.motherAge <= 70)
    assert.equal(family.fatherAge, family.motherAge)
    assert.equal(family.metadata.birthOrderGroup === '5+', family.siblings === 4)
  }
})

test('new metadata validates while old snapshots retain their original family unchanged', () => {
  const result = createSimulation({ seed: 483, countryId: 'KEN' })
  assert.ok(validateSimulation(result.simulation))
  for (const sibling of result.state.people.filter(person => person.id.startsWith('sibling-'))) assert.ok(sibling.age >= 1 && result.simulation.birth.parents.mother.age - sibling.age >= 15)
  const legacy = structuredClone(result.simulation)
  delete legacy.birth.familySampling
  legacy.birth.parents.mother.age = 20
  legacy.birth.parents.father.age = 43
  legacy.birth.siblings = 5
  const before = structuredClone(legacy)
  assert.ok(validateSimulation(legacy))
  assert.deepEqual(legacy, before)
  const bad = structuredClone(result.simulation)
  bad.birth.familySampling!.wealthProbabilities[0] = NaN
  assert.equal(validateSimulation(bad), false)
})

test('every complete survey supports coherent conditional draws', () => {
  const random = seededRandom(31341)
  for (const survey of familyData.surveys.filter(survey => survey.wealth.length === 5)) {
    for (let index = 0; index < 20; index++) {
      const family = sampleFamily(survey.countryCode, survey.surveyYear, random)
      assert.ok(Number.isInteger(family.motherAge) && family.motherAge >= 15 + family.siblings)
      assert.ok(family.metadata.wealthProbabilities.every(value => value >= 0 && value <= 1))
    }
  }
})
