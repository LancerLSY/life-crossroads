import assert from 'node:assert/strict'
import test from 'node:test'
import { isGameState, setFocus } from '../game/engine.ts'
import { COUNTRIES, countryAt } from './countries.ts'
import { advanceSimulation, createSimulation, migrate, resolveSimulationDecision, secondsPerYear, setInvestment, spend, survivalAt, validateSimulation } from './core.ts'
import type { FoundationConfig, SimulationResult } from './types.ts'

function choose(result: SimulationResult, preferred?: string): string | undefined {
  const choices = result.state.currentEvent.choices
  return (choices.find(choice => choice.id === preferred) ?? choices.find(choice => ['sim:school:primary', 'sim:school:secondary', 'sim:school:upper', 'sim:school:university', 'sim:work:professional', 'sim:work:technical', 'sim:retire:yes'].includes(choice.id)) ?? choices[0])?.id
}

function until(result: SimulationResult, age: number): SimulationResult {
  while (!result.state.ended && result.state.age < age) result = advanceSimulation(result.state, result.simulation, choose(result))
  return result
}

function survivingSeed(countryId = 'JPN'): SimulationResult {
  for (let seed = 1; seed < 100; seed++) {
    const result = until(createSimulation({ seed, countryId }), 35)
    if (!result.state.ended) return result
  }
  throw new Error('No surviving test cohort')
}

const netWorth = (result: SimulationResult) => result.simulation.economy.cash + result.simulation.economy.investments + result.simulation.economy.homeValue - result.simulation.economy.debt

test('newborn identity, parents, four independent peers and complete serializable records', () => {
  const result = createSimulation({ seed: 918, countryId: 'IND', birthYear: 2000 })
  assert.equal(result.state.age, 0)
  assert.equal(result.state.year, 2000)
  assert.equal(result.state.config.startAge, 0)
  assert.equal(result.simulation.birth.countryId, 'IND')
  assert.equal(result.simulation.birth.parents.mother.age, result.state.people.find(person => person.id === 'mother')?.age)
  assert.equal(result.simulation.peers.length, 4)
  assert.equal(new Set(result.simulation.peers.map(peer => peer.id)).size, 4)
  assert.ok(new Set(result.simulation.peers.map(peer => peer.name)).size > 1)
  for (const peer of result.simulation.peers) {
    assert.equal(peer.years.length, peer.deathAge + 1)
    assert.equal(peer.years[0]?.age, 0)
    assert.equal(peer.years.at(-1)?.alive, false)
    assert.ok(peer.years.every((year, index) => year.age === index))
  }
  assert.ok(isGameState(result.state))
  assert.ok(validateSimulation(JSON.parse(JSON.stringify(result.simulation))))
  assert.deepEqual(createSimulation({ seed: 918, countryId: 'IND', birthYear: 2000 }), result)
})

test('Yemen and supported Arabic naming regions give newborns and parents deterministic local names', () => {
  const localName = /^(Layla|Amina|Noor|Fatima|Omar|Ali|Yusuf|Amir) (Hassan|Khan|Ibrahim|Karim)$/
  for (const countryId of ['YEM', 'OMN', 'ARE', 'QAT', 'KWT', 'BHR', 'LBN', 'SYR', 'PSE', 'LBY', 'MRT']) {
    assert.ok(COUNTRIES.some(country => country.id === countryId))
    const config = { seed: 918, countryId, birthYear: 2000 }
    const result = createSimulation(config)
    assert.equal(result.simulation.birth.countryId, countryId)
    assert.match(result.state.config.name, localName)
    for (const id of ['mother', 'father'] as const) {
      assert.match(result.simulation.birth.parents[id].name, localName)
      assert.equal(result.state.people.find(person => person.id === id)?.name, result.simulation.birth.parents[id].name)
    }
    assert.deepEqual(createSimulation(config), result)
  }
})

test('sampling changes with draw mode; duration changes pacing and never death randomness', () => {
  let differences = 0
  const regions = new Set<string>()
  for (let seed = 1; seed <= 25; seed++) {
    const birth = createSimulation({ seed, drawMode: 'birth', paceMinutes: 30 })
    const population = createSimulation({ seed, drawMode: 'population', paceMinutes: 90 })
    regions.add(birth.simulation.birth.countryId)
    if (birth.simulation.birth.countryId !== population.simulation.birth.countryId) differences++
  }
  assert.ok(regions.size >= 8)
  assert.ok(differences > 12)
  const slow = createSimulation({ seed: 122, countryId: 'JPN', paceMinutes: 90 })
  const fast = createSimulation({ seed: 122, countryId: 'JPN', paceMinutes: 30 })
  assert.ok(secondsPerYear(slow.simulation) > secondsPerYear(fast.simulation))
  assert.equal(until(slow, 110).state.age, until(fast, 110).state.age)
  assert.ok(secondsPerYear(fast.simulation) >= 12 && secondsPerYear(slow.simulation) <= 120)
})

