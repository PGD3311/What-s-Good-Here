/**
 * Downscale a captured photo to maxDim and re-encode as JPEG base64.
 * Uses an <img> element (not createImageBitmap) so iOS HEIC decodes natively —
 * the re-encode is also what converts HEIC to JPEG (Anthropic rejects HEIC).
 * @param {File} file - image file from a capture input
 * @param {number} maxDim - longest-edge cap in px
 * @param {number} quality - JPEG quality 0-1
 * @returns {Promise<{ base64: string, mediaType: 'image/jpeg' }>}
 */
export function downscaleImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Could not process that photo')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
      } catch (err) {
        reject(err)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that photo'))
    }
    img.src = url
  })
}
