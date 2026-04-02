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

// Avoid dirtying the local repo on every verification build.
// Vercel deploys still write a fresh stamp in their ephemeral build env.
if (!process.env.VERCEL && existsSync(outputPath)) {
  process.exit(0)
}

mkdirSync(dirname(outputPath), { recursive: true })
if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== nextContents) {
  writeFileSync(outputPath, nextContents, 'utf8')
}
