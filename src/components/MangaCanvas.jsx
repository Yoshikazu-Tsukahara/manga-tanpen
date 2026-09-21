import { useEffect, useRef } from 'react'
import { clamp } from '../layout'

/** ホイール操作をキャンセル付きで受け取る（React の onWheel だとページが一緒に動いてしまう） */
function WheelCatcher({ enabled, onZoom, children, ...rest }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return undefined
    const handle = (event) => {
      event.preventDefault()
      event.stopPropagation()
      onZoom(event.deltaY)
    }
    node.addEventListener('wheel', handle, { passive: false })
    return () => node.removeEventListener('wheel', handle)
  }, [enabled, onZoom])

  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  )
}

/** コマ内の画像。object-position と scale でトリミング位置を表現する */
function PanelImage({ panel }) {
  const x = panel.x ?? 50
  const y = panel.y ?? 50
  const scale = panel.scale ?? 1

  return (
    <img
      src={panel.src}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover"
      style={{
        objectPosition: `${x}% ${y}%`,
        transform: `scale(${scale})`,
        transformOrigin: `${x}% ${y}%`,
      }}
    />
  )
}

/**
 * 漫画ページ（4コマが縦に並んだ1枚の大きな原稿用紙）。
 *
 * ワークスペース側とプレビュー側で「まったく同じもの」を使い回す。
 * 編集モードでは、配置済みの画像をドラッグして位置を、ホイールで拡大を変えられる。
 */
export default function MangaCanvas({
  layout,
  panels,
  editable = false,
  showMarkers = false,
  selectedIndex = -1,
  onPickImage,
  onClearImage,
  onSelectPanel,
  onImageTransform,
}) {
  // ドラッグ開始時の値を覚えておく（レンダーをまたいでもズレないように ref に持つ）
  const dragRef = useRef(null)

  const startPan = (event, index) => {
    if (!editable || !panels[index].src) return
    event.preventDefault()
    event.stopPropagation()
    onSelectPanel?.(index)

    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      index,
      startX: event.clientX,
      startY: event.clientY,
      origX: panels[index].x ?? 50,
      origY: panels[index].y ?? 50,
      width: rect.width,
      height: rect.height,
      scale: panels[index].scale ?? 1,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePan = (event) => {
    const drag = dragRef.current
    if (!drag) return

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true

    // 画像を指に追従させる（右へドラッグすると写真も右へ動き、左側が見える）
    const x = clamp(drag.origX - (dx / drag.width) * (100 / drag.scale), 0, 100)
    const y = clamp(drag.origY - (dy / drag.height) * (100 / drag.scale), 0, 100)
    onImageTransform?.(drag.index, { x, y })
  }

  const endPan = (event) => {
    const drag = dragRef.current
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    return drag
  }

  const handleZoom = (index, deltaY) => {
    onSelectPanel?.(index)
    const current = panels[index].scale ?? 1
    const next = clamp(current * (deltaY < 0 ? 1.07 : 0.93), 1, 3)
    onImageTransform?.(index, { scale: next })
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-none bg-transparent"
      style={{ aspectRatio: layout.CANVAS_ASPECT }}
    >
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          className="absolute overflow-hidden border border-slate-800 bg-white [container-type:inline-size]"
          style={{
            top: `${layout.panelTopPct(index)}%`,
            left: `${layout.PANEL_LEFT_PCT}%`,
            width: `${layout.PANEL_W_PCT}%`,
            height: `${layout.PANEL_H_PCT}%`,
          }}
        >
          {panel.src ? (
            <PanelImage panel={panel} />
          ) : (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqw]"
              style={{
                backgroundColor: panel.tint,
                backgroundImage:
                  'radial-gradient(circle at center, rgba(30,41,59,0.20) 21%, transparent 22%)',
                backgroundSize: `${panel.dot}cqw ${panel.dot}cqw`,
              }}
            >
              <span className="font-serif text-[16cqw] leading-none font-bold text-slate-800/85">
                {index + 1}
              </span>
              <span className="text-[2.6cqw] font-bold tracking-[0.45em] text-slate-500">
                {panel.caption}
              </span>
            </div>
          )}

          {showMarkers && (
            <span className="pointer-events-none absolute top-0 left-0 bg-slate-800/90 px-[1.2cqw] py-[0.25cqw] font-serif text-[2.2cqw] leading-none font-bold text-white">
              {index + 1}
            </span>
          )}

          {editable && selectedIndex === index && panel.src && (
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1.5px_#e0443a]" />
          )}

          {editable && (
            panel.src ? (
              <WheelCatcher
                enabled
                onZoom={(deltaY) => handleZoom(index, deltaY)}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
                onPointerDown={(event) => startPan(event, index)}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerCancel={endPan}
                title="ドラッグで位置を調整／ホイールで拡大"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSelectPanel?.(index)
                  onPickImage?.(index)
                }}
                className="absolute inset-0 cursor-pointer opacity-0 transition hover:opacity-100"
                title={`${index + 1}コマ目の画像を選ぶ`}
              >
                <span className="flex h-full w-full items-center justify-center bg-white/80 text-[3cqw] font-bold text-slate-700">
                  クリックして画像を配置
                </span>
              </button>
            )
          )}

          {editable && panel.src && (
            <button
              type="button"
              onClick={() => onClearImage?.(index)}
              className="absolute top-[1.2%] right-[2%] z-10 rounded-full bg-white/90 px-[2cqw] py-[0.4cqw] text-[2.2cqw] font-bold text-slate-600 shadow-sm hover:bg-[#e0443a] hover:text-white"
              title="画像を外してダミーに戻す"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
