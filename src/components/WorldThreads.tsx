import { GitBranch, Heart, MessageCircle } from 'lucide-react'
import type { GameState, WorldThread } from '../game/types.ts'

const DIRECTIONS = { support: '信任带来的机会', distance: '关系尚有距离', conflict: '分歧有了后续' }
const OUTCOMES = { completed: '已经完成', withdrawn: '主动放下', lapsed: '久未跟进', interrupted: '因故中断' }

function statusLabel(thread: WorldThread, year: number) {
  if (thread.status === 'resolved') return thread.outcome ? OUTCOMES[thread.outcome] : '已告一段落'
  if (thread.direction === 'conflict' && thread.personId) return '等待化解分歧'
  if (thread.stalledYears || thread.milestones?.at(-1)?.kind === 'delay') return '等待跟进'
  if (thread.stage === 1 && thread.startedYear === year && thread.lastActionYear === undefined) return '刚刚开始'
  if (thread.nextYear > year) return '等待后续'
  return thread.stage === 1 ? '刚刚开始' : '等待下一步'
}

function ThreadCard({ thread, state }: { thread: WorldThread; state: GameState }) {
  const person = state.people.find(person => person.id === thread.personId)
  const earlier = state.worldThreads?.find(item => item.id === thread.relatedThreadId)
  const milestones = thread.milestones ?? []
  const latestReason = milestones.at(-1)?.text ?? thread.impact
  return <article className={`world-thread ${thread.direction}${thread.status === 'resolved' ? ' thread-ended' : ''}`}>
    <header><span>{thread.personId ? person?.name ?? '往日的联系' : '自己的安排'} · {thread.startedYear} 年起</span><span className={`thread-status ${thread.outcome === 'completed' ? 'completed' : ''}`}>{statusLabel(thread, state.year)}</span></header>
    <h4>{thread.title}</h4>
    <p>{thread.cause}</p>
    <div className="thread-direction">{!thread.personId ? <GitBranch size={12}/> : thread.direction === 'support' ? <Heart size={12}/> : <MessageCircle size={12}/>}<span>{thread.personId ? DIRECTIONS[thread.direction] : '行动留下的后续'}</span>{thread.status === 'active' && <span className="thread-stages" aria-label={`已经历 ${thread.stage} 段经过`}>{[1, 2, 3].map(stage => <i key={stage} aria-hidden="true" className={stage <= thread.stage ? 'filled' : ''}/>)}</span>}</div>
    <p className="thread-impact"><span className="thread-reason-label">最近的变化</span>{latestReason}</p>
    {thread.status === 'active' && <small>{thread.nextYear > state.year ? `下次回顾 · ${thread.nextYear} 年` : '这件事仍待跟进'}</small>}
    {earlier && <p className="thread-earlier">从「{earlier.title}」延续而来</p>}
    {milestones.length > 0 && <details className="thread-history"><summary>查看因果经过</summary><ol>{milestones.map((milestone, index) => <li key={`${milestone.year}-${milestone.kind}-${index}`}><time dateTime={String(milestone.year)}>{milestone.year} 年</time><span>{milestone.text}</span></li>)}</ol></details>}
  </article>
}

export default function WorldThreads({ state }: { state: GameState }) {
  const active = (state.worldThreads ?? []).filter(thread => thread.status === 'active')
  const resolved = (state.worldThreads ?? []).filter(thread => thread.status === 'resolved')
  const recentFacts = (state.worldFacts ?? []).slice(-8).reverse()
  return <section className="world-threads panel" aria-label="持续发展的世界线索">
    <div className="section-heading"><h3><GitBranch size={16}/>世界线索</h3><span>{active.length ? `${active.length} 条正在发展` : `世界智能 ${state.config.intelligence}`}</span></div>
    {active.length ? active.map(thread => <ThreadCard key={thread.id} thread={thread} state={state}/>) : <p className="world-thread-empty">{state.config.intelligence === 0 ? '世界线索暂时静止。提高世界智能后，人物的关系与选择会带来后续事件。' : state.age < 6 ? '家人的陪伴正在留下最早的回忆。长大后，这些关系会延伸出新的约定与机会。' : '一次交谈、一个选择，都可能成为下一段故事的起点。关系变化会影响线索的走向。'}</p>}
    {!!resolved.length && <details className="resolved-threads"><summary>回看告一段落的线索 · {resolved.length}</summary>{[...resolved].reverse().map(thread => <ThreadCard key={thread.id} thread={thread} state={state}/>)}</details>}
    {recentFacts.length > 0 && <details className="world-recent-facts"><summary>最近留下的经历 · {recentFacts.length}</summary><ol>{recentFacts.map(fact => <li key={fact.id}><time dateTime={String(fact.year)}>{fact.year} 年</time><span>{fact.summary}</span></li>)}</ol></details>}
  </section>
}
