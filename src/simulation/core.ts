import { crisisActive, resolveMyanmarDecision, validateMyanmarData, visitMyanmar } from './myanmar.ts'
import { relationshipEffect } from '../game/relationships.ts'
import { evolveWorld, recordWorldAction, worldThreadEvent } from '../game/world.ts'
import { advanceYear, createLife, resolveChoice } from '../game/engine.ts'
import type { Choice, Focus, GameState, LifeEvent, Person } from '../game/types.ts'
import { sampleFamily } from './family.ts'
import { COUNTRIES, countryAt, countryById, sampleCountry } from './countries.ts'
import type { Country } from './countries.ts'
import type { BirthRecord, EducationLevel, FocusWeights, FoundationConfig, InvestmentPolicy, Peer, Sex, Simulation, SimulationResult, Temperament, World, YearRecord } from './types.ts'

export type { BirthRecord, Economy, FocusWeights, FoundationConfig, InvestmentPolicy, Peer, PeerYear, Simulation, SimulationResult, Temperament, YearRecord } from './types.ts'

const FOCUSES: Focus[] = ['balance', 'study', 'career', 'social', 'health']
const POLICIES: InvestmentPolicy[] = ['deposit', 'bonds', 'balanced', 'local', 'global', 'property', 'trading']
const REFLECTION_AGES = [5, 15, 30, 50, 70]
const TEMPERAMENT_KEYS: (keyof Temperament)[] = ['curiosity', 'activity', 'sociability', 'persistence']
const FAMILY_CLASSES = ['资源紧张', '朴素家庭', '普通家庭', '生活宽裕', '资源充足']
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const money = (value: number) => Math.round(clamp(value, 0, 1e12) * 100) / 100

function hash(text: string): number {
  let result = 2166136261
  for (const character of text) result = Math.imul(result ^ character.charCodeAt(0), 16777619)
  return result >>> 0
}

