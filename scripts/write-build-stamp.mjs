import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
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

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(
  outputPath,
  `export const BUILD_STAMP_ISO = ${JSON.stringify(stamp)}\nexport const BUILD_COMMIT = ${JSON.stringify(commit)}\n`,
  'utf8'
)

