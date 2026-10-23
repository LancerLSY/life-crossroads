import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceYear, applyGeneratedEvent, createLife, FOCUS_OPTIONS, getChapter, interact, isGameState, resolveChoice, setFocus, setIntelligence } from './engine.ts'
import type { GameState, LifeEvent, WorldMessage } from './types.ts'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const nested of Object.values(value)) freeze(nested)
  }
  return value
}
const choose = (state: GameState, index = 0) => advanceYear(state, state.currentEvent.choices[index]?.id)

test('defaults are immediately playable and first summer offers study, travel, and family', () => {
  const state = createLife({ seed: 42 })
  assert.equal(state.config.name, '林知夏')
  assert.equal(state.config.location, '杭州')
  assert.equal(state.config.birthYear, 1990)
  assert.equal(state.age, 18)
  assert.equal(state.year, 2008)
  assert.equal(state.config.intelligence, 60)
  assert.equal(state.currentEvent.choices.length, 3)
  assert.match(state.currentEvent.choices[0]!.label, /学/)
  assert.match(state.currentEvent.choices[1]!.label, /世界/)
  assert.match(state.currentEvent.choices[2]!.label, /家人/)
  assert.ok(isGameState(copy(state)))
})

test('supplied seeds reproduce the same life; unsupplied seeds are freshly selected', () => {
  assert.deepEqual(createLife({ seed: 0 }), createLife({ seed: 0 }))
  const seeds = new Set(Array.from({ length: 16 }, () => createLife().config.seed))
  assert.ok(seeds.size > 1)
  const config = { seed: 817, birthYear: 2040, startAge: 23, intelligence: 91 }
  let first = createLife(config)
  let second = createLife(config)
  for (let turn = 0; turn < 12; turn++) {
    first = choose(first, turn % 3)
    second = choose(second, turn % 3)
    assert.deepEqual(first, second)
  }
})

test('custom timelines and invalid runtime configuration are normalized consistently', () => {
  const state = createLife({ name: '  自己  ', location: ' 小城 ', birthYear: 2100, startAge: 65, intelligence: 300, seed: -1 })
  assert.equal(state.year, 2165)
  assert.equal(state.config.name, '自己')
  assert.equal(state.config.location, '小城')
  assert.equal(state.config.intelligence, 100)
  assert.equal(state.config.seed, 0)
  assert.ok(state.people.every(person => person.age >= 0 && person.age <= 100))
  const invalid = createLife({ birthYear: NaN, startAge: Infinity, intelligence: NaN, seed: Infinity })
  assert.equal(invalid.year, 2008)
  assert.ok(isGameState(invalid))
})

test('yearly decisions are mandatory, resolve once, and cannot be replayed in a later year', () => {
  const state = freeze(createLife({ seed: 3 }))
  const before = copy(state)
  const choiceId = state.currentEvent.choices[1]!.id
  assert.throws(() => advanceYear(state), /选择/)
  assert.throws(() => advanceYear(state, 'missing'), /当前年份/)
  const next = advanceYear(state, choiceId)
  assert.equal(next.age, state.age + 1)
  assert.equal(next.year, state.year + 1)
  assert.equal(next.turn, 1)
  assert.equal(next.history.length, 1)
  assert.equal(next.history[0]!.choices.length, 0)
  assert.match(next.history[0]!.description, /你选择了/)
  assert.throws(() => advanceYear(next, choiceId), /当前年份/)
  assert.deepEqual(state, before)
})

test('choices alter stats and relationships, while focus changes subsequent outcomes', () => {
  const state = createLife({ seed: 44 })
  const study = choose(state, 0)
  const travel = choose(state, 1)
  const family = choose(state, 2)
  assert.ok(study.stats.knowledge > family.stats.knowledge)
  assert.ok(travel.stats.wealth < study.stats.wealth)
  const friend = travel.people.find(person => person.id === 'friend')!
  const previous = state.people.find(person => person.id === 'friend')!
  assert.ok(friend.closeness > previous.closeness)
  assert.ok(friend.trust > previous.trust)
  assert.match(friend.memories[0]!, /2008年/)
  const health = choose(setFocus(state, 'health'))
  const career = choose(setFocus(state, 'career'))
  assert.ok(health.stats.health > career.stats.health)
  assert.ok(career.stats.wealth > health.stats.wealth)
  assert.ok(FOCUS_OPTIONS.every(option => option.id && option.label && option.description))
  assert.throws(() => setFocus(state, 'oops' as never), /有效/)
})

test('setters preserve the original state and clamp intelligence', () => {
  const state = freeze(createLife({ seed: 4 }))
  assert.equal(setFocus(state, 'social').focus, 'social')
  assert.equal(state.focus, 'balance')
  assert.equal(setIntelligence(state, -9).config.intelligence, 0)
  assert.equal(setIntelligence(state, 200).config.intelligence, 100)
  assert.equal(setIntelligence(state, NaN).config.intelligence, 60)
  assert.equal(state.config.intelligence, 60)
})

