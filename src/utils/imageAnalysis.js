/**
 * Client-side image analysis for photo quality scoring
 */

import { PHOTO_QUALITY, REJECTION_MESSAGES } from '../constants/photoQuality'

/**
 * Re-encode an image file to JPEG to strip EXIF metadata (GPS coordinates,
 * timestamps, device info). Browsers automatically apply EXIF orientation
 * when drawing to canvas, so portrait photos won't end up rotated.
 *
 * Throws on decode failure (e.g. HEIC on a browser without HEIC support);
 * the caller is expected to surface a friendly error rather than silently
 * uploading the original with metadata intact.
 *
 * @param {File} file
 * @param {Object} [options]
 * @param {number} [options.quality=0.92] - JPEG quality, 0..1
 * @returns {Promise<File>} New File with .jpg extension and image/jpeg type
 */
export async function stripExifAndReencode(file, { quality = 0.92 } = {}) {
  const img = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  )
  if (!blob) throw new Error('Image re-encoding failed')
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

/**
 * Load an image file into an HTMLImageElement
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Analyze brightness by sampling the image at a lower resolution
 * Uses luminance formula: 0.299*R + 0.587*G + 0.114*B
 */
function analyzeBrightness(img, sampleSize = 64) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  canvas.width = sampleSize
  canvas.height = sampleSize

  // Draw image scaled down to sample size
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize)

  const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize)
  const pixels = imageData.data
  const totalPixels = sampleSize * sampleSize

  let totalLuminance = 0
  let darkPixels = 0
  let brightPixels = 0

  const { BRIGHTNESS } = PHOTO_QUALITY

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]

    // Standard luminance formula
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b

    totalLuminance += luminance

    if (luminance < BRIGHTNESS.DARK_PIXEL_THRESHOLD) {
      darkPixels++
    }
    if (luminance > BRIGHTNESS.BRIGHT_PIXEL_THRESHOLD) {
      brightPixels++
    }
  }

  return {
    avg: totalLuminance / totalPixels,
    darkPct: (darkPixels / totalPixels) * 100,
    brightPct: (brightPixels / totalPixels) * 100,
  }
}

/**
 * Calculate individual component scores
 */
function calculateComponentScores(metrics) {
  const { IDEAL, ASPECT_RATIO } = PHOTO_QUALITY

  // Resolution score: based on shortest side, maxes out at IDEAL.RESOLUTION
  const shortestSide = Math.min(metrics.width, metrics.height)
  const resolutionScore = Math.min(100, (shortestSide / IDEAL.RESOLUTION) * 100)

  // Brightness score: 100 at ideal brightness, decreasing as it moves away
  const brightnessDiff = Math.abs(metrics.avgBrightness - IDEAL.BRIGHTNESS)
  const brightnessScore = Math.max(0, 100 - brightnessDiff / 1.28)

  // Compression score: bytes per pixel ratio
  const totalPixels = metrics.width * metrics.height
  const bytesPerPixel = metrics.fileSize / totalPixels
  const compressionScore = Math.min(100, (bytesPerPixel / IDEAL.BYTES_PER_PIXEL) * 100)

  // Aspect ratio score: no penalty for portrait/landscape up to 1.5 ratio
  // Uses max(w/h, h/w) so ratio is always >= 1
  const ratio = Math.max(metrics.width / metrics.height, metrics.height / metrics.width)
  let aspectRatioScore
  if (ratio <= ASPECT_RATIO.NO_PENALTY_MAX) {
    // Full score for ratio <= 1.5 (covers 4:3, 3:4, and most phone photos)
    aspectRatioScore = 100
  } else if (ratio <= ASPECT_RATIO.MILD_PENALTY_MAX) {
    // Mild penalty from 1.5 to 2.0 (linear from 100 to 70)
    const t = (ratio - ASPECT_RATIO.NO_PENALTY_MAX) / (ASPECT_RATIO.MILD_PENALTY_MAX - ASPECT_RATIO.NO_PENALTY_MAX)
    aspectRatioScore = 100 - t * 30
  } else {
    // Strong penalty beyond 2.0 (panoramas, screenshots)
    // Linear from 70 down to 0 at ratio 4.0
    const t = Math.min(1, (ratio - ASPECT_RATIO.MILD_PENALTY_MAX) / 2)
    aspectRatioScore = Math.max(0, 70 - t * 70)
  }

  return {
    resolution: resolutionScore,
    brightness: brightnessScore,
    compression: compressionScore,
    aspectRatio: aspectRatioScore,
  }
}

