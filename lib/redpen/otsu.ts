// Otsu's method: picks the grayscale threshold that best separates a bimodal histogram (here,
// printed/marked ink vs. paper) by maximizing between-class variance. Computed per page (spec
// §03 — not per document), since one unevenly-lit or shadowed page shouldn't shift the
// threshold used on every other page.

/** Mean of R/G/B per pixel — the scan is nominally grayscale already, but this is robust to a
 *  scanner or pdf.js handing back RGB data anyway. */
export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length / 4)
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    gray[p] = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3
  }
  return gray
}

/** Returns the Otsu threshold (0-255) for a grayscale buffer. */
export function otsuThreshold(gray: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0)
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++

  const total = gray.length
  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * histogram[t]

  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t]
    if (weightBackground === 0) continue
    const weightForeground = total - weightBackground
    if (weightForeground === 0) break

    sumBackground += t * histogram[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sumAll - sumBackground) / weightForeground

    const betweenVariance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    if (betweenVariance > bestVariance) {
      bestVariance = betweenVariance
      best = t
    }
  }
  return best
}

/** True = dark (ink/mark), false = light (paper). Pixels darker than the threshold are "dark". */
export function binarize(gray: Uint8ClampedArray, threshold: number): Uint8Array {
  const bits = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) bits[i] = gray[i] < threshold ? 1 : 0
  return bits
}
