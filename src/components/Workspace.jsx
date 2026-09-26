import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import MangaCanvas from './MangaCanvas'
import { clamp } from '../layout'

/** 原稿の上下に取る余白（px） */
const PAD = 8

/** カメラ枠の色（赤ペンで囲うイメージの朱色） */
const CAMERA_COLOR = '#e0443a'

/**
 * ワークスペース（全体図）ビュー。
 *
 * 紙の上に漫画が直接描いてあるように見せる。別枠のカードは置かない。
 * 赤いカメラ枠は再生中だけ重ねる。
 */
export default function Workspace({
  layout,
  panels,
  progress,
  isPlaying = false,
  selectedIndex,
  onPickImage,
  onClearImage,
  onSelectPanel,
  onImageTransform,
  hideHints = false,
}) {
  const scrollRef = useRef(null)

  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(0.72)

  useLayoutEffect(() => {
    const element = scrollRef.current
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const available = Math.max(viewport.height - PAD * 2, 0)
  const fitPageWidth = available / layout.CANVAS_RATIO
  const fitPanelWidth = available / layout.CAMERA_RATIO
  const canvasWidth = clamp(
    fitPageWidth + (fitPanelWidth - fitPageWidth) * zoom,
    40,
    Math.max(viewport.width - 24, 40),
  )
  const canvasHeight = canvasWidth * layout.CANVAS_RATIO
  const frameHeight = canvasWidth * layout.CAMERA_RATIO

  useEffect(() => {
    if (!isPlaying) return
    const element = scrollRef.current
    if (!element) return
    const frameTop = PAD + progress * (canvasHeight - frameHeight)
    const target = frameTop - (viewport.height - frameHeight) / 2
    element.scrollTop = clamp(target, 0, element.scrollHeight - element.clientHeight)
  }, [isPlaying, progress, canvasHeight, frameHeight, viewport.height])

  const frameTopPct = progress * layout.MAX_SCROLL_PCT

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="no-scrollbar relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <div className="flex justify-center" style={{ paddingTop: PAD, paddingBottom: PAD }}>
          <div
            className="relative shrink-0 touch-none select-none"
            style={{ width: canvasWidth }}
          >
            <MangaCanvas
              layout={layout}
              panels={panels}
              editable={!hideHints}
              showMarkers
              selectedIndex={selectedIndex}
              onPickImage={onPickImage}
              onClearImage={onClearImage}
              onSelectPanel={onSelectPanel}
              onImageTransform={onImageTransform}
            />

            {isPlaying && (
              <>
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 bg-[#f7f1e4]/75"
                  style={{ height: `${frameTopPct}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-[#f7f1e4]/75"
                  style={{ height: `${100 - frameTopPct - layout.CAMERA_H_PCT}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-x-0"
                  style={{
                    top: `${frameTopPct}%`,
                    height: `${layout.CAMERA_H_PCT}%`,
                    boxShadow: `inset 0 0 0 2px ${CAMERA_COLOR}`,
                  }}
                >
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-white"
                    style={{ backgroundColor: CAMERA_COLOR }}
                  >
                    CAMERA 9:16
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {hideHints ? null : (
        <p className="px-1 pt-3 font-serif text-[10px] leading-relaxed text-[#8a7a64] sm:text-[11px]">
          推奨はコマ枠 {layout.aspectLabel}（{layout.FRAME_W}×{Math.round(layout.FRAME_H)} 前後）。1コマにつき1枚。端は切れるので、重要な絵は中央へ。
        </p>
      )}
      <div className="flex min-w-0 items-center gap-2 px-1 pt-2 text-[11px] text-[#6b5d4d] sm:gap-3">
        <span className="shrink-0 font-serif">表示倍率</span>
        <button
          type="button"
          onClick={() => setZoom(0)}
          className="shrink-0 font-serif text-[#6b5d4d] underline decoration-[#c4b8a5] underline-offset-4 hover:text-[#3d3228]"
        >
          全体
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(zoom * 100)}
          onChange={(event) => setZoom(Number(event.target.value) / 100)}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="shrink-0 font-serif text-[#6b5d4d] underline decoration-[#c4b8a5] underline-offset-4 hover:text-[#3d3228]"
        >
          コマ
        </button>
      </div>
    </div>
  )
}
