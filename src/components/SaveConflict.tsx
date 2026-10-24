import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import './SaveRecovery.css';

export default function SaveConflict({ name, age, year, onExport, onReload, raw }: {
  name: string; age: number; year: number;
  onExport: () => void; onReload: () => void; raw?: string;
}) {
  const [error, setError] = useState('');
  function exportCurrent() {
    setError('');
    try {
      if (raw === undefined) { onExport(); return; }
      const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `人生岔路-本页原始记录-${new Date().toISOString().slice(0, 10)}.txt`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '暂时无法下载，请复制原文或稍后重试。'); }
  }
  function reloadLatest() {
    setError('');
    try { onReload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '最新记录暂时无法载入，本页故事仍然保留着。'); }
  }
  return <main className="save-recovery-page">
    <div className="recovery-brand">✦ 人生岔路</div>
    <h1>另一页的人生，已经往前走了。</h1>
    <p>另一个页面更新了本机记录。当前页已暂停，自动保存也已停止，不会覆盖另一页的进展。</p>
    <p className="recovery-reason">本页停在：{name} · {year} 年 · {age} 岁</p>
    <section aria-labelledby="conflict-backup-heading">
      <h2 id="conflict-backup-heading">先留下本页的故事</h2>
      <p>若要保留本页分歧，请先导出备份。载入最新记录后，本页尚未保存的进展会被替换。</p>
      {raw !== undefined && <p>这份内容是本页保留的原始异常记录，将按原文下载，方便之后找回。</p>}
      <button className="secondary-button" onClick={exportCurrent}><Download size={15}/>{raw === undefined ? '导出本页故事' : '下载本页原始记录'}</button>
      {raw !== undefined && <details><summary>也可以查看并复制原文</summary><textarea aria-label="本页原始存档记录" value={raw} readOnly rows={5} spellCheck={false}/></details>}
    </section>
    <section aria-labelledby="conflict-latest-heading">
      <h2 id="conflict-latest-heading">接着最新的人生走</h2>
      <p>载入另一页保存的最新记录，然后继续游戏。</p>
      <button className="primary-button" onClick={reloadLatest}><RefreshCw size={15}/>载入最新记录</button>
    </section>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </main>;
}