test('world intelligence increases detail and autonomous dialogue without changing time', () => {
  const low = createLife({ seed: 5, startAge: 28, intelligence: 0 })
  const high = createLife({ seed: 5, startAge: 28, intelligence: 100 })
  assert.equal(low.age, high.age)
  assert.equal(low.worldMessages.length, 1)
  assert.equal(high.worldMessages.length, 4)
  assert.ok(high.currentEvent.description.length > low.currentEvent.description.length)
  for (const message of high.worldMessages) {
    assert.notEqual(message.speaker, message.target)
    assert.equal(message.year, high.year)
    assert.ok(high.people.some(person => person.name === message.speaker))
    assert.ok(high.people.some(person => person.name === message.target))
  }
})

test('local chats keep time, add both messages and shared memories, and remain immutable', () => {
  const state = freeze(createLife({ seed: 6 }))
  const next = interact(state, 'friend', '我最近有点迷茫，想听听你的想法。')
  assert.equal(next.year, state.year)
  assert.equal(next.age, state.age)
  assert.equal(next.turn, state.turn)
  assert.equal(state.people.find(person => person.id === 'friend')!.messages.length, 0)
  const friend = next.people.find(person => person.id === 'friend')!
  assert.deepEqual(friend.messages.map(message => message.role), ['user', 'assistant'])
  assert.ok(friend.messages[1]!.text.length > 0)
  assert.match(friend.memories[0]!, /迷茫/)
  assert.equal(friend.trust, state.people.find(person => person.id === 'friend')!.trust)
  const ai = interact(next, 'friend', '那我们一起想想。', '我们先选一件小事做起吧。')
  assert.equal(ai.people.find(person => person.id === 'friend')!.messages.at(-1)!.text, '我们先选一件小事做起吧。')
  assert.ok(isGameState(ai))
  assert.throws(() => interact(state, 'missing', '你好'), /人物/)
  assert.throws(() => interact(state, 'friend', '  '), /一句话/)
})

test('chat storage stays bounded and repeated messages keep distinct IDs', () => {
  let state = createLife({ seed: 7 })
  for (let index = 0; index < 65; index++) state = interact(state, 'friend', '今天怎么样？', '今天很好。')
  const friend = state.people.find(person => person.id === 'friend')!
  assert.equal(friend.messages.length, 40)
  assert.equal(friend.memories.length, 12)
  assert.equal(new Set(friend.messages.map(message => message.id)).size, 40)
  assert.ok(isGameState(state))
  const tense = interact(state, 'friend', '你这个笨蛋')
  assert.ok(tense.people.find(person => person.id === 'friend')!.trust < friend.trust)
})

test('generated events sanitize unsafe input and preserve identity, time, and stats', () => {
  const state = freeze(createLife({ seed: 8 }))
  const event = {
    id: 'forged', year: 1900, age: 0, kind: 'world', title: '  新的可能  ', description: '来自模型的叙事。', source: 'deepseek',
    choices: [
      { id: 'forged-choice', label: '尝试', hint: '试试看', effects: { health: 999, wealth: -999, knowledge: NaN, money: 9 }, personId: 'friend', relationshipDelta: 999 },
      { label: '等等看', effects: null, personId: 'not-a-person', relationshipDelta: -999 },
      { label: '等等看', effects: { health: 5 } },
      null,
    ],
  } as unknown as LifeEvent
  const messages = [{ id: 'unsafe', speaker: 'friend', target: 'mother', text: '我们聊聊最近的事吧。', year: -1 }, { speaker: '陌生人', text: '不应显示' }, { speaker: 'friend', target: 'friend', text: '自己对自己说话' }] as WorldMessage[]
  const next = applyGeneratedEvent(state, event, messages)
  assert.equal(next.currentEvent.id, state.currentEvent.id)
  assert.equal(next.currentEvent.year, state.year)
  assert.equal(next.currentEvent.age, state.age)
  assert.equal(next.currentEvent.kind, state.currentEvent.kind)
  assert.equal(next.currentEvent.source, 'deepseek')
  assert.equal(next.currentEvent.title, '新的可能')
  assert.equal(next.currentEvent.choices.length, 2)
  assert.equal(next.currentEvent.choices[0]!.id, state.currentEvent.choices[0]!.id)
  assert.deepEqual(next.currentEvent.choices[0]!.effects, { health: 25, wealth: -25 })
  assert.equal(next.currentEvent.choices[0]!.relationshipDelta, 15)
  assert.equal(next.currentEvent.choices[1]!.personId, undefined)
  assert.deepEqual(next.stats, state.stats)
  const generated = next.worldMessages.filter(message => message.id.includes('generated-world'))
  assert.equal(generated.length, 1)
  assert.equal(generated[0]!.year, state.year)
  assert.ok(isGameState(next))
  assert.ok(isGameState(choose(next)))
})

