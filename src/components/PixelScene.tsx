import { useEffect, useMemo, useRef } from 'react'
import type { GameState } from '../game/types.ts'
import type { Simulation } from '../simulation/types.ts'
import { deriveSceneModel, renderScene, SCENE_HEIGHT, SCENE_WIDTH } from '../pixel/scene.ts'
import { usePixelTheme } from '../pixel/usePixelTheme.ts'

interface PixelSceneProps {
  state?: GameState
  simulation?: Simulation
  dark?: boolean
  className?: string
  showCaption?: boolean
  onPersonClick?: (id: string) => void
}

export default function PixelScene({ state, simulation, dark, className = '', showCaption = true, onPersonClick }: PixelSceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const isDark = usePixelTheme(dark)
  const model = useMemo(() => deriveSceneModel(state, simulation, isDark), [state, simulation, isDark])
  const frame = useMemo(() => renderScene(model), [model])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0)
  }, [frame])

  return <figure className={`pixel-scene ${className}`} style={{ margin: 0 }}>
    <div className="pixel-scene-stage" style={{ position: 'relative', lineHeight: 0 }}>
      <canvas ref={canvas} width={SCENE_WIDTH} height={SCENE_HEIGHT} role="img" aria-label={model.caption} style={{ width: '100%', height: 'auto', display: 'block', imageRendering: 'pixelated' }}/>
      {onPersonClick && frame.people.filter(person => !person.self).map(person => <button
        key={person.id} type="button" className="pixel-person-hotspot"
        aria-label={`与${person.name}对话，${person.role}，${person.age}岁`} title={`${person.name} · ${person.role} · ${person.age}岁`}
        onClick={() => onPersonClick(person.id)}
        style={{ position: 'absolute', left: `${person.x / SCENE_WIDTH * 100}%`, top: `${person.y / SCENE_HEIGHT * 100}%`, width: `${person.width / SCENE_WIDTH * 100}%`, height: `${person.height / SCENE_HEIGHT * 100}%`, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
      />)}
    </div>
    {showCaption && <figcaption className="pixel-scene-caption">{model.kind === 'crisis' ? '缅甸 · 虚构支线' : `${model.countryName} · ${model.urban ? '城市' : '乡村'}`} · {model.summary}</figcaption>}
  </figure>
}
