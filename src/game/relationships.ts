import type { ChatReaction, GameState, Person, RelationshipAction, RelationshipAssessment, RelationshipHistory } from './types.ts'
const clamp = (n: number) => Math.min(100, Math.max(0, n))
const normal = (s: string) => s.toLowerCase().replace(/[\s，。！？,.!?]/g, '')
const fingerprint = (s: string) => { let h = 2166136261; for (const c of normal(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36) }
const negatedPromise = (s: string) => /不(?:能|会|想|打算)?(?:承诺|保证|答应)|不能保证|不会(?:陪|帮)|不答应|(?:can't|cannot|won't|will not|don't)\s+(?:promise|help|join)/i.test(s)
/** Deliberately narrow offline fallback: unrecognized wording stays neutral. */
export function classifyReaction(text: string, supplied?: ChatReaction): ChatReaction {
  const plain = text.replace(/[“「『"].*?[”」』"]/g, '')
  let result: ChatReaction = { intent: 'neutral', reason: '这次谈话留下了记录，暂未判断出明确的关系变化。' }
  if (/^(?:你(?:就是|这个|是个?|真是)?\s*)?(?:笨蛋|滚开|闭嘴|废物|去死)[！!。\s]*$|^you (?:are |are an? )?(?:idiot|stupid)[!.\s]*$/i.test(plain)) result = { intent: 'hostility', reason: '直接的攻击让对方受伤，信任下降。' }
  else if (/对不起|我错了|我向你道歉|i am sorry/i.test(plain)) result = { intent: 'apology', reason: '你承认了伤害；道歉只是修复的开始。' }
  else if (/我愿意听|我在听|你慢慢说/.test(plain)) result = { intent: 'listen', reason: '你留出了倾听对方的空间。' }
  else if (/我很关心你|辛苦了|希望你过得好/.test(plain)) result = { intent: 'care', reason: '明确的关心让对方感到被在乎。' }
  else if (/我(?:答应|保证|承诺).*(?:陪|帮)/.test(plain) && !negatedPromise(plain)) result = { intent: 'promise', reason: '对方记住了你的约定，等待实际行动。', commitment: /帮/.test(plain) ? 'help' : 'company' }
  else if (/我(?:不能|不想|需要)|暂时不方便/.test(plain)) result = { intent: 'boundary', reason: '你说明了自己的边界。' }
  if (supplied && ['care', 'listen', 'apology', 'boundary', 'dismissive', 'hostility', 'promise', 'neutral'].includes(supplied.intent) && typeof supplied.reason === 'string' && supplied.reason.trim()) result = { ...supplied, reason: supplied.reason.trim().slice(0, 240) }
  const ownPromise = /(?:^|[，。！？,.!?\s])我(?:答应|保证|承诺|会|明年会|明天会|下次会|愿意).*(?:陪你|陪伴你|帮你|帮助你)/.test(plain) && !/他说|她说|他们说|转述|引用|他答应|她答应/.test(plain)
  const mentionsCompany = /陪你|陪伴你/.test(plain)
  const mentionsHelp = /帮你|帮助你/.test(plain)
  if (result.intent === 'promise' && result.commitment === undefined && ownPromise && !negatedPromise(text) && mentionsCompany !== mentionsHelp) result = { ...result, commitment: mentionsCompany ? 'company' : 'help' }
  if (result.intent === 'promise' && (!ownPromise || negatedPromise(text) || (result.commitment === 'company' ? !/陪你|陪伴你/.test(plain) : !/帮你|帮助你/.test(plain)) || !result.commitment || !['company', 'help'].includes(result.commitment))) return { intent: negatedPromise(text) ? 'boundary' : 'neutral', reason: '没有形成明确的本人约定，不自动新增承诺。' }
  // Quotation and explicit rejection of insults are never automatic hostility.
  if (result.intent === 'hostility' && (/不会叫你|不(?:是|要|会).*笨蛋|不要骂|他说|他对我说|引用/.test(text) || plain !== text && !/你(?:是|就是).*(笨蛋|废物)/.test(plain))) return { intent: 'neutral', reason: '引用或否定攻击性用语，不作为对对方的攻击。' }
  return result
}

/** Older saves reconstruct only damage evidenced in their bounded history. */
export function relationshipStrain(person: Pick<Person, 'relationshipStrain' | 'relationshipHistory'>): number {
  return person.relationshipStrain ?? (person.relationshipHistory ?? []).reduce((strain, entry) => updateRelationshipStrain(strain, entry.trustDelta), 0)
}
export function updateRelationshipStrain(strain: number, actualTrustDelta: number): number {
  return clamp(strain + (actualTrustDelta < 0 ? -actualTrustDelta : -actualTrustDelta * .5))
}

export function relationshipEffect(state: GameState, personId: string, key: string, source: RelationshipHistory['source'], reason: string, closeness: number, trust: number, happiness = 0, mood?: string): GameState {
  const p = state.people.find(p => p.id === personId)
  if (!p || state.ended || p.role.includes('已离世')) return state
  const ledger = p.relationshipYear?.year === state.year ? p.relationshipYear : { year: state.year, keys: [], closenessGain: 0, trustGain: 0, happinessGain: 0 }
  if (ledger.keys.includes(key) || ledger.keys.length >= 64) return state
  const cap = (n: number, used: number, max: number) => n > 0 ? Math.min(n, Math.max(0, max - used)) : n
  const cd = clamp(p.closeness + cap(closeness, ledger.closenessGain, 12)) - p.closeness
  const td = clamp(p.trust + cap(trust, ledger.trustGain, 10)) - p.trust
  const hd = clamp(state.stats.happiness + cap(happiness, ledger.happinessGain, 4)) - state.stats.happiness
  const entry = { id: `rel-${state.year}-${fingerprint(personId + key)}`, year: state.year, source, key, reason: reason.slice(0, 240), closenessDelta: cd, trustDelta: td }
  const strain = updateRelationshipStrain(relationshipStrain(p), td)
  const updated: Person = { ...p, closeness: p.closeness + cd, trust: p.trust + td, relationshipStrain: strain, mood: strain > 0 ? (td > 0 ? '慢慢修复信任，仍需要一点空间' : '需要一点空间') : mood ?? p.mood,
    relationshipYear: { year: state.year, keys: [...ledger.keys, key], closenessGain: ledger.closenessGain + Math.max(0, cd), trustGain: ledger.trustGain + Math.max(0, td), happinessGain: ledger.happinessGain + Math.max(0, hd) },
    relationshipHistory: [...(p.relationshipHistory ?? []), entry].slice(-16), memories: [...p.memories, `${state.year}年，${reason}（亲密${cd >= 0 ? '+' : ''}${cd}，信任${td >= 0 ? '+' : ''}${td}）`.slice(0, 240)].slice(-12) }
  return { ...state, stats: { ...state.stats, happiness: state.stats.happiness + hd }, people: state.people.map(item => item.id === personId ? updated : item) }
}
/** NPC appraisals need a present fact; prose alone cannot grant rewards or invent a grievance. */
export function applyRelationshipAssessments(state: GameState, assessments: RelationshipAssessment[] = []): GameState {
  if (state.ended || state.age < 6 || !Array.isArray(assessments)) return state
  let next = state
  const seen = new Set<string>()
  for (const assessment of assessments.slice(0, 3)) {
    if (!assessment || typeof assessment.reason !== 'string' || !assessment.reason.trim() || assessment.reason.length > 160 || seen.has(assessment.personId)) continue
    const person = state.people.find(p => p.id === assessment.personId && !p.role.includes('已离世'))
    const evidence = state.worldFacts?.find(f => f.id === assessment.evidenceId && f.year === state.year && f.personId === assessment.personId)
    if (!person || !evidence) continue
    let change: [number, number, number, string] | undefined
    if (assessment.intent === 'neglected') {
      const thread = state.worldThreads?.find(t => evidence.id === `review:${t.id}:${state.year}` && t.personId === person.id && (t.stalledYears ?? 0) >= 2)
      if (evidence.kind === 'decision' && thread) change = [-2, -1, -1, '觉得被冷落，期待更明确的行动']
    } else if (assessment.intent === 'appreciated') {
      const thread = state.worldThreads?.find(t => evidence.id === `decision:${t.id}:${state.year}` && t.personId === person.id && t.milestones?.some(m => m.year === state.year && m.kind === 'action'))
      if (evidence.kind === 'decision' && thread) change = [1, 1, 0, '注意到了你的实际投入']
    } else if (assessment.intent === 'hurt' && evidence.kind === 'relationship' && person.relationshipHistory?.some(h => evidence.id === `relationship:${h.id}` && h.year === state.year && (h.closenessDelta < 0 || h.trustDelta < 0))) {
      change = [0, 0, 0, '仍在意之前的伤害']
    }
    if (!change) continue
    seen.add(person.id)
    next = relationshipEffect(next, person.id, 'assessment:annual', 'experience', `对方的感受：${assessment.reason}`.slice(0, 240), ...change)
  }
  return next
}

function promise(state: GameState, personId: string, kind: 'company' | 'help'): GameState {
  return { ...state, people: state.people.map(p => {
    if (p.id !== personId || (p.commitments ?? []).some(c => c.kind === kind && (c.status === 'pending' || c.createdYear === state.year))) return p
    const previous = p.commitments ?? []
    if (previous.filter(c => c.status === 'pending').length >= 4) return p
    return { ...p, commitments: [...previous.filter(c => c.status === 'pending'), ...previous.filter(c => c.status !== 'pending').slice(-Math.max(0, 3 - previous.filter(c => c.status === 'pending').length)), { id: `promise-${state.year}-${kind}-${personId}`.slice(0, 180), kind, createdYear: state.year, dueYear: state.year + 1, status: 'pending' as const }].slice(-4) }
  }) }
}
export function applyChatReaction(state: GameState, personId: string, text: string, reaction: ChatReaction): GameState {
  const values: Record<ChatReaction['intent'], [number, number, number, string]> = {
    care: [2, 1, 1, '觉得被在乎'], listen: [2, 2, 1, '愿意慢慢倾诉'], apology: [0, 1, 0, '等待行动证明'], boundary: [0, 0, 0, '理解彼此的边界'], dismissive: [-2, -2, -1, '有些失落'], hostility: [-5, -7, -1, '需要一点空间'], promise: [0, 0, 0, '等待约定兑现'], neutral: [0, 0, 0, '愿意继续聊聊'],
  }
  const key = reaction.intent === 'apology' || reaction.intent === 'promise' ? `chat:${reaction.intent}` : `chat:${fingerprint(text)}`
  const next = relationshipEffect(state, personId, key, 'chat', reaction.reason, ...values[reaction.intent])
  return reaction.intent === 'promise' && reaction.commitment && state.age >= 6 ? promise(next, personId, reaction.commitment) : next
}
export function applyRelationshipAction(state: GameState, personId: string, action: RelationshipAction): GameState {
  const target = state.people.find(p => p.id === personId)
  if (state.ended || !target || target.role.includes('已离世')) throw new Error('当前不能与这位人物互动。')
  if (state.age < 3 || target.age < 3 || state.age < 6 && ['help', 'promise-help', 'promise-company', 'cancel-promise'].includes(action)) throw new Error('长大一些后再尝试这项行动。')
  const choices: Record<RelationshipAction, [string, number, number, number]> = { listen: ['你认真听对方说完近况。', 2, 2, 1], company: ['你实际留出时间陪伴对方。', 3, 2, 1], help: ['你完成了一件力所能及的小事，帮助对方。', 2, 3, 1], apologize: ['你认真道歉，并给对方时间消化。', 0, 1, 0], 'promise-company': ['你约定在下一年结束前陪伴对方一次。', 0, 0, 0], 'promise-help': ['你约定在下一年结束前帮助对方一次。', 0, 0, 0], 'cancel-promise': ['你主动说明无法继续履行约定，减少对方的等待。', 0, -1, 0] }
  if (!choices[action]) throw new Error('请选择有效的关系行动。')
  const [reason, c, t, h] = choices[action]
  if (action === 'cancel-promise' && !target.commitments?.some(c => c.status === 'pending')) return state
  const actionAlreadyUsed = target.relationshipYear?.year === state.year && (target.relationshipYear.keys.includes(`action:${action}`) || target.relationshipYear.keys.length >= 64)
  let next = relationshipEffect(state, personId, `action:${action}`, 'action', reason, c, t, h)
  if (action.startsWith('promise-')) return promise(next, personId, action === 'promise-help' ? 'help' : 'company')
  for (const commitment of target.commitments ?? []) {
    if (commitment.status !== 'pending') continue
    if (action === commitment.kind && !actionAlreadyUsed && state.year <= commitment.dueYear || action === 'cancel-promise') {
      const status = action === 'cancel-promise' ? 'cancelled' : 'fulfilled'
      next = { ...next, people: next.people.map(p => p.id === personId ? { ...p, commitments: p.commitments?.map(c => c.id === commitment.id ? { ...c, status } : c) } : p) }
      if (status === 'fulfilled') next = relationshipEffect(next, personId, commitment.id, 'commitment', '你用实际行动兑现了约定。', 1, 3, 0, '觉得你值得信赖')
    }
  }
  return next
}
export function settleCommitments(state: GameState): GameState {
  let next = state
  for (const person of state.people) for (const commitment of person.commitments ?? []) {
    if (commitment.status !== 'pending' || state.year <= commitment.dueYear || person.role.includes('已离世')) continue
    next = relationshipEffect(next, person.id, commitment.id, 'commitment', '约定的整整一年已经过去，承诺仍未兑现。', -2, -5, 0, '对落空的约定感到失望')
    next = { ...next, people: next.people.map(p => p.id === person.id ? { ...p, commitments: p.commitments?.map(c => c.id === commitment.id ? { ...c, status: 'broken' } : c) } : p) }
  }
  return next
}

export function validateRelationshipData(person: Record<string, unknown>, birthYear: number, year: number): boolean {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  const date = (v: unknown) => number(v, birthYear, year) && Number.isInteger(v)
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
  if (person.relationshipStrain !== undefined && !number(person.relationshipStrain, 0, 100)) return false
  const history = person.relationshipHistory
  if (history !== undefined && (!Array.isArray(history) || history.length > 16 || !history.every(h => record(h) && text(h.id, 180) && date(h.year) && ['chat', 'action', 'commitment', 'experience'].includes(h.source as string) && text(h.key, 160) && text(h.reason, 240) && number(h.closenessDelta, -15, 15) && number(h.trustDelta, -15, 15)) || new Set(history.map(h => h.id)).size !== history.length)) return false
  const commitments = person.commitments
  if (commitments !== undefined && (!Array.isArray(commitments) || commitments.length > 4 || !commitments.every(c => record(c) && text(c.id, 180) && ['company', 'help'].includes(c.kind as string) && date(c.createdYear) && c.dueYear === (c.createdYear as number) + 1 && ['pending', 'fulfilled', 'broken', 'cancelled'].includes(c.status as string)) || new Set(commitments.map(c => c.id)).size !== commitments.length)) return false
  const ledger = person.relationshipYear
  return ledger === undefined || record(ledger) && date(ledger.year) && Array.isArray(ledger.keys) && ledger.keys.length <= 64 && ledger.keys.every(k => text(k, 160)) && new Set(ledger.keys).size === ledger.keys.length && number(ledger.closenessGain, 0, 12) && number(ledger.trustGain, 0, 10) && number(ledger.happinessGain, 0, 4)
}
