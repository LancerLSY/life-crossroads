import { useId, useState } from 'react';
import { PUBLIC_PLAY_URL } from '../lib/lifeCard.ts';
import './ShareCard.css';

interface ShareCardProps {
  image?: string;
  generating: boolean;
  error?: string;
  filename: string;
}

export default function ShareCard({ image, generating, error, filename }: ShareCardProps) {
  const linkId = useId();
  const [failedImage, setFailedImage] = useState<string>();
  const [downloadError, setDownloadError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const imageFailed = !!image && failedImage === image;
  async function copyLink() {
    setCopyStatus('copying');
    try {
      await navigator.clipboard.writeText(PUBLIC_PLAY_URL);
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }
  }
  function downloadCard() {
    setDownloadError(undefined);
    let url: string | undefined;
    try {
      const encoded = image?.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/)?.[1];
      if (!encoded) throw new Error('Invalid PNG');
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    } catch {
      setDownloadError('PNG 保存未能开始，请再试一次，或长按人生卡图片保存。');
    } finally {
      if (url) {
        const downloadUrl = url;
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
    }
  }
  return <section className="share-life-card" aria-busy={generating}>
    {generating && <p className="share-life-card__status" role="status">正在把这段人生制成 PNG…</p>}
    {(error || imageFailed) && <p className="share-life-card__error" role="alert">{error || '图片预览未能打开，请关闭后重新生成。你仍可复制下方试玩链接。'}</p>}
    {image && !generating && !imageFailed && <>
      <img className="share-life-card__preview" src={image} alt="人生岔路 PNG 人生卡，包含出生或结局档案及试玩地址" onError={() => setFailedImage(image)}/>
      <a className="primary-button share-life-card__download" href={image} download={filename} onClick={event => { event.preventDefault(); downloadCard(); }}>保存 PNG 人生卡</a>
    </>}
    {downloadError && <p className="share-life-card__error" role="alert">{downloadError}</p>}
    <div className="share-life-card__link">
      <label htmlFor={linkId}>免费试玩链接</label>
      <input id={linkId} type="url" readOnly value={PUBLIC_PLAY_URL} onFocus={event => event.currentTarget.select()}/>
      <button className="secondary-button" type="button" disabled={copyStatus === 'copying'} onClick={() => void copyLink()}>{copyStatus === 'copying' ? '正在复制…' : '复制试玩链接'}</button>
      <p className={`share-life-card__copy-status${copyStatus === 'error' ? ' share-life-card__error' : ''}`} role="status">{copyStatus === 'success' ? '链接已复制，可以分享给朋友了。' : copyStatus === 'error' ? '复制失败，请选中上方链接手动复制。' : '人生卡和链接由你选择是否分享。'}</p>
    </div>
  </section>;
}
