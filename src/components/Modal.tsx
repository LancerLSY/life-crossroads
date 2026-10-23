import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export default function Modal({ title, subtitle, children, onClose, wide = false, notice, onDismissNotice }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; notice?: string; onDismissNotice?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const label = useId();
  useEffect(() => {
    const el = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => { el.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby={label} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-inner"><header className="modal-header"><div><h2 id={label}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="关闭窗口"><X size={20}/></button></header>{children}</div>
    {notice && <div className="modal-notice" role="status"><span>{notice}</span><button className="icon-button" aria-label="关闭提示" onClick={onDismissNotice}><X size={15}/></button></div>}
  </dialog>;
}