test('generated NPC dialogue can address the protagonist without impersonation or changing time', () => {
  const state = freeze(createLife({ name: '试玩角色', birthYear: 2000, startAge: 18, intelligence: 100, seed: 1847 }))
  const friend = state.people.find(person => person.id === 'friend')!
  const messages = [state.config.name, state.id, 'protagonist'].map(target => ({ id: 'incoming', speaker: friend.id,
    target, text: '最近有个挺有意思的事，想找你聊聊。', year: 1900 }))
  messages.push(...[
    { speaker: state.config.name, target: friend.id }, { speaker: state.id, target: friend.id },
    { speaker: friend.id, target: '未知人物' }, { speaker: friend.id, target: friend.name },
  ].map(message => ({ ...message, id: 'invalid', text: '不应显示', year: 1900 })))
  const next = applyGeneratedEvent(state, { ...state.currentEvent, id: 'forged', year: 1900, age: 0 }, messages)
  const added = next.worldMessages.filter(message => message.id.includes('generated-world'))
  assert.equal(added.length, 3)
  assert.ok(added.every(message => message.speaker === friend.name && message.target === state.config.name && message.year === state.year))
  for (const speaker of ['protagonist', 'player']) {
    const rejected = applyGeneratedEvent(state, state.currentEvent, [{ id: 'invalid', speaker, target: friend.id, text: '不应替玩家发言', year: state.year }])
    assert.deepEqual(rejected.worldMessages, state.worldMessages)
  }
  assert.equal(next.id, state.id)
  assert.deepEqual(next.config, state.config)
  assert.equal(next.currentEvent.id, state.currentEvent.id)
  assert.equal(next.currentEvent.year, state.year)
  assert.equal(next.currentEvent.age, state.age)
  assert.ok(isGameState(next))
})

test('invalid generated choices fall back to the playable local event', () => {
  const state = createLife({ seed: 9 })
  for (const choices of [undefined, [], [null], [{ label: '只有一个选择' }]]) {
    const next = applyGeneratedEvent(state, { title: '', choices } as unknown as LifeEvent)
    assert.deepEqual(next.currentEvent.choices, state.currentEvent.choices)
    assert.ok(isGameState(next))
  }
  assert.equal(applyGeneratedEvent(state, null as unknown as LifeEvent), state)
})

test('stats stay bounded, health depletion ends a life, and ended lives cannot advance', () => {
  const state = createLife({ seed: 10 })
  const weak = { ...state, stats: { health: 1, happiness: 99, knowledge: 99, wealth: 99 } }
  const event = { ...state.currentEvent, choices: [{ id: 'risky', label: '承担风险', hint: '风险', effects: { health: -25, happiness: 25, knowledge: 25, wealth: 25 } }] } as LifeEvent
  const ended = choose({ ...weak, currentEvent: event })
  assert.deepEqual(ended.stats, { health: 0, happiness: 100, knowledge: 100, wealth: 100 })
  assert.ok(ended.ended)
  assert.ok(ended.ending)
  assert.equal(ended.currentEvent.choices.length, 0)
  assert.equal(advanceYear(ended), ended)
  assert.equal(applyGeneratedEvent(ended, event), ended)
  assert.ok(isGameState(ended))
})

test('complete lifecycles stay valid for all eras, age bands, and varied decisions', () => {
  let turns = 0
  const titles = new Set<string>()
  const kinds = new Set<string>()
  for (const birthYear of [1900, 1950, 1990, 2050, 2100]) {
    for (const startAge of [0, 8, 15, 18, 31, 48, 66, 83, 90]) {
      let state = createLife({ seed: birthYear + startAge, birthYear, startAge, intelligence: (startAge * 3) % 101 })
      assert.ok(isGameState(copy(state)), `initial ${birthYear}/${startAge}`)
      while (!state.ended) {
        titles.add(state.currentEvent.title)
        kinds.add(state.currentEvent.kind)
        if (state.age < 18) assert.doesNotMatch(state.currentEvent.title + state.currentEvent.description + state.currentEvent.choices.map(choice => choice.label).join(''), /表达好感|恋爱|结婚|求婚/)
        assert.ok(state.people.every(person => person.age >= 0 && person.age <= 100))
        const oldAge = state.age
        state = setFocus(state, FOCUS_OPTIONS[state.turn % FOCUS_OPTIONS.length]!.id)
        state = choose(state, state.turn % state.currentEvent.choices.length)
        turns++
        assert.equal(state.age, oldAge + 1)
        assert.equal(state.year, birthYear + state.age)
        assert.ok(isGameState(copy(state)), `advanced ${birthYear}/${startAge} to ${state.age}`)
        assert.ok(state.age <= 90)
      }
      assert.ok(state.ending!.includes(state.config.name))
    }
  }
  assert.ok(turns > 1500)
  assert.ok(titles.size > 30)
  assert.ok(kinds.has('world'))
  assert.ok(kinds.has('relationship'))
})

test('different seeds and focus produce diverse, nonfixed trajectories', () => {
  const timelines = new Set<string>()
  for (let seed = 0; seed < 20; seed++) {
    let state = createLife({ seed, startAge: 24, intelligence: 90 })
    const titles: string[] = []
    for (let turn = 0; turn < 10; turn++) {
      titles.push(state.currentEvent.title)
      state = choose(state, turn % 3)
    }
    timelines.add(titles.join('|'))
  }
  assert.ok(timelines.size >= 18)
})

