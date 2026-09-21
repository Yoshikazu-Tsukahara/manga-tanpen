import { CAMERA_H, CANVAS_W } from './layout'
import { progressAtTime } from './timeline'

const PAPER = '#f7f1e4'
const INK = '#1e293b'
const FPS = 60
const FRAME_MS = 1000 / FPS

const pickMime = () => {
  const candidates = [
    // VP8 は VP9 より軽いので、実時間録画でもフレームが落ちにくい
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) || ''
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    image.src = src
  })

/** object-fit: cover + object-position + scale を Canvas 上で再現する */
const drawCoverImage = (ctx, image, destX, destY, destW, destH, focusX = 50, focusY = 50, zoom = 1) => {
  const fx = focusX / 100
  const fy = focusY / 100
  const cover = Math.max(destW / image.naturalWidth, destH / image.naturalHeight) * zoom
  const drawW = image.naturalWidth * cover
  const drawH = image.naturalHeight * cover
  const dx = destX + fx * destW - fx * drawW
  const dy = destY + fy * destH - fy * drawH

  ctx.save()
  ctx.beginPath()
  ctx.rect(destX, destY, destW, destH)
  ctx.clip()
  ctx.drawImage(image, dx, dy, drawW, drawH)
  ctx.restore()
}

const drawDummy = (ctx, panel, x, y, w, h) => {
  ctx.fillStyle = panel.tint || '#ffffff'
  ctx.fillRect(x, y, w, h)

  const step = Math.max(6, w * ((panel.dot || 2.4) / 100))
  ctx.fillStyle = 'rgba(30, 41, 59, 0.16)'
  for (let py = y + step / 2; py < y + h; py += step) {
    for (let px = x + step / 2; px < x + w; px += step) {
      ctx.beginPath()
      ctx.arc(px, py, step * 0.18, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.fillStyle = 'rgba(30, 41, 59, 0.85)'
  ctx.font = `700 ${Math.round(w * 0.16)}px "Yu Mincho", "Hiragino Mincho ProN", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(panel.id), x + w / 2, y + h / 2 - w * 0.04)

  if (panel.caption) {
    ctx.fillStyle = 'rgba(100, 116, 139, 0.9)'
    ctx.font = `700 ${Math.round(w * 0.028)}px "Yu Gothic", "Hiragino Sans", sans-serif`
    ctx.fillText(panel.caption, x + w / 2, y + h / 2 + w * 0.08)
  }
}

/** 原稿1枚を先に描いておき、各フレームでは切り出すだけにする */
const prerenderPage = (panels, images, layout) => {
  const page = document.createElement('canvas')
  page.width = CANVAS_W
  page.height = Math.max(1, Math.ceil(layout.TOTAL_H))
  const ctx = page.getContext('2d', { alpha: false })

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, page.width, page.height)

  panels.forEach((panel, index) => {
    const x = layout.H_INSET
    const y = layout.PAGE_PAD + index * layout.PANEL_PITCH
    const w = layout.PANEL_W
    const h = layout.PANEL_H
    const image = images[index]

    if (image) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, w, h)
      drawCoverImage(ctx, image, x, y, w, h, panel.x ?? 50, panel.y ?? 50, panel.scale ?? 1)
    } else {
      drawDummy(ctx, panel, x, y, w, h)
    }

    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
  })

  return page
}

/**
 * 先に描いた原稿から、カメラが見ている範囲だけを切り出す。
 * 大きく動いているフレームは、途中位置を重ねて残像を作り、段差を目立たなくする。
 */
const drawExportFrame = (ctx, page, layout, progress, prevProgress = progress) => {
  const from = prevProgress * layout.MAX_SCROLL
  const to = progress * layout.MAX_SCROLL
  const travel = Math.abs(to - from)
  const samples = travel < 1.5 ? 1 : Math.min(8, Math.max(3, Math.round(travel / 28)))

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CANVAS_W, CAMERA_H)

  for (let s = 0; s < samples; s += 1) {
    const t = samples === 1 ? 1 : s / (samples - 1)
    ctx.globalAlpha = 1 / (s + 1)
    ctx.drawImage(page, 0, -(from + (to - from) * t))
  }
  ctx.globalAlpha = 1
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const pad2 = (value) => String(value).padStart(2, '0')

/** 画面の「漫画 / 短編」に寄せた、保存用のファイル名 */
const exportFilename = (extension, panelCount) => {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`
  return `漫画短編_${panelCount}コマ_${stamp}.${extension}`
}

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)))

/** 指定時刻まで待つ。rAF は最大16ms遅れるので使わず、絶対時刻で間隔を揃える */
const waitUntil = async (timestamp) => {
  const remaining = timestamp - performance.now()
  if (remaining > 0) await sleep(remaining)
}

/**
 * 現在の台本どおりに 9:16 動画を書き出し、自動ダウンロードする。
 */
export async function exportVideo({ panels, layout, timeline, onProgress }) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('このブラウザは動画の書き出しに対応していません')
  }

  const mimeType = pickMime()
  if (!mimeType) {
    throw new Error('対応する録画形式が見つかりませんでした')
  }

  const images = await Promise.all(panels.map((panel) => (panel.src ? loadImage(panel.src) : null)))
  const page = prerenderPage(panels, images, layout)

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CAMERA_H
  canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:1080px;height:1920px;pointer-events:none;'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 0 なら「描いたあと自分で1枚送る」手動モード。未対応なら 30fps 自動取り込み
  let stream
  try {
    stream = canvas.captureStream(0)
  } catch {
    stream = canvas.captureStream(FPS)
  }
  const track = stream.getVideoTracks()[0]
  const pushFrame = () => {
    if (typeof track.requestFrame === 'function') track.requestFrame()
  }

  const chunks = []
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 })

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const finished = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error('録画中にエラーが起きました'))
  })

  const totalFrames = Math.max(1, Math.round(timeline.total * FPS))
  let lastUi = 0
  const report = (ratio) => {
    const now = performance.now()
    if (ratio === 0 || ratio === 1 || now - lastUi >= 80) {
      lastUi = now
      onProgress?.(ratio)
    }
  }

  try {
    drawExportFrame(ctx, page, layout, 0)
    pushFrame()
    report(0)
    recorder.start(200)

    const started = performance.now()
    let prevProgress = 0

    for (let i = 0; i <= totalFrames; i += 1) {
      const time = Math.min(i / FPS, timeline.total)
      const progress = i === totalFrames ? 1 : progressAtTime(timeline, time)

      drawExportFrame(ctx, page, layout, progress, i === 0 ? progress : prevProgress)
      prevProgress = progress
      pushFrame()
      report(i / totalFrames)

      if (i === totalFrames) break
      await waitUntil(started + (i + 1) * FRAME_MS)
    }

    // 最後のフレームがエンコーダに乗るまで少し待つ
    await sleep(FRAME_MS)
    if (recorder.state === 'recording') {
      recorder.requestData?.()
      recorder.stop()
    }
    await finished

    const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
    if (blob.size === 0) {
      throw new Error('動画データの生成に失敗しました')
    }

    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm'
    downloadBlob(blob, exportFilename(extension, layout.panelCount))
  } finally {
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop())
    canvas.remove()
  }
}
