import type { GameState } from '../game/types.ts'
import type { Simulation } from '../simulation/types.ts'
import playLinkQr from './playLinkQr.json' with { type: 'json' }

export const PUBLIC_PLAY_URL = 'https://lancerlsy.github.io/life-crossroads/'

const CARD_WIDTH = 640
const CARD_HEIGHT = 820
const QR_SCALE = 2
const QR_SIZE = playLinkQr.rows.length * QR_SCALE
const QR_PATH = playLinkQr.rows.flatMap((row, y) => Array.from(row, (module, x) => module === '1' ? `M${x * QR_SCALE} ${y * QR_SCALE}h${QR_SCALE}v${QR_SCALE}h-${QR_SCALE}z` : '')).join('')

function xml(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!)
}

function short(text: string, limit: number): string {
  const characters = Array.from(text.replace(/\s+/g, ' ').trim())
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : characters.join('')
}

/** Deliberately selects a few public life facts, never the saved conversations or notes. */
export function createLifeCardSvg(state: GameState, simulation: Simulation, sceneDataUrl: string): string {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(sceneDataUrl)) {
    throw new Error('人生卡需要本地生成的 PNG 像素场景。')
  }
  const name = short(state.config.name, 24)
  const details = [
    state.ended ? `${state.age}岁 · ${simulation.cause ?? '一生的终点'}` : `${simulation.birth.urban ? '城市' : '乡村'} · ${simulation.birth.familyClass}`,
    simulation.education,
    state.ended ? '这一段人生，留在时间里。' : '未来的故事，还没有写下。',
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
<rect width="640" height="820" fill="#EBF0ED"/>
<rect x="24" y="24" width="592" height="772" fill="#F7FAF8" stroke="#C7D2CE"/>
<rect x="24" y="24" width="592" height="40" fill="#8C1D3C"/>
<text x="42" y="50" font-family="sans-serif" font-size="16" fill="white">人生岔路 · ${state.ended ? '人生档案' : '出生登记'}</text>
<text x="320" y="148" text-anchor="middle" font-family="serif" font-size="${Array.from(name).length > 16 ? 22 : 34}" fill="#13212A">${xml(name)}</text>
<text x="320" y="193" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#4A5A61">${xml(short(`${simulation.birth.countryName} · ${simulation.birth.sex}`, 30))}</text>
<text x="320" y="232" text-anchor="middle" font-family="monospace" font-size="21" fill="#0F6E68">${state.config.birthYear} — ${state.ended ? state.year : '未完待续'}</text>
<image x="32" y="278" width="576" height="180" href="${xml(sceneDataUrl)}" style="image-rendering:pixelated"/>
${details.map((line, index) => `<text x="320" y="${516 + index * 55}" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#4A5A61">${xml(short(line, 32))}</text>`).join('\n')}
<path d="M48 692H592" stroke="#C7D2CE" stroke-dasharray="4 4"/>
<text x="48" y="727" font-family="sans-serif" font-size="17" fill="#0F6E68">扫码试玩，你的人生会走向哪里？</text>
<text x="48" y="754" font-family="monospace" font-size="12" fill="#4A5A61">${xml(PUBLIC_PLAY_URL)}</text>
<text x="48" y="779" font-family="monospace" font-size="10" fill="#5F6E72">OTHERLIFE · ONE LIFE AT A TIME</text>
<g id="play-link-qr" role="img" aria-label="扫码免费试玩人生岔路" transform="translate(${CARD_WIDTH - 44 - QR_SIZE} ${CARD_HEIGHT - 30 - QR_SIZE})" shape-rendering="crispEdges">
<rect width="${QR_SIZE}" height="${QR_SIZE}" fill="#FFFFFF"/>
<path d="${QR_PATH}" fill="#13212A"/>
</g>
</svg>`
}

/** Rasterizes only in this browser; embedded scene pixels need no external request. */
export async function rasterizeLifeCard(svg: string): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH * 2
  canvas.height = CARD_HEIGHT * 2
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器暂时无法生成 PNG 人生卡，请稍后重试。')
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('人生卡图片未能生成，请关闭后重试。'))
      image.src = url
    })
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
