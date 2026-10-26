export interface CompressedImage {
  blob: Blob
  thumbBlob: Blob
  uuid: string
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

async function resizeImage(file: File | Blob, maxSide: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      let newW = width
      let newH = height

      if (width > height) {
        if (width > maxSide) {
          newW = maxSide
          newH = Math.round(height * maxSide / width)
        }
      } else {
        if (height > maxSide) {
          newH = maxSide
          newW = Math.round(width * maxSide / height)
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = newW
      canvas.height = newH
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }
      ctx.drawImage(img, 0, 0, newW, newH)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      }, 'image/jpeg', quality)
    }
    img.onerror = reject
    img.src = url
  })
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const [blob, thumbBlob] = await Promise.all([
    resizeImage(file, 1600, 0.8),
    resizeImage(file, 400, 0.75),
  ])
  return { blob, thumbBlob, uuid: generateUUID() }
}

export async function uploadToR2(
  presignedUrl: string,
  blob: Blob,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presignedUrl)
    xhr.setRequestHeader('Content-Type', 'image/jpeg')
    if (onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(blob)
  })
}
