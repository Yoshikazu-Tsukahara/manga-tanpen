import { CANVAS_W } from './layout'
import { progressAtTime } from './timeline'

const PAPER = '#f7f1e4'
const INK = '#1e293b'
const FULL_FPS = 60
const SNS_FPS = 30
/** SNS向けの出力。映像はいつも 9:16 なので 720×1280 */
const SNS_W = 720
const SNS_H = 1280

/**
 * 仕上がりがおおよそ 5MB を超えないように、動画の長さからビットレートを決める。
 * エンコーダは指定より少し大きくなることがあるので、目標は 3.6MB に余白を残す。
 */
const snsBitsPerSecond = (durationSec) => {
  const targetBytes = 3.6 * 1024 * 1024
  const fromSize = (targetBytes * 8) / Math.max(durationSec, 0.5)
  return Math.round(Math.min(4_000_000, Math.max(400_000, fromSize)))
}

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
  ctx.fillRect(0, 0, layout.CAMERA_W, layout.CAMERA_H)

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
const exportFilename = (extension, panelCount, preset, aspectId) => {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`
  const kind = preset === 'sns' ? 'SNS_' : ''
  const ratio = aspectId === '3:4' ? '3x4_' : ''
  return `漫画短編_${kind}${ratio}${panelCount}コマ_${stamp}.${extension}`
}

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)))

/** 指定時刻まで待つ。rAF は最大16ms遅れるので使わず、絶対時刻で間隔を揃える */
const waitUntil = async (timestamp) => {
  const remaining = timestamp - performance.now()
  if (remaining > 0) await sleep(remaining)
}

/**
 * 現在の台本どおりに動画を書き出し、自動ダウンロードする。
 * preset が sns のときは 720×1280・30fps で 5MB 未満を狙う。映像はコマ枠が 3:4 でも 9:16。
 */
export async function exportVideo({ panels, layout, timeline, onProgress, preset = 'full' }) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('このブラウザは動画の書き出しに対応していません')
  }

  const mimeType = pickMime()
  if (!mimeType) {
    throw new Error('対応する録画形式が見つかりませんでした')
  }

  const images = await Promise.all(panels.map((panel) => (panel.src ? loadImage(panel.src) : null)))
  const page = prerenderPage(panels, images, layout)

  const sns = preset === 'sns'
  const fps = sns ? SNS_FPS : FULL_FPS
  const frameMs = 1000 / fps
  const outW = sns ? SNS_W : layout.CAMERA_W
  const outH = sns ? SNS_H : layout.CAMERA_H

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  canvas.style.cssText = `position:fixed;left:-9999px;top:0;width:${outW}px;height:${outH}px;pointer-events:none;`
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // 原稿は 1080 幅のまま描き、SNS のときは出力キャンバス側で縮小する
  ctx.setTransform(outW / layout.CAMERA_W, 0, 0, outH / layout.CAMERA_H, 0, 0)

  // 0 なら「描いたあと自分で1枚送る」手動モード。未対応なら 30fps 自動取り込み
  let stream
  try {
    stream = canvas.captureStream(0)
  } catch {
    stream = canvas.captureStream(fps)
  }
  const track = stream.getVideoTracks()[0]
  const pushFrame = () => {
    if (typeof track.requestFrame === 'function') track.requestFrame()
  }

  const chunks = []
  const videoBitsPerSecond = sns ? snsBitsPerSecond(timeline.total) : 10_000_000
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond })

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const finished = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error('録画中にエラーが起きました'))
  })

  const totalFrames = Math.max(1, Math.round(timeline.total * fps))
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
      const time = Math.min(i / fps, timeline.total)
      const progress = i === totalFrames ? 1 : progressAtTime(timeline, time)

      drawExportFrame(ctx, page, layout, progress, i === 0 ? progress : prevProgress)
      prevProgress = progress
      pushFrame()
      report(i / totalFrames)

      if (i === totalFrames) break
      await waitUntil(started + (i + 1) * frameMs)
    }

    // 最後のフレームがエンコーダに乗るまで少し待つ
    await sleep(frameMs)
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
    downloadBlob(blob, exportFilename(extension, layout.panelCount, preset, layout.aspectId))
  } finally {
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop())
    canvas.remove()
  }
}
