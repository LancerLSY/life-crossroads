import { useEffect, useMemo, useRef } from 'react'
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH, renderPortrait, type PortraitOptions } from '../pixel/scene.ts'
import { usePixelTheme } from '../pixel/usePixelTheme.ts'

interface PixelPortraitProps extends PortraitOptions {
  /** Displayed height; native portrait is 24 × 32 pixels. */
  size?: number
  className?: string
}

export default function PixelPortrait({ name, age, role, sex, seed, dark, size = 64, className = '' }: PixelPortraitProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const isDark = usePixelTheme(dark)
  const frame = useMemo(() => renderPortrait({ name, age, role, sex, seed, dark: isDark }), [name, age, role, sex, seed, isDark])
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0)
  }, [frame])
  return <canvas ref={canvas} className={`pixel-portrait ${className}`} width={PORTRAIT_WIDTH} height={PORTRAIT_HEIGHT} role="img" aria-label={`${name}的像素肖像，${age}岁`} style={{ width: size * PORTRAIT_WIDTH / PORTRAIT_HEIGHT, height: size, imageRendering: 'pixelated', flexShrink: 0, display: 'block' }}/>
}
