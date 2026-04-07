'use client'

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function renderSvgMarkupToPngBlob(
  svgMarkup: string,
  width: number,
  height: number,
): Promise<Blob> {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    return await new Promise<Blob>((resolve, reject) => {
      const img = new Image()
      const canvas = document.createElement('canvas')
      const timeout = window.setTimeout(() => reject(new Error('SVG export timed out')), 8000)
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
        canvas.toBlob(pngBlob => {
          if (!pngBlob) {
            reject(new Error('Could not encode PNG'))
            return
          }
          resolve(pngBlob)
        }, 'image/png')
      }

      img.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('Could not render SVG image'))
      }

      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

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

export async function renderSvgToPngBlob(
  svgNode: SVGElement,
  options?: { title?: string; xLabel?: string; yLabel?: string; width?: number; height?: number }
): Promise<Blob> {
  const rect = svgNode.getBoundingClientRect()
  const xLabel = options?.xLabel?.trim() ?? ''
  const yLabel = options?.yLabel?.trim() ?? ''
  const leftPad = yLabel ? 42 : 0
  const bottomPad = xLabel ? 28 : 0
  const plotWidth = Math.max(1, Math.ceil(options?.width ?? rect.width))
  const plotHeight = Math.max(1, Math.ceil(options?.height ?? rect.height))
  const title = options?.title?.trim() ?? ''
  const titleHeight = title ? 34 : 0
  const totalWidth = plotWidth + leftPad
  const totalHeight = plotHeight + titleHeight + bottomPad

  const svgClone = svgNode.cloneNode(true) as SVGElement
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgClone.setAttribute('width', String(plotWidth))
  svgClone.setAttribute('height', String(plotHeight))
  svgClone.setAttribute('viewBox', `0 0 ${plotWidth} ${plotHeight}`)

  const serializedSvg = new XMLSerializer().serializeToString(svgClone)
  const wrapper = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff" />
      ${title ? `<text x="${totalWidth / 2}" y="22" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="16" font-weight="600" fill="#0D4F49">${escapeSvgText(title)}</text>` : ''}
      <g transform="translate(${leftPad}, ${titleHeight})">
        ${serializedSvg}
      </g>
      ${xLabel ? `<text x="${leftPad + plotWidth / 2}" y="${titleHeight + plotHeight + 22}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="13" fill="#64748B">${escapeSvgText(xLabel)}</text>` : ''}
      ${yLabel ? `<text x="16" y="${titleHeight + plotHeight / 2}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="13" fill="#64748B" transform="rotate(-90 16 ${titleHeight + plotHeight / 2})">${escapeSvgText(yLabel)}</text>` : ''}
    </svg>
  `
  return renderSvgMarkupToPngBlob(wrapper, totalWidth, totalHeight)
}

export async function renderDomToPngBlob(node: HTMLElement): Promise<Blob> {
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
    return await new Promise<Blob>((resolve, reject) => {
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
        canvas.toBlob(pngBlob => {
          if (!pngBlob) {
            reject(new Error('Could not encode PNG'))
            return
          }
          resolve(pngBlob)
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

export async function renderDomToPngBlobWithLabels(
  node: HTMLElement,
  options?: { title?: string; xLabel?: string; yLabel?: string }
): Promise<Blob> {
  const rect = node.getBoundingClientRect()
  const plotWidth = Math.max(1, Math.ceil(rect.width))
  const plotHeight = Math.max(1, Math.ceil(rect.height))
  const title = options?.title?.trim() ?? ''
  const xLabel = options?.xLabel?.trim() ?? ''
  const yLabel = options?.yLabel?.trim() ?? ''
  const leftPad = yLabel ? 42 : 0
  const bottomPad = xLabel ? 28 : 0
  const titleHeight = title ? 34 : 0
  const totalWidth = plotWidth + leftPad
  const totalHeight = plotHeight + titleHeight + bottomPad
  const clone = cloneNodeWithInlineStyles(node) as HTMLElement

  clone.style.margin = '0'
  clone.style.width = `${plotWidth}px`
  clone.style.height = `${plotHeight}px`
  clone.style.background = '#ffffff'

  const serialized = new XMLSerializer().serializeToString(clone)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff" />
      ${title ? `<text x="${totalWidth / 2}" y="22" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="16" font-weight="600" fill="#0D4F49">${escapeSvgText(title)}</text>` : ''}
      <foreignObject x="${leftPad}" y="${titleHeight}" width="${plotWidth}" height="${plotHeight}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${plotWidth}px;height:${plotHeight}px;background:#ffffff;">
          ${serialized}
        </div>
      </foreignObject>
      ${xLabel ? `<text x="${leftPad + plotWidth / 2}" y="${titleHeight + plotHeight + 22}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="13" fill="#64748B">${escapeSvgText(xLabel)}</text>` : ''}
      ${yLabel ? `<text x="16" y="${titleHeight + plotHeight / 2}" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="13" fill="#64748B" transform="rotate(-90 16 ${titleHeight + plotHeight / 2})">${escapeSvgText(yLabel)}</text>` : ''}
    </svg>
  `
  return renderSvgMarkupToPngBlob(svg, totalWidth, totalHeight)
}

export async function exportDomAsPng(node: HTMLElement, filename: string) {
  const pngBlob = await renderDomToPngBlob(node)
  const pngUrl = URL.createObjectURL(pngBlob)
  try {
    const link = document.createElement('a')
    link.href = pngUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(pngUrl)
  }
}