test('20 complete life courses remain coherent and account for all annual cash flows', () => {
  const deathAges = new Set<number>()
  for (let seed = 1; seed <= 20; seed++) {
    let result = createSimulation({ seed, countryId: seed % 2 ? 'JPN' : 'NGA', birthYear: 1990 })
    while (!result.state.ended) {
      const previous = structuredClone(result)
      const expectedChoice = choose(result)
      result = advanceSimulation(result.state, result.simulation, expectedChoice)
      assert.equal(previous.state.age + 1, result.state.age)
      assert.equal(result.state.year, result.state.config.birthYear + result.state.age)
      assert.equal(previous.simulation.years.length + 1, result.simulation.years.length)
      assert.ok(isGameState(result.state), `invalid game state, seed${seed}, age${result.state.age}`)
      const economy = result.simulation.economy
      assert.ok(Math.abs(netWorth(result) - netWorth(previous) - economy.annualIncome + economy.annualExpenses - economy.investmentReturn) < .05, `ledger mismatch, seed${seed}, age${result.state.age}`)
      if (result.state.age < 16) assert.equal(economy.annualIncome, 0)
      for (const stat of Object.values(result.state.stats)) assert.ok(stat >= 0 && stat <= 100 && Number.isFinite(stat))
      assert.ok(economy.cash >= 0 && economy.debt >= 0 && economy.investments >= 0)
      assert.equal(previous.simulation.years.length, previous.state.age + 1, 'input snapshots stay immutable')
    }
    deathAges.add(result.state.age)
    assert.ok(result.state.age <= 110)
    assert.ok(result.simulation.cause)
    assert.equal(result.simulation.years.at(-1)?.marker, 'death')
    assert.equal(result.state.currentEvent.choices.length, 0)
    assert.ok(validateSimulation(result.simulation))
  }
  assert.ok(deathAges.size > 8, `Expected variable mortality, got ${[...deathAges]}`)
  assert.ok([...deathAges].some(age => age > 90), 'There is no mandatory age90 ending')
})

test('education makes graduation a one-time event and opens qualified jobs', () => {
  let result = survivingSeed()
  assert.equal(result.simulation.educationLevel, 'university')
  assert.match(result.simulation.education, /毕业/)
  assert.match(result.simulation.occupation, /专业|负责人/)
  assert.ok(result.simulation.workYears > 0)
  assert.ok(result.simulation.economy.annualIncome > 0)
  const previousIncome = result.simulation.economy.annualIncome
  result = until(result, 64)
  if (!result.state.ended) {
    assert.ok(result.simulation.economy.annualIncome > previousIncome * .7)
    const collegeDecisions = result.state.history.filter(item => item.description.includes('进入大学'))
    assert.equal(collegeDecisions.length, 1)
  }
})

test('investing, buying a home, debt repayment and consumption use real balances', () => {
  let result = survivingSeed()
  result = { ...result, simulation: { ...result.simulation, economy: { ...result.simulation.economy, cash: 1_000_000, investments: 10_000, debt: 0 } } }
  const starting = structuredClone(result)
  result = spend(result.simulation, result.state, 'invest', 1000)
  assert.equal(result.simulation.economy.cash, starting.simulation.economy.cash - 1000)
  assert.equal(result.simulation.economy.investments, 11000)
  assert.equal(netWorth(result), netWorth(starting))
  const beforeHome = netWorth(result)
  result = spend(result.simulation, result.state, 'home')
  assert.equal(result.simulation.economy.homeOwned, true)
  assert.ok(result.simulation.economy.debt > 0)
  assert.ok(Math.abs(netWorth(result) - beforeHome) < .01)
  const debt = result.simulation.economy.debt
  const beforeRepay = netWorth(result)
  result = spend(result.simulation, result.state, 'repay', 1000)
  assert.equal(result.simulation.economy.debt, debt - 1000)
  assert.ok(Math.abs(netWorth(result) - beforeRepay) < .01)
  const beforeStudy = netWorth(result)
  result = spend(result.simulation, result.state, 'study', 100)
  assert.ok(Math.abs(netWorth(result) - (beforeStudy - 100)) < .01)
  assert.throws(() => spend(result.simulation, result.state, 'travel', Infinity))
  assert.throws(() => spend(result.simulation, result.state, 'travel', 1e12))
  assert.throws(() => spend(result.simulation, result.state, 'home'))
  assert.equal(starting.simulation.economy.cash, 1_000_000)
})