test('deep storage validation rejects malformed nested data and inconsistent timelines', () => {
  const valid = choose(interact(createLife({ seed: 11 }), 'friend', '你好'))
  const friendIndex = valid.people.findIndex(person => person.id === 'friend').toString()
  const mutations: [path: string[], replacement: unknown][] = [
    [['version'], 2], [['id'], ''], [['config'], null],
    [['config', 'name'], {}], [['config', 'seed'], NaN], [['config', 'startAge'], -1],
    [['age'], 100], [['year'], valid.year + 1], [['turn'], valid.turn + 1], [['focus'], 'invalid'],
    [['stats', 'health'], NaN], [['stats', 'wealth'], 101], [['stats', 'knowledge'], undefined],
    [['people'], [null]], [['people', '0', 'memories'], [{}]], [['people', '0', 'messages'], [{}]],
    [['people', '0', 'age'], -2], [['people', '0', 'trust'], Infinity], [['people'], [...valid.people, valid.people[0]]],
    [['people', friendIndex, 'messages', '0', 'text'], {}],
    [['currentEvent', 'choices', '0', 'effects'], { invalid: 2 }], [['currentEvent', 'choices', '0', 'effects', 'health'], Infinity],
    [['currentEvent', 'choices', '0', 'personId'], 'missing'], [['currentEvent', 'choices', '0', 'label'], null],
    [['currentEvent', 'choices'], [valid.currentEvent.choices[0], valid.currentEvent.choices[0]]], [['currentEvent', 'year'], valid.year - 1],
    [['history', '0', 'description'], []], [['history', '0', 'age'], valid.age], [['history'], []],
    [['worldMessages', '0', 'text'], { html: 'bad' }], [['worldMessages', '0', 'year'], 1000],
    [['ended'], true], [['ending'], 'premature'],
  ]
  assert.ok(isGameState(valid))
  for (const [index, [path, replacement]] of mutations.entries()) {
    const value = copy(valid)
    let target = value as unknown as Record<string, unknown>
    for (const segment of path.slice(0, -1)) target = target[segment] as Record<string, unknown>
    target[path.at(-1)!] = replacement
    assert.equal(isGameState(value), false, `mutation ${index} accepted`)
  }
  for (const value of [null, undefined, [], {}, 'state', 1, { version: 1 }]) assert.equal(isGameState(value), false)
})

test('chapters cover the complete age range', () => {
  const chapters = [0, 6, 13, 18, 25, 40, 60, 75].map(getChapter)
  assert.equal(new Set(chapters).size, 8)
  assert.equal(getChapter(90), chapters[7])
})

function findEvent(age: number, title: string): GameState {
  for (let seed = 0; seed < 500; seed++) {
    const state = createLife({ startAge: age, seed })
    if (state.currentEvent.title === title) return state
  }
  throw new Error(`Missing event: ${title}`)
}

function neutralYear(state: GameState): GameState {
  return choose({ ...state, currentEvent: { ...state.currentEvent, choices: [{ id: `${state.currentEvent.id}-neutral`, label: '照顾眼前的生活', hint: '按照自己的节奏前进', effects: {} }] } })
}

function readyForPartnership(): GameState {
  let state = setFocus(createLife({ startAge: 22, seed: 319 }), 'social')
  state = { ...state, people: state.people.map(person => person.id === 'acquaintance' ? { ...person, closeness: 64, trust: 72 } : person) }
  for (let turn = 0; turn < 20; turn++) {
    if (state.currentEvent.choices.some(choice => choice.id.endsWith('-action-begin-partnership'))) return state
    state = neutralYear(state)
  }
  throw new Error('A trusted adult peer never received the optional relationship conversation')
}

test('family, mentor, and neighbor choices update the actual participant', () => {
  for (const [age, title, label, targetId] of [
    [4, '下雨的午后', '靠着家人好好休息', 'mother'],
    [10, '走到街道的另一头', '给家人讲最近的学校生活', 'mother'],
    [15, '答案之外的问题', '找老师聊聊不同的路径', 'mentor'],
    [20, '第一次被认真托付', '请前辈指导后再开始', 'mentor'],
    [66, '门外的一声招呼', '请对方坐下聊一会儿', 'mentor'],
  ] as const) {
    const state = freeze(findEvent(age, title))
    const choice = state.currentEvent.choices.find(choice => choice.label === label)!
    assert.equal(choice.personId, targetId, `${title} targets the wrong relationship`)
    const next = advanceYear(state, choice.id)
    const participant = next.people.find(person => person.id === targetId)!
    assert.ok(participant.trust > state.people.find(person => person.id === targetId)!.trust)
    assert.match(participant.memories.at(-1)!, new RegExp(label))
    assert.equal(next.people.find(person => person.id === 'friend')!.trust, state.people.find(person => person.id === 'friend')!.trust)
    assert.ok(isGameState(next))
  }
})

test('trust and closeness drive conflict, followed by repair and reconciliation', () => {
  const normal = createLife({ startAge: 30, seed: 82 })
  const strained = { ...normal, people: normal.people.map(person => person.id === 'friend' ? { ...person, closeness: 24, trust: 20 } : person) }
  const next = neutralYear(freeze(strained))
  assert.equal(next.currentEvent.title, '把难受说清楚')
  assert.ok(next.currentEvent.choices.every(choice => choice.personId === 'friend'))
  assert.notEqual(neutralYear(normal).currentEvent.title, next.currentEvent.title)
  const repairing = choose(next, 0)
  assert.equal(repairing.people.find(person => person.id === 'friend')!.mood, '慢慢重建信任')
  assert.equal(repairing.currentEvent.title, '信任，从一件小事重新开始')
  const repaired = choose(repairing, 0)
  const friend = repaired.people.find(person => person.id === 'friend')!
  assert.ok(friend.closeness > 24)
  assert.ok(friend.trust > 20)
  assert.equal(friend.mood, '重新愿意靠近')
  assert.ok(friend.memories.some(memory => memory.includes('兑现一次具体的小约定')))
  assert.ok(isGameState(repaired))
  const insulted = interact(normal, 'friend', '你这个笨蛋')
  assert.equal(neutralYear(insulted).currentEvent.title, '把难受说清楚')
})

