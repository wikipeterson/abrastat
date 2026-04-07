import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function getCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

const stamp = new Date().toISOString()
const commit = getCommit()
const outputPath = resolve(process.cwd(), 'lib/buildStamp.generated.ts')
const nextContents =
  `export const BUILD_STAMP_ISO = ${JSON.stringify(stamp)}\n` +
  `export const BUILD_COMMIT = ${JSON.stringify(commit)}\n`

function getExistingCommit(contents) {
  const match = contents.match(/BUILD_COMMIT = "([^"]+)"/)
  return match?.[1] ?? null
}

mkdirSync(dirname(outputPath), { recursive: true })
const existingContents = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : null

// Locally, only refresh when the commit changed. That keeps the footer honest
// without dirtying the repo on every single verification build.
if (!process.env.VERCEL && existingContents && getExistingCommit(existingContents) === commit) {
  process.exit(0)
}

if (!existingContents || existingContents !== nextContents) {
  writeFileSync(outputPath, nextContents, 'utf8')
}