test('seven investment policies have distinct returns, switching fees, and risk of loss', () => {
  const result = survivingSeed()
  const rates = new Set<number>()
  for (const policy of ['deposit', 'bonds', 'balanced', 'local', 'global', 'property', 'trading'] as const) {
    const previous = { ...result.simulation, economy: { ...result.simulation.economy, investments: 10000, policy } }
    const next = advanceSimulation(result.state, previous, choose(result))
    rates.add(next.simulation.economy.investmentReturn)
  }
  assert.equal(rates.size, 7)
  const changed = setInvestment(result.simulation, 'trading')
  assert.equal(changed.economy.policy, 'trading')
  assert.ok(changed.economy.investments <= result.simulation.economy.investments)
  assert.equal(result.simulation.economy.policy, 'deposit')
  let losses = 0
  for (let seed = 1; seed <= 15; seed++) {
    const previous = { ...result.simulation, config: { ...result.simulation.config, seed }, economy: { ...result.simulation.economy, investments: 10000, policy: 'trading' as const } }
    if (advanceSimulation(result.state, previous, choose(result)).simulation.economy.investmentReturn < 0) losses++
  }
  assert.ok(losses > 0)
})

test('migration retains origin, education, family, and assets while wages change', () => {
  let result = survivingSeed('NGA')
  result = { ...result, simulation: { ...result.simulation, economy: { ...result.simulation.economy, cash: 1_000_000 } } }
  const original = structuredClone(result)
  const destination = migrate(result.state, result.simulation, 'JPN')
  assert.equal(destination.simulation.birth.countryId, 'NGA')
  assert.equal(destination.simulation.currentCountryId, 'JPN')
  assert.equal(destination.simulation.education, original.simulation.education)
  assert.deepEqual(destination.state.people, original.state.people)
  assert.ok(destination.simulation.economy.cash < original.simulation.economy.cash)
  const next = advanceSimulation(destination.state, destination.simulation, choose(destination))
  const stayed = advanceSimulation(original.state, original.simulation, choose(original))
  assert.ok(next.simulation.economy.annualIncome > stayed.simulation.economy.annualIncome)
  assert.throws(() => migrate(original.state, original.simulation, 'INVALID'))
  const child = createSimulation({ seed: 1 })
  assert.throws(() => migrate(child.state, child.simulation, 'JPN'))
})

test('survival is monotonic, sex/country sensitive, and present conditions stay frozen', () => {
  let previous = 1
  for (let age = 0; age <= 110; age++) {
    const current = survivalAt('JPN', age, '女')
    assert.ok(current <= previous && current >= 0)
    previous = current
  }
  assert.ok(survivalAt('JPN', 80, '女') > survivalAt('JPN', 80, '男'))
  assert.ok(survivalAt('JPN', 5, '女') > survivalAt('NGA', 5, '女'))
  assert.notEqual(countryAt('CHN', 1960, 'past').gdp, countryAt('CHN', 2024, 'past').gdp)
  const present = survivingSeed()
  const future = { ...present, simulation: { ...present.simulation, config: { ...present.simulation.config, world: 'future' as const } } }
  const a = advanceSimulation(present.state, present.simulation, choose(present))
  const b = advanceSimulation(future.state, future.simulation, choose(future))
  assert.notEqual(a.simulation.economy.annualIncome, b.simulation.economy.annualIncome)
})

test('focus effects are time weighted; choosing a focus does not immediately award stats', () => {
  const result = survivingSeed()
  const before = result.state.stats
  const selected = setFocus(setFocus(result.state, 'study'), 'health')
  assert.deepEqual(selected.stats, before)
  const health = advanceSimulation(selected, result.simulation, choose(result), { health: 1 })
  const study = advanceSimulation(selected, result.simulation, choose(result), { study: 1 })
  const mixed = advanceSimulation(selected, result.simulation, choose(result), { health: .5, study: .5 })
  assert.ok(health.state.stats.health >= mixed.state.stats.health && mixed.state.stats.health >= study.state.stats.health)
  assert.ok(study.state.stats.knowledge >= mixed.state.stats.knowledge && mixed.state.stats.knowledge >= health.state.stats.knowledge)
})

