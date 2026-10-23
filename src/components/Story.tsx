import { Check, Sparkles } from 'lucide-react';
import type { Focus, GameState } from '../game/types.ts';
import type { Simulation } from '../simulation/types.ts';
import { FOCUS_OPTIONS } from '../game/engine.ts';
import PixelScene from './PixelScene';
export default function Story({ state, simulation, onChoose, onFocus, onChat, busy, saved, configured, hidden, onToggle }: {
  state: GameState; simulation: Simulation; onChoose: (id: string) => void;
  onFocus: (focus: Focus) => void; onChat: (id: string) => void; busy: boolean; saved: boolean; configured: boolean;
  hidden: boolean; onToggle: () => void;
}) {
  const event = state.currentEvent;
  return <main className="story-column">
    <section className="scene-panel panel"><PixelScene state={state} simulation={simulation} onPersonClick={onChat} showCaption/></section>
    <section className="focus-panel panel"><div className="section-heading"><h3>今年的重心</h3><span>{simulation.occupation}</span></div>
      {state.age < 6 ? <div className="child-focus-note"><p>{state.age < 1 ? '还是个婴儿，正由家人照顾。' : '童年的小事，正在慢慢塑造你的性格。'} 从六岁起，可以选择每一年的生活重心。</p><p>可以调整速度，或快转到下一个抉择。</p></div> : <div className="focus-options">{FOCUS_OPTIONS.map(f => <button key={f.id} title={f.description} disabled={busy} className={state.focus === f.id ? 'selected' : ''} aria-pressed={state.focus === f.id} onClick={() => onFocus(f.id)}>{state.age < 13 ? ({ balance: '兴趣休息', study: '用心学习', career: '帮忙家事', social: '朋友玩耍', health: '多多运动' }[f.id]) : state.age < 18 && f.id === 'career' ? '课余实践' : f.label}</button>)}</div>}
    </section>
    {event.choices.length > 0 && <section className={`story-event panel ${hidden ? 'decision-minimized' : ''}`}>
      <div className="decision-top"><span className="decision-label">{event.source === 'deepseek' ? <><Sparkles size={12}/> AI 抉择</> : '重大抉择'}</span><span>{state.age} 岁 · {state.year} 年</span><button className="text-button" onClick={onToggle}>{hidden ? '重新展开' : '先收起来'}</button></div>
      <h2>{event.title}</h2>
      {hidden ? <p className="muted">时间已停下，准备好后再选择。</p> : <><p className="narrative">{event.description}</p>
        <div className="choices" aria-label="选择你的人生方向">{event.choices.map((c, i) => <button key={c.id} disabled={busy} className="choice" onClick={() => onChoose(c.id)}><span className="choice-letter">{i + 1}</span><span className="choice-copy"><strong>{c.label}</strong><small>{c.hint}</small></span></button>)}</div>
        <p className="muted">点击选项，决定就会在当年生效。</p>
      </>}
    </section>}
    <div className="story-bottom"><span className="save-label"><Check size={12}/>{saved ? '已保存' : '存档暂未保存'}</span><span><i className={`status-dot ${configured ? 'connected' : ''}`}/>{configured ? state.config.intelligence ? 'DeepSeek 已连接' : '本地叙事' : '本地世界'}</span>{busy && <span>世界正在思考…</span>}</div>
  </main>;
}
