import { PANEL_COUNT, clamp } from './layout'

/**
 * カメラワークの「台本（タイムライン）」を組み立てる。
 *
 * 一定速度でダラダラ流すのではなく、
 *   停留(hold) → 移動(move) → 停留(hold) → 移動(move) …
 * という2種類のステップを並べることで、ショート動画らしい緩急を作る。
 *
 * 再生位置 progress（0〜1）はそのまま活かし、
 * 「時間 t から progress を求める関数」としてタイムラインを表現している。
 */

/** 旧いイージング。中間が急加速するので、カメラ移動には使わない */
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/**
 * カメラ移動用。始まり・終わり・真ん中のどれも急に速度が変わらない。
 * （2階微分まで連続なので、コマ間のパンが一段スムーズに見える）
 */
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10)

/**
 * @param hold  各コマで止まっている秒数
 * @param move  次のコマへ移動するのにかける秒数
 */
export function buildTimeline({ hold, move, layout, panelCount = PANEL_COUNT }) {
  const steps = []
  let cursor = 0

  for (let i = 0; i < panelCount; i += 1) {
    const at = layout.panelProgress(i)

    // このコマをじっくり見せる時間
    steps.push({ type: 'hold', index: i, start: cursor, duration: hold, from: at, to: at })
    cursor += hold

    // 次のコマへシュッと移動する時間
    if (i < panelCount - 1) {
      steps.push({
        type: 'move',
        index: i,
        start: cursor,
        duration: move,
        from: at,
        to: layout.panelProgress(i + 1),
      })
      cursor += move
    }
  }

  return { steps, total: cursor }
}

/** 時間 t がどのステップの何割の位置にいるかを返す */
export function stepAtTime(timeline, time) {
  const t = clamp(time, 0, timeline.total)

  for (const step of timeline.steps) {
    if (t < step.start + step.duration) {
      const local = step.duration > 0 ? (t - step.start) / step.duration : 1
      return { step, local: clamp(local, 0, 1) }
    }
  }

  return { step: timeline.steps[timeline.steps.length - 1], local: 1 }
}

/** 時間 t のときのカメラ位置（progress 0〜1） */
export function progressAtTime(timeline, time) {
  const { step, local } = stepAtTime(timeline, time)
  if (step.type === 'hold') return step.from
  return step.from + (step.to - step.from) * smootherstep(local)
}

/**
 * 逆算：カメラをこの位置に置きたい → 時間はいくつ？
 * イージングの逆関数を解くのは面倒なので、二分探索で十分な精度まで詰める
 * （手でカメラ枠をドラッグしたときに、タイムライン側の時間を合わせるために使う）。
 */
export function timeAtProgress(timeline, progress) {
  let low = 0
  let high = timeline.total

  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2
    if (progressAtTime(timeline, mid) < progress) low = mid
    else high = mid
  }

  return (low + high) / 2
}

/** 指定したコマの「停留が始まる時間」 */
export function timeAtPanelHold(timeline, index) {
  const step = timeline.steps.find((s) => s.type === 'hold' && s.index === index)
  return step ? step.start : 0
}