test('reflections are once only; deeply malformed imports are rejected', () => {
  let result = createSimulation({ seed: 1, countryId: 'JPN' })
  result = until(result, 5)
  assert.equal(result.simulation.reflectionAge, 5)
  result = advanceSimulation(result.state, result.simulation, choose(result))
  assert.equal(result.simulation.reflectionAge, undefined)
  assert.equal(result.simulation.reflectedAges.filter(age => age === 5).length, 1)
  assert.ok(validateSimulation(result.simulation))
  const invalids = [null, {}, { ...result.simulation, economy: { ...result.simulation.economy, cash: NaN } }, { ...result.simulation, peers: [] }, { ...result.simulation, years: [{ ...result.simulation.years[0], happiness: 101 }] }, { ...result.simulation, notes: [{ age: 0, text: 'x'.repeat(201) }] }, { ...result.simulation, birth: { ...result.simulation.birth, parents: { mother: null } } }, { ...result.simulation, config: { ...result.simulation.config, world: 'fake' } }]
  for (const invalid of invalids) assert.equal(validateSimulation(invalid), false)
  assert.ok(COUNTRIES.length >= 150)
})

test('historical and future configs normalize and remain valid', () => {
  const cases: Partial<FoundationConfig>[] = [{ world: 'past', birthYear: 1960 }, { world: 'future', birthYear: 2080 }, { world: 'present' }]
  for (const config of cases) {
    const result = createSimulation({ ...config, seed: 124 })
    assert.ok(isGameState(result.state))
    assert.ok(validateSimulation(result.simulation))
    assert.equal(result.state.age, 0)
  }
})

test('partnership and children retain identities, age, and household obligations', () => {
  let result = createSimulation({ seed: 1, countryId: 'JPN' })
  while (!result.state.ended && result.state.age < 45 && !result.state.currentEvent.choices.some(choice => choice.id === 'sim:family:child')) result = advanceSimulation(result.state, result.simulation, result.state.currentEvent.choices[0]?.id)
  assert.ok(result.state.currentEvent.choices.some(choice => choice.id === 'sim:family:child'))
  assert.ok(result.state.people.some(person => person.role === '伴侣'))
  result = advanceSimulation(result.state, result.simulation, 'sim:family:child')
  assert.equal(result.simulation.children, 1)
  const child = result.state.people.find(person => person.id === 'child-1')
  assert.equal(child?.age, 0)
  assert.ok(child?.name)
  const income = result.simulation.economy.annualIncome
  assert.ok(income > 0)
  result = advanceSimulation(result.state, result.simulation, result.state.currentEvent.choices[0]?.id)
  assert.equal(result.state.people.find(person => person.id === 'child-1')?.age, 1)
  assert.equal(result.state.people.find(person => person.id === 'child-1')?.name, child?.name)
  assert.ok(result.simulation.economy.annualExpenses > 0)
  assert.ok(isGameState(result.state))
})

test('mortality can occur in infancy and softened presentation does not rig lifespan', () => {
  let infantDeaths = 0
  for (let seed = 1; seed <= 160; seed++) {
    const born = createSimulation({ seed, countryId: 'NGA' })
    const result = advanceSimulation(born.state, born.simulation)
    if (result.state.ended) infantDeaths++
  }
  assert.ok(infantDeaths > 0)
  const gentle = until(createSimulation({ seed: 815, countryId: 'NGA', softMode: true }), 110)
  const detailed = until(createSimulation({ seed: 815, countryId: 'NGA', softMode: false }), 110)
  assert.equal(gentle.state.age, detailed.state.age)
  assert.equal(gentle.simulation.years.length, detailed.simulation.years.length)
})