test('adult peer relationships become partners only after an explicit mutual choice', () => {
  const ready = freeze(readyForPartnership())
  assert.equal(ready.people.find(person => person.id === 'acquaintance')!.role, '新认识的人')
  assert.ok(ready.currentEvent.choices.every(choice => choice.personId === 'acquaintance'))
  const begin = ready.currentEvent.choices.find(choice => choice.id.endsWith('-action-begin-partnership'))!
  const partnered = advanceYear(ready, begin.id)
  const partner = partnered.people.find(person => person.id === 'acquaintance')!
  assert.equal(partner.role, '伴侣')
  assert.match(partner.memories.at(-1)!, /成为伴侣/)
  assert.equal(partnered.people.find(person => person.id === 'friend')!.role, '老朋友')
  assert.notEqual(partnered.people.find(person => person.id === 'mentor')!.role, '伴侣')
  let following = partnered
  for (let index = 0; index < 20 && following.currentEvent.title !== '把陪伴放进日常'; index++) following = neutralYear(following)
  assert.equal(following.currentEvent.title, '把陪伴放进日常')
  assert.ok(following.currentEvent.description.includes(partner.name))
  const hurt = { ...following, people: following.people.map(person => person.id === partner.id ? { ...person, trust: 20 } : person) }
  const conflict = neutralYear(hurt)
  const end = conflict.currentEvent.choices.find(choice => choice.id.endsWith('-action-end-partnership'))!
  assert.ok(end)
  const separated = advanceYear(conflict, end.id)
  assert.equal(separated.people.find(person => person.id === partner.id)!.role, '朋友（曾是伴侣）')
  assert.match(separated.people.find(person => person.id === partner.id)!.memories.at(-1)!, /结束伴侣关系/)
  assert.ok(isGameState(separated))
})

test('friendship and postponement remain valid alternatives to romance', () => {
  const ready = readyForPartnership()
  const friends = choose(ready, 1)
  assert.equal(friends.people.find(person => person.id === 'acquaintance')!.role, '朋友')
  let future = friends
  for (let turn = 0; turn < 12; turn++) {
    assert.ok(!future.currentEvent.choices.some(choice => choice.id.endsWith('-action-begin-partnership')))
    future = neutralYear(future)
  }
  assert.notEqual(choose(ready, 2).people.find(person => person.id === 'acquaintance')!.role, '伴侣')
})

test('model prose cannot invent a partner or replace explicit milestone decisions', () => {
  const ready = readyForPartnership()
  const forged = { ...ready.currentEvent, choices: ready.currentEvent.choices.map(choice => ({ ...choice, label: '模型决定你们成为伴侣', personId: 'mentor', effects: { wealth: 25 } })) }
  const enriched = applyGeneratedEvent(ready, forged)
  assert.deepEqual(enriched.currentEvent.choices, ready.currentEvent.choices)
  assert.notEqual(enriched.people.find(person => person.id === 'acquaintance')!.role, '伴侣')
  assert.equal(choose(enriched, 0).people.find(person => person.id === 'acquaintance')!.role, '伴侣')
  const normal = createLife({ startAge: 30, seed: 9 })
  const incoming = { ...normal.currentEvent, choices: [
    { id: 'action-begin-partnership', label: '确认彼此愿意，开始一段伴侣关系', hint: '模型的提议', effects: {}, personId: 'friend', relationshipDelta: 8 },
    { id: 'other', label: '继续了解', hint: '慢慢来', effects: {} },
  ] }
  assert.ok(!choose(applyGeneratedEvent(normal, incoming)).people.some(person => person.role === '伴侣'))
})

test('minors never receive adult relationship progression, even at maximal trust', () => {
  for (let startAge = 0; startAge < 18; startAge++) {
    let state = createLife({ startAge, seed: startAge + 202, intelligence: 100 })
    state = { ...state, people: state.people.map(person => ({ ...person, trust: 100, closeness: 100 })) }
    while (state.age < 18) {
      assert.ok(!state.people.some(person => person.id === 'acquaintance' || person.role.includes('伴侣')))
      assert.doesNotMatch(state.currentEvent.title + state.currentEvent.description + state.currentEvent.choices.map(choice => choice.label).join(''), /恋爱|伴侣|结婚|求婚|表达好感/)
      state = neutralYear(state)
    }
    assert.ok(state.people.find(person => person.id === 'acquaintance')!.age >= 18)
    assert.notEqual(state.people.find(person => person.id === 'acquaintance')!.role, '伴侣')
    assert.ok(isGameState(state))
  }
  const child = createLife({ startAge: 14, seed: 1 })
  assert.equal(applyGeneratedEvent(child, { ...child.currentEvent, title: '你们开始恋爱' }), child)
  const malformed = copy(child)
  malformed.people[0]!.role = '伴侣'
  assert.equal(isGameState(malformed), false)
})

