/**
 * 漫画ページとカメラフレームのサイズを決める「設計図」。
 *
 * 映像（カメラ）はいつも 9:16。変わるのはコマ枠の縦横だけ。
 * 3:4 のコマは 9:16 より高さが低いので、カメラ内の上下の余白が大きくなる。
 * 余白（inset）は左右のすき間。0 ならコマ幅が画面いっぱい。
 */

export const MIN_PANELS = 2
export const MAX_PANELS = 4
export const DEFAULT_PANELS = 4
export const PANEL_COUNT = DEFAULT_PANELS
export const CANVAS_W = 1080

/** コマ枠の縦横。ratio は高さ ÷ 幅。映像の 9:16 とは別 */
export const ASPECT_OPTIONS = [
  { id: '9:16', label: '9:16', ratio: 16 / 9 },
  { id: '3:4', label: '3:4', ratio: 4 / 3 },
]
export const DEFAULT_ASPECT = '9:16'

const aspectById = (id) => ASPECT_OPTIONS.find((item) => item.id === id) || ASPECT_OPTIONS[0]

/** 書き出す映像はいつもこのサイズ */
export const CAMERA_H = (CANVAS_W * 16) / 9
export const CAMERA_RATIO = CAMERA_H / CANVAS_W

/** 片側の余白。0 = ぴったり、0.09 ≒ 従来の 82% 幅、0.16 で広め */
export const MIN_INSET = 0
export const MAX_INSET = 0.16
export const DEFAULT_INSET = 0.09

/** コマ間の間隔。キャンバス幅に対する割合。0 = 密着 */
export const MIN_GAP = 0
export const MAX_GAP = 0.2
export const DEFAULT_GAP = 0.09

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function createLayout(
  inset = DEFAULT_INSET,
  gapRatio = DEFAULT_GAP,
  panelCount = DEFAULT_PANELS,
  aspectId = DEFAULT_ASPECT,
) {
  const safe = clamp(inset, MIN_INSET, MAX_INSET)
  const gapSafe = clamp(gapRatio, MIN_GAP, MAX_GAP)
  const count = clamp(Math.round(panelCount), MIN_PANELS, MAX_PANELS)
  const aspect = aspectById(aspectId)
  const panelWidthRatio = 1 - safe * 2

  const PANEL_W = CANVAS_W * panelWidthRatio
  const PANEL_H = PANEL_W * aspect.ratio
  const H_INSET = (CANVAS_W - PANEL_W) / 2
  // 3:4 のコマはカメラより低いので、ここが 9:16 のときより大きくなる
  const V_INSET = (CAMERA_H - PANEL_H) / 2
  const GAP = CANVAS_W * gapSafe
  const PAGE_PAD = V_INSET
  const PANEL_PITCH = PANEL_H + GAP
  const TOTAL_H = PAGE_PAD * 2 + count * PANEL_H + (count - 1) * GAP
  const MAX_SCROLL = Math.max(TOTAL_H - CAMERA_H, 0)

  const panelTopPct = (i) => ((PAGE_PAD + i * PANEL_PITCH) / TOTAL_H) * 100
  const panelProgress = (i) => (MAX_SCROLL <= 0 ? 0 : clamp((i * PANEL_PITCH) / MAX_SCROLL, 0, 1))

  const currentPanelIndex = (progress) => {
    const cameraCenter = progress * MAX_SCROLL + CAMERA_H / 2
    return clamp(Math.floor((cameraCenter - PAGE_PAD) / PANEL_PITCH), 0, count - 1)
  }

  return {
    inset: safe,
    panelCount: count,
    aspectId: aspect.id,
    aspectLabel: aspect.label,
    FRAME_W: CANVAS_W,
    FRAME_H: CANVAS_W * aspect.ratio,
    CAMERA_W: CANVAS_W,
    CAMERA_H,
    CAMERA_RATIO,
    PANEL_W,
    PANEL_H,
    H_INSET,
    V_INSET,
    GAP,
    PAGE_PAD,
    PANEL_PITCH,
    TOTAL_H,
    MAX_SCROLL,
    CAMERA_H_PCT: (CAMERA_H / TOTAL_H) * 100,
    MAX_SCROLL_PCT: (MAX_SCROLL / TOTAL_H) * 100,
    PANEL_H_PCT: (PANEL_H / TOTAL_H) * 100,
    PANEL_W_PCT: (PANEL_W / CANVAS_W) * 100,
    PANEL_LEFT_PCT: (H_INSET / CANVAS_W) * 100,
    CANVAS_ASPECT: `${CANVAS_W} / ${TOTAL_H}`,
    CANVAS_RATIO: TOTAL_H / CANVAS_W,
    panelTopPct,
    panelProgress,
    currentPanelIndex,
  }
}