test('same-year resolution applies schooling once, preserves the clock, and charges tuition annually', () => {
  const original = until(createSimulation({ seed: 1, countryId: 'JPN' }), 18)
  assert.ok(original.state.currentEvent.choices.some(choice => choice.id === 'sim:school:university'))
  const before = structuredClone(original)
  let resolved = resolveSimulationDecision(original.state, original.simulation, 'sim:school:university')
  assert.equal(resolved.state.age, 18)
  assert.equal(resolved.state.year, before.state.year)
  assert.equal(resolved.state.turn, before.state.turn)
  assert.equal(resolved.state.history.length, before.state.history.length)
  assert.equal(resolved.simulation.years.length, before.simulation.years.length)
  assert.equal(resolved.state.currentEvent.id, before.state.currentEvent.id)
  assert.equal(resolved.state.currentEvent.choices.length, 0)
  assert.equal(resolved.simulation.educationLevel, 'university')
  assert.equal(resolved.simulation.schoolUntil, 22)
  assert.equal(resolved.simulation.economy.totalExpenses, before.simulation.economy.totalExpenses)
  assert.equal(resolved.simulation.years.at(-1)?.marker, 'education')
  assert.throws(() => resolveSimulationDecision(resolved.state, resolved.simulation, 'sim:school:university'))
  assert.ok(isGameState(resolved.state))
  assert.ok(validateSimulation(resolved.simulation))
  const expenses = resolved.simulation.economy.totalExpenses
  resolved = advanceSimulation(resolved.state, resolved.simulation)
  assert.equal(resolved.state.age, 19)
  assert.ok(Math.abs(resolved.simulation.economy.totalExpenses - expenses - resolved.simulation.economy.annualExpenses) < .01)
  assert.equal(resolved.state.history.filter(item => item.description.includes('你选择了：进入大学')).length, 1)
  assert.deepEqual(original, before)
})

test('same-year one-off costs, stat and relationship effects cannot be replayed next year', () => {
  const base = survivingSeed()
  const acquaintance = base.state.people.find(person => person.id === 'acquaintance')!
  const choice = { id: 'sim:bond:meet-35', label: '一起见面', hint: '付出时间与费用，增进信任', effects: { happiness: 3 }, personId: acquaintance.id, relationshipDelta: 8 }
  const original = { ...base, state: { ...base.state, currentEvent: { ...base.state.currentEvent, choices: [choice] } }, simulation: { ...base.simulation, economy: { ...base.simulation.economy, cash: 100_000 } } }
  const before = structuredClone(original)
  const resolved = resolveSimulationDecision(original.state, original.simulation, choice.id)
  const cost = Math.round(countryAt('JPN', original.state.year, 'present').gdp * .01 * 100) / 100
  assert.equal(resolved.state.age, original.state.age)
  assert.equal(resolved.state.people.find(person => person.id === acquaintance.id)?.closeness, acquaintance.closeness + 8)
  assert.equal(resolved.state.people.find(person => person.id === acquaintance.id)?.memories.length, Math.min(12, acquaintance.memories.length + 1))
  assert.equal(resolved.simulation.economy.cash, original.simulation.economy.cash - cost)
  assert.ok(Math.abs(resolved.simulation.economy.totalExpenses - original.simulation.economy.totalExpenses - cost) < .01)
  const next = advanceSimulation(resolved.state, resolved.simulation)
  assert.equal(next.state.people.find(person => person.id === acquaintance.id)?.closeness, resolved.state.people.find(person => person.id === acquaintance.id)?.closeness)
  assert.ok(Math.abs(next.simulation.economy.totalExpenses - resolved.simulation.economy.totalExpenses - next.simulation.economy.annualExpenses) < .01)
  assert.throws(() => resolveSimulationDecision(resolved.state, resolved.simulation, choice.id))
  assert.deepEqual(original, before)
})

test('a same-year caregiving income adjustment survives save and is consumed for exactly one year', () => {
  const base = survivingSeed()
  const state = { ...base.state, currentEvent: { ...base.state.currentEvent, choices: [{ id: 'sim:family:care', label: '减少工作，陪伴家人', hint: '本年劳动收入减少15%', effects: { happiness: 4 } }] } }
  const resolved = resolveSimulationDecision(state, base.simulation, 'sim:family:care')
  assert.equal(resolved.state.age, state.age)
  assert.equal(resolved.simulation.pendingIncomeFactor, .85)
  const saved = JSON.parse(JSON.stringify(resolved.simulation))
  assert.ok(validateSimulation(saved))
  const adjusted = advanceSimulation(resolved.state, saved)
  const unadjusted = advanceSimulation(resolved.state, { ...saved, pendingIncomeFactor: undefined })
  assert.ok(adjusted.simulation.economy.annualIncome < unadjusted.simulation.economy.annualIncome)
  assert.equal(adjusted.simulation.pendingIncomeFactor, undefined)
  const following = advanceSimulation(adjusted.state, adjusted.simulation, choose(adjusted))
  assert.equal(following.simulation.pendingIncomeFactor, undefined)
})

