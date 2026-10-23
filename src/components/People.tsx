import { MessageCircle, ChevronRight, Sparkles } from 'lucide-react';
import type { GameState, Person } from '../game/types.ts';
import PixelPortrait from './PixelPortrait';
export function Avatar({ person, small = false }: { person: Person; small?: boolean }) {
  return <PixelPortrait name={person.name} age={person.age} role={person.role} size={small ? 24 : 32}/>;
}
export default function People({ state, onChat, onRelations, onIntelligence, disabled, configured }: {
  state: GameState; onChat: (id: string) => void; onRelations: () => void; onIntelligence: (n: number) => void; disabled: boolean; configured: boolean;
}) {
  const household = state.people.filter(p => /母亲|父亲|姐姐|哥哥|伴侣|孩子|女儿|儿子/.test(p.role));
  const people = household.length ? household : state.people;
  return <aside className="people-rail"><section className="family-panel panel"><div className="section-heading"><h3>家人与生活</h3><button className="text-button" onClick={onRelations}>全部关系<ChevronRight size={12}/></button></div>
      <div className="person-list">{people.slice(0, 8).map(p => <button className={`person-row ${p.role.endsWith('已离世') ? 'departed' : ''}`} key={p.id} onClick={() => onChat(p.id)} aria-label={`与${p.name}对话`}><Avatar person={p}/><span className="person-info"><span className="person-name"><small>{p.role}</small><strong>{p.name} · {p.age} 岁</strong></span><span className="person-mood">{p.mood} · 亲密 {Math.round(p.closeness)}</span></span><MessageCircle size={14} className="person-message-icon"/></button>)}</div>
    </section>
    <details className="world-section panel" open><summary>身边的声音<span>NPC 互动</span></summary><div className="world-feed" aria-live="polite">{state.worldMessages.slice(-3).reverse().map(m => {
      const person = state.people.find(p => p.name === m.speaker || p.id === m.speaker);
      return <article className="world-message" key={m.id}>{person && <Avatar person={person} small/>}<div><header><strong>{person?.name ?? m.speaker}</strong><span>{m.year} 年{m.target ? ` · 对${state.people.find(p => p.id === m.target)?.name ?? m.target}说` : ''}</span></header><p>{m.text}</p></div></article>;
    })}{state.worldMessages.length === 0 && <p className="empty-copy">他们的故事，也会随着时间继续。</p>}</div></details>
    <section className="intelligence-control panel"><div><Sparkles size={14}/><label htmlFor="world-intelligence">世界智能</label><strong>{state.config.intelligence}<span> / 100</span></strong></div><input id="world-intelligence" type="range" min="0" max="100" step="10" value={state.config.intelligence} onChange={e => onIntelligence(Number(e.target.value))} disabled={disabled}/><p>{state.config.intelligence === 0 ? '本地故事，安静地往前走。' : state.config.intelligence < 40 ? '少一些波澜，多一些日常。' : state.config.intelligence < 80 ? '人物关系与行动会留下后续线索。' : '关系、消费与出行，让旧线索继续发展。'}{!configured && state.config.intelligence > 0 ? ' 当前为本地模式。' : ''}</p></section>
  </aside>;
}
