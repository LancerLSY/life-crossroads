import { useEffect, useRef, useState } from 'react';
import { GitBranch, Settings, ArrowRight, Check, Download, Upload, Wifi, WifiOff, RefreshCw, X, BookOpen, Users, Play, Pause, FastForward, Wallet, Star, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import Biography from './components/Biography';
import People from './components/People';
import Story from './components/Story';
import Modal from './components/Modal';
import { ChatPanel, HistoryPanel, Relationships, Timelines } from './components/Panels';
import { BirthWelcome, BirthCertificate, SimulationDashboard, LifeEconomy, Reflection, LifeEnding } from './components/FoundationViews';
import type { SpendAction } from './components/FoundationViews';
import { applyGeneratedEvent, interact, setFocus, setIntelligence } from './game/engine.ts';
import type { Focus, GameState } from './game/types.ts';
import { advanceSimulation, createSimulation, migrate, resolveSimulationDecision, secondsPerYear, setInvestment, spend } from './simulation/core.ts';
import type { FoundationConfig, InvestmentPolicy, Simulation } from './simulation/types.ts';
import { downloadSave, forkBranch, loadSave, MAX_SAVE_BYTES, serializeSave, STORAGE_KEY, uid, updateBranch, validSave } from './lib/storage';
import type { ClockState, Snapshot } from './lib/storage';
import { interruptClock, saveClock, tickClock } from './lib/clock';
import { api, DEFAULT_STATUS, generateReply, generateTurn } from './lib/api';
import type { ApiStatus } from './lib/api';
type Tab = 'story' | 'people' | 'timelines';
type Dialog = 'setup' | 'settings' | 'history' | 'economy' | null;
const SPEEDS = [1, 2, 4, 8, 12, 16] as const;
const newClock = (): ClockState => ({ fraction: 0, speed: 1, paused: false, autoDecision: false, fastForward: false, focusWeights: {} });
export default function App() {
  const [save, setSave] = useState(loadSave);
  const active = save.branches.find(b => b.id === save.activeBranchId)!;
  const state = active.state;
  const simulation = active.simulation;
  const [clock, setClock] = useState(active.clock);
  const clockRef = useRef(clock);
  const [tab, setTab] = useState<Tab>('story');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [saved, setSaved] = useState(true);
  const [status, setStatus] = useState<ApiStatus>(DEFAULT_STATUS);
  const [statusBusy, setStatusBusy] = useState(false);
  const [token, setToken] = useState('');
  const [toast, setToast] = useState('');
  const [decisionHidden, setDecisionHidden] = useState(false);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('otherlife-dark') === 'true'; } catch { return false; } });
  const [music, setMusic] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const audioBusy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const blocked = active.stage !== 'playing' || state.ended || busy || !!dialog || !!chatId || simulation.reflectionAge !== undefined || state.currentEvent.choices.length > 0;
  const canUseModel = status.configured && state.config.intelligence > 0;
  const latestSave = useRef(save);
  useEffect(() => { latestSave.current = save; }, [save]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, serializeSave(saveClock(save, clockRef.current))); setSaved(true); } catch { setSaved(false); }
    }, 0);
    return () => clearTimeout(timer);
  }, [save]);
  useEffect(() => {
    const controller = new AbortController();
    void api<ApiStatus>('/api/status', undefined, '', controller.signal).then(setStatus).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('otherlife-dark', String(dark)); } catch { /* display still works */ }
  }, [dark]);
  useEffect(() => {
    function preserveClock() {
      const current = latestSave.current;
      const withClock = saveClock(current, clockRef.current);
      try { localStorage.setItem(STORAGE_KEY, serializeSave(withClock)); } catch { /* autosave state already retained */ }
    }
    window.addEventListener('pagehide', preserveClock);
    document.addEventListener('visibilitychange', preserveClock);
    return () => { window.removeEventListener('pagehide', preserveClock); document.removeEventListener('visibilitychange', preserveClock); };
  }, []);
  useEffect(() => {
    if (blocked || clock.paused) return;
    let previous = performance.now();
    const resetElapsed = () => { previous = performance.now(); };
    document.addEventListener('visibilitychange', resetElapsed);
    const timer = setInterval(() => {
      const now = performance.now();
      const result = tickClock(clockRef.current, (now - previous) / 1000, secondsPerYear(simulation), state.age < 6 ? 'balance' : state.focus, document.hidden || lock.current);
      previous = now;
      clockRef.current = result.clock;
      setClock(result.clock);
      if (result.elapsed) void passYear();
    }, 100);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resetElapsed); };
    // The interval reads its fractional progress from a ref; world changes restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id, state, simulation, blocked, clock.paused, clock.speed, clock.fastForward, canUseModel, token]);
  useEffect(() => {
    if (clock.autoDecision && !clock.paused && !state.ended && state.currentEvent.choices.length && !dialog && !chatId && !busy && active.stage === 'playing' && simulation.reflectionAge === undefined) {
      const choice = state.currentEvent.choices[(state.config.seed + state.turn) % state.currentEvent.choices.length];
      const timer = setTimeout(() => resolveDecision(choice.id), 700);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id, state, simulation, clock.autoDecision, clock.paused, dialog, chatId, busy, active.stage]);
  function changeClock(patch: Partial<ClockState>, persist = true) {
    const next = { ...clockRef.current, ...patch };
    clockRef.current = next; setClock(next);
    if (persist) setSave(s => ({ ...s, branches: s.branches.map(b => b.id === s.activeBranchId ? { ...b, clock: next } : b) }));
  }
  function apply(stateNext: GameState, simNext: Simulation, origin: Snapshot = { state, simulation }, fromRequest = false) {
    if ((!fromRequest && lock.current) || state.ended) return;
    setSave(s => {
      const branch = s.branches.find(b => b.id === active.id);
      // A response may only replace the exact state from which it was requested.
      if (s.activeBranchId !== active.id || branch?.state !== origin.state || branch.simulation !== origin.simulation) return s;
      return updateBranch(s, stateNext, simNext);
    });
  }
  async function passYear() {
    if (lock.current || state.ended || state.currentEvent.choices.length || simulation.reflectionAge !== undefined) return;
    lock.current = true; setBusy(true);
    const oldClock = clockRef.current;
    try {
      const result = advanceSimulation(state, simulation, undefined, oldClock.focusWeights);
      const interrupted = result.state.currentEvent.choices.length > 0 || result.simulation.reflectionAge !== undefined || result.state.ended;
      const nextClock = { ...(interrupted ? interruptClock(oldClock) : oldClock), fraction: 0, focusWeights: {} };
      clockRef.current = nextClock; setClock(nextClock);
      setSave(s => {
        const branch = s.branches.find(b => b.id === active.id);
        if (s.activeBranchId !== active.id || branch?.state !== state || branch.simulation !== simulation) return s;
        return saveClock(updateBranch(s, result.state, result.simulation, true), nextClock);
      });
      setSelected(null); setDecisionHidden(false);
      if (canUseModel && !result.state.ended && (!oldClock.fastForward || result.state.currentEvent.choices.length > 0 || state.config.intelligence >= 80)) {
        try {
          const generated = await generateTurn(result.state, token);
          const enriched = applyGeneratedEvent(result.state, generated.event, generated.worldMessages);
          apply(enriched, result.simulation, result, true);
          if (enriched.currentEvent.choices.length > 0) changeClock(interruptClock(clockRef.current));
        } catch (error) { setToast(error instanceof Error ? error.message : '世界暂时忙碌，本地故事继续。'); }
      }
    } catch (error) { changeClock({ paused: true }); setToast(error instanceof Error ? error.message : '时间暂时停下，请重试。'); }
    finally { lock.current = false; setBusy(false); }
  }
  function resolveDecision(choiceId: string) {
    if (lock.current || state.ended || simulation.reflectionAge !== undefined) return;
    try {
      const result = resolveSimulationDecision(state, simulation, choiceId);
      apply(result.state, result.simulation); setSelected(null); setDecisionHidden(false);
      changeClock({ paused: false, fastForward: false });
    } catch (error) { setToast((error as Error).message); }
  }
  async function sendMessage(text: string) {
    if (lock.current || !chatId || state.ended || state.people.find(p => p.id === chatId)?.role.endsWith('已离世')) return;
    lock.current = true; setBusy(true);
    try {
      let reply: string | undefined;
      if (canUseModel) { try { const result = await generateReply(state, chatId, text, token); if (typeof result.reply === 'string' && result.reply.trim()) reply = result.reply; } catch (error) { setToast(error instanceof Error ? error.message : '这次使用本地对话。'); } }
      const next = interact(state, chatId, text, reply);
      const living = next.people.filter(p => !p.role.endsWith('已离世'));
      const relationships = living.length ? Math.round(living.reduce((sum, p) => sum + (p.closeness + p.trust) / 2, 0) / living.length) : 20;
      const sim = { ...simulation, relationships, years: simulation.years.map(y => y.age === state.age ? { ...y, relationships, happiness: next.stats.happiness } : y) };
      apply(next, sim, { state, simulation }, true);
    } catch { setToast('这句话暂时没有送达，请稍后重试。'); }
    finally { lock.current = false; setBusy(false); }
  }
  function changeFocus(focus: Focus) { if (!lock.current && !state.ended && state.age >= 6) apply(setFocus(state, focus), simulation); }
  function changeIntelligence(value: number) { if (!lock.current && !state.ended) apply(setIntelligence(state, value), { ...simulation, config: { ...simulation.config, intelligence: value } }); }
  function newLife(config: Partial<FoundationConfig>) {
    if (lock.current) return;
    if (save.branches.length >= 8) { setToast('已保存 8 条时间线，请先导出存档保留故事。'); return; }
    const outgoingClock = clockRef.current;
    const result = createSimulation(config); const id = uid(); const nextClock = { ...newClock(), paused: true };
    setSave(s => ({ ...s, activeBranchId: id, branches: [...saveClock(s, outgoingClock).branches.filter(b => b.stage !== 'setup'), { id, name: `${result.state.config.name}的一生`, createdAt: new Date().toISOString(), ...result, snapshots: [], stage: 'certificate', clock: nextClock }] }));
    clockRef.current = nextClock; setClock(nextClock); setSelected(null); setDialog(null); setChatId(null); setTab('story');
  }
  function beginLife() { changeClock({ paused: false }); setSave(s => ({ ...s, branches: s.branches.map(b => b.id === s.activeBranchId ? { ...b, stage: 'playing' } : b) })); }
  function switchBranch(id: string) {
    if (lock.current) return;
    const preserved = saveClock(save, clockRef.current);
    const branch = preserved.branches.find(b => b.id === id);
    if (!branch) return;
    const nextClock = { ...branch.clock, paused: true, fastForward: false };
    setSave(saveClock({ ...preserved, activeBranchId: id }, nextClock));
    clockRef.current = nextClock; setClock(nextClock); setSelected(null); setChatId(null); setDecisionHidden(false);
  }
  function fork(snapshot: Snapshot) { if (lock.current) return; try { const forked = forkBranch(saveClock(save, clockRef.current), snapshot); setSave(forked); const c = forked.branches.at(-1)!.clock; clockRef.current = c; setClock(c); setSelected(null); setTab('story'); setDecisionHidden(false); setToast(`已回到 ${snapshot.state.year} 年，原来的故事仍然保留。`); } catch (error) { setToast((error as Error).message); } }
  async function importSave(file?: File) {
    if (!file || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (file.size > MAX_SAVE_BYTES) throw new Error('请选择 4 MB 以内的游戏存档。');
      const parsed: unknown = JSON.parse(await file.text());
      if (!validSave(parsed)) throw new Error('无法识别这个存档，请选择「人生岔路」导出的 JSON 文件。');
      const c = { ...parsed.branches.find(b => b.id === parsed.activeBranchId)!.clock, paused: true, fastForward: false };
      setSave(saveClock(parsed, c)); clockRef.current = c; setClock(c);
      setSelected(null); setDecisionHidden(false); setChatId(null); setDialog(null); setTab('story'); setToast('存档已载入，欢迎回到你的故事。');
    } catch (error) { setToast(error instanceof Error ? error.message : '存档载入失败。'); }
    finally { lock.current = false; setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  function saveNote(text: string) { if (lock.current || simulation.reflectionAge === undefined || state.ended) return; const next = { ...simulation, notes: [...simulation.notes, { age: state.age, text: text.trim().slice(0, 200) }] }; delete next.reflectionAge; apply(state, next); }
  function economicAction(action: SpendAction, amount?: number) { if (lock.current || state.ended) return; try { const result = spend(simulation, state, action, amount); apply(result.state, result.simulation); setToast('这笔安排已记入家庭账本。'); } catch (error) { setToast((error as Error).message); } }
  function policy(value: InvestmentPolicy) { if (lock.current || state.ended) return; try { apply(state, setInvestment(simulation, value)); } catch (error) { setToast((error as Error).message); } }
  function move(countryId: string) { if (lock.current || state.ended) return; try { const result = migrate(state, simulation, countryId); apply(result.state, result.simulation); setToast('新的生活，开始了。'); } catch (error) { setToast((error as Error).message); } }
  async function refreshStatus() { setStatusBusy(true); try { setStatus(await api<ApiStatus>('/api/status')); setToast('连接状态已更新。'); } catch { setStatus(DEFAULT_STATUS); setToast('服务端暂未连接，本地故事仍可继续。'); } finally { setStatusBusy(false); } }
  function exportSave() { try { const withClock = saveClock(save, clockRef.current); downloadSave(withClock); } catch (error) { setToast((error as Error).message); } }
  function shareCard() {
    const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
    const lines = [state.ended ? '人生回响' : '出生登记', state.config.name, `${simulation.birth.countryName} · ${simulation.birth.sex}`, `${state.config.birthYear} — ${state.ended ? state.year : '未完待续'}`, state.ended ? `${state.age} 岁 · ${simulation.cause}` : `${simulation.birth.urban ? '城市' : '乡村'} · ${simulation.birth.familyClass}`, '人生岔路 · OTHERLIFE'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="820"><rect width="640" height="820" fill="#f5f6f0"/><rect x="30" y="30" width="580" height="760" rx="12" fill="none" stroke="#a4b497"/>${lines.map((t, i) => `<text x="320" y="${145 + i * 100}" text-anchor="middle" font-family="serif" font-size="${i === 1 ? 40 : 23}" fill="#536b50">${escape(t)}</text>`).join('')}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); const link = document.createElement('a'); link.href = url; link.download = `人生岔路-${state.config.name}.svg`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => () => {
    const context = audio.current;
    audio.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }, []);
  async function toggleMusic() {
    if (audioBusy.current) return;
    audioBusy.current = true;
    try {
      if (audio.current) {
        await audio.current.close(); audio.current = null; setMusic(false); return;
      }
      const context = new AudioContext(); audio.current = context;
      const gain = context.createGain(); gain.gain.value = .025; gain.connect(context.destination);
      [174.61, 220, 261.63].forEach(f => { const osc = context.createOscillator(); osc.type = 'sine'; osc.frequency.value = f; osc.connect(gain); osc.start(); });
      await context.resume();
      if (audio.current === context) setMusic(true);
    } catch {
      const context = audio.current; audio.current = null; setMusic(false);
      if (context && context.state !== 'closed') await context.close().catch(() => {});
      setToast('浏览器暂时无法播放环境音，可以稍后再试。');
    } finally { audioBusy.current = false; }
  }
  useEffect(() => {
    function selectWithKeyboard(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || lock.current || dialog || chatId || decisionHidden || tab !== 'story' || active.stage !== 'playing' || state.ended || simulation.reflectionAge !== undefined) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select, button, a'))) return;
      const index = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : /^[a-f]$/i.test(event.key) ? event.key.toLowerCase().charCodeAt(0) - 97 : -1;
      const choice = state.currentEvent.choices[index];
      if (choice) { event.preventDefault(); setSelected(choice.id); }
    }
    window.addEventListener('keydown', selectWithKeyboard);
    return () => window.removeEventListener('keydown', selectWithKeyboard);
  }, [active.stage, chatId, decisionHidden, dialog, simulation.reflectionAge, state, tab]);
  const header = <header className="app-header"><a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('story'); }} aria-label="人生岔路首页"><svg className="brand-mark" viewBox="0 0 54 48" fill="none" aria-hidden="true"><path d="M8 42C14 33 13 26 24 24C36 22 42 17 45 6M19 28C20 16 23 13 29 8M25 24C34 25 39 29 47 34M24 17L22 9M39 19L47 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="42" r="2" fill="currentColor"/></svg><span><strong>人生岔路</strong><small>O T H E R L I F E</small></span></a><nav className="main-nav" aria-label="主要导航"><button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}><BookOpen size={15}/><span>我的这一生</span></button><button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}><Users size={15}/><span>人际关系</span></button><button className={tab === 'timelines' ? 'active' : ''} onClick={() => setTab('timelines')}><GitBranch size={15}/><span>时间分支</span></button></nav><div className="header-actions"><button className="settings-button" onClick={() => setDialog('settings')} aria-label="游戏设置"><Settings size={18}/><span>设置</span></button><button className="primary-button new-life-button" disabled={busy} onClick={() => setDialog('setup')}>新的一生<ArrowRight size={16}/></button></div></header>;
  return <div className="app-shell">{header}{active.stage === 'setup' ? <BirthWelcome onCreate={newLife} onSettings={() => setDialog('settings')} hasSaved={save.branches.some(b => b.stage === 'playing')} onResume={() => switchBranch(save.branches.find(b => b.stage === 'playing')!.id)}/> : active.stage === 'certificate' ? <BirthCertificate state={state} simulation={simulation} onBegin={beginLife} onShare={shareCard}/> : <><div className="time-toolbar"><button className="secondary-button" onClick={() => changeClock({ paused: !clock.paused, fastForward: false })} disabled={busy || state.ended}>{clock.paused ? <Play size={14}/> : <Pause size={14}/>} {clock.paused ? '继续' : '暂停'}</button><div className="speed-controls" aria-label="时间速度">{SPEEDS.map(speed => <button key={speed} disabled={busy || state.ended} aria-pressed={clock.speed === speed} className={clock.speed === speed ? 'selected' : ''} onClick={() => changeClock({ speed, paused: false, fastForward: false })}>{speed}×</button>)}</div><button className={`fast-forward ${clock.fastForward ? 'selected' : ''}`} onClick={() => changeClock({ fastForward: !clock.fastForward, paused: false })} disabled={busy || state.ended || state.currentEvent.choices.length > 0}><FastForward size={14}/>下个抉择</button><label className="auto-toggle"><input type="checkbox" checked={clock.autoDecision} disabled={busy || state.ended} onChange={e => changeClock({ autoDecision: e.target.checked })}/>自动抉择</label><button className="text-button" disabled={busy} onClick={() => setDialog('economy')}><Wallet size={14}/>家人与生活 · 花钱</button><span className="clock-state">{state.ended ? '此生已珍藏' : state.currentEvent.choices.length ? '时间停下，等待你的选择' : busy ? '世界正在思考' : clock.paused ? '时间已暂停' : `${Math.floor(clock.fraction * 100)}% · 一年约 ${Math.round(secondsPerYear(simulation))} 秒`}</span><div className="year-progress" style={{ width: `${clock.fraction * 100}%` }}/></div><div className="game-layout"><Biography state={state} onFocus={changeFocus} onTimeline={() => setTab('timelines')} disabled={busy || state.ended} relationships={simulation.relationships}/><div className="center-flow">{tab === 'story' ? state.ended ? <LifeEnding state={state} simulation={simulation} onNew={() => setDialog('setup')} onHistory={() => setDialog('history')} onShare={shareCard}/> : <><div className="decision-controls">{state.currentEvent.choices.length > 0 && <button className="text-button" onClick={() => setDecisionHidden(!decisionHidden)}>{decisionHidden ? '有一个抉择等着你 · 重新展开' : '先收起抉择'}</button>}</div>{decisionHidden ? <div className="decision-peek"><GitBranch size={27}/><h2>{state.currentEvent.title}</h2><p>时间会等你，准备好再做选择。</p><button className="primary-button" onClick={() => setDecisionHidden(false)}>重新展开</button></div> : <Story key={state.currentEvent.id} state={state} selected={selected} onSelect={setSelected} onAdvance={() => state.currentEvent.choices.length && selected ? resolveDecision(selected) : changeClock({ fastForward: true, paused: false })} onHistory={() => setDialog('history')} onNew={() => setDialog('setup')} busy={busy} saved={saved} configured={status.configured}/>}<div className="record-preview"><div className="section-heading"><h2>人生纪录</h2><span>新近的记忆</span></div>{[...state.history].slice(-4).reverse().map(e => <button key={e.id} disabled={busy} className={`record-row ${simulation.starred.includes(e.id) ? 'starred' : ''}`} onClick={() => apply(state, { ...simulation, starred: simulation.starred.includes(e.id) ? simulation.starred.filter(id => id !== e.id) : [...simulation.starred, e.id] })}><span>{e.age} 岁<small>{e.year}</small></span><strong>{e.title}</strong><Star size={13} fill={simulation.starred.includes(e.id) ? 'currentColor' : 'none'}/></button>)}{state.history.length === 0 && <p className="empty-copy">一生的第一行，才刚刚写下。</p>}<button className="text-button" onClick={() => setDialog('history')}>查看完整人生纪录<ArrowRight size={12}/></button></div></> : tab === 'people' ? <Relationships state={state} onChat={setChatId}/> : <Timelines save={save} active={active} onSwitch={switchBranch} onFork={fork} disabled={busy}/>}<SimulationDashboard state={state} simulation={simulation}/></div><People state={state} onChat={setChatId} onRelations={() => setTab('people')} onIntelligence={changeIntelligence} disabled={busy || state.ended} configured={status.configured}/></div></>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}><X size={15}/></button></div>}
    {dialog === 'setup' && <Modal title="新的一生" subtitle="从零岁开始，世界替你抽出最初的那张牌。" wide onClose={() => setDialog(null)}><BirthWelcome onCreate={newLife} onSettings={() => setDialog('settings')} hasSaved onResume={() => setDialog(null)}/></Modal>}
    {dialog === 'economy' && <Modal title="家人与生活" subtitle="让每一笔选择，留在真实的账本里。" wide onClose={() => setDialog(null)}><fieldset disabled={busy || state.ended} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><LifeEconomy state={state} simulation={simulation} onAction={economicAction} onPolicy={policy} onMigrate={move}/></fieldset></Modal>}
    {dialog === 'history' && <Modal title="人生手记" subtitle={`${state.config.name} · ${state.config.birthYear} — ${state.year}`} wide onClose={() => setDialog(null)}><HistoryPanel state={state}/>{simulation.notes.filter(n => n.text).map(n => <p className="reflection-saved" key={n.age}>{n.age} 岁的我：{n.text}</p>)}</Modal>}
    {simulation.reflectionAge !== undefined && !dialog && !chatId && !busy && <Modal title="暂停片刻" subtitle="把这段人生，和自己的生活放在一起想一想。" onClose={() => saveNote('')}><Reflection age={simulation.reflectionAge} onSave={saveNote}/></Modal>}
    {chatId && <Modal title={state.age < 6 ? '家人在你身边说的话' : '把话说给重要的人听'} subtitle={`${state.year} 年 · 对话会留在共同记忆里`} onClose={() => setChatId(null)}><ChatPanel key={chatId} state={state} personId={chatId} busy={busy} configured={status.configured} onSend={sendMessage}/></Modal>}
    {dialog === 'settings' && <Modal title="世界的设定" subtitle="让故事按照你喜欢的节奏生长。" onClose={() => setDialog(null)}><div className="settings-content"><div className={`connection-box ${status.configured ? 'connected' : ''}`}>{status.configured ? <Wifi size={22}/> : <WifiOff size={22}/>}<div><strong>{status.configured ? 'DeepSeek 已连接' : '正在本地世界中'}</strong><p>{status.configured ? `当前模型 · ${status.model}` : '完整人生可直接游玩，连接模型后开启自由叙事。'}</p></div><button className="icon-button" disabled={statusBusy} onClick={() => void refreshStatus()} aria-label="刷新连接状态"><RefreshCw size={16} className={statusBusy ? 'spin' : ''}/></button></div>{!status.configured && <div className="api-help"><p>服务端配置 <code>DEEPSEEK_API_KEY</code> 并重启后，点击刷新。</p><p>密钥只保留在服务端。</p></div>}{status.requiresAccessToken && <label className="form-label">站点访问口令<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="部署者设置的访问口令"/><small>仅在本次页面会话中使用。</small></label>}<section className="setting-section"><div className="section-heading"><h3>世界智能</h3><strong>{state.config.intelligence} / 100</strong></div><input aria-label="设置世界智能" type="range" min="0" max="100" step="10" value={state.config.intelligence} disabled={busy || state.ended} onChange={e => changeIntelligence(Number(e.target.value))}/><div className="range-captions"><span>0 · 本地叙事</span><span>50 · 丰富世界</span><span>100 · 自由涌现</span></div><p>控制事件发散程度、人物发言和故事交织。快转时优先在关键抉择处生成；80 以上也生成途中故事。</p></section><section className="setting-section setting-toggles"><button className="secondary-button" onClick={() => setDark(!dark)}>{dark ? <Sun size={15}/> : <Moon size={15}/>} {dark ? '浅色画面' : '深色画面'}</button><button className="secondary-button" onClick={() => void toggleMusic()}>{music ? <VolumeX size={15}/> : <Volume2 size={15}/>} {music ? '关闭环境音' : '轻柔环境音'}</button><label><input type="checkbox" checked={simulation.config.softMode} disabled={busy || state.ended} onChange={e => apply(state, { ...simulation, config: { ...simulation.config, softMode: e.target.checked } })}/>温和叙事</label></section><section className="setting-section"><div className="section-heading"><h3>珍藏你的故事</h3><span>{saved ? <><Check size={12}/>已自动保存</> : '自动保存不可用'}</span></div><p>人生、时钟和分支保存在浏览器；载入会替换本地存档，请先导出。</p><div className="save-actions"><button className="secondary-button" onClick={exportSave}><Download size={15}/>导出存档</button><button className="secondary-button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15}/>载入存档</button></div></section><p className="settings-note">原创模拟模型；统计数据来自 WDI 与官方补充资料。代理值、历史插值和未来情景详见项目数据说明。人物和事件为虚构。</p></div></Modal>}
    <input className="visually-hidden" aria-label="选择游戏存档" ref={fileInput} type="file" accept=".json,application/json" disabled={busy} onChange={e => void importSave(e.target.files?.[0])}/>
  </div>;
}