test('the continuous-clock decision path completes full valid lives with no duplicate financial booking', () => {
  for (let seed = 1; seed <= 6; seed++) {
    let result = createSimulation({ seed, countryId: seed % 2 ? 'JPN' : 'NGA' })
    while (!result.state.ended) {
      const choiceId = choose(result)
      if (choiceId) {
        const age = result.state.age
        const previousNetWorth = netWorth(result)
        const previousExpenses = result.simulation.economy.totalExpenses
        result = resolveSimulationDecision(result.state, result.simulation, choiceId)
        assert.equal(result.state.age, age)
        assert.ok(isGameState(result.state))
        assert.ok(validateSimulation(result.simulation))
        assert.ok(Math.abs(netWorth(result) - previousNetWorth + result.simulation.economy.totalExpenses - previousExpenses) < .05)
      }
      const before = structuredClone(result)
      result = advanceSimulation(result.state, result.simulation)
      assert.equal(result.state.age, before.state.age + 1)
      assert.ok(isGameState(result.state))
      assert.ok(validateSimulation(result.simulation))
      const economy = result.simulation.economy
      assert.ok(Math.abs(netWorth(result) - netWorth(before) - economy.annualIncome + economy.annualExpenses - economy.investmentReturn) < .05)
    }
    assert.equal(result.simulation.years.at(-1)?.marker, 'death')
  }
})


test('childhood temperament choices at two and four resolve in place and accumulate across saves', () => {
  let result = until(createSimulation({ seed: 1, countryId: 'JPN' }), 2)
  assert.equal(result.state.currentEvent.choices.length, 4)
  assert.ok(result.state.currentEvent.choices.every(choice => choice.id.startsWith('sim:temperament:')))
  const before = structuredClone(result)
  const knowledge = result.state.stats.knowledge
  result = resolveSimulationDecision(result.state, result.simulation, 'sim:temperament:curiosity-2')
  assert.equal(result.state.age, 2)
  assert.equal(result.state.year, before.state.year)
  assert.equal(result.simulation.temperament?.curiosity, 64)
  assert.equal(result.state.stats.knowledge, knowledge + 4)
  assert.equal(result.simulation.economy.totalExpenses, before.simulation.economy.totalExpenses)
  assert.equal(result.simulation.economy.annualIncome, 0)
  assert.equal(result.simulation.workYears, 0)
  assert.equal(before.simulation.temperament?.curiosity, 50)
  assert.throws(() => resolveSimulationDecision(result.state, result.simulation, 'sim:work:professional'))
  result = until(result, 4)
  assert.equal(result.state.currentEvent.choices.length, 4)
  result = resolveSimulationDecision(result.state, result.simulation, 'sim:temperament:persistence-4')
  assert.equal(result.state.age, 4)
  assert.equal(result.simulation.temperament?.curiosity, 64)
  assert.equal(result.simulation.temperament?.persistence, 64)
  const saved = JSON.parse(JSON.stringify(result.simulation))
  assert.ok(validateSimulation(saved))
  result = advanceSimulation(result.state, saved)
  assert.equal(result.state.age, 5)
  assert.equal(result.simulation.reflectionAge, 5)
  assert.equal(result.simulation.temperament?.persistence, 64)
  assert.equal(result.simulation.workYears, 0)
  assert.equal(result.simulation.economy.annualIncome, 0)
  assert.ok(isGameState(result.state))
  assert.equal(validateSimulation({ ...saved, temperament: { ...saved.temperament, curiosity: 101 } }), false)
  assert.equal(validateSimulation({ ...saved, temperament: { curiosity: 50 } }), false)
})