test('departed NPCs retain their memories and messages with an explicit historical record', () => {
  const initial = interact(createLife({ startAge: 69, seed: 55 }), 'father', '一直记得你教我的事情。')
  let state = neutralYear(neutralYear(freeze(initial)))
  const father = state.people.find(person => person.id === 'father')!
  assert.equal(father.age, 100)
  assert.ok(father.role.endsWith('已离世'))
  assert.equal(father.mood, '长久的思念')
  assert.deepEqual(father.messages, initial.people.find(person => person.id === 'father')!.messages)
  assert.ok(father.memories.some(memory => memory.includes('一直记得你教我的事情')))
  assert.match(state.history.at(-1)!.description, new RegExp(`${father.name}在100岁时离世`))
  assert.throws(() => interact(state, father.id, '你好'), /回忆/)
  const departureYear = state.year
  for (let year = 0; year < 5; year++) state = neutralYear(state)
  assert.equal(state.people.find(person => person.id === father.id)!.age, 100)
  assert.ok(!state.currentEvent.choices.some(choice => choice.personId === father.id))
  assert.ok(state.worldMessages.filter(message => message.year >= departureYear).every(message => message.speaker !== father.name && message.target !== father.name))
  const generated = { ...state.currentEvent, choices: [
    { id: 'a', label: '保存回忆', hint: '妥善珍藏', effects: {}, personId: 'father', relationshipDelta: 10 },
    { id: 'b', label: '继续生活', hint: '慢慢前进', effects: {} },
  ] }
  const enriched = applyGeneratedEvent(state, generated, [
    { id: 'dead-speaker', speaker: father.name, target: state.config.name, text: '不应生成新的发言', year: state.year },
    { id: 'dead-target', speaker: 'friend', target: father.id, text: '不应向已离世人物发言', year: state.year },
  ])
  assert.ok(!enriched.currentEvent.choices.some(choice => choice.personId === father.id))
  assert.deepEqual(enriched.worldMessages, state.worldMessages)
  assert.ok(isGameState(enriched))
})

test('external mortality keeps a complete timeline through110 under wrapper control', () => {
  let state = createLife({ startAge: 0, seed: 420, birthYear: 2100 })
  for (let age = 1; age <= 110; age++) {
    const original = freeze(state)
    state = advanceYear(original, original.currentEvent.choices[0]?.id, { mortality: 'external' })
    assert.equal(state.age, age)
    assert.equal(state.turn, age)
    assert.equal(state.year, 2100 + age)
    assert.equal(state.ended, false)
    assert.equal(original.age, age - 1)
    assert.ok(isGameState(copy(state)), `external state invalid at${age}`)
  }
  assert.throws(() => advanceYear(state, state.currentEvent.choices[0]?.id, { mortality: 'external' }), /110岁/)
  assert.equal(isGameState({ ...state, age: 111, year: 2211, turn: 111 }), false)
  const weak = createLife({ startAge: 24, seed: 3 })
  weak.stats.health = 0
  weak.currentEvent.choices = [{ ...weak.currentEvent.choices[0]!, effects: { health: -25 } }]
  const active = advanceYear(weak, weak.currentEvent.choices[0]?.id, { mortality: 'external' })
  assert.equal(active.stats.health, 0)
  assert.equal(active.ended, false)
  assert.equal(advanceYear(weak, weak.currentEvent.choices[0]?.id).ended, true)
  assert.ok(isGameState(active))
})

test('external early deaths may have positive health but must preserve a valid ending', () => {
  const newborn = createLife({ startAge: 0, seed: 211 })
  const state = advanceYear(newborn, newborn.currentEvent.choices[0]?.id, { mortality: 'external' })
  assert.ok(state.stats.health > 0)
  const ended: GameState = { ...state, ended: true, ending: '一次意外，让故事停在这里。', currentEvent: { ...state.currentEvent, choices: [], title: '这一生，留在时间里' } }
  assert.ok(isGameState(copy(ended)))
  assert.equal(isGameState({ ...ended, ending: undefined }), false)
  assert.equal(isGameState({ ...ended, currentEvent: { ...ended.currentEvent, choices: state.currentEvent.choices } }), false)
  assert.equal(advanceYear(ended, undefined, { mortality: 'external' }), ended)
})

test('model enrichment preserves simulation choice IDs, labels, and financial effects together', () => {
  const initial = createLife({ startAge: 18, seed: 22 })
  const state = freeze({ ...initial, currentEvent: { ...initial.currentEvent, title: '升学还是工作', choices: [
    { id: 'sim:school:university', label: '进入大学，必要时申请贷款', hint: '未来四年需要学费', effects: { knowledge: 6, wealth: -4 } },
    { id: 'sim:work:service', label: '直接开始工作', hint: '获得服务岗位收入', effects: { happiness: 2 } },
  ] } })
  const incoming: LifeEvent = { ...state.currentEvent, title: '成年之后的选择', description: '新的生活，在真实的开支与收入之间展开。', choices: [
    { id: 'free-money', label: '免费领取收入', hint: '没有任何代价', effects: { wealth: 25 } },
    { id: 'do-nothing', label: '什么也不做', hint: '没有后果', effects: {} },
  ] }
  const enriched = applyGeneratedEvent(state, incoming)
  assert.equal(enriched.currentEvent.description, incoming.description)
  assert.equal(enriched.currentEvent.source, 'deepseek')
  assert.deepEqual(enriched.currentEvent.choices, state.currentEvent.choices)
  assert.ok(isGameState(enriched))
})