function rng(seed: number, salt: string): () => number {
  let current = (seed ^ hash(salt)) >>> 0
  return () => {
    current += 0x6d2b79f5
    let value = Math.imul(current ^ current >>> 15, 1 | current)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function seed(): number {
  return globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 4294967296)
}

function normalize(config: Partial<FoundationConfig>): FoundationConfig {
  const currentYear = new Date().getFullYear()
  const world = config.world === 'past' || config.world === 'future' ? config.world : 'present'
  const birthYear = Number.isFinite(config.birthYear) ? Math.round(clamp(config.birthYear!, 1950, 2100)) : world === 'past' ? 1980 : currentYear
  return {
    world, birthYear: world === 'past' ? Math.min(currentYear - 1, birthYear) : birthYear,
    drawMode: config.drawMode === 'population' ? 'population' : 'birth',
    paceMinutes: config.paceMinutes === 30 || config.paceMinutes === 90 ? config.paceMinutes : 60,
    softMode: config.softMode !== false,
    seed: Number.isFinite(config.seed) ? Math.round(clamp(config.seed!, 0, 4294967295)) : seed(),
    intelligence: Number.isFinite(config.intelligence) ? Math.round(clamp(config.intelligence!)) : 60,
    ...(config.countryId ? { countryId: countryById(config.countryId).id } : {}),
    ...(config.homeCountryId ? { homeCountryId: countryById(config.homeCountryId).id } : {}),
    ...(config.name?.trim() ? { name: config.name.trim().slice(0, 40) } : {}),
  }
}

function conditions(simulation: Simulation, year: number): Country {
  // Present is deliberately frozen; past follows the calendar, future follows its scenario.
  return countryAt(simulation.currentCountryId, simulation.config.world === 'present' ? simulation.config.birthYear : year, simulation.config.world)
}

function chooseBirthCountry(config: FoundationConfig): Country {
  if (config.countryId) return countryAt(config.countryId, config.birthYear, config.world)
  if (config.world === 'present') return countryAt(sampleCountry(config.seed, config.drawMode).id, config.birthYear, config.world)
  const field = config.drawMode === 'birth' ? 'births' : 'population'
  const candidates = COUNTRIES.map(country => countryAt(country.id, config.birthYear, config.world))
  let cursor = rng(config.seed, 'era-country')() * candidates.reduce((sum, country) => sum + country[field], 0)
  return candidates.find(country => (cursor -= country[field]) <= 0) ?? candidates[candidates.length - 1]!
}

function makeName(countryId: string, sex: Sex, random: () => number): string {
  const at = <T,>(values: T[]) => values[Math.floor(random() * values.length)]!
  if (['CHN', 'TWN', 'HKG', 'SGP', 'MAC'].includes(countryId)) return at(['林', '陈', '李', '王', '赵', '张', '周', '黄']) + at(sex === '女' ? ['知夏', '雨宁', '清禾', '小满', '安然', '星月'] : ['时安', '明川', '远山', '知行', '星河', '予舟'])
  if (countryId === 'JPN') return at(['佐藤', '铃木', '高桥', '田中']) + at(sex === '女' ? ['葵', '凛', '美咲'] : ['悠真', '莲', '阳太'])
  if (countryId === 'KOR') return at(['金', '李', '朴', '崔']) + at(sex === '女' ? ['书妍', '智友', '夏恩'] : ['智勋', '敏俊', '道允'])
  if (['IND', 'BGD', 'NPL', 'LKA'].includes(countryId)) return at(sex === '女' ? ['Asha', 'Priya', 'Anika', 'Meera'] : ['Arjun', 'Ravi', 'Aarav', 'Dev']) + ' ' + at(['Sharma', 'Patel', 'Das', 'Kumar'])
  if (['PAK', 'AFG', 'IRN', 'IRQ', 'SAU', 'EGY', 'DZA', 'MAR', 'TUN', 'JOR', 'SDN', 'YEM', 'OMN', 'ARE', 'QAT', 'KWT', 'BHR', 'LBN', 'SYR', 'PSE', 'LBY', 'MRT'].includes(countryId)) return at(sex === '女' ? ['Layla', 'Amina', 'Noor', 'Fatima'] : ['Omar', 'Ali', 'Yusuf', 'Amir']) + ' ' + at(['Hassan', 'Khan', 'Ibrahim', 'Karim'])
  if (['ESP', 'MEX', 'COL', 'ARG', 'PER', 'CHL', 'VEN', 'ECU', 'GTM', 'BOL'].includes(countryId)) return at(sex === '女' ? ['Sofía', 'Lucía', 'Valentina', 'Isabel'] : ['Mateo', 'Diego', 'Daniel', 'Gabriel']) + ' ' + at(['García', 'López', 'Martínez', 'Rivera'])
  if (['FRA', 'BEL', 'CMR', 'SEN', 'CIV', 'COD', 'MLI', 'NER'].includes(countryId)) return at(sex === '女' ? ['Aïcha', 'Marie', 'Lina', 'Fatou'] : ['Louis', 'Amadou', 'Noé', 'Moussa']) + ' ' + at(['Martin', 'Diallo', 'Camara', 'Laurent'])
  if (['RUS', 'UKR', 'BLR', 'KAZ'].includes(countryId)) return at(sex === '女' ? ['Anya', 'Sofia', 'Daria'] : ['Ivan', 'Mikhail', 'Alexei']) + ' ' + at(['Petrov', 'Ivanov', 'Smirnov'])
  if (['NGA', 'GHA', 'KEN', 'UGA', 'TZA', 'ETH', 'ZAF'].includes(countryId)) return at(sex === '女' ? ['Ama', 'Zuri', 'Nia', 'Amina'] : ['Kwame', 'Kofi', 'Jabari', 'Samuel']) + ' ' + at(['Mensah', 'Okafor', 'Kamau', 'Abebe'])
  if (['BRA', 'PRT', 'AGO', 'MOZ'].includes(countryId)) return at(sex === '女' ? ['Ana', 'Beatriz', 'Sofia'] : ['João', 'Miguel', 'Lucas']) + ' ' + at(['Silva', 'Santos', 'Costa'])
  return at(sex === '女' ? ['Maya', 'Emma', 'Sara', 'Amelia', 'Elena'] : ['Noah', 'Adam', 'Leo', 'Oliver', 'Elias']) + ' ' + at(['Morgan', 'Williams', 'Anderson', 'Brown', 'Wilson'])
}

function birthRecord(config: FoundationConfig, country: Country): { birth: BirthRecord; name: string } {
  const random = rng(config.seed, 'birth-certificate')
  const femaleChance = ['CHN', 'IND'].includes(country.id) ? .48 : .488
  const sex: Sex = random() < femaleChance ? '女' : '男'
  const name = config.name ?? makeName(country.id, sex, random)
  const family = sampleFamily(country.id, config.birthYear, rng(config.seed, 'birth-family'))
  const { familyQuintile, motherAge } = family
  const parentJobs = familyQuintile < 3 ? ['农业劳动者', '店员', '工厂员工', '运输工作者', '服务业员工'] : ['教师', '技术工作者', '医护人员', '小店经营者', '办公室职员']
  const birth: BirthRecord = {
    countryId: country.id, countryName: country.name, sex, familyQuintile,
    familyClass: FAMILY_CLASSES[familyQuintile - 1]!, urban: family.urban,
    parents: {
      mother: { name: makeName(country.id, '女', random), age: motherAge, occupation: parentJobs[Math.floor(random() * parentJobs.length)]! },
      father: { name: makeName(country.id, '男', random), age: family.fatherAge, occupation: parentJobs[Math.floor(random() * parentJobs.length)]! },
    }, siblings: family.siblings, familySampling: family.metadata,
  }
  return { birth, name }
}

const present = (person: Person) => !person.role.endsWith('已离世')
const netWorth = (simulation: Simulation) => Math.round((simulation.economy.cash + simulation.economy.investments + simulation.economy.homeValue - simulation.economy.debt) * 100) / 100
const relationshipScore = (state: GameState) => {
  const people = state.people.filter(present)
  return people.length ? Math.round(people.reduce((sum, person) => sum + (person.closeness + person.trust) / 2, 0) / people.length) : 20
}

function yearRecord(state: GameState, simulation: Simulation, marker?: YearRecord['marker']): YearRecord {
  return {
    age: state.age, year: state.year, health: state.stats.health, happiness: state.stats.happiness, knowledge: state.stats.knowledge,
    relationships: relationshipScore(state), netWorth: netWorth(simulation), income: simulation.economy.annualIncome,
    expenses: simulation.economy.annualExpenses, cash: simulation.economy.cash, investments: simulation.economy.investments,
    debt: simulation.economy.debt, countryId: simulation.currentCountryId, occupation: simulation.occupation, education: simulation.education,
    title: state.currentEvent.title, ...(marker ? { marker } : {}), alive: !state.ended,
  }
}

function baseSimulation(config: FoundationConfig): SimulationResult {
  const country = chooseBirthCountry(config)
  const { birth, name } = birthRecord(config, country)
  let state = createLife({ name, birthYear: config.birthYear, location: country.name, startAge: 0, intelligence: config.intelligence, seed: config.seed })
  const random = rng(config.seed, 'birth-health')
  const familyRandom = rng(config.seed, 'birth-siblings')
  const siblings: Person[] = Array.from({ length: birth.siblings }, (_, index) => {
    const sex: Sex = familyRandom() < .488 ? '女' : '男'
    return { id: `sibling-${index}`, name: makeName(country.id, sex, familyRandom), role: sex === '女' ? '姐姐' : '哥哥', age: Math.max(1, Math.floor((index + 1) * (birth.parents.mother.age - 15) / Math.max(1, birth.siblings))), personality: '有自己的兴趣，慢慢学着和家人相处', closeness: 70, trust: 74, mood: '好奇', avatar: 6 + index, memories: [], messages: [] }
  })
  state = {
    ...state, stats: { health: Math.round(78 + random() * 17), happiness: Math.round(55 + random() * 20), knowledge: 0, wealth: birth.familyQuintile * 16 },
    people: [...state.people.map(person => {
      const parent = person.id === 'mother' ? birth.parents.mother : birth.parents.father
      return { ...person, name: parent.name, age: parent.age, personality: `${person.personality}，在当地从事${parent.occupation}` }
    }), ...siblings],
    worldMessages: [{ id: `${state.id}-world-birth`, speaker: birth.parents.mother.name, target: birth.parents.father.name, text: '新的日子开始了，我们一起慢慢学着照顾这个小家。', year: config.birthYear }],
    currentEvent: { id: `${state.id}-year-0`, year: config.birthYear, age: 0, kind: 'life', title: '世界里，多了一个你', description: `${config.birthYear}年，你出生在${country.name}的${birth.urban ? '城市' : '乡村'}，是一个${birth.familyClass}的${birth.sex === '女' ? '女孩' : '男孩'}。家人的生活从此多了一份牵挂。`, choices: [], source: 'local' },
  }
  const simulation: Simulation = {
    version: 1, config: { ...config }, birth, economy: { cash: 0, annualIncome: 0, annualExpenses: 0, investments: 0, debt: 0, homeOwned: false, homeValue: 0, policy: 'deposit', investmentReturn: 0, totalIncome: 0, totalExpenses: 0 },
    education: '尚未入学', educationLevel: 'none', schoolUntil: 0, occupation: '由家人照顾', workYears: 0, retired: false,
    currentCountryId: country.id, children: 0, relationships: relationshipScore(state), temperament: { curiosity: 50, activity: 50, sociability: 50, persistence: 50 }, peers: [], years: [], notes: [], starred: [], reflectedAges: [],
  }
  simulation.years = [yearRecord(state, simulation, 'birth')]
  return { state, simulation }
}

/** Four full independent lives share the player's calendar and model, not their outcomes. */
export function createSimulation(config: Partial<FoundationConfig> = {}): SimulationResult {
  const normalized = normalize(config)
  const result = baseSimulation(normalized)
  result.simulation.peers = Array.from({ length: 4 }, (_, index) => {
    const peerConfig = { ...normalized, seed: hash(`${normalized.seed}-peer-${index}`), name: undefined, countryId: undefined }
    let peer = baseSimulation(peerConfig)
    const years = [{ age: 0, health: peer.state.stats.health, happiness: peer.state.stats.happiness, occupation: peer.simulation.occupation, income: 0, alive: true }]
    const random = rng(peerConfig.seed, 'peer-decisions')
    while (!peer.state.ended && peer.state.age < 110) {
      const choices = peer.state.currentEvent.choices
      const choice = choices[Math.floor(random() * choices.length)]
      if (choice) peer = resolveSimulationDecision(peer.state, peer.simulation, choice.id)
      peer = step(peer.state, peer.simulation)
      years.push({ age: peer.state.age, health: peer.state.stats.health, happiness: peer.state.stats.happiness, occupation: peer.simulation.occupation, income: peer.simulation.economy.annualIncome, alive: !peer.state.ended })
    }
    return { id: `peer-${index}-${peerConfig.seed}`, name: peer.state.config.name, countryId: peer.simulation.birth.countryId, countryName: peer.simulation.birth.countryName, sex: peer.simulation.birth.sex, deathAge: peer.state.age, cause: peer.simulation.cause ?? '生命自然终止', years } satisfies Peer
  })
  return result
}

function option(id: string, label: string, hint: string, effects: Choice['effects'] = {}): Choice {
  return { id: `sim:${id}`, label, hint, effects }
}

function event(state: GameState, title: string, description: string, choices: Choice[], kind: LifeEvent['kind'] = 'choice'): LifeEvent {
  return { id: `${state.id}-year-${state.age}`, year: state.year, age: state.age, title, description, choices, kind, source: 'local' }
}

function nextEvent(state: GameState, simulation: Simulation): LifeEvent {
  if (state.ended) return event(state, '这一生，留在时间里', state.ending!, [], 'life')
  const livingIds = new Set(state.people.filter(present).map(person => person.id))
  if (state.currentEvent.choices.some(choice => choice.personId && !livingIds.has(choice.personId))) state = { ...state, currentEvent: event(state, '在变化中继续生活', '一些相遇成为了记忆。你慢慢整理心情，也为身边的日常留出时间。', [], 'life') }
  const country = conditions(simulation, state.year)
  const random = rng(simulation.config.seed, `milestones-${state.age}`)
  const age = state.age
  if (age === 2 || age === 4) {
    const family = state.people.find(person => present(person) && (person.id === 'mother' || person.id === 'father'))
    const sociable: Choice = { ...option(`temperament:sociability-${age}`, age === 2 ? '拉着家人的手，向来客打招呼' : '邀请小伙伴一起搭一个小镇', '在熟悉的陪伴中练习表达，增加亲近感', { happiness: 4 }), ...(family ? { personId: family.id, relationshipDelta: 3 } : {}) }
    const choices = [
      option(`temperament:curiosity-${age}`, age === 2 ? '坐近一点，仔细看新鲜的小物件' : '翻开图画书，问问故事里的为什么', '观察与提问，让好奇心慢慢生长', { knowledge: 4, happiness: 1 }),
      option(`temperament:activity-${age}`, age === 2 ? '抱起小球，请家人陪着走一走' : '和小伙伴在空地上玩追影子', '在安全的照顾下活动身体', { health: 4, happiness: 2 }),
      sociable,
      option(`temperament:persistence-${age}`, age === 2 ? '继续试着把积木放稳' : '把刚才没拼好的图案再试一次', '允许慢慢尝试，练习专注与耐心', { knowledge: 3, health: 1 }),
    ]
    return event(state, age === 2 ? '一个慢慢熟悉世界的下午' : '玩耍里，长出自己的样子', age === 2 ? '一位家人熟悉的来客带来了小玩具。家人陪在身边，等着你用自己的方式回应这个新鲜的下午。' : '桌上有图画书、积木和没完成的拼图，门外传来小伙伴的笑声。没有哪个玩法更好，每次尝试都在留下你的性格。', choices)
  }
  if (age === 6) {
    const access = clamp(country.education + (simulation.birth.familyQuintile - 3) * .055, .08, .99)
    return event(state, '到了上学的年纪', `在${country.name}，教育机会也受到家庭资源与所在地影响。${random() < access ? '家人为你联系了一所学校。' : '附近的学校较远，家里需要多做一些安排。'}`, [option('school:primary', '进入小学', '由家庭承担基础学习支出，开启小学阶段', { knowledge: 4 }), option('school:home', '在家学习并帮助家人', '资源有限的另一条路，成年后仍可继续学习', { knowledge: 1, happiness: 2 })])
  }
  if (age === 12 && simulation.educationLevel === 'primary') return event(state, '小学之后，还有新的课堂', '基础教育告一段落。下一段学习需要更多时间，家里也开始商量未来的安排。', [option('school:secondary', '继续中学教育', '延长学习阶段，增加升学机会', { knowledge: 5 }), option('school:practical', '学习生活技能，暂缓升学', '保留基础教育经历，16岁后进入劳动市场', { knowledge: 2, happiness: 2 })])
  if (age === 16 && simulation.educationLevel === 'secondary') return event(state, '下一段路怎么走', '学习、实践与家庭需要在这个年龄交会。不同的安排会影响何时工作，以及能获得的职位。', [option('school:upper', '继续完成中学', '18岁时可申请高等教育', { knowledge: 4 }), option('school:vocational', '进入职业培训', '两年培训后可从事技能工作', { knowledge: 3 }), option('work:service', '结束在校学习，先工作', '开始领取工资，暂时放下升学', { knowledge: 1 })])
  if (age === 18 && simulation.educationLevel === 'secondary' && simulation.schoolUntil >= 18) {
    const tuition = Math.round(country.gdp * .12)
    const choices = [option('school:vocational', '学习一门职业技能', '两年培训后进入技能岗位', { knowledge: 3 }), option('work:service', '直接开始工作', '获得服务岗位收入，继续积累经验', { happiness: 2 })]
    if (state.stats.knowledge >= 40 && country.education > .2) choices.unshift(option('school:university', '进入大学，必要时申请贷款', `四年学习；每年学费约${tuition.toLocaleString()} PPP美元，资金不足形成债务`, { knowledge: 6 }))
    return event(state, '成年之后，选择自己的方向', '你完成了中学阶段。升学会推迟全职收入，也可能打开新的职业入口。', choices)
  }
  if (age >= 16 && age >= simulation.schoolUntil && (simulation.occupation === '学生' || simulation.occupation === '等待工作机会' || simulation.occupation === '由家人照顾')) return jobEvent(state, simulation)
  if (age === 65 || age === 70 && !simulation.retired) return event(state, '重新安排工作的节奏', '走过多年的日常，你开始考虑，把时间留给工作、家人，还是自己的生活。', [option('retire:yes', '退休，领取基础养老金', '养老金按当地收入与工作年数计算', { health: 3, happiness: 3 }), option('retire:no', '再工作几年', '保留劳动收入，也承担继续工作的消耗', { health: -2, happiness: 1 })])
  if (state.stats.health < 48 && age >= 18 && random() < .55) return event(state, '身体需要多一点照顾', '持续的不适影响了日常。治疗可以改善状态，费用也需要列入预算。', [option('care:treatment', '接受检查和治疗', `一次性支出约${Math.round(country.gdp * .08).toLocaleString()} PPP美元，资金不足形成债务`, { health: 14 }), option('care:rest', '先调整作息，慢慢恢复', '收入有所减少，保持观察', { health: 4, happiness: 1 })])
  const partner = state.people.find(person => person.role === '伴侣')
  const acquaintance = state.people.find(person => person.id === 'acquaintance' && present(person) && person.age >= 18 && Math.abs(person.age - age) <= 8)
  if (!partner && acquaintance && age >= 18 && age <= 43 && random() < .35) {
    const ready = acquaintance.closeness >= 60 && acquaintance.trust >= 60 && !acquaintance.memories.some(memory => memory.includes('约定保持友谊'))
    const meet: Choice = { ...option(`bond:meet-${age}`, '约一次见面，慢慢了解彼此', '支付一次小额相聚开支，增进信任与了解', { happiness: 3 }), personId: acquaintance.id, relationshipDelta: 8 }
    const remain: Choice = { ...option(`bond:space-${age}`, '保持现在的相处节奏', '尊重自己的意愿，保留各自的空间', { health: 2 }), personId: acquaintance.id, relationshipDelta: 1 }
    const begin: Choice = { ...option(`bond:${age}-action-begin-partnership`, '确认彼此愿意，开始一段伴侣关系', '双方明确同意，一起经营这段关系', { happiness: 7 }), personId: acquaintance.id, relationshipDelta: 8 }
    return event(state, ready ? '认真问一次彼此的心意' : '给相识留一点时间', ready ? `你和${acquaintance.name}逐渐建立了信任，愿不愿意成为伴侣，可以坦诚地说清。` : `${acquaintance.name}邀请你找个时间聊聊各自的近况。关系会从真实的相处中慢慢变化。`, ready ? [begin, meet, remain] : [meet, remain], 'relationship')
  }
  const youngest = state.people.filter(person => /孩子/.test(person.role) && present(person)).sort((a, b) => a.age - b.age)[0]
  if (partner && age >= 23 && age <= 43 && simulation.children < 3 && (!youngest || youngest.age >= 3) && random() < .32) return event(state, '要不要迎接一个新的家人', `你和${partner.name}谈起育儿。这会改变家庭的时间、开支与责任，需要共同的意愿。`, [option('family:child', '双方愿意，准备迎接孩子', '增加一个持续成长的家庭成员和每年抚养支出', { happiness: 6, health: -2 }), option('family:wait', '暂时保持现在的生活', '尊重彼此的计划，可以以后再谈', { happiness: 2 })], 'relationship')
  if (youngest && youngest.age < 8 && random() < .22) return event(state, '给孩子怎样的陪伴', `${youngest.name}正在成长。照顾与工作需要新的分工，家庭预算也要一起商量。`, [option('family:care', '减少工作，亲自多陪伴', '本年收入减少15%，亲子关系更亲近', { happiness: 4 }), option('family:childcare', '安排托育，保持工作', '支付本年托育费用，保留工作时间', { knowledge: 1 })], 'relationship')
  if (age >= 24 && age < 60 && simulation.workYears >= 4 && age % 5 === 0 && !simulation.retired) return event(state, '工作里的一次新机会', '经验让你有机会承担更多责任。收入和压力，都会随安排改变。', [option('work:promotion', '争取晋升', '职位提高，今后收入增加，也更忙碌', { health: -2, happiness: 2 }), option('work:steady', '保持熟悉的岗位', '继续积累经验，留出生活空间', { health: 2, happiness: 2 }), option('work:retrain', '边工作边学习新技能', '支付培训费，知识增长', { knowledge: 7 })])
  // Explicit engine relationship decisions survive; ordinary years flow without a modal.
  if (state.currentEvent.kind === 'relationship' && state.currentEvent.choices.length && age >= 6) return state.currentEvent
  const ordinary = random() >= .2 || age < 6
  const contextual = `${state.currentEvent.description}\n${country.name}，${simulation.occupation}。${age < 16 ? '家人的照顾与学习，构成这一年的日常。' : `这一年的家庭收入与开支会按当地生活条件结算。`}`
  return { ...state.currentEvent, description: contextual.slice(0, 3000), choices: ordinary ? [] : state.currentEvent.choices }
}

function jobEvent(state: GameState, simulation: Simulation): LifeEvent {
  const trained = ['vocational', 'university', 'postgraduate'].includes(simulation.educationLevel)
  const educated = ['university', 'postgraduate'].includes(simulation.educationLevel)
  const choices = [option('work:service', '从服务岗位开始', '获得稳定起步收入，经验会提高薪资', { happiness: 2 }), option('work:manual', '加入生产或技术现场', '收入略高，体力消耗也较大', { health: -2 })]
  if (trained) choices.unshift(option('work:technical', '申请技能岗位', '职业训练或高等教育提高岗位收入', { knowledge: 2 }))
  if (educated) choices.unshift(option('work:professional', '申请专业岗位', '以高等教育背景从事专业工作', { knowledge: 3 }))
  return event(state, simulation.workYears ? '重新寻找适合的工作' : '第一份工作的入口', `${simulation.education}，现在可以把积累带到工作中。职业选择会改变每年的收入与健康消耗。`, choices)
}

function educationLabel(level: EducationLevel, complete: boolean): string {
  const labels = { none: '在家学习', primary: '小学', secondary: '中学', vocational: '职业培训', university: '大学', postgraduate: '研究生' }
  return labels[level] + (level === 'none' ? '' : complete ? '毕业' : '在读')
}

/** Choice cash effects are booked with the same year's finances, including any loan needed. */
function consequences(state: GameState, simulation: Simulation, choice: Choice | undefined, decisionAge: number): { state: GameState; cost: number; incomeFactor: number; marker?: YearRecord['marker'] } {
  const id = choice?.id ?? ''
  const country = conditions(simulation, state.year)
  let cost = 0
  let incomeFactor = 1
  let marker: YearRecord['marker'] | undefined
  if (id.startsWith('sim:temperament:')) {
    const trait = id.slice('sim:temperament:'.length).split('-')[0] as keyof Temperament
    if (TEMPERAMENT_KEYS.includes(trait)) {
      simulation.temperament = { curiosity: 50, activity: 50, sociability: 50, persistence: 50, ...simulation.temperament }
      simulation.temperament[trait] = clamp(simulation.temperament[trait] + 14)
    }
  }
  if (id.startsWith('sim:school:')) {
    const path = id.slice('sim:school:'.length)
    const setting: Record<string, [EducationLevel, number]> = { primary: ['primary', 12], home: ['none', 16], secondary: ['secondary', 18], upper: ['secondary', 18], practical: ['primary', 16], vocational: ['vocational', decisionAge + 2], university: ['university', decisionAge + 4] }
    const selected = setting[path]
    if (selected) {
      simulation.educationLevel = selected[0]
      simulation.schoolUntil = selected[1]
      simulation.education = educationLabel(selected[0], path === 'practical')
      simulation.occupation = path === 'home' || path === 'practical' ? '等待工作机会' : '学生'
      marker = 'education'
    }
  }
  if (id.startsWith('sim:work:')) {
    const path = id.slice('sim:work:'.length)
    const jobs: Record<string, string> = { service: '服务工作者', manual: '生产工作者', technical: '技能工作者', professional: '专业工作者' }
    if (jobs[path]) {
      simulation.occupation = jobs[path]
      simulation.schoolUntil = Math.min(simulation.schoolUntil, decisionAge)
      simulation.education = educationLabel(simulation.educationLevel, true)
      simulation.retired = false
      marker = 'work'
    } else if (path === 'promotion') {
      simulation.occupation = simulation.occupation.includes('负责人') ? simulation.occupation : simulation.occupation.includes('资深') ? `${simulation.occupation.replace('资深', '')} · 团队负责人` : `资深${simulation.occupation}`
      marker = 'work'
    } else if (path === 'retrain') cost += country.gdp * .035
  }
  if (id === 'sim:retire:yes') { simulation.retired = true; simulation.occupation = '退休'; marker = 'work' }
  if (id.startsWith('sim:bond:meet-')) cost += country.gdp * .01
  if (id === 'sim:care:treatment') cost += country.gdp * .08
  if (id === 'sim:care:rest') incomeFactor *= .85
  if (id === 'sim:family:care') incomeFactor *= .85
  if (id === 'sim:family:childcare') cost += country.gdp * .07
  if (id === 'sim:family:child') {
    simulation.children++
    const random = rng(simulation.config.seed, `child-${simulation.children}`)
    const childSex: Sex = random() < .488 ? '女' : '男'
    const child: Person = { id: `child-${simulation.children}`, name: makeName(country.id, childSex, random), role: childSex === '女' ? '孩子 · 女儿' : '孩子 · 儿子', age: 0, personality: '好奇，在家人的陪伴下形成自己的性格与兴趣', closeness: 80, trust: 86, mood: '安心', avatar: 6 + simulation.children, memories: [`${state.year}年，成为家里的新成员。`], messages: [] }
    // Keep the engine's bounded cast: remove a peripheral contact only if necessary.
    const people = state.people.length >= 12 ? state.people.filter(person => !['neighbor', 'mentor'].includes(person.id)) : state.people
    state = { ...state, people: [...people, child].slice(-12) }
    marker = 'family'
  }
  return { state, cost: money(cost), incomeFactor, marker }
}

function focusWeights(state: GameState, weights?: FocusWeights): Record<Focus, number> {
  const eligible = (focus: Focus) => state.age >= 6 && (focus !== 'career' || state.age >= 16 && state.age < 65)
  const result = Object.fromEntries(FOCUSES.map(focus => [focus, eligible(focus) ? clamp(Number.isFinite(weights?.[focus]) ? weights![focus]! : 0, 0, 1) : 0])) as Record<Focus, number>
  const sum = Object.values(result).reduce((total, value) => total + value, 0)
  if (sum) for (const focus of FOCUSES) result[focus] /= sum
  else result[state.age < 6 ? 'balance' : eligible(state.focus) ? state.focus : 'balance'] = 1
  return result
}

function investmentRate(policy: InvestmentPolicy, random: () => number): number {
  // Original game parameters, not market forecasts. The riskier policies can lose principal.
  const [mean, spread] = ({ deposit: [.012, .006], bonds: [.024, .045], balanced: [.04, .16], local: [.045, .28], global: [.05, .23], property: [.035, .19], trading: [.018, .6] } as const)[policy]
  return mean + (random() * 2 - 1) * spread
}

function finances(state: GameState, simulation: Simulation, weights: Record<Focus, number>, extraCost: number, incomeFactor: number): void {
  const country = conditions(simulation, state.year)
  const economy = simulation.economy
  const random = rng(simulation.config.seed, `finances-${state.age}`)
  const working = state.age >= 16 && state.age >= simulation.schoolUntil && !['学生', '等待工作机会', '由家人照顾'].includes(simulation.occupation) && !simulation.retired
  const dependentChildren = state.people.filter(person => /孩子/.test(person.role) && person.age < 18 && present(person)).length
  const spouse = state.people.some(person => person.role === '伴侣')
  let income = 0
  if (working) {
    simulation.workYears++
    const type = simulation.occupation.includes('专业') ? 1.5 : simulation.occupation.includes('技能') ? 1.1 : simulation.occupation.includes('生产') ? .83 : .7
    const seniority = simulation.occupation.includes('资深') ? 1.28 : simulation.occupation.includes('负责人') ? 1.7 : 1
    income = country.gdp * .48 * type * seniority * (1 + Math.min(35, simulation.workYears) * .022) * (.92 + random() * .16) * (1 + weights.career * .16) * incomeFactor
    if (state.stats.health < 35) income *= .7
  } else if (simulation.retired) income = country.gdp * .2 * Math.min(1, simulation.workYears / 25)
  const spouseIncome = spouse && state.age >= 20 && state.age < 65 ? country.gdp * .19 : 0
  income += spouseIncome
  let expenses = state.age < 16 ? 0 : country.gdp * (simulation.occupation === '学生' ? .12 : .17) * (simulation.economy.homeOwned ? .83 : 1)
  expenses += country.gdp * dependentChildren * .055 + (spouse ? country.gdp * .08 : 0)
  if (simulation.occupation === '学生' && ['university', 'postgraduate'].includes(simulation.educationLevel)) expenses += country.gdp * .12
  expenses += economy.debt * .045 + extraCost
  economy.annualIncome = money(income)
  economy.annualExpenses = money(expenses)
  economy.totalIncome = money(economy.totalIncome + economy.annualIncome)
  economy.totalExpenses = money(economy.totalExpenses + economy.annualExpenses)
  const available = economy.cash + economy.annualIncome - economy.annualExpenses
  economy.cash = money(Math.max(0, available))
  if (available < 0) economy.debt = money(economy.debt - available)
  const rate = investmentRate(economy.policy, random)
  economy.investmentReturn = Math.round(economy.investments * rate * 100) / 100
  economy.investments = money(economy.investments + economy.investmentReturn)
  // The transfer is an asset allocation, never an expense or free income.
  if (state.age >= 18 && available > 0) {
    const contribution = money(Math.max(0, economy.annualIncome - economy.annualExpenses) * .2)
    economy.cash = money(economy.cash - contribution)
    economy.investments = money(economy.investments + contribution)
  }
}

/** Cohort hazard: a fitted original model from longevity + infant mortality, not a full UN life table. */
function baselineHazard(country: Country, age: number, sex: Sex): number {
  if (age <= 0) return clamp(country.infantMortality / 1000, .0001, .4)
  const expectancy = sex === '女' ? country.femaleLifeExpectancy : country.maleLifeExpectancy
  const infant = country.infantMortality / 1000
  if (age < 5) return clamp(infant * .075, .00008, .06)
  if (age < 15) return clamp(infant * .012 + .00005, .00006, .01)
  const adultFloor = .00035 + Math.max(0, 80 - expectancy) * .000035
  // Mode is close to life expectancy + 10; infant loss shifts cohort expectancy downward.
  const mode = expectancy + 10 + infant * 24
  return clamp(adultFloor + .085 * Math.exp((age - mode) / 9.5), .0001, .92)
}

export function survivalAt(countryId: string, age: number, sex: Sex, world: World = 'present', birthYear = new Date().getFullYear()): number {
  if (!Number.isFinite(age) || age <= 0) return 1
  let survival = 1
  const years = Math.min(130, Math.floor(age))
  for (let year = 0; year < years; year++) survival *= 1 - baselineHazard(countryAt(countryId, world === 'present' ? birthYear : birthYear + year, world), year, sex)
  const remainder = Math.min(130, age) - years
  if (remainder > 0) survival *= Math.pow(1 - baselineHazard(countryAt(countryId, world === 'present' ? birthYear : birthYear + years, world), years, sex), remainder)
  return clamp(survival, 0, 1)
}

function mortality(state: GameState, simulation: Simulation, country: Country): { ended: boolean; cause?: string } {
  const random = rng(simulation.config.seed, `mortality-${state.age}`)
  const healthFactor = clamp(Math.exp((65 - state.stats.health) / 35), .35, 4)
  const socioeconomic = 1.12 - simulation.birth.familyQuintile * .045
  const probability = clamp(baselineHazard(country, state.age - 1, simulation.birth.sex) * healthFactor * socioeconomic, 0, .95)
  if (state.age < 110 && state.stats.health > 0 && random() >= probability) return { ended: false }
  const gentleCause = state.age <= 1 ? '婴幼儿时期的健康并发症' : state.age < 18 ? '早年的健康意外' : state.age > 75 ? '与年龄相关的身体衰退' : state.stats.health < 35 ? '长期健康问题' : '突发的健康变化'
  const detailedCauses = state.age < 5 ? ['围产期并发症', '幼年感染'] : state.age < 40 ? ['意外伤害', '急性感染', '突发疾病'] : ['心血管疾病', '呼吸系统疾病', '长期慢性疾病']
  const cause = simulation.config.softMode || state.age > 85 ? gentleCause : detailedCauses[Math.floor(random() * detailedCauses.length)]!
  return { ended: true, cause }
}

function familyMortality(state: GameState, simulation: Simulation): GameState {
  const country = conditions(simulation, state.year)
  const notices: string[] = []
  const people = state.people.map(person => {
    if (!present(person)) return person
    // The engine already archives at 100; stochastic departures can happen earlier.
    const probability = baselineHazard(country, Math.max(0, person.age - 1), person.id === 'mother' || person.role.includes('女儿') ? '女' : '男')
    if (rng(simulation.config.seed, `family-death-${person.id}-${state.age}`)() >= probability) return person
    const notice = `${state.year}年，${person.name}离世，享年${person.age}岁。共同的记忆留在了这里。`
    notices.push(notice)
    return { ...person, role: `${person.role} · 已离世`, mood: '长久的思念', memories: [...person.memories, notice].slice(-12) }
  })
  if (!notices.length) return state
  const history = [...state.history]
  const last = history.at(-1)
  if (last) history[history.length - 1] = { ...last, description: `${last.description}\n${notices.join('\n')}`.slice(0, 3400) }
  return { ...state, people, history, stats: { ...state.stats, happiness: clamp(state.stats.happiness - notices.length * 7) } }
}

function copySimulation(previous: Simulation): Simulation {
  // Birth and precomputed peer lives are immutable; evolving arrays stay isolated across forks.
  return { ...previous, config: { ...previous.config }, economy: { ...previous.economy }, ...(previous.temperament ? { temperament: { ...previous.temperament } } : {}), years: [...previous.years], notes: [...previous.notes], starred: [...previous.starred], reflectedAges: [...previous.reflectedAges] }
}

/** Resolve a pending decision without moving the simulated clock or settling an annual budget. */
export function resolveSimulationDecision(original: GameState, previous: Simulation, choiceId: string): SimulationResult {
  if (crisisActive(previous) || choiceId.startsWith('surprise:mmr:')) return resolveMyanmarDecision(original, previous, choiceId)
  // Engine validation rejects stale IDs before any simulation or cash mutations occur.
  const resolved = resolveChoice(original, choiceId)
  const choice = original.currentEvent.choices.find(item => item.id === choiceId)!
  const simulation = copySimulation(previous)
  const applied = consequences(resolved, simulation, choice, original.age)
  applied.state = evolveWorld(applied.state)
  if (simulation.myanmarInjury) applied.state = { ...applied.state, stats: { ...applied.state.stats, health: Math.min(applied.state.stats.health, 65) } }
  if (applied.cost > 0) charge(simulation, applied.cost, true)
  if (applied.incomeFactor !== 1) simulation.pendingIncomeFactor = (simulation.pendingIncomeFactor ?? 1) * applied.incomeFactor
  simulation.relationships = relationshipScore(applied.state)
  simulation.years[simulation.years.length - 1] = yearRecord(applied.state, simulation, applied.marker ?? previous.years.at(-1)?.marker)
  return { state: applied.state, simulation }
}

function localizeNewContacts(state: GameState, original: GameState, simulation: Simulation): GameState {
  const existingIds = new Set(original.people.map(person => person.id))
  const names = new Map<string, string>()
  const people = state.people.map(person => {
    if (existingIds.has(person.id)) return person
    const random = rng(simulation.config.seed, `contact-${simulation.currentCountryId}-${state.age}-${person.id}`)
    const name = makeName(simulation.currentCountryId, random() < .488 ? '女' : '男', random)
    names.set(person.name, name)
    return { ...person, name }
  })
  if (!names.size) return state
  const replaceNames = (text: string) => [...names].reduce((value, [before, after]) => value.replaceAll(before, after), text)
  // The engine already authored this year's event and dialogue with its default names.
  // Keep saved history and earlier conversations intact, including legacy NPC names.
  const previousMessages = new Set(original.worldMessages.map(message => message.id))
  return {
    ...state, people,
    currentEvent: {
      ...state.currentEvent, title: replaceNames(state.currentEvent.title), description: replaceNames(state.currentEvent.description),
      choices: state.currentEvent.choices.map(choice => ({ ...choice, label: replaceNames(choice.label), hint: replaceNames(choice.hint) })),
    },
    worldMessages: state.worldMessages.map(message => previousMessages.has(message.id) ? message : {
      ...message, speaker: names.get(message.speaker) ?? message.speaker,
      ...(message.target ? { target: names.get(message.target) ?? message.target } : {}), text: replaceNames(message.text),
    }),
  }
}

function step(original: GameState, previous: Simulation, choiceId?: string, weightedFocus?: FocusWeights): SimulationResult {
  if (original.ended) return { state: original, simulation: previous }
  if (crisisActive(previous)) throw new Error('请先处理当前隐藏危机。')
  const simulation = copySimulation(previous)
  const choice = original.currentEvent.choices.find(item => item.id === choiceId)
  const weights = focusWeights(original, weightedFocus)
  let state = localizeNewContacts(advanceYear(original, choiceId, { mortality: 'external', world: 'external' }), original, simulation)
  if (state.people.length > 12) state = { ...state, people: state.people.filter(person => person.id !== 'neighbor') }
  const socialAdjustment = weights.social - (original.focus === 'social' ? 1 : 0)
  if (socialAdjustment) state = { ...state, people: state.people.map(person => present(person) && person.id !== choice?.personId ? { ...person, closeness: clamp(person.closeness + socialAdjustment), trust: clamp(person.trust + weights.social * .7 - (original.focus === 'social' ? 1 : 0)) } : person) }
  const applied = consequences(state, simulation, choice, original.age)
  state = applied.state
  if (state.age >= simulation.schoolUntil && simulation.occupation === '学生' && simulation.schoolUntil > 0) simulation.education = educationLabel(simulation.educationLevel, true)
  const country = conditions(simulation, state.year)
  finances(state, simulation, weights, applied.cost, applied.incomeFactor * (simulation.pendingIncomeFactor ?? 1))
  delete simulation.pendingIncomeFactor
  const random = rng(simulation.config.seed, `status-${state.age}`)
  const learning = simulation.occupation === '学生' ? 2.2 : state.age < 6 ? 1.8 : .18
  const healthTarget = clamp(82 + (country.lifeExpectancy - 72) * .35 - Math.max(0, state.age - 40) * .72, 25, 92)
  const happinessTarget = clamp(52 + simulation.birth.familyQuintile * 2 + simulation.relationships * .12 - Math.min(20, simulation.economy.debt / Math.max(1, country.gdp) * 2), 20, 83)
  state = { ...state, stats: {
    health: Math.round(clamp(original.stats.health + (healthTarget - original.stats.health) * .12 + weights.health * 2.7 + weights.balance * .45 - weights.career * .8 + (choice?.effects.health ?? 0) * .65 + (random() - .5) * 3)),
    happiness: Math.round(clamp(original.stats.happiness + (happinessTarget - original.stats.happiness) * .16 + weights.social * 1.8 + weights.balance * .6 + (choice?.effects.happiness ?? 0) * .6 + (random() - .5) * 3)),
    knowledge: Math.round(clamp(original.stats.knowledge + learning + weights.study * 2 + (choice?.effects.knowledge ?? 0) * .65 - (state.age >= 80 ? 1.3 : 0))),
    wealth: Math.round(clamp(35 + Math.log1p(Math.max(0, netWorth(simulation)) / Math.max(1, country.gdp)) * 18 - Math.min(30, simulation.economy.debt / Math.max(1, country.gdp) * 7))),
  } }
  if (simulation.myanmarInjury) state = { ...state, stats: { ...state.stats, health: Math.min(state.stats.health, 65) } }
  state = familyMortality(state, simulation)
  simulation.relationships = relationshipScore(state)
  const ending = mortality(state, simulation, country)
  if (ending.ended) {
    simulation.cause = ending.cause
    const endingText = `${state.config.name}出生于${simulation.birth.countryName}，在${country.name}走到${state.age}岁。${ending.cause}让这一生在${state.year}年停下。${simulation.education}，曾经的职业与${simulation.children ? `${simulation.children}个孩子、` : ''}那些相遇，都留在记录里。最终净资产为${Math.round(netWorth(simulation)).toLocaleString()} PPP美元。`
    state = { ...state, ended: true, ending: endingText }
  }
  delete simulation.reflectionAge
  if (REFLECTION_AGES.includes(state.age) && !simulation.reflectedAges.includes(state.age) && !state.ended) {
    simulation.reflectedAges.push(state.age)
    simulation.reflectionAge = state.age
  }
  state = evolveWorld({ ...state, currentEvent: nextEvent(state, simulation) })
  state = { ...state, currentEvent: worldThreadEvent(state) ?? state.currentEvent }
  // Mark birth-country peers' departures in the year at which the player reaches them.
  const departures = simulation.peers.filter(peer => peer.deathAge === state.age)
  if (departures.length && !state.ended) state = { ...state, currentEvent: { ...state.currentEvent, description: `${state.currentEvent.description}\n${departures.map(peer => `与你同年出生的${peer.name}，在${peer.deathAge}岁结束了这一生。`).join('\n')}`.slice(0, 3000) } }
  const marker = state.ended ? 'death' : applied.marker
  simulation.years.push(yearRecord(state, simulation, marker))
  return { state, simulation }
}

export function advanceSimulation(state: GameState, simulation: Simulation, choiceId?: string, weightedFocus?: FocusWeights): SimulationResult {
  return step(state, simulation, choiceId, weightedFocus)
}

export function secondsPerYear(simulation: Simulation): number {
  const country = countryAt(simulation.birth.countryId, simulation.config.birthYear, simulation.config.world)
  return clamp(simulation.config.paceMinutes * 60 / Math.max(60, country.lifeExpectancy), 12, 120)
}

export function setInvestment(previous: Simulation, policy: InvestmentPolicy): Simulation {
  if (crisisActive(previous)) throw new Error('请先处理当前隐藏危机。')
  if (!POLICIES.includes(policy)) throw new Error('请选择有效的投资政策。')
  if ((previous.years.at(-1)?.age ?? 0) < 18) throw new Error('成年后可以管理投资。')
  if (previous.economy.policy === policy) return previous
  const simulation = { ...previous, economy: { ...previous.economy }, years: [...previous.years] }
  if (simulation.economy.policy !== policy) {
    const fee = money(simulation.economy.investments * .003)
    simulation.economy.investments = money(simulation.economy.investments - fee)
    simulation.economy.totalExpenses = money(simulation.economy.totalExpenses + fee)
    simulation.economy.annualExpenses = money(simulation.economy.annualExpenses + fee)
  }
  simulation.economy.policy = policy
  const last = simulation.years.at(-1)
  if (last) simulation.years[simulation.years.length - 1] = { ...last, netWorth: netWorth(simulation), investments: simulation.economy.investments, expenses: simulation.economy.annualExpenses }
  return simulation
}

function charge(simulation: Simulation, amount: number, allowDebt = false): void {
  if (!allowDebt && amount > simulation.economy.cash) throw new Error('可用现金不足，请先安排预算。')
  const shortfall = Math.max(0, amount - simulation.economy.cash)
  simulation.economy.cash = money(Math.max(0, simulation.economy.cash - amount))
  simulation.economy.debt = money(simulation.economy.debt + shortfall)
  simulation.economy.annualExpenses = money(simulation.economy.annualExpenses + amount)
  simulation.economy.totalExpenses = money(simulation.economy.totalExpenses + amount)
}

// Keep space for future engine contacts and up to three children. Never evict a
// family member or an existing relationship just to introduce an action contact.
function actionContact(state: GameState, simulation: Simulation, kind: 'travel' | 'social' | 'migrate', visitCountryId = simulation.currentCountryId): { state: GameState; personId?: string } {
  if (state.config.intelligence <= 0) return { state }
  const id = `contact-${state.year}-${visitCountryId}`
  const existing = state.people.find(person => person.id === id)
  if (existing) return { state, ...(present(existing) ? { personId: existing.id } : {}) }
  const reserved = Math.max(0, 3 - simulation.children)
    + (state.people.some(person => person.id === 'neighbor') ? 0 : 1)
    + (state.people.some(person => person.id === 'acquaintance') ? 0 : 1)
  if (state.people.length + reserved >= 12) return { state }
  const random = rng(simulation.config.seed, id)
  const role = kind === 'migrate' ? '新邻里朋友' : kind === 'travel' ? '旅途中认识的朋友' : '活动中认识的朋友'
  const person: Person = { id, name: makeName(visitCountryId, random() < .488 ? '女' : '男', random), role,
    age: Math.min(99, state.age), personality: '有自己的生活与兴趣，愿意从具体的小事慢慢了解彼此', closeness: 42, trust: 52,
    mood: '期待下一次交流', avatar: 4, memories: [`${state.year}年，在${countryById(visitCountryId).name}与你相识。`], messages: [] }
  return { state: { ...state, people: [...state.people, person] }, personId: person.id }
}

export function spend(previous: Simulation, original: GameState, action: 'health' | 'travel' | 'social' | 'study' | 'home' | 'repay' | 'invest', amount?: number, destinationCountryId?: string): SimulationResult {
  if (crisisActive(previous)) throw new Error('请先处理当前隐藏危机。')
  if (destinationCountryId !== undefined && (action !== 'travel' || !COUNTRIES.some(country => country.id === destinationCountryId))) throw new Error('请选择受支持的旅行目的地。')
  if (original.ended) throw new Error('这一生已结束，记录保留供回看。')
  if (original.age < 6) throw new Error('长大一些后，可以安排自己的支出。')
  const simulation: Simulation = { ...previous, economy: { ...previous.economy }, years: [...previous.years] }
  let state = { ...original, stats: { ...original.stats } }
  const experienceCountryId = action === 'travel' ? destinationCountryId ?? simulation.currentCountryId : simulation.currentCountryId
  const country = conditions(simulation, state.year)
  const requested = amount === undefined ? country.gdp * (action === 'health' ? .025 : .015) : amount
  if (!Number.isFinite(requested) || requested <= 0 || requested > 1e12) throw new Error('请输入有效金额。')
  const value = money(requested)
  if (['home', 'repay', 'invest'].includes(action) && state.age < 18) throw new Error('成年后可以管理房产、贷款和投资。')
  if (action === 'home') {
    if (simulation.economy.homeOwned) throw new Error('当前已经拥有自住房。')
    const price = money(country.gdp * 4.5)
    const deposit = money(price * .2)
    if (simulation.economy.cash < deposit) throw new Error(`首付款需要${deposit.toLocaleString()} PPP美元。`)
    simulation.economy.cash = money(simulation.economy.cash - deposit)
    simulation.economy.debt = money(simulation.economy.debt + price - deposit)
    simulation.economy.homeOwned = true
    simulation.economy.homeValue = price
    state.stats.happiness = clamp(state.stats.happiness + 5)
  } else if (action === 'repay') {
    const payment = money(Math.min(value, simulation.economy.debt, simulation.economy.cash))
    if (!payment) throw new Error('当前没有可偿还的贷款，或现金不足。')
    simulation.economy.cash = money(simulation.economy.cash - payment)
    simulation.economy.debt = money(simulation.economy.debt - payment)
  } else if (action === 'invest') {
    if (value > simulation.economy.cash) throw new Error('可用现金不足。')
    simulation.economy.cash = money(simulation.economy.cash - value)
    simulation.economy.investments = money(simulation.economy.investments + value)
  } else {
    charge(simulation, value)
    const repeatedExperience = (action === 'social' || action === 'travel') && state.people.some(person => person.relationshipYear?.year === state.year && person.relationshipYear.keys.includes(`experience:${action}:${experienceCountryId}`))
    const impact = repeatedExperience ? 0 : clamp(value / Math.max(1, country.gdp) * 100, 0, 8)
    if (action === 'health') state.stats.health = clamp(state.stats.health + impact)
    if (action === 'study') state.stats.knowledge = clamp(state.stats.knowledge + impact)
    if (action === 'travel') { state.stats.happiness = clamp(state.stats.happiness + impact); state.stats.knowledge = clamp(state.stats.knowledge + impact * .3) }
    if (action === 'social') {
      state.stats.happiness = clamp(state.stats.happiness + impact * .6)
      simulation.relationships = relationshipScore(state)
    }
  }
  if (simulation.myanmarInjury) state.stats.health = Math.min(state.stats.health, 65)
  const contact = action === 'travel' || action === 'social' ? actionContact(state, simulation, action, experienceCountryId) : { state }
  state = contact.state
  if (action === 'social' || action === 'travel') {
    const participant = action === 'social' ? state.people.find(person => present(person) && (person.id === 'friend' || person.role === '伴侣'))?.id ?? contact.personId : contact.personId
    if (participant) state = relationshipEffect(state, participant, `experience:${action}:${experienceCountryId}`, 'experience', action === 'social' ? '你们实际参加了一次聚会，留下共同经历。' : '你们在旅途中交流见闻，留下共同经历。', 2, 1)
  }
  state = recordWorldAction(state, { kind: action, amount: money(previous.economy.cash - simulation.economy.cash), location: action === 'travel' && destinationCountryId ? countryById(destinationCountryId).name : country.name, personId: contact.personId })
  simulation.relationships = relationshipScore(state)
  simulation.years[simulation.years.length - 1] = yearRecord(state, simulation, simulation.years.at(-1)?.marker)
  if (action === 'travel' && destinationCountryId === 'MMR' && previous.currentCountryId !== 'MMR') return visitMyanmar(state, simulation, `travel:${state.year}:MMR`)
  return { state, simulation }
}

export function migrate(original: GameState, previous: Simulation, countryId: string): SimulationResult {
  if (crisisActive(previous)) throw new Error('请先处理当前隐藏危机。')
  if (original.ended || original.age < 18) throw new Error('成年并独立生活后，才能决定跨国迁居。')
  if (!COUNTRIES.some(country => country.id === countryId)) throw new Error('请选择受支持的目的地。')
  if (countryId === previous.currentCountryId) throw new Error('你已经生活在这里。')
  const country = countryById(countryId)
  const simulation: Simulation = { ...previous, economy: { ...previous.economy }, years: [...previous.years] }
  const expense = money(conditions(simulation, original.year).gdp * .12 + country.gdp * .025)
  charge(simulation, expense)
  simulation.currentCountryId = countryId
  // Credentials, children, family and assets persist; next year's wages use the destination.
  let state = { ...original, config: { ...original.config, location: country.name }, stats: { ...original.stats, happiness: clamp(original.stats.happiness - 3), knowledge: clamp(original.stats.knowledge + 3) }, currentEvent: { ...original.currentEvent, description: `${original.currentEvent.description}\n你迁居到了${country.name}，支付了${expense.toLocaleString()} PPP美元的搬迁费用。新的生活条件将从本年开始影响收入与风险。`.slice(0, 3000) } }
  const oldFriend = state.people.find(person => person.id === 'friend' && present(person))
  if (oldFriend) state = relationshipEffect(state, oldFriend.id, `experience:distance:${countryId}`, 'experience', `你迁居到${country.name}，与留在原地的老朋友见面变少，需要重新安排联系。`, -2, 0)
  const contact = actionContact(state, simulation, 'migrate')
  state = recordWorldAction(contact.state, { kind: 'migrate', amount: expense, location: country.name, personId: contact.personId })
  simulation.relationships = relationshipScore(state)
  simulation.years[simulation.years.length - 1] = yearRecord(state, simulation, 'move')
  if (countryId === 'MMR') return visitMyanmar(state, simulation, `migrate:${state.year}:MMR`)
  return { state, simulation }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown, min: number, max: number, integer = false): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))
