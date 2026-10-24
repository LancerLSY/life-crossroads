import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Upload } from 'lucide-react';
import { downloadSave, MAX_BRANCHES, MAX_SAVE_BYTES, parseSave, serializeSave } from '../lib/storage';
import type { Branch, SaveFile } from '../lib/storage';

export type ImportMode = 'merge' | 'replace';
export default function SavePanel({ count, saved, branches, activeBranchId, getSave, onLoad, onRemove }: {
  count: number; saved: boolean; getSave: () => SaveFile;
  branches: Branch[]; activeBranchId: string; onRemove: (id: string) => void;
  onLoad: (incoming: SaveFile, mode: ImportMode) => void;
}) {
  const [backup, setBackup] = useState('');
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<SaveFile | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmed, setConfirmed] = useState(false);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removalBackedUp, setRemovalBackedUp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLTextAreaElement>(null);
  const pasteDetails = useRef<HTMLDetailsElement>(null);
  const removeHeading = useRef<HTMLHeadingElement>(null);
  const timelinesHeading = useRef<HTMLHeadingElement>(null);
  const removalTrigger = useRef<HTMLButtonElement | null>(null);
  const canMerge = !!preview && count + preview.branches.length <= MAX_BRANCHES;
  const parentIds = new Set(branches.flatMap(branch => branch.parentId ? [branch.parentId] : []));
  const removingBranch = branches.find(branch => branch.id === removeId);
  const canRemove = !!removingBranch && branches.length > 1 && !parentIds.has(removingBranch.id);

  useEffect(() => { if (removeId) removeHeading.current?.focus(); }, [removeId]);

  function fail(reason: unknown) { setError(reason instanceof Error ? reason.message : '暂时无法读取这份备份。'); }
  function makeBackup(download: boolean) {
    setError(''); setMessage('');
    try {
      const current = getSave();
      if (download) {
        downloadSave(current);
        setMessage('已发起下载。也可以展开文本备份，手动复制保存。');
      } else {
        setBackup(serializeSave(current));
        setMessage('文本包含当前全部人生，可以复制到文本文件中保存。');
      }
    } catch (reason) { fail(reason); }
  }
  async function copyBackup() {
    setError('');
    try { await navigator.clipboard.writeText(backup); setMessage('备份文本已复制。'); }
    catch { backupInput.current?.select(); setMessage('已选中备份文本，请使用系统的复制操作。'); }
  }
  function inspect(raw: string) {
    setPreview(null); setConfirmed(false); setMode('merge'); setError(''); setMessage('');
    try {
      setPreview(parseSave(raw));
      if (pasteDetails.current) pasteDetails.current.open = false;
    } catch (reason) { fail(reason); }
  }
  async function readFile(file?: File) {
    if (!file) return;
    setReading(true); setPreview(null); setConfirmed(false); setError(''); setMessage('');
    try {
      if (file.size > MAX_SAVE_BYTES) throw new Error('请选择 4 MB 以内的游戏存档。');
      inspect(await file.text());
    } catch (reason) { fail(reason); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  function load() {
    if (!preview || reading || (mode === 'merge' ? !canMerge : !confirmed)) return;
    setError('');
    try { onLoad(preview, mode); } catch (reason) { fail(reason); }
  }
  function reviewRemoval(branch: Branch, trigger: HTMLButtonElement) {
    if (branches.length <= 1 || parentIds.has(branch.id)) return;
    removalTrigger.current = trigger;
    setRemoveId(branch.id); setRemovalBackedUp(false); setError(''); setMessage('');
  }
  function cancelRemoval() {
    setRemoveId(null); setRemovalBackedUp(false);
    removalTrigger.current?.focus();
  }
  function remove() {
    if (!removingBranch || !canRemove || !removalBackedUp) return;
    setError(''); setMessage('');
    try {
      onRemove(removingBranch.id);
      setMessage(`「${removingBranch.name}」已移出本机。`);
      setRemoveId(null); setRemovalBackedUp(false);
      timelinesHeading.current?.focus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '暂时无法移出这条时间线，请稍后重试。');
    }
  }

  return <div className="save-panel">
    <div className="save-summary"><span>{count} / {MAX_BRANCHES} 条时间线</span><span>{saved ? <><Check size={13}/>已自动保存</> : '自动保存不可用，请先备份'}</span></div>
    <section aria-labelledby="backup-heading">
      <h3 id="backup-heading">把这一生，留一份副本</h3>
      <p>包含全部人物、对话、人生分支和时间进度。浏览器数据清理后，可以用备份找回。</p>
      <div className="save-actions"><button className="secondary-button" onClick={() => makeBackup(true)}><Download size={15}/>下载存档</button><button className="secondary-button" onClick={() => makeBackup(false)}><Copy size={15}/>{backup ? '更新文本备份' : '展开文本备份'}</button></div>
      {backup && <div className="backup-text"><label className="form-label">存档备份文本<textarea ref={backupInput} value={backup} readOnly rows={3} spellCheck={false}/></label><div className="save-actions"><button className="text-button" onClick={() => void copyBackup()}>复制全部文本</button><button className="text-button" onClick={() => setBackup('')}>收起文本</button></div></div>}
    </section>
    <section className="saved-timelines" aria-labelledby="saved-timelines-heading">
      <h3 id="saved-timelines-heading" ref={timelinesHeading} tabIndex={-1}>本机的时间线</h3>
      <p>需要腾出位置时，请先下载或复制备份。有后续分支的人生，需先移出它的后续分支；最后一条时间线会保留。</p>
      <ul className="saved-timeline-list">{branches.map(branch => <li key={branch.id}>
        <div className="saved-timeline-copy">
          <div className="saved-timeline-name"><strong>{branch.name}</strong>{branch.id === activeBranchId && <span className="saved-timeline-active">当前</span>}</div>
          <span>{branch.state.config.name} · {branch.state.year} 年 · {branch.state.age} 岁</span>
          <small>{branch.stage === 'setup' ? '等待出生抽签' : branch.stage === 'certificate' ? '出生已确定' : branch.state.ended ? '这一生已结束' : '人生进行中'}{branch.parentId ? ` · ${branch.forkYear} 年分岔` : ''}</small>
          {parentIds.has(branch.id) && <small className="saved-timeline-lock">有后续分支，请先移出后续分支</small>}
          {branches.length === 1 && <small className="saved-timeline-lock">保留最后一条时间线</small>}
        </div>
        {branches.length > 1 && !parentIds.has(branch.id) && <button className="text-button saved-timeline-remove" aria-label={`移出本机：${branch.name}`} aria-expanded={removeId === branch.id} aria-controls={removeId === branch.id ? 'timeline-removal-review' : undefined} onClick={event => reviewRemoval(branch, event.currentTarget)}>移出本机</button>}
      </li>)}</ul>
      {removingBranch && <div id="timeline-removal-review" className="timeline-removal-review" role="region" aria-labelledby="timeline-removal-heading">
        <h4 id="timeline-removal-heading" ref={removeHeading} tabIndex={-1}>移出「{removingBranch.name}」？</h4>
        <p className="timeline-removal-identity">{removingBranch.state.config.name} · {removingBranch.state.year} 年 · {removingBranch.state.age} 岁{removingBranch.id === activeBranchId ? ' · 当前时间线' : ''}</p>
        <p>这会删除本机保存的这条时间线及其人物、对话和历史，无法撤销。以后只能通过你另外保存的备份找回。{removingBranch.id === activeBranchId ? '移出后将切换到保留的人生。' : ''}</p>
        {!canRemove && <p className="inline-error" role="status">这条时间线目前不能移出：请保留至少一条人生，并先移出它的后续分支。</p>}
        <label className="replace-confirm timeline-removal-confirm"><input type="checkbox" checked={removalBackedUp} onChange={event => setRemovalBackedUp(event.target.checked)}/>我已将需要的备份保存到文件或复制到其他位置</label>
        <div className="save-actions"><button className="secondary-button" onClick={cancelRemoval}>取消</button><button className="secondary-button timeline-removal-final" disabled={!canRemove || !removalBackedUp} onClick={remove}>移出这条时间线</button></div>
      </div>}
    </section>
    <section aria-labelledby="restore-heading">
      <h3 id="restore-heading">找回另一段故事</h3>
      <p>先查看备份中的人生，再决定如何载入。</p>
      <button className="secondary-button" disabled={reading} onClick={() => fileInput.current?.click()}><Upload size={15}/>{reading ? '正在读取…' : '选择存档文件'}</button>
      <input ref={fileInput} hidden type="file" aria-label="选择游戏存档" accept=".json,application/json" disabled={reading} onChange={event => void readFile(event.target.files?.[0])}/>
      <details ref={pasteDetails} className="paste-save"><summary>也可以粘贴备份文本</summary><label className="form-label">粘贴存档文本<textarea value={input} rows={4} maxLength={MAX_SAVE_BYTES} spellCheck={false} disabled={reading} onChange={event => { setInput(event.target.value); setPreview(null); setConfirmed(false); setError(''); }} placeholder="将之前保存的完整文本粘贴到这里"/></label><button className="secondary-button" disabled={reading || !input.trim()} onClick={() => inspect(input)}>预览这份存档</button></details>
    </section>
    {preview && <section className="save-preview" aria-label="待载入存档预览">
      <div className="section-heading"><h3>备份中的人生</h3><span>{preview.branches.length} 条时间线</span></div>
      <ul>{preview.branches.map(branch => <li key={branch.id}><strong>{branch.name}</strong><span>{branch.state.config.name} · {branch.state.age} 岁 · {branch.state.year} 年</span><small>{branch.simulation.birth.countryName}{branch.parentId ? ` · ${branch.forkYear} 年的分支` : ''}</small></li>)}</ul>
      <fieldset className="import-options"><legend>如何载入</legend>
        <label><input type="radio" name="import-mode" value="merge" checked={mode === 'merge'} onChange={() => { setMode('merge'); setConfirmed(false); }}/><span><strong>保留现有人生，加入新副本</strong><small>原来的 {count} 条时间线继续保留；同名故事也会作为独立副本加入。</small></span></label>
        <label><input type="radio" name="import-mode" value="replace" checked={mode === 'replace'} onChange={() => { setMode('replace'); setConfirmed(false); }}/><span><strong>用备份恢复全部人生</strong><small>当前 {count} 条时间线将被这份备份替换。</small></span></label>
      </fieldset>
      {mode === 'merge' && !canMerge && <p className="inline-error" role="status">加入后将有 {count + preview.branches.length} 条时间线，超过 {MAX_BRANCHES} 条上限。现有人生不会被改动。</p>}
      {mode === 'replace' && <label className="replace-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>我已保留需要的备份，确认替换当前全部人生</label>}
      <button className="primary-button" disabled={reading || (mode === 'merge' ? !canMerge : !confirmed)} onClick={load}>{mode === 'merge' ? `加入 ${preview.branches.length} 条时间线` : '确认恢复这份备份'}</button>
    </section>}
    {error && <p className="inline-error save-feedback" role="alert">{error}</p>}
    {message && <p className="save-feedback" role="status">{message}</p>}
  </div>;
}
