import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { MAX_SAVE_BYTES, parseSave } from '../lib/storage';
import type { SaveFile } from '../lib/storage';
import './SaveRecovery.css';

export default function SaveRecovery({ raw, message, onRestore, onReset }: {
  raw: string; message: string; onRestore: (save: SaveFile) => void | Promise<void>; onReset: () => void | Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<SaveFile | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoringRef = useRef(false);
  const [error, setError] = useState('');
  function inspect(text: string) {
    if (restoringRef.current) return;
    setPreview(null); setError('');
    try { setPreview(parseSave(text)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '这份备份暂时无法读取。'); }
  }
  async function readFile(file?: File) {
    if (!file || reading || restoringRef.current) return;
    setReading(true); setError(''); setPreview(null);
    try {
      if (file.size > MAX_SAVE_BYTES) throw new Error('请选择 4 MB 以内的游戏存档。');
      inspect(await file.text());
    } catch (reason) { setError(reason instanceof Error ? reason.message : '文件暂时无法读取。'); }
    finally { setReading(false); }
  }
  function downloadOriginal() {
    const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `人生岔路-原始记录-${new Date().toISOString().slice(0, 10)}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function recover(restore: boolean) {
    if (!backedUp || reading || restoringRef.current || (restore && !preview)) return;
    restoringRef.current = true; setRestoring(true); setError('');
    try { if (restore) await onRestore(preview!); else await onReset(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '浏览器仍然无法保存，原始记录继续保留。'); }
    finally { restoringRef.current = false; setRestoring(false); }
  }
  return <main className="save-recovery-page">
    <div className="recovery-brand">✦ 人生岔路</div>
    <h1>先保留这段人生。</h1>
    <p>本机原有的记录暂时无法读取，原文仍保留着，自动保存已暂停。</p>
    <p className="recovery-reason">{message}</p>
    <section aria-labelledby="original-save-heading">
      <h2 id="original-save-heading">留下原始记录</h2>
      <p>下载原文以备恢复。只有你在下方明确选择后，才会替换本机记录。</p>
      <button className="secondary-button" onClick={downloadOriginal}><Download size={15}/>下载原始记录</button>
      <details><summary>也可以查看并复制原文</summary><textarea aria-label="原始存档记录" value={raw} readOnly rows={5} spellCheck={false}/></details>
    </section>
    <section aria-labelledby="recovery-backup-heading">
      <h2 id="recovery-backup-heading">从一份备份找回故事</h2>
      <label className="secondary-button recovery-file"><Upload size={15}/>{reading ? '正在读取…' : '选择存档文件'}<input type="file" aria-label="选择恢复备份" accept=".json,application/json" disabled={reading || restoring} onChange={event => void readFile(event.target.files?.[0])}/></label>
      <details><summary>粘贴备份文本</summary><label className="form-label">完整的备份文本<textarea value={input} rows={4} maxLength={MAX_SAVE_BYTES} spellCheck={false} disabled={reading || restoring} onChange={event => { setInput(event.target.value); setPreview(null); }}/></label><button className="secondary-button" disabled={reading || restoring || !input.trim()} onClick={() => inspect(input)}>预览恢复备份</button></details>
      {preview && <div className="save-preview" aria-label="恢复备份预览"><h3>可以恢复 {preview.branches.length} 条时间线</h3><ul>{preview.branches.map(branch => <li key={branch.id}><strong>{branch.name}</strong><span>{branch.state.config.name} · {branch.state.age} 岁 · {branch.state.year} 年</span></li>)}</ul></div>}
    </section>
    <label className="replace-confirm"><input type="checkbox" checked={backedUp} disabled={reading || restoring} onChange={event => setBackedUp(event.target.checked)}/>我已将需要的原始记录保存在其他位置，允许替换本机记录</label>
    <div className="save-actions"><button className="primary-button" disabled={!preview || !backedUp || reading || restoring} onClick={() => void recover(true)}>使用这份备份</button></div>
    <details className="recovery-reset"><summary>重新开始一段人生</summary><p>这会替换本机原有记录。保存在其他位置的原文和备份不会改变。</p><button className="secondary-button" disabled={!backedUp || reading || restoring} onClick={() => void recover(false)}>保留备份后，重新抽签</button></details>
    {restoring && <p role="status">正在保存恢复后的记录，请稍候…</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </main>;
}