test('choices resolve immediately without advancing time or applying annual focus', () => {
  const initial = setFocus(createLife({ seed: 762 }), 'career')
  initial.currentEvent.source = 'deepseek'
  const state = freeze(initial)
  const before = copy(state)
  const choice = state.currentEvent.choices[1]!
  const resolved = resolveChoice(state, choice.id)
  assert.equal(resolved.age, state.age)
  assert.equal(resolved.year, state.year)
  assert.equal(resolved.turn, state.turn)
  assert.equal(resolved.id, state.id)
  assert.equal(resolved.currentEvent.id, state.currentEvent.id)
  assert.equal(resolved.currentEvent.source, 'deepseek')
  assert.equal(resolved.currentEvent.kind, state.currentEvent.kind)
  assert.equal(resolved.currentEvent.choices.length, 0)
  assert.ok(resolved.currentEvent.description.endsWith(`你选择了：${choice.label}。`))
  assert.equal(resolved.stats.wealth, state.stats.wealth - 5)
  assert.equal(resolved.stats.knowledge, state.stats.knowledge + 3)
  assert.equal(resolved.stats.happiness, state.stats.happiness + 7)
  assert.equal(resolved.stats.health, state.stats.health)
  assert.deepEqual(resolved.history, state.history)
  assert.deepEqual(resolved.worldMessages, state.worldMessages)
  assert.deepEqual(resolved.people.map(person => person.age), state.people.map(person => person.age))
  assert.equal(resolved.people.find(person => person.id === 'friend')!.closeness, state.people.find(person => person.id === 'friend')!.closeness + 6)
  assert.equal(resolved.people.find(person => person.id === 'mother')!.trust, state.people.find(person => person.id === 'mother')!.trust)
  assert.deepEqual(state, before)
  assert.ok(isGameState(resolved))
  const next = advanceYear(resolved)
  assert.equal(next.age, state.age + 1)
  assert.equal(next.stats.wealth, resolved.stats.wealth + 4)
  assert.equal(next.stats.knowledge, resolved.stats.knowledge)
  assert.equal(next.people.find(person => person.id === 'friend')!.memories.length, resolved.people.find(person => person.id === 'friend')!.memories.length)
  assert.equal(next.history[0]!.description.split(`你选择了：${choice.label}。`).length - 1, 1)
})

test('immediate partnership resolution applies actions and memories exactly once', () => {
  const state = freeze(readyForPartnership())
  const choice = state.currentEvent.choices[0]!
  const before = state.people.find(person => person.id === 'acquaintance')!
  const resolved = resolveChoice(state, choice.id)
  const partner = resolved.people.find(person => person.id === before.id)!
  assert.equal(partner.role, '伴侣')
  assert.equal(partner.age, before.age)
  assert.equal(partner.closeness, Math.min(100, before.closeness + 8))
  assert.equal(partner.memories.length, Math.min(12, before.memories.length + 2))
  assert.equal(resolved.age, state.age)
  assert.throws(() => resolveChoice(resolved, choice.id), /当前年份/)
  assert.throws(() => advanceYear(resolved, choice.id), /当前年份/)
  const next = advanceYear(resolved)
  assert.equal(next.people.find(person => person.id === before.id)!.role, '伴侣')
  assert.equal(next.people.find(person => person.id === before.id)!.memories.length, partner.memories.length)
  assert.equal(applyGeneratedEvent(resolved, state.currentEvent), resolved, 'late model output cannot reopen a resolved choice')
  assert.ok(isGameState(next))
})

test('immediate resolution defers aging, departures, and mortality until the year advances', () => {
  const state = createLife({ startAge: 69, seed: 88 })
  state.stats.health = 1
  state.people.find(person => person.id === 'father')!.age = 99
  state.currentEvent.choices = [{ id: 'one-more-conversation', label: '和家人认真谈谈', hint: '把心事说清楚', effects: { health: -25 }, personId: 'father', relationshipDelta: 5 }]
  const resolved = resolveChoice(freeze(state), 'one-more-conversation')
  assert.equal(resolved.stats.health, 0)
  assert.equal(resolved.ended, false)
  assert.equal(resolved.ending, undefined)
  assert.equal(resolved.people.find(person => person.id === 'father')!.age, 99)
  assert.equal(resolved.people.find(person => person.id === 'father')!.role, '父亲')
  assert.equal(resolved.history.length, 0)
  assert.ok(isGameState(resolved))
  const next = advanceYear(resolved)
  assert.equal(next.ended, true)
  assert.ok(next.people.find(person => person.id === 'father')!.role.endsWith('已离世'))
  assert.ok(isGameState(next))
})

