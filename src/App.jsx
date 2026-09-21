import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Workspace from './components/Workspace'
import VideoPreview from './components/VideoPreview'
import {
  DEFAULT_GAP,
  DEFAULT_INSET,
  DEFAULT_PANELS,
  MAX_GAP,
  MAX_INSET,
  MAX_PANELS,
  MIN_GAP,
  MIN_INSET,
  MIN_PANELS,
  clamp,
  createLayout,
} from './layout'
import { buildTimeline, progressAtTime } from './timeline'
import { exportVideo } from './exportVideo'

/** 画像が未設定のときに表示する、スクリーントーン風のダミーコマ */
const INITIAL_PANELS = [
  { id: 1, caption: 'SCENE 01', tint: '#f4f4f2', dot: 2.6, src: null, x: 50, y: 50, scale: 1 },
  { id: 2, caption: 'SCENE 02', tint: '#eef1f4', dot: 1.8, src: null, x: 50, y: 50, scale: 1 },
  { id: 3, caption: 'SCENE 03', tint: '#f6f1ea', dot: 3.4, src: null, x: 50, y: 50, scale: 1 },
  { id: 4, caption: 'SCENE 04', tint: '#eef2ef', dot: 2.2, src: null, x: 50, y: 50, scale: 1 },
]

export default function App() {
  const [panels, setPanels] = useState(INITIAL_PANELS)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [hold, setHold] = useState(1.5) // 各コマで止まる秒数
  const [move, setMove] = useState(0.7) // 次のコマへ移動する秒数
  const [inset, setInset] = useState(DEFAULT_INSET) // カメラ内の片側余白（0でぴったり）
  const [gap, setGap] = useState(DEFAULT_GAP) // コマとコマの間隔
  const [panelCount, setPanelCount] = useState(DEFAULT_PANELS)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState('')

  const layout = useMemo(() => createLayout(inset, gap, panelCount), [inset, gap, panelCount])
  const visiblePanels = useMemo(() => panels.slice(0, panelCount), [panels, panelCount])

  // 「台本」。停留と移動を並べたもので、時間 → カメラ位置 の変換表になる
  const timeline = useMemo(
    () => buildTimeline({ hold, move, layout, panelCount }),
    [hold, move, layout, panelCount],
  )

  const [time, setTimeState] = useState(0)

  // アニメーション中は毎フレーム最新値を読みたいので、state と別に ref でも持っておく
  const timeRef = useRef(0)

  const setTime = useCallback(
    (value) => {
      const next = clamp(value, 0, timeline.total)
      timeRef.current = next
      setTimeState(next)
    },
    [timeline.total],
  )

  // 停留・移動の秒数を変えたときに、再生位置が台本の長さを超えないようにする
  useEffect(() => {
    if (timeRef.current > timeline.total) setTime(timeline.total)
  }, [timeline.total, setTime])

  // 再生ループ：requestAnimationFrame で経過時間ぶんだけ台本を進める
  useEffect(() => {
    if (!isPlaying || isExporting) return undefined

    let rafId = 0
    let lastTime = performance.now()

    const tick = (now) => {
      const delta = (now - lastTime) / 1000
      lastTime = now
      const next = timeRef.current + delta

      if (next >= timeline.total) {
        if (isLooping) {
          setTime(0)
        } else {
          setTime(timeline.total)
          setIsPlaying(false)
          return
        }
      } else {
        setTime(next)
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, isExporting, isLooping, timeline.total, setTime])

  const togglePlay = useCallback(() => {
    setIsPlaying((playing) => {
      if (!playing && timeRef.current >= timeline.total) setTime(0) // 最後まで行っていたら頭から
      return !playing
    })
  }, [timeline.total, setTime])

  // スペースキーで再生／一時停止
  useEffect(() => {
    const onKeyDown = (event) => {
      // 入力欄やボタンにフォーカスがあるときは、そちらの操作を邪魔しない
      const onControl =
        event.target instanceof Element && event.target.closest('input, button, textarea')
      if (isExporting || event.code !== 'Space' || onControl) return
      event.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePlay, isExporting])

  // 画像アップロード
  const fileInputRef = useRef(null)
  const pendingIndexRef = useRef(0)

  const openPicker = (index) => {
    pendingIndexRef.current = index
    setSelectedIndex(index)
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const index = pendingIndexRef.current
    const url = URL.createObjectURL(file)

    setPanels((prev) => {
      const old = prev[index].src
      if (old) URL.revokeObjectURL(old) // 古い画像のメモリを解放
      return prev.map((panel, i) =>
        i === index ? { ...panel, src: url, x: 50, y: 50, scale: 1 } : panel,
      )
    })
  }

  const clearImage = (index) => {
    setPanels((prev) => {
      const old = prev[index].src
      if (old) URL.revokeObjectURL(old)
      return prev.map((panel, i) =>
        i === index ? { ...panel, src: null, x: 50, y: 50, scale: 1 } : panel,
      )
    })
  }

  const updateImage = (index, patch) => {
    setPanels((prev) => prev.map((panel, i) => (i === index ? { ...panel, ...patch } : panel)))
  }

  const progress = progressAtTime(timeline, time)

  const seek = (value) => {
    if (isExporting) return
    setIsPlaying(false)
    setTime(value)
  }

  const handleExport = async () => {
    if (isExporting) return
    setIsPlaying(false)
    setExportError('')
    setExportProgress(0)
    setIsExporting(true)

    try {
      await exportVideo({
        panels: visiblePanels,
        layout,
        timeline,
        onProgress: (ratio) => {
          setExportProgress(ratio)
          setTime(ratio * timeline.total)
        },
      })
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '書き出しに失敗しました')
    } finally {
      setIsExporting(false)
      setExportProgress(0)
    }
  }

  return (
    <div className={`paper flex h-full flex-col text-[#3d3228] ${isExporting ? 'pointer-events-none' : ''}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <header className="flex items-end justify-between px-8 pt-6 pb-2">
        <h1 className="font-serif text-xl tracking-[0.18em] text-[#3d3228]">
          漫画 <span className="text-[#c45c4a]">/</span> 短編
        </h1>
        <div className="flex items-baseline gap-4 font-serif text-sm">
          {Array.from({ length: MAX_PANELS - MIN_PANELS + 1 }, (_, i) => MIN_PANELS + i).map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => {
                setPanelCount(count)
                setSelectedIndex((index) => Math.min(index, count - 1))
                setIsPlaying(false)
              }}
              className={
                panelCount === count
                  ? 'text-[#3d3228] underline decoration-[#3d3228] underline-offset-4'
                  : 'text-[#8a7a64] hover:text-[#3d3228]'
              }
            >
              {count}コマ
            </button>
          ))}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-10 px-8 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section className="flex min-h-0 flex-col">
          <Workspace
            layout={layout}
            panels={visiblePanels}
            progress={progress}
            isPlaying={isPlaying}
            selectedIndex={selectedIndex}
            onPickImage={openPicker}
            onClearImage={clearImage}
            onSelectPanel={setSelectedIndex}
            onImageTransform={updateImage}
          />
        </section>

        <aside className="no-scrollbar flex min-h-0 flex-col justify-center gap-6 overflow-y-auto px-2">
          <div className="mx-auto w-full max-w-[300px] space-y-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="pointer-events-auto w-full rounded-sm border border-[#3d3228]/18 bg-[#f3ece0] py-2.5 font-serif text-sm tracking-wide text-[#3d3228] shadow-[0_1px_0_rgba(61,50,40,0.08)] transition hover:border-[#3d3228]/35 hover:bg-[#ece4d2] disabled:border-[#c4b8a5]/40 disabled:bg-[#f3ece0] disabled:text-[#8a7a64]"
            >
              {isExporting
                ? `生成中... (${Math.round(exportProgress * 100)}%)`
                : '動画を書き出す（エクスポート）'}
            </button>
            <p className="text-center font-serif text-[10px] leading-relaxed text-[#8a7a64]">
              {isExporting
                ? 'このタブを開いたままお待ちください'
                : '生成中はタブを閉じたり、別のタブへ移らないでください'}
            </p>
            {exportError ? (
              <p className="text-center font-serif text-[11px] text-[#c45c4a]">{exportError}</p>
            ) : null}
          </div>

          <VideoPreview
            layout={layout}
            panels={visiblePanels}
            progress={progress}
            time={time}
            total={timeline.total}
            isPlaying={isPlaying}
            isLooping={isLooping}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onToggleLoop={() => setIsLooping((value) => !value)}
          />

          <div className="mx-auto w-full max-w-[300px] space-y-4">
            <div className="grid grid-cols-2 gap-5">
              <label className="block">
                <div className="mb-1 flex justify-between font-serif text-[11px] text-[#6b5d4d]">
                  <span>停留</span>
                  <span className="tabular-nums">{hold.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={4}
                  step={0.1}
                  value={hold}
                  onChange={(event) => setHold(Number(event.target.value))}
                />
              </label>
              <label className="block">
                <div className="mb-1 flex justify-between font-serif text-[11px] text-[#6b5d4d]">
                  <span>移動</span>
                  <span className="tabular-nums">{move.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={2.5}
                  step={0.1}
                  value={move}
                  onChange={(event) => setMove(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <label className="block">
                <div className="mb-1 flex justify-between font-serif text-[11px] text-[#6b5d4d]">
                  <span>余白</span>
                  <span className="tabular-nums">{inset <= 0 ? 'なし' : `${Math.round(inset * 100)}%`}</span>
                </div>
                <input
                  type="range"
                  min={MIN_INSET}
                  max={MAX_INSET}
                  step={0.005}
                  value={inset}
                  onChange={(event) => setInset(Number(event.target.value))}
                />
              </label>
              <label className="block">
                <div className="mb-1 flex justify-between font-serif text-[11px] text-[#6b5d4d]">
                  <span>間隔</span>
                  <span className="tabular-nums">{gap <= 0 ? 'なし' : `${Math.round(gap * 100)}%`}</span>
                </div>
                <input
                  type="range"
                  min={MIN_GAP}
                  max={MAX_GAP}
                  step={0.005}
                  value={gap}
                  onChange={(event) => setGap(Number(event.target.value))}
                />
              </label>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
