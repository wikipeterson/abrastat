'use client'

function cloneNodeWithInlineStyles(node: Node): Node {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.cloneNode(true)
  }

  if (!(node instanceof Element)) {
    return node.cloneNode(false)
  }

  if (node instanceof HTMLCanvasElement) {
    const img = document.createElement('img')
    img.src = node.toDataURL('image/png')
    img.width = node.width
    img.height = node.height
    img.style.width = `${node.clientWidth}px`
    img.style.height = `${node.clientHeight}px`
    return img
  }

  const clone = node.cloneNode(false) as Element
  const computed = window.getComputedStyle(node)
  const styleText = Array.from(computed)
    .map(prop => `${prop}:${computed.getPropertyValue(prop)};`)
    .join('')

  clone.setAttribute('style', styleText)

  if (node instanceof HTMLInputElement) {
    clone.setAttribute('value', node.value)
  }

  if (node instanceof HTMLSelectElement) {
    const clonedSelect = clone as HTMLSelectElement
    clonedSelect.value = node.value
    Array.from(clonedSelect.options).forEach(option => {
      option.selected = option.value === node.value
    })
  }

  if (node instanceof SVGElement) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  for (const child of Array.from(node.childNodes)) {
    clone.appendChild(cloneNodeWithInlineStyles(child))
  }

  return clone
}

export async function exportDomAsPng(node: HTMLElement, filename: string) {
  const rect = node.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(rect.width))
  const height = Math.max(1, Math.ceil(rect.height))
  const clone = cloneNodeWithInlineStyles(node) as HTMLElement

  clone.style.margin = '0'
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.background = '#ffffff'

  const serialized = new XMLSerializer().serializeToString(clone)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;background:#ffffff;">
          ${serialized}
        </div>
      </foreignObject>
    </svg>
  `

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      const canvas = document.createElement('canvas')
      const timeout = window.setTimeout(() => {
        reject(new Error('Graph export timed out'))
      }, 8000)
      canvas.width = width * 2
      canvas.height = height * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        window.clearTimeout(timeout)
        reject(new Error('Could not create export canvas'))
        return
      }

      img.onload = () => {
        window.clearTimeout(timeout)
        ctx.scale(2, 2)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error('Could not encode PNG'))
            return
          }
          const pngUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = pngUrl
          link.download = filename
          document.body.appendChild(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(pngUrl)
          resolve()
        }, 'image/png')
      }

      img.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('Could not render export image'))
      }
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