/**
 * Calculate overall quality score from component scores
 */
function calculateQualityScore(componentScores) {
  const { SCORING } = PHOTO_QUALITY

  const score =
    componentScores.resolution * (SCORING.RESOLUTION_WEIGHT / 100) +
    componentScores.brightness * (SCORING.BRIGHTNESS_WEIGHT / 100) +
    componentScores.compression * (SCORING.COMPRESSION_WEIGHT / 100) +
    componentScores.aspectRatio * (SCORING.ASPECT_RATIO_WEIGHT / 100)

  return Math.round(score)
}

/**
 * Determine placement status based on score
 */
function determineStatus(qualityScore, rejectReason) {
  if (rejectReason) {
    return 'rejected'
  }

  const { PLACEMENT } = PHOTO_QUALITY

  if (qualityScore >= PLACEMENT.FEATURED_MIN_SCORE) {
    return 'featured'
  }
  if (qualityScore >= PLACEMENT.COMMUNITY_MIN_SCORE) {
    return 'community'
  }
  return 'hidden'
}

/**
 * Main analysis function - analyzes an image file and returns all metrics
 */
export async function analyzeImage(file) {
  const result = {
    width: 0,
    height: 0,
    mimeType: file.type,
    fileSize: file.size,
    avgBrightness: 0,
    brightPixelPct: 0,
    darkPixelPct: 0,
    qualityScore: 0,
    status: 'rejected',
    rejectReason: null,
  }

  // Hard gate 1: Check mime type
  if (!PHOTO_QUALITY.ALLOWED_MIME_TYPES.includes(file.type)) {
    result.rejectReason = REJECTION_MESSAGES.INVALID_TYPE
    return result
  }

  // Hard gate 2: Check file size
  if (file.size > PHOTO_QUALITY.MAX_FILE_SIZE_BYTES) {
    result.rejectReason = REJECTION_MESSAGES.FILE_TOO_LARGE
    return result
  }

  // Load image to get dimensions
  let img
  try {
    img = await loadImageFromFile(file)
  } catch {
    result.rejectReason = 'Failed to load image'
    return result
  }

  result.width = img.width
  result.height = img.height

  // Hard gate 3: Check resolution
  const shortestSide = Math.min(img.width, img.height)
  if (shortestSide < PHOTO_QUALITY.MIN_RESOLUTION_PX) {
    result.rejectReason = REJECTION_MESSAGES.TOO_SMALL
    return result
  }

  // Analyze brightness
  const brightness = analyzeBrightness(img)
  result.avgBrightness = brightness.avg
  result.darkPixelPct = brightness.darkPct
  result.brightPixelPct = brightness.brightPct

  // Hard gate 4: Check brightness extremes
  const { BRIGHTNESS } = PHOTO_QUALITY
  if (
    brightness.avg < BRIGHTNESS.MIN_AVG ||
    brightness.darkPct > BRIGHTNESS.MAX_DARK_PCT
  ) {
    result.rejectReason = REJECTION_MESSAGES.TOO_DARK
    return result
  }

  if (
    brightness.avg > BRIGHTNESS.MAX_AVG ||
    brightness.brightPct > BRIGHTNESS.MAX_BRIGHT_PCT
  ) {
    result.rejectReason = REJECTION_MESSAGES.TOO_BRIGHT
    return result
  }

  // Calculate quality score
  const componentScores = calculateComponentScores({
    width: result.width,
    height: result.height,
    avgBrightness: result.avgBrightness,
    fileSize: result.fileSize,
  })

  result.qualityScore = calculateQualityScore(componentScores)
  result.status = determineStatus(result.qualityScore, result.rejectReason)

  return result
}