const text = (value: unknown, length: number, empty = false): value is string => typeof value === 'string' && value.length <= length && (empty || !!value.trim())
const countryId = (value: unknown): value is string => typeof value === 'string' && COUNTRIES.some(country => country.id === value)

/** All fields consumed by the UI and engine are checked before an imported snapshot is used. */
export function validateSimulation(value: unknown): value is Simulation {
  try {
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.config) || !isRecord(value.birth) || !isRecord(value.economy)) return false
    const config = value.config
    if (!['past', 'present', 'future'].includes(config.world as string) || !finite(config.birthYear, 1950, 2100, true) || !['birth', 'population'].includes(config.drawMode as string) || ![30, 60, 90].includes(config.paceMinutes as number) || typeof config.softMode !== 'boolean' || !finite(config.seed, 0, 4294967295, true) || !finite(config.intelligence, 0, 100) || config.name !== undefined && !text(config.name, 40) || config.countryId !== undefined && !countryId(config.countryId) || config.homeCountryId !== undefined && !countryId(config.homeCountryId)) return false
    const birth = value.birth
    if (!countryId(birth.countryId) || !text(birth.countryName, 100) || !['女', '男'].includes(birth.sex as string) || !text(birth.familyClass, 60) || !finite(birth.familyQuintile, 1, 5, true) || typeof birth.urban !== 'boolean' || !finite(birth.siblings, 0, 10, true) || !isRecord(birth.parents)) return false
    if (!['mother', 'father'].every(key => { const parent = birth.parents && (birth.parents as Record<string, unknown>)[key]; return isRecord(parent) && text(parent.name, 60) && finite(parent.age, 15, 70, true) && text(parent.occupation, 80) })) return false
    if (birth.familySampling !== undefined) {
      const metadata = birth.familySampling
      if (!isRecord(metadata) || metadata.version !== 1 || metadata.evidence !== 'survey-proxy' || !text(metadata.surveyId, 80) || !finite(metadata.surveyYear, 1950, 2100, true) || !countryId(metadata.sourceCountry) || !text(metadata.sourceURL, 2000) || !metadata.sourceURL.startsWith('https://api.dhsprogram.com/') || typeof metadata.countryMatch !== 'boolean' || !finite(metadata.requestedYear, 1950, 2100, true) || !['1', '2', '3', '4', '5+'].includes(metadata.birthOrderGroup as string)) return false
      const validProbabilities = (values: unknown): values is number[] => Array.isArray(values) && values.length > 0 && values.every(value => finite(value, 0, 1)) && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-8
      if (!validProbabilities(metadata.wealthProbabilities) || metadata.wealthProbabilities.length !== 5 || !finite(metadata.urbanProbability, 0, 1) || !Array.isArray(metadata.maternalAgeDistribution) || metadata.maternalAgeDistribution.length > 20 || !metadata.maternalAgeDistribution.every(group => isRecord(group) && text(group.label, 50) && finite(group.probability, 0, 1)) || !validProbabilities(metadata.maternalAgeDistribution.map(group => group.probability)) || !Array.isArray(metadata.notes) || metadata.notes.length > 20 || !metadata.notes.every(note => text(note, 500))) return false
    }
    const economy = value.economy
    if (economy.homeOwned === false && economy.homeValue !== 0) return false
    if (!['cash', 'annualIncome', 'annualExpenses', 'investments', 'debt', 'homeValue', 'totalIncome', 'totalExpenses'].every(key => finite(economy[key], 0, 1e12)) || !finite(economy.investmentReturn, -1e12, 1e12) || typeof economy.homeOwned !== 'boolean' || !POLICIES.includes(economy.policy as InvestmentPolicy)) return false
    if (!text(value.education, 80) || !['none', 'primary', 'secondary', 'vocational', 'university', 'postgraduate'].includes(value.educationLevel as string) || !finite(value.schoolUntil, 0, 110, true) || !text(value.occupation, 80) || !finite(value.workYears, 0, 110, true) || typeof value.retired !== 'boolean' || !countryId(value.currentCountryId) || !finite(value.children, 0, 12, true) || !finite(value.relationships, 0, 100)) return false
    if (!Array.isArray(value.years) || value.years.length < 1 || value.years.length > 111) return false
    const years = value.years
    if (!years.every((year, index) => isRecord(year) && year.age === index && year.year === (config.birthYear as number) + index && ['health', 'happiness', 'knowledge', 'relationships'].every(key => finite(year[key], 0, 100)) && finite(year.netWorth, -1e12, 3e12) && ['income', 'expenses', 'cash', 'investments', 'debt'].every(key => finite(year[key], 0, 1e12)) && countryId(year.countryId) && text(year.occupation, 80) && text(year.education, 80) && text(year.title, 140) && typeof year.alive === 'boolean' && (year.marker === undefined || ['birth', 'education', 'work', 'family', 'move', 'death'].includes(year.marker as string)))) return false
    if (!Array.isArray(value.notes) || value.notes.length > 500 || !value.notes.every(note => isRecord(note) && finite(note.age, 0, years.length - 1, true) && text(note.text, 200, true) && (note.kind === undefined || note.kind === 'event'))) return false
    if (!Array.isArray(value.starred) || value.starred.length > 500 || !value.starred.every(id => text(id, 180)) || new Set(value.starred).size !== value.starred.length) return false
    if (!Array.isArray(value.reflectedAges) || !value.reflectedAges.every(age => REFLECTION_AGES.includes(age as number) && (age as number) < years.length) || new Set(value.reflectedAges).size !== value.reflectedAges.length || value.reflectionAge !== undefined && (!REFLECTION_AGES.includes(value.reflectionAge as number) || !value.reflectedAges.includes(value.reflectionAge) || value.reflectionAge !== years.length - 1)) return false
    if (value.cause !== undefined && !text(value.cause, 200)) return false
    if (value.pendingIncomeFactor !== undefined && !finite(value.pendingIncomeFactor, 0, 1)) return false
    if (value.temperament !== undefined && (!isRecord(value.temperament) || !TEMPERAMENT_KEYS.every(key => finite((value.temperament as Record<string, unknown>)[key], 0, 100)))) return false
    if (!Array.isArray(value.peers) || value.peers.length !== 4) return false
    if (!value.peers.every(peer => {
      if (!isRecord(peer) || !text(peer.id, 100) || !text(peer.name, 60) || !countryId(peer.countryId) || !text(peer.countryName, 100) || !['女', '男'].includes(peer.sex as string) || !finite(peer.deathAge, 1, 110, true) || !text(peer.cause, 200) || !Array.isArray(peer.years) || peer.years.length !== peer.deathAge + 1) return false
      return peer.years.every((year, index) => isRecord(year) && year.age === index && finite(year.health, 0, 100) && finite(year.happiness, 0, 100) && text(year.occupation, 80) && finite(year.income, 0, 1e12) && year.alive === (index < (peer.deathAge as number)))
    }) || new Set(value.peers.map(peer => (peer as Peer).id)).size !== 4) return false
    if (!validateMyanmarData(value as unknown as Simulation)) return false
    return true
  } catch { return false }
}
