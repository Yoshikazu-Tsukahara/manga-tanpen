import { useEffect, useRef, useState } from 'react'
import MangaCanvas from './MangaCanvas'
import { clamp } from '../layout'

const formatTime = (seconds) => {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = Math.floor(safe % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * 紙の上に置いた iPhone。
 * 画面まわりの黒い余白は薄く保ちつつ、金属フレームと側面ボタンで
 * 一目で端末だと分かるようにする。
 */
export default function VideoPreview({
  layout,
  panels,
  progress,
  time,
  total,
  isPlaying,
  isLooping,
  onTogglePlay,
  onSeek,
  onToggleLoop,
}) {
  const barRef = useRef(null)
  const seekingRef = useRef(false)
  const wasPlayingRef = useRef(isPlaying)
  const [showControls, setShowControls] = useState(true)
  const played = total > 0 ? time / total : 0

  // 再生から止めたときは操作UIを出す（YouTubeと同じ）
  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) setShowControls(true)
    wasPlayingRef.current = isPlaying
  }, [isPlaying])

  // 再生中は少ししたら自動で消す
  useEffect(() => {
    if (!isPlaying || !showControls) return undefined
    const timer = window.setTimeout(() => setShowControls(false), 2400)
    return () => window.clearTimeout(timer)
  }, [isPlaying, showControls])

  const seekFromEvent = (event) => {
    const rect = barRef.current.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    onSeek(ratio * total)
  }

  const startSeek = (event) => {
    event.stopPropagation()
    seekingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    seekFromEvent(event)
  }

  const moveSeek = (event) => {
    if (seekingRef.current) seekFromEvent(event)
  }

  const endSeek = (event) => {
    seekingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="phone-preview relative mx-auto px-2">
      <div className="relative">
        {/* 消音・音量・電源。紙の上でも輪郭が残るよう少し厚めに */}
        <div
          className="absolute top-[15.5%] -left-[2px] z-20 h-[15px] w-[3px] rounded-[1px]"
          style={{ background: 'linear-gradient(90deg, #e8e8ea, #8d8d92)' }}
        />
        <div
          className="absolute top-[22%] -left-[2px] z-20 h-[30px] w-[3px] rounded-[1px]"
          style={{ background: 'linear-gradient(90deg, #e8e8ea, #8d8d92)' }}
        />
        <div
          className="absolute top-[32%] -left-[2px] z-20 h-[30px] w-[3px] rounded-[1px]"
          style={{ background: 'linear-gradient(90deg, #e8e8ea, #8d8d92)' }}
        />
        <div
          className="absolute top-[24%] -right-[2px] z-20 h-[46px] w-[3px] rounded-[1px]"
          style={{ background: 'linear-gradient(90deg, #8d8d92, #e8e8ea)' }}
        />

        {/* 外側：チタンの筐体 */}
        <div
          className="relative rounded-[2.45rem] p-[3px]"
          style={{
            background:
              'linear-gradient(145deg, #f7f7f8 0%, #cfcfd3 16%, #8a8a90 36%, #4a4a4e 62%, #d8d8dc 88%, #9a9a9f 100%)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(0,0,0,0.25), 0 1px 2px rgba(60,40,20,0.10), 0 8px 18px rgba(60,40,20,0.14)',
          }}
        >
          {/* 内側：黒いフロントガラス。ここが「iPhone」の輪郭になる */}
          <div className="rounded-[2.28rem] bg-[#111113] p-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            <div className="relative overflow-hidden rounded-[2.12rem] bg-[#f7f1e4]" style={{ aspectRatio: '9 / 16' }}>
              <div
                className="absolute top-0 left-0 w-full will-change-transform"
                style={{ transform: `translateY(${-progress * layout.MAX_SCROLL_PCT}%)` }}
              >
                <MangaCanvas layout={layout} panels={panels} />
              </div>

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(165deg,rgba(255,255,255,0.14)_0%,transparent_20%)]" />

              {/* Dynamic Island */}
              <div className="pointer-events-none absolute top-[7px] left-1/2 z-30 flex h-[20px] w-[74px] -translate-x-1/2 items-center justify-end rounded-full bg-black px-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                <div className="h-[8px] w-[8px] rounded-full bg-[#10182a] shadow-[inset_0_0_0_1px_rgba(90,110,160,0.45)]">
                  <div className="mx-auto mt-[2px] h-[3.5px] w-[3.5px] rounded-full bg-[#2c5080]" />
                </div>
              </div>

              {/* 余白タップで操作UIの表示／非表示を切り替える */}
              <button
                type="button"
                onClick={() => setShowControls((visible) => !visible)}
                className="absolute inset-0 z-10"
                aria-label={showControls ? '操作を隠す' : '操作を表示'}
              />

              {showControls && !isPlaying && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onTogglePlay()
                  }}
                  className="absolute top-1/2 left-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-[#111] shadow-[0_4px_16px_rgba(0,0,0,0.16)]"
                  aria-label="再生"
                >
                  <span className="ml-0.5 text-base">▶</span>
                </button>
              )}

              {showControls && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/40 to-transparent px-3 pt-8 pb-4">
                <div className="pointer-events-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onTogglePlay()
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-[10px] text-white"
                    aria-label={isPlaying ? '一時停止' : '再生'}
                  >
                    {isPlaying ? '❚❚' : '▶'}
                  </button>

                  <div
                    ref={barRef}
                    onPointerDown={startSeek}
                    onPointerMove={moveSeek}
                    onPointerUp={endSeek}
                    onPointerCancel={endSeek}
                    className="relative h-4 min-w-0 flex-1 cursor-pointer touch-none"
                  >
                    <div className="absolute top-1/2 right-0 left-0 h-[2px] -translate-y-1/2 rounded-full bg-white/35">
                      <div
                        className="h-full rounded-full bg-white"
                        style={{ width: `${played * 100}%` }}
                      />
                    </div>
                    <div
                      className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                      style={{ left: `${played * 100}%` }}
                    />
                  </div>

                  <span className="w-7 shrink-0 text-right text-[8px] text-white/80 tabular-nums">
                    {formatTime(time)}
                  </span>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleLoop()
                    }}
                    className={`shrink-0 text-[12px] ${isLooping ? 'text-white' : 'text-white/35'}`}
                    title="ループ"
                  >
                    ⟳
                  </button>
                </div>
              </div>
              )}

              <div className="pointer-events-none absolute bottom-[5px] left-1/2 z-30 h-[3px] w-[30%] -translate-x-1/2 rounded-full bg-white/55" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
