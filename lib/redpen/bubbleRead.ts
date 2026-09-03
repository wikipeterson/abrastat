// Samples how "filled" one bubble is: the mean darkness of a disc at 80% of the bubble radius
// (spec §03), centered on wherever the affine transform says that bubble's center actually
// landed on the scan — so a slightly misregistered grid still samples paper inside the bubble,
// not its printed outline.

import { Point } from './fiducials'

/** 0 (pure white) .. 1 (pure black) mean fill of the disc. Works on the grayscale buffer, not
 *  the binarized one, so the decision rule gets real percentages (spec's log entries cite
 *  exact fill percentages) rather than a coarse yes/no. */
export function sampleBubbleFill(gray: Uint8ClampedArray, width: number, height: number, center: Point, bubbleDiameterPx: number): number {
  const radius = (bubbleDiameterPx / 2) * 0.8
  const x0 = Math.max(0, Math.floor(center.x - radius))
  const x1 = Math.min(width - 1, Math.ceil(center.x + radius))
  const y0 = Math.max(0, Math.floor(center.y - radius))
  const y1 = Math.min(height - 1, Math.ceil(center.y + radius))

  let sum = 0
  let count = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - center.x
      const dy = y - center.y
      if (dx * dx + dy * dy <= radius * radius) {
        sum += gray[y * width + x]
        count++
      }
    }
  }
  if (count === 0) return 0
  const meanGray = sum / count
  return 1 - meanGray / 255
}