test('early social temperament connects to family and old saves gain valid defaults', () => {
  const original = until(createSimulation({ seed: 1, countryId: 'JPN' }), 2)
  const parent = original.state.people.find(person => person.id === 'mother')!
  const olderSave = { ...original.simulation, temperament: undefined }
  assert.ok(validateSimulation(olderSave))
  const resolved = resolveSimulationDecision(original.state, olderSave, 'sim:temperament:sociability-2')
  assert.equal(resolved.simulation.temperament?.sociability, 64)
  assert.equal(resolved.state.people.find(person => person.id === 'mother')?.closeness, Math.min(100, parent.closeness + 3))
  assert.equal(resolved.state.age, 2)
  const activeFocus = advanceSimulation(setFocus(resolved.state, 'career'), resolved.simulation, undefined, { career: 1 })
  const passiveFocus = advanceSimulation(setFocus(resolved.state, 'balance'), resolved.simulation)
  assert.deepEqual(activeFocus.state.stats, passiveFocus.state.stats)
  assert.equal(activeFocus.simulation.occupation, '由家人照顾')
  assert.equal(activeFocus.simulation.economy.annualIncome, 0)
  assert.equal(activeFocus.simulation.workYears, 0)
})

test('new childhood and adult contacts receive deterministic local names without changing family or portraits', () => {
  const birth = createSimulation({ seed: 918, countryId: 'IND', birthYear: 2000 })
  const family = new Map(birth.state.people.map(person => [person.id, person.name]))
  let result = birth
  const indianName = /^(Asha|Priya|Anika|Meera|Arjun|Ravi|Aarav|Dev) (Sharma|Patel|Das|Kumar)$/
  for (const [age, id, avatar] of [[3, 'friend', 2], [6, 'mentor', 3], [18, 'acquaintance', 5], [26, 'neighbor', 4]] as const) {
    result = until(result, age)
    assert.equal(result.state.age, age)
    const contact = result.state.people.find(person => person.id === id)!
    assert.match(contact.name, indianName)
    assert.equal(contact.avatar, avatar)
    for (const person of result.state.people) if (family.has(person.id)) assert.equal(person.name, family.get(person.id))
    for (const message of result.state.worldMessages.filter(message => message.year === result.state.year)) {
      assert.ok(result.state.people.some(person => person.name === message.speaker))
      assert.ok(result.state.people.some(person => person.name === message.target))
    }
    assert.doesNotMatch(result.state.currentEvent.description, /江小满|周予安|夏予宁|唐时雨/)
  }
  assert.deepEqual(until(createSimulation({ seed: 918, countryId: 'IND', birthYear: 2000 }), 26), result)
})

test('migration localizes only future contacts and preserves legacy names and conversations', () => {
  const result = until(createSimulation({ seed: 918, countryId: 'IND', birthYear: 2000 }), 25)
  result.state.people = result.state.people.map(person => person.id === 'friend' ? { ...person, name: '旧存档朋友' } : person)
  result.simulation.economy.cash = 1_000_000
  const migrated = migrate(result.state, result.simulation, 'JPN')
  const saved = JSON.parse(JSON.stringify(migrated)) as SimulationResult
  const next = until(saved, 26)
  assert.match(next.state.people.find(person => person.id === 'neighbor')!.name, /^(佐藤|铃木|高桥|田中)(葵|凛|美咲|悠真|莲|阳太)$/)
  for (const person of migrated.state.people) assert.equal(next.state.people.find(item => item.id === person.id)?.name, person.name)
  assert.deepEqual(next.state.history.slice(0, migrated.state.history.length), migrated.state.history)
  for (const message of migrated.state.worldMessages) {
    const retained = next.state.worldMessages.find(item => item.id === message.id)
    if (retained) assert.deepEqual(retained, message)
  }
  assert.deepEqual(next, until(JSON.parse(JSON.stringify(migrated)) as SimulationResult, 26))
})

test('annual simulation carries world threads across forks and protects mandatory milestones', () => {
  let result = createSimulation({ seed: 918, countryId: 'JPN', birthYear: 2000 })
  result.state.config.intelligence = 100
  result = until(result, 6)
  assert.ok(result.state.currentEvent.choices.some(choice => choice.id === 'sim:school:primary'))
  result = until(result, 20)
  assert.ok(result.state.worldThreads?.length)
  const snapshot = structuredClone(result)
  const first = advanceSimulation(result.state, result.simulation, choose(result))
  const replay = advanceSimulation(structuredClone(result.state), structuredClone(result.simulation), choose(result))
  assert.deepEqual(first, replay)
  assert.deepEqual(result, snapshot)
  assert.equal(first.state.worldUpdatedYear, first.state.year)
  for (const previous of result.state.worldThreads!.filter(thread => thread.status === 'active')) {
    const next = first.state.worldThreads!.find(thread => thread.id === previous.id)
    if (next) assert.ok(next.stage <= previous.stage + 1, 'annual wrapper must not advance a thread twice')
  }
  assert.ok(isGameState(first.state))
})

