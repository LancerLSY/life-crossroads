import { GitBranch, Heart, MessageCircle } from 'lucide-react'
import type { GameState, WorldThread } from '../game/types.ts'

const DIRECTIONS = { support: '信任带来的机会', distance: '关系尚有距离', conflict: '分歧有了后续' }
function ThreadCard({ thread, state }: { thread: WorldThread; state: GameState }) {
  const person = state.people.find(person => person.id === thread.personId)
  return <article className={`world-thread ${thread.direction}`}>
    <header><span>{person?.name ?? '共同经历'} · {thread.startedYear} 年起</span><span>{thread.status === 'resolved' ? '已落定' : thread.stage === 1 ? '刚刚开始' : '持续发展'}</span></header>
    <h4>{thread.title}</h4>
    <p>{thread.cause}</p>
    <div className="thread-direction">{thread.direction === 'support' ? <Heart size={12}/> : <MessageCircle size={12}/>}<span>{DIRECTIONS[thread.direction]}</span><span className="thread-stages" aria-label={`线索阶段 ${thread.stage} / 3`}>{[1, 2, 3].map(stage => <i key={stage} className={stage <= thread.stage ? 'filled' : ''}/>)}</span></div>
    <p className="thread-impact">{thread.impact}</p>
    {thread.status === 'active' && <small>下个节点 · {thread.nextYear} 年{thread.relatedThreadId ? ' · 从往日线索延伸' : ''}</small>}
  </article>
}

export default function WorldThreads({ state }: { state: GameState }) {
  const active = (state.worldThreads ?? []).filter(thread => thread.status === 'active')
  const resolved = (state.worldThreads ?? []).filter(thread => thread.status === 'resolved')
  return <section className="world-threads panel" aria-label="持续发展的世界线索">
    <div className="section-heading"><h3><GitBranch size={16}/>世界线索</h3><span>{active.length ? `${active.length} 条正在发展` : `世界智能 ${state.config.intelligence}`}</span></div>
    {active.length ? active.map(thread => <ThreadCard key={thread.id} thread={thread} state={state}/>) : <p className="world-thread-empty">{state.config.intelligence === 0 ? '世界线索暂时静止。提高世界智能后，人物的关系与选择会带来后续事件。' : state.age < 6 ? '家人的陪伴正在留下最早的回忆。长大后，这些关系会延伸出新的约定与机会。' : '一次交谈、一个选择，都可能成为下一段故事的起点。关系变化会影响线索的走向。'}</p>}
    {!!resolved.length && <details className="resolved-threads"><summary>回看已落定的线索 · {resolved.length}</summary>{[...resolved].reverse().map(thread => <ThreadCard key={thread.id} thread={thread} state={state}/>)}</details>}
  </section>
}
