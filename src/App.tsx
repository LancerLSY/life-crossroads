import { useEffect, useRef, useState } from 'react';
import { GitBranch, Settings, ArrowRight, Check, Download, Wifi, WifiOff, RefreshCw, X, BookOpen, Users, Play, Pause, FastForward, Wallet, Star, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import Biography from './components/Biography';
import People from './components/People';
import Story from './components/Story';
import WorldThreads from './components/WorldThreads';
import Modal from './components/Modal';
import SavePanel from './components/SavePanel';
import type { ImportMode } from './components/SavePanel';
import { ChatPanel, HistoryPanel, Relationships, Timelines } from './components/Panels';
import { BirthCertificate, SimulationDashboard, LifeEconomy, Reflection, LifeEnding } from './components/FoundationViews';
import { BirthWelcome, BirthReveal } from './components/BirthDraw';
import { createBirthDraw } from './simulation/birthDraw.ts';
import { crisisActive } from './simulation/myanmar.ts';
import type { SpendAction } from './components/FoundationViews';
import { applyGeneratedEvent, interact, performRelationshipAction, setFocus, setIntelligence } from './game/engine.ts';
import { evolveWorld } from './game/world.ts';
import type { ChatReaction, Focus, GameState, RelationshipAction } from './game/types.ts';
import { advanceSimulation, migrate, resolveSimulationDecision, secondsPerYear, setInvestment, spend } from './simulation/core.ts';
import type { FoundationConfig, InvestmentPolicy, Simulation } from './simulation/types.ts';
import { downloadSave, forkBranch, loadSave, MAX_BRANCHES, mergeSave, renameBranch, serializeSave, STORAGE_KEY, uid, updateBranch } from './lib/storage';
import type { ClockState, SaveFile, Snapshot } from './lib/storage';
import { interruptClock, saveClock, tickClock } from './lib/clock';
import { deriveSceneModel, renderScene } from './pixel/scene.ts';
import { api, DEFAULT_STATUS, generateReply, generateTurn } from './lib/api';
import type { ApiStatus } from './lib/api';
type Tab = 'story' | 'people' | 'timelines';
type Dialog = 'setup' | 'settings' | 'history' | 'economy' | 'save' | null;
const SPEEDS = [1, 2, 4, 8, 12, 16] as const;
const newClock = (): ClockState => ({ fraction: 0, speed: 1, paused: false, autoDecision: false, fastForward: false, focusWeights: {} });
export default function App() {
  const [save, setSave] = useState(loadSave);
  const active = save.branches.find(b => b.id === save.activeBranchId)!;
  const state = active.state;
  const simulation = active.simulation;
  const inCrisis = crisisActive(simulation);
  const [clock, setClock] = useState(active.clock);
  const clockRef = useRef(clock);
  const [tab, setTab] = useState<Tab>('story');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [birthDrawId, setBirthDrawId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
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
  const blocked = inCrisis || active.stage !== 'playing' || state.ended || busy || !!dialog || !!chatId || simulation.reflectionAge !== undefined || state.currentEvent.choices.length > 0;
  const canUseModel = status.configured && state.config.intelligence > 0 && !inCrisis;
  const latestSave = useRef(save);
  useEffect(() => { latestSave.current = save; }, [save]);
  useEffect(() => { window.scrollTo(0, 0); }, [active.id, active.stage, birthDrawId]);
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
    if (clock.autoDecision && !inCrisis && !clock.paused && !state.ended && state.currentEvent.choices.length && !dialog && !chatId && !busy && active.stage === 'playing' && simulation.reflectionAge === undefined) {
      const choice = state.currentEvent.choices[(state.config.seed + state.turn) % state.currentEvent.choices.length];
      const timer = setTimeout(() => resolveDecision(choice.id), 700);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id, state, simulation, clock.autoDecision, clock.paused, dialog, chatId, busy, active.stage, inCrisis]);
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
    if (lock.current || inCrisis || state.ended || state.currentEvent.choices.length || simulation.reflectionAge !== undefined) return;
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
      setDecisionHidden(false);
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
    if (lock.current || state.ended || (simulation.reflectionAge !== undefined && !inCrisis)) return;
    try {
      const result = resolveSimulationDecision(state, simulation, choiceId);
      apply(result.state, result.simulation); setDecisionHidden(false);
      changeClock({ paused: inCrisis || result.state.ended, fastForward: false });
    } catch (error) { setToast((error as Error).message); }
  }
  async function sendMessage(text: string) {
    if (lock.current || inCrisis || !chatId || state.ended || state.people.find(p => p.id === chatId)?.role.endsWith('已离世')) return;
    lock.current = true; setBusy(true);
    try {
      let reply: string | undefined;
      let reaction: ChatReaction | undefined;
      if (canUseModel) { try { const result = await generateReply(state, chatId, text, token); if (typeof result.reply === 'string' && result.reply.trim()) reply = result.reply; reaction = result.reaction; } catch (error) { setToast(error instanceof Error ? error.message : '这次使用本地对话。'); } }
      syncRelationship(interact(state, chatId, text, reply, reaction), true);
    } catch { setToast('这句话暂时没有送达，请稍后重试。'); }
    finally { lock.current = false; setBusy(false); }
  }
  function syncRelationship(next: GameState, fromRequest = false) {
    const living = next.people.filter(person => !person.role.endsWith('已离世'));
    const relationships = living.length ? Math.round(living.reduce((sum, person) => sum + (person.closeness + person.trust) / 2, 0) / living.length) : 20;
    apply(next, { ...simulation, relationships, years: simulation.years.map(year => year.age === state.age ? { ...year, relationships, happiness: next.stats.happiness } : year) }, { state, simulation }, fromRequest);
  }
  function relationshipAction(action: RelationshipAction) {
    if (lock.current || inCrisis || !chatId || state.ended) return;
    try { syncRelationship(performRelationshipAction(state, chatId, action)); }
    catch (error) { setToast(error instanceof Error ? error.message : '这次行动暂时没有完成。'); }
  }
  function changeFocus(focus: Focus) { if (!lock.current && !inCrisis && !state.ended && state.age >= 6) apply(setFocus(state, focus), simulation); }
  function changeIntelligence(value: number) { if (!lock.current && !inCrisis && !state.ended) apply(evolveWorld(setIntelligence(state, value)), { ...simulation, config: { ...simulation.config, intelligence: value } }); }
  function newLife(config: Partial<FoundationConfig>): boolean {
    if (lock.current) return false;
    const preserved = saveClock(save, clockRef.current);
    const existing = preserved.branches.filter(branch => branch.stage !== 'setup');
    if (existing.length >= MAX_BRANCHES) { setToast('已保存 8 条时间线。请先在备份与载入中保留现有故事。'); return false; }
    try {
      const result = createBirthDraw(config); const id = uid(); const nextClock = { ...newClock(), paused: true };
      const next: SaveFile = { version: 2, activeBranchId: id, branches: [...existing, { id, name: `${result.state.config.name}的一生`, createdAt: new Date().toISOString(), ...result, snapshots: [], stage: 'certificate', clock: nextClock }] };
      // Commit the draw before its reveal: skip and refresh always retain this outcome.
      try { localStorage.setItem(STORAGE_KEY, serializeSave(next)); setSaved(true); }
      catch { setSaved(false); setToast('抽签结果已生成，但浏览器无法保存。请先备份这一生再关闭页面。'); }
      setSave(next); setBirthDrawId(id);
      clockRef.current = nextClock; setClock(nextClock); setDialog(null); setChatId(null); setTab('story');
      return true;
    } catch (error) { setToast(error instanceof Error ? error.message : '抽签暂时没有完成，请再试一次。'); return false; }
  }
  function beginLife() { changeClock({ paused: false }); setSave(s => ({ ...s, branches: s.branches.map(b => b.id === s.activeBranchId ? { ...b, stage: 'playing' } : b) })); }
  function switchBranch(id: string) {
    if (lock.current) return;
    setBirthDrawId(null);
    const preserved = saveClock(save, clockRef.current);
    const branch = preserved.branches.find(b => b.id === id);
    if (!branch) return;
    const nextClock = { ...branch.clock, paused: true, fastForward: false };
    setSave(saveClock({ ...preserved, activeBranchId: id }, nextClock));
    clockRef.current = nextClock; setClock(nextClock); setChatId(null); setDecisionHidden(false);
  }
  function fork(snapshot: Snapshot) { if (lock.current) return; try { const forked = forkBranch(saveClock(save, clockRef.current), snapshot); setSave(forked); const c = forked.branches.at(-1)!.clock; clockRef.current = c; setClock(c); setTab('story'); setDecisionHidden(false); setToast(`已回到 ${snapshot.state.year} 年，原来的故事仍然保留。`); } catch (error) { setToast((error as Error).message); } }
  function loadBackup(incoming: SaveFile, mode: ImportMode) {
    if (lock.current) throw new Error('故事还在更新，请稍后再试。');
    const current = saveClock(save, clockRef.current);
    let loaded = mode === 'merge' ? mergeSave(current, incoming) : {
      ...incoming, branches: incoming.branches.map(branch => ({ ...branch, clock: { ...branch.clock, paused: true, fastForward: false } })),
    };
    // A new browser's setup placeholder has no timeline navigation yet.
    if (mode === 'merge' && active.stage === 'setup') {
      const importedIndex = incoming.branches.findIndex(branch => branch.id === incoming.activeBranchId);
      loaded = { ...loaded, activeBranchId: loaded.branches[current.branches.length + importedIndex].id };
    }
    serializeSave(loaded);
    const c = { ...loaded.branches.find(branch => branch.id === loaded.activeBranchId)!.clock, paused: true, fastForward: false };
    setBirthDrawId(null);
    setSave(saveClock(loaded, c)); clockRef.current = c; setClock(c);
    setDecisionHidden(false); setChatId(null); setDialog(null);
    setTab(mode === 'merge' ? 'timelines' : 'story');
    setToast(mode === 'merge' ? `已加入 ${incoming.branches.length} 条时间线，原来的人生仍然保留。` : '备份已恢复，时间暂停在你离开的地方。');
  }
  function renameTimeline(id: string, name: string) {
    if (lock.current) throw new Error('故事还在更新，请稍后再试。');
    setSave(renameBranch(saveClock(save, clockRef.current), id, name));
    setToast('时间线名称已保存。');
  }
  function saveNote(text: string) { if (lock.current || simulation.reflectionAge === undefined || state.ended) return; const next = { ...simulation, notes: [...simulation.notes, { age: state.age, text: text.trim().slice(0, 200) }] }; delete next.reflectionAge; apply(state, next); }
  function economicAction(action: SpendAction, amount?: number, destination?: string) { if (lock.current || state.ended) return; try { const result = spend(simulation, state, action, amount, destination); apply(result.state, result.simulation); if (crisisActive(result.simulation)) { setDialog(null); setChatId(null); setTab('story'); setDecisionHidden(false); changeClock({ paused: true, fastForward: false }); return; } setToast(result.state.worldThreads !== state.worldThreads ? '这笔安排已记入账本，也留下了新的世界线索。' : '这笔安排已记入家庭账本。'); } catch (error) { setToast((error as Error).message); } }
  function policy(value: InvestmentPolicy) { if (lock.current || state.ended) return; try { apply(state, setInvestment(simulation, value)); } catch (error) { setToast((error as Error).message); } }
  function move(countryId: string) { if (lock.current || state.ended) return; try { const result = migrate(state, simulation, countryId); apply(result.state, result.simulation); if (crisisActive(result.simulation)) { setDialog(null); setChatId(null); setTab('story'); setDecisionHidden(false); changeClock({ paused: true, fastForward: false }); return; } setToast('新的生活，开始了。'); } catch (error) { setToast((error as Error).message); } }
  async function refreshStatus() { setStatusBusy(true); try { setStatus(await api<ApiStatus>('/api/status')); setToast('连接状态已更新。'); } catch { setStatus(DEFAULT_STATUS); setToast('服务端暂未连接，本地故事仍可继续。'); } finally { setStatusBusy(false); } }
  function exportSave() { try { const withClock = saveClock(save, clockRef.current); downloadSave(withClock); } catch (error) { setToast((error as Error).message); } }
  function shareCard() {
    const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
    const frame = renderScene(deriveSceneModel(state, simulation));
    const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
    const context = canvas.getContext('2d');
    if (!context) { setToast('浏览器暂时无法生成人生卡。'); return; }
    context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0);
    const scene = canvas.toDataURL('image/png');
    const name = [...state.config.name].slice(0, 24).join('');
    const details = [state.ended ? `${state.age}岁 · ${simulation.cause ?? '一生的终点'}` : `${simulation.birth.urban ? '城市' : '乡村'} · ${simulation.birth.familyClass}`, simulation.education, state.ended ? '这一段人生，留在时间里。' : '未来的故事，还没有写下。'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="820"><rect width="640" height="820" fill="#EBF0ED"/><rect x="24" y="24" width="592" height="772" fill="#F7FAF8" stroke="#C7D2CE"/><rect x="24" y="24" width="592" height="40" fill="#8C1D3C"/><text x="42" y="50" font-family="sans-serif" font-size="16" fill="white">人生岔路 · ${state.ended ? '人生档案' : '出生登记'}</text><text x="320" y="148" text-anchor="middle" font-family="serif" font-size="${name.length > 16 ? 24 : 34}" fill="#13212A">${escape(name)}</text><text x="320" y="193" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#4A5A61">${escape(simulation.birth.countryName)} · ${simulation.birth.sex}</text><text x="320" y="232" text-anchor="middle" font-family="monospace" font-size="21" fill="#0F6E68">${state.config.birthYear} — ${state.ended ? state.year : '未完待续'}</text><image x="32" y="278" width="576" height="180" href="${scene}" style="image-rendering:pixelated"/>${details.map((line, index) => `<text x="320" y="${516 + index * 55}" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#4A5A61">${escape(line)}</text>`).join('')}<path d="M48 710H592" stroke="#C7D2CE" stroke-dasharray="4 4"/><text x="320" y="754" text-anchor="middle" font-family="monospace" font-size="14" fill="#5F6E72">OTHERLIFE · ONE LIFE AT A TIME</text></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = `人生岔路-${state.config.name}.svg`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      if (choice) { event.preventDefault(); resolveDecision(choice.id); }
    }
    window.addEventListener('keydown', selectWithKeyboard);
    return () => window.removeEventListener('keydown', selectWithKeyboard);
    // Rebind to the current life and event; fractional clock updates do not change the decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.stage, chatId, decisionHidden, dialog, simulation.reflectionAge, state, tab]);
  const openChat = (id: string) => { if (state.people.some(person => person.id === id)) setChatId(id); };
  const modalNotice = { notice: toast, onDismissNotice: () => setToast('') };
  const hasModal = !!dialog || !!chatId || (simulation.reflectionAge !== undefined && !busy);
  const visibleRecords = [state.currentEvent, ...[...state.history].reverse()].slice(0, 8);
  const header = <header className="app-header">
    <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('story'); }} aria-label="人生岔路首页"><span className="pixel-brand-mark" aria-hidden="true">✦</span><strong>人生岔路</strong></a>
    <span className="header-note">从随机出生开始，经历仅此一次的人生。</span>
    <div className="header-actions"><button className="settings-button" onClick={() => setDialog('settings')} aria-label="游戏设置"><Settings size={16}/><span>设置</span></button>{active.stage !== 'setup' && <button className="secondary-button" disabled={busy} onClick={() => setDialog('setup')}>新的一生</button>}</div>
  </header>;
  return <div className={`app-shell ${active.stage === 'playing' ? 'is-playing' : ''}`}>
    {active.stage !== 'playing' && !birthDrawId && header}
    {active.stage === 'setup' ? <BirthWelcome initialIntelligence={state.config.intelligence} onCreate={newLife} onSettings={() => setDialog('settings')} hasSaved={save.branches.some(b => b.stage === 'playing')} onResume={() => switchBranch(save.branches.find(b => b.stage === 'playing')!.id)}/>
      : active.stage === 'certificate' && birthDrawId === active.id ? <BirthReveal key={active.id} state={state} simulation={simulation} onComplete={() => setBirthDrawId(null)}/>
      : active.stage === 'certificate' ? <BirthCertificate state={state} simulation={simulation} onBegin={beginLife} onShare={shareCard}/>
      : <>
        <header className="time-toolbar">
          <button className="toolbar-brand" onClick={() => setTab('story')}>人生岔路</button>
          <div className="toolbar-identity"><strong>{state.age}<small>岁</small></strong><span>{state.year}年 · {state.config.name}<small>1年 ≈ {Math.round(secondsPerYear(simulation))}秒</small></span></div>
          <button className={`secondary-button play-button ${clock.paused ? 'paused' : ''}`} onClick={() => changeClock({ paused: !clock.paused, fastForward: false })} disabled={busy || state.ended || inCrisis}>{clock.paused ? <Play size={13}/> : <Pause size={13}/>} {clock.paused ? '继续' : '暂停'}</button>
          <div className="speed-controls" aria-label="时间速度">{SPEEDS.map(speed => <button key={speed} disabled={busy || state.ended || inCrisis} aria-pressed={clock.speed === speed} className={clock.speed === speed ? 'selected' : ''} onClick={() => changeClock({ speed, paused: false, fastForward: false })}>{speed}×</button>)}</div>
          <button className={`fast-forward ${clock.fastForward ? 'selected' : ''}`} onClick={() => changeClock({ fastForward: !clock.fastForward, paused: false })} disabled={busy || inCrisis || state.ended || state.currentEvent.choices.length > 0}><FastForward size={13}/>下个抉择</button>
          <label className="auto-toggle"><input type="checkbox" checked={clock.autoDecision} disabled={busy || state.ended || inCrisis} onChange={e => changeClock({ autoDecision: e.target.checked })}/>自动抉择</label>
          <button className="toolbar-action" disabled={busy || inCrisis} onClick={() => setDialog('economy')}><Wallet size={14}/>花钱</button>
          <button className="toolbar-action" onClick={() => setDialog('settings')} aria-label="游戏设置"><Settings size={15}/></button>
          <details className="toolbar-more"><summary>更多</summary><nav aria-label="主要导航" onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}><button onClick={() => setTab('story')}><BookOpen size={14}/>我的这一生</button><button onClick={() => setTab('people')}><Users size={14}/>人际关系</button><button onClick={() => setTab('timelines')}><GitBranch size={14}/>时间分支</button><button disabled={busy} onClick={() => setDialog('setup')}>新的一生</button><button onClick={() => setDialog('history')}>人生手记</button></nav></details>
          <div className="year-progress" style={{ width: `${clock.fraction * 100}%` }}/>
        </header>
        <div className="game-layout">
          <div className="left-rail"><Biography state={state} simulation={simulation} onEconomy={() => setDialog('economy')} onTimeline={() => setTab('timelines')} disabled={busy || inCrisis}/></div>
          <div className="center-flow">
            {tab === 'story' ? state.ended ? <LifeEnding state={state} simulation={simulation} onNew={() => setDialog('setup')} onHistory={() => setDialog('history')} onShare={shareCard}/>
              : <><Story key={state.currentEvent.id} state={state} simulation={simulation} onChoose={resolveDecision} onFocus={changeFocus} onChat={openChat} busy={busy} saved={saved} configured={status.configured} hidden={decisionHidden} onToggle={() => setDecisionHidden(!decisionHidden)}/>
                <WorldThreads state={state}/>
                <section className="record-preview panel"><div className="section-heading"><h2>人生纪录</h2><span>最新在前 · 点击收藏</span></div>
                  {visibleRecords.map(e => <button key={e.id} disabled={busy} className={`record-row ${simulation.starred.includes(e.id) ? 'starred' : ''}`} onClick={() => apply(state, { ...simulation, starred: simulation.starred.includes(e.id) ? simulation.starred.filter(id => id !== e.id) : [...simulation.starred, e.id] })}><span className="record-age">{e.age}岁<small>{e.year}</small></span><span className="record-content"><strong>{e.title}</strong><span className="record-description">{e.description}</span></span><Star size={13} fill={simulation.starred.includes(e.id) ? 'currentColor' : 'none'}/></button>)}
                  <button className="text-button" onClick={() => setDialog('history')}>查看更早的纪录<ArrowRight size={12}/></button>
                </section>
              </> : tab === 'people' ? <Relationships state={state} onChat={openChat}/> : <Timelines save={save} active={active} onSwitch={switchBranch} onFork={fork} onRename={renameTimeline} disabled={busy}/>}
          </div>
          <div className="right-rail"><People state={state} onChat={openChat} onRelations={() => setTab('people')} onIntelligence={changeIntelligence} disabled={busy || state.ended || inCrisis} configured={status.configured} disconnected={inCrisis}/><SimulationDashboard state={state} simulation={simulation}/></div>
        </div>
      </>}
    {toast && !hasModal && <div className="toast" role="status"><span>{toast}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}><X size={15}/></button></div>}
    {dialog === 'setup' && <Modal {...modalNotice} title="抽取新的一生" subtitle="选择年代，出生地与身份交给命运。" wide onClose={() => setDialog(null)}><BirthWelcome initialIntelligence={state.config.intelligence} onCreate={newLife} onSettings={() => setDialog('settings')} hasSaved onResume={() => setDialog(null)}/></Modal>}
    {dialog === 'economy' && <Modal {...modalNotice} title="家人与生活" subtitle="让每一笔选择，留在真实的账本里。" wide onClose={() => setDialog(null)}><fieldset disabled={busy || state.ended || inCrisis} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><LifeEconomy state={state} simulation={simulation} onAction={economicAction} onPolicy={policy} onMigrate={move}/></fieldset></Modal>}
    {dialog === 'history' && <Modal {...modalNotice} title="人生手记" subtitle={`${state.config.name} · ${state.config.birthYear} — ${state.year}`} wide onClose={() => setDialog(null)}><HistoryPanel state={state}/>{simulation.notes.filter(n => n.text).map(n => <p className="reflection-saved" key={n.age}>{n.age} 岁 · {n.kind === 'event' ? '行程记录' : '手记'}：{n.text}</p>)}</Modal>}
    {simulation.reflectionAge !== undefined && !inCrisis && !dialog && !chatId && !busy && <Modal {...modalNotice} title="暂停片刻" subtitle="把这段人生，和自己的生活放在一起想一想。" onClose={() => saveNote('')}><Reflection age={simulation.reflectionAge} onSave={saveNote}/></Modal>}
    {chatId && <Modal {...modalNotice} title={state.age < 6 ? '家人在你身边说的话' : '把话说给重要的人听'} subtitle={`${state.year} 年 · 对话会留在共同记忆里`} onClose={() => setChatId(null)}><ChatPanel key={chatId} state={state} personId={chatId} busy={busy} configured={status.configured} onSend={sendMessage} onAction={relationshipAction} blocked={inCrisis}/></Modal>}
    {dialog === 'settings' && <Modal {...modalNotice} title="世界的设定" subtitle="让故事按照你喜欢的节奏生长。" onClose={() => setDialog(null)}><div className="settings-content"><div className={`connection-box ${status.configured ? 'connected' : ''}`}>{status.configured ? <Wifi size={22}/> : <WifiOff size={22}/>}<div><strong>{status.configured ? 'DeepSeek 已连接' : '正在本地世界中'}</strong><p>{status.configured ? `当前模型 · ${status.model}` : '完整人生可直接游玩，连接模型后开启自由叙事。'}</p></div><button className="icon-button" disabled={statusBusy} onClick={() => void refreshStatus()} aria-label="刷新连接状态"><RefreshCw size={16} className={statusBusy ? 'spin' : ''}/></button></div>{!status.configured && <div className="api-help"><p>服务端配置 <code>DEEPSEEK_API_KEY</code> 并重启后，点击刷新。</p><p>密钥只保留在服务端。</p></div>}{status.requiresAccessToken && <label className="form-label">站点访问口令<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="部署者设置的访问口令"/><small>仅在本次页面会话中使用。</small></label>}<section className="setting-section"><div className="section-heading"><h3>世界智能</h3><strong>{state.config.intelligence} / 100</strong></div><input aria-label="设置世界智能" type="range" min="0" max="100" step="10" value={state.config.intelligence} disabled={busy || state.ended || inCrisis} onChange={e => changeIntelligence(Number(e.target.value))}/><div className="range-captions"><span>0 · 本地叙事</span><span>50 · 丰富世界</span><span>100 · 自由涌现</span></div><p>影响人物主动性、关系的连锁反应和世界线索的发展。消费、旅行与迁居也会留下后续；80 以上还会生成途中故事。</p></section><section className="setting-section setting-toggles"><button className="secondary-button" onClick={() => setDark(!dark)}>{dark ? <Sun size={15}/> : <Moon size={15}/>} {dark ? '浅色画面' : '深色画面'}</button><button className="secondary-button" onClick={() => void toggleMusic()}>{music ? <VolumeX size={15}/> : <Volume2 size={15}/>} {music ? '关闭环境音' : '轻柔环境音'}</button><label><input type="checkbox" checked={simulation.config.softMode} disabled={busy || state.ended || inCrisis} onChange={e => apply(state, { ...simulation, config: { ...simulation.config, softMode: e.target.checked } })}/>温和叙事</label></section><section className="setting-section"><div className="section-heading"><h3>珍藏你的故事</h3><span>{saved ? <><Check size={12}/>已自动保存</> : '自动保存不可用'}</span></div><p>备份全部人生，或预览另一份存档后加入时间线。</p><div className="save-actions"><button className="secondary-button" onClick={exportSave}><Download size={15}/>导出存档</button><button className="secondary-button" disabled={busy} onClick={() => { setToast(''); setDialog('save'); }}><GitBranch size={15}/>备份与载入</button></div></section><p className="settings-note">原创模拟模型；统计数据来自 WDI 与官方补充资料。代理值、历史插值和未来情景详见项目数据说明。人物和事件为虚构。</p></div></Modal>}
    {dialog === 'save' && <Modal {...modalNotice} title="珍藏你的故事" subtitle="每一条时间线，都可以好好保留。" onClose={() => setDialog(null)}><SavePanel count={save.branches.length} saved={saved} getSave={() => saveClock(save, clockRef.current)} onLoad={loadBackup}/></Modal>}
  </div>;
}