test('successful spending records each actual outlay as a distinct world cause; failures leave snapshots untouched', () => {
  const original = until(createSimulation({ seed: 918, countryId: 'JPN' }), 25)
  original.state.config.intelligence = 100
  original.simulation.economy.cash = 1_000_000
  original.simulation.economy.debt = 75
  const snapshot = structuredClone(original)
  for (const action of ['health', 'study', 'social', 'travel', 'home', 'repay', 'invest'] as const) {
    const result = spend(original.simulation, original.state, action, 100)
    const thread = result.state.worldThreads!.find(thread => thread.id.startsWith(`action-${action}-`))!
    assert.ok(thread)
    const actual = original.simulation.economy.cash - result.simulation.economy.cash
    assert.match(thread.cause, new RegExp(actual.toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(result.state.age, original.state.age)
    assert.ok(isGameState(result.state))
  }
  assert.deepEqual(original, snapshot)
  const broke = { ...original, simulation: { ...original.simulation, economy: { ...original.simulation.economy, cash: 0 } } }
  const before = structuredClone(broke)
  for (const action of ['travel', 'social', 'home', 'invest', 'repay'] as const) assert.throws(() => spend(broke.simulation, broke.state, action, 100))
  assert.deepEqual(broke, before)
})

test('travel and migration introduce bounded local contacts without replacing existing people or birth history', () => {
  let result = until(createSimulation({ seed: 918, countryId: 'JPN' }), 25)
  result.state.config.intelligence = 100
  result.simulation.economy.cash = 1_000_000
  const originalPeople = structuredClone(result.state.people)
  const birth = structuredClone(result.simulation.birth)
  const year = result.state.year
  result = spend(result.simulation, result.state, 'travel', 100)
  const contact = result.state.people.find(person => person.id.startsWith(`contact-${year}-JPN`))!
  assert.ok(contact)
  assert.match(contact.name, /^(佐藤|铃木|高桥|田中)/)
  const count = result.state.people.length
  for (let index = 0; index < 20; index++) result = spend(result.simulation, result.state, index % 2 ? 'social' : 'travel', 100)
  assert.equal(result.state.people.length, count)
  assert.ok(result.state.worldThreads!.length <= 9)
  result = migrate(result.state, result.simulation, 'IND')
  const neighbor = result.state.people.find(person => person.id === `contact-${year}-IND`)!
  assert.ok(neighbor)
  assert.match(neighbor.name, / (Sharma|Patel|Das|Kumar)$/)
  assert.deepEqual(result.simulation.birth, birth)
  for (const old of originalPeople) {
    const retained = result.state.people.find(person => person.id === old.id)!
    assert.equal(retained.name, old.name)
    assert.deepEqual(retained.messages, old.messages)
    assert.deepEqual(retained.memories, old.memories)
  }
  assert.ok(result.state.people.length <= 12)
  assert.equal(result.state.year, year)
  assert.match(result.state.worldThreads!.find(thread => thread.id.startsWith('action-migrate-'))!.cause, /印度/)
  assert.ok(isGameState(result.state))
})

test('world intelligence zero preserves all immediate economic actions while suppressing extra stories and contacts', () => {
  const original = until(createSimulation({ seed: 918, countryId: 'JPN' }), 25)
  original.simulation.economy.cash = 1_000_000
  original.simulation.economy.debt = 75
  const quiet = { ...original.state, config: { ...original.state.config, intelligence: 0 }, worldThreads: undefined }
  const active = { ...quiet, config: { ...quiet.config, intelligence: 100 } }
  for (const action of ['health', 'study', 'social', 'travel', 'home', 'repay', 'invest'] as const) {
    const low = spend(original.simulation, quiet, action, 100)
    const high = spend(original.simulation, active, action, 100)
    assert.deepEqual(low.simulation.economy, high.simulation.economy)
    assert.deepEqual(low.state.stats, high.state.stats)
    assert.equal(low.state.worldThreads, undefined)
    assert.equal(low.state.people.length, quiet.people.length)
  }
  const lowMove = migrate(quiet, original.simulation, 'IND')
  const highMove = migrate(active, original.simulation, 'IND')
  assert.deepEqual(lowMove.simulation.economy, highMove.simulation.economy)
  assert.equal(lowMove.state.worldThreads, undefined)
  assert.equal(lowMove.state.people.length, quiet.people.length)
})