test('immediate resolution rejects stale IDs, archived targets, and malformed effects', () => {
  const state = createLife({ seed: 71 })
  const id = state.currentEvent.choices[0]!.id
  for (const invalidId of ['', 'previous-year', null, 4]) assert.throws(() => resolveChoice(state, invalidId as string))
  const malformed: [string, unknown][] = [
    ['effects', { health: NaN }], ['effects', { wealth: Infinity }], ['effects', { knowledge: 26 }], ['effects', { extra: 1 }], ['effects', null],
    ['label', {}], ['hint', undefined], ['personId', 'missing'], ['relationshipDelta', 5],
  ]
  for (const [key, value] of malformed) {
    const invalid = copy(state)
    const choice = invalid.currentEvent.choices[0] as unknown as Record<string, unknown>
    choice[key] = value
    assert.throws(() => resolveChoice(invalid, id), `accepted malformed ${key}`)
  }
  const duplicate = copy(state)
  duplicate.currentEvent.choices.push(duplicate.currentEvent.choices[0]!)
  assert.throws(() => resolveChoice(duplicate, id), /当前年份/)
  const archived = copy(state)
  archived.people.find(person => person.id === 'mother')!.role = '母亲 · 已离世'
  const familyId = archived.currentEvent.choices[2]!.id
  assert.throws(() => resolveChoice(archived, familyId), /回忆/)
  const ended = createLife({ startAge: 90, seed: 1 })
  assert.throws(() => resolveChoice(ended, id), /珍藏/)
  const ready = readyForPartnership()
  ready.people.find(person => person.id === 'acquaintance')!.trust = 20
  assert.throws(() => resolveChoice(ready, ready.currentEvent.choices[0]!.id), /关系已经发生变化/)
})

test('immediate outcome prose remains valid at the maximum narrative length', () => {
  const state = createLife({ seed: 5 })
  state.currentEvent.description = '时光'.repeat(1500)
  const choice = state.currentEvent.choices[0]!
  const resolved = resolveChoice(state, choice.id)
  assert.ok(resolved.currentEvent.description.length <= 3000)
  assert.ok(resolved.currentEvent.description.endsWith(`你选择了：${choice.label}。`))
  assert.ok(isGameState(resolved))
  const boundary = createLife({ seed: 8 })
  boundary.stats.health = 99
  boundary.focus = 'career'
  boundary.currentEvent.choices[0]!.effects = { health: 25 }
  assert.equal(advanceYear(boundary, boundary.currentEvent.choices[0]!.id).stats.health, 100, 'bundled annual resolution keeps its original clamp behavior')
})

test('world choices resolve in place and model enrichment preserves their causal meaning', () => {
  let state = createLife({ seed: 3, startAge: 19, intelligence: 100 })
  for (let index = 0; index < 12 && !state.currentEvent.choices.some(choice => choice.id.startsWith('world:')); index++) state = choose(state)
  assert.ok(state.currentEvent.choices.some(choice => choice.id.startsWith('world:')))
  const snapshot = copy(state)
  const enriched = applyGeneratedEvent(state, { ...state.currentEvent, title: '模型润色后的标题', choices: state.currentEvent.choices.map(choice => ({ ...choice, id: 'changed-' + choice.id, label: '改变决定', effects: { wealth: 20 } })) })
  assert.deepEqual(enriched.currentEvent.choices, state.currentEvent.choices)
  const choice = state.currentEvent.choices.find(choice => choice.id.endsWith(':close'))!
  const resolved = resolveChoice(enriched, choice.id)
  assert.equal(resolved.age, state.age)
  assert.equal(resolved.worldThreads!.find(thread => choice.id === `world:${thread.id}:close`)!.status, 'resolved')
  assert.deepEqual(state, snapshot)
  assert.ok(isGameState(resolved))
})

test('chat changes a world follow-up without advancing stages or creating annual work', () => {
  let state = createLife({ seed: 3, startAge: 19, intelligence: 100 })
  for (let index = 0; index < 12 && !state.worldThreads?.some(thread => thread.status === 'active'); index++) state = choose(state)
  const active = state.worldThreads!.find(thread => thread.status === 'active')!
  const count = state.worldThreads!.length
  const before = copy(state)
  const chatted = interact(state, active.personId, '闭嘴')
  const after = chatted.worldThreads!.find(thread => thread.id === active.id)!
  assert.equal(after.direction, 'conflict')
  assert.equal(after.stage, active.stage)
  assert.equal(chatted.year, state.year)
  assert.equal(chatted.worldThreads!.length, count)
  assert.deepEqual(state, before)
})

test('world save fields reject unknown references and future nodes while legacy saves remain valid', () => {
  let state = createLife({ seed: 3, startAge: 19, intelligence: 100 })
  for (let index = 0; index < 12 && !state.worldThreads?.length; index++) state = choose(state)
  assert.ok(isGameState(state))
  assert.ok(isGameState({ ...state, worldThreads: undefined, worldUpdatedYear: undefined }))
  const entry = state.worldThreads![0]!
  for (const worldThreads of [[{ ...entry, personId: 'unknown' }], [{ ...entry, relatedThreadId: 'missing-thread' }], [{ ...entry, startedYear: state.year + 1 }], [{ ...entry, nextYear: state.year + 4 }], [{ ...entry, impact: {} }]]) {
    assert.equal(isGameState({ ...state, worldThreads }), false)
  }
  assert.equal(isGameState({ ...state, worldUpdatedYear: state.year + 1 }), false)
})
