// marksheet/v1: the app's only import surface (spec §04). A teacher pastes whatever an LLM
// returned after being given buildImportPromptText(); we validate it and report exactly which
// question failed, before anything is saved.
//
// In practice, an LLM given a prose description of a JSON shape reliably nails the part that's
// spelled out in detail (each question: n/answer/points/topic) and just as reliably drops
// wrapper fields that are only described, not shown — schema/title/choiceCount. That's not a
// malformed response, it's the expected failure mode of prose-only instructions, so this parser
// treats those three as recoverable: infer what's missing, warn about it, and only hard-fail on
// things that would actually corrupt the answer key (bad question shapes, an answer letter that
// doesn't parse, etc).

import { AnswerEntry, AnswerValue, UnscorableEntry } from './types'

export interface ParsedMarksheet {
  title: string
  choiceCount: number
  questions: AnswerEntry[]
  unscorable: UnscorableEntry[]
}

export type ParseResult =
  | { ok: true; data: ParsedMarksheet; warnings: string[] }
  | { ok: false; errors: string[] }

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const DEFAULT_CHOICE_COUNT = 4

function letterIndex(letter: string): number {
  return LETTERS.indexOf(letter)
}

function isLetterAnswer(value: unknown): value is string {
  return typeof value === 'string' && letterIndex(value) !== -1
}

/** Validates shape only, against the full A–F range — choiceCount isn't known yet at this
 *  point when it wasn't provided, so range-checking against a declared count happens later. */
function validateAnswer(n: number, answer: unknown): { value?: AnswerValue; error?: string } {
  if (Array.isArray(answer)) {
    if (answer.length === 0 || !answer.every(isLetterAnswer)) {
      return { error: `Q${n}: "answer" array must contain only letters A–${LETTERS[LETTERS.length - 1]}.` }
    }
    return { value: answer as string[] }
  }
  if (isLetterAnswer(answer)) {
    return { value: answer }
  }
  return { error: `Q${n}: "answer" must be a letter, an array of letters, or a numeric string for grid-in.` }
}

/**
 * Parses and validates pasted JSON against the marksheet/v1 schema. Never throws — every hard
 * failure comes back as a message naming the question number it belongs to, so the import
 * screen can show exactly what to fix before anything is saved. Missing wrapper fields
 * (schema/title/choiceCount) are inferred instead of rejected; that's reported via `warnings`
 * so the teacher sees what was guessed, but doesn't block the import.
 */
export function parseMarksheetV1(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [`Couldn't parse that as JSON: ${e instanceof Error ? e.message : String(e)}`] }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['Expected a JSON object at the top level.'] }
  }
  const obj = raw as Record<string, unknown>

  const errors: string[] = []
  const warnings: string[] = []

  if (obj.schema !== undefined && obj.schema !== 'marksheet/v1') {
    errors.push(`"schema" must be "marksheet/v1" if present (got ${JSON.stringify(obj.schema)}).`)
  } else if (obj.schema === undefined) {
    warnings.push('No "schema" field — assuming this is marksheet/v1 anyway since it has the right shape.')
  }

  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : ''
  if (!title) warnings.push('No "title" was given — name the assessment on the next screen.')

  const declaredChoiceCount = typeof obj.choiceCount === 'number' ? obj.choiceCount : NaN
  if (obj.choiceCount !== undefined && !(declaredChoiceCount >= 2 && declaredChoiceCount <= LETTERS.length)) {
    errors.push(`"choiceCount" must be a number between 2 and ${LETTERS.length} if present.`)
  }

  const questionsRaw = obj.questions
  const questions: AnswerEntry[] = []
  let highestLetterIndexUsed = -1

  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
    errors.push('"questions" must be a non-empty array.')
  } else {
    questionsRaw.forEach((q, i) => {
      if (typeof q !== 'object' || q === null) {
        errors.push(`Question ${i + 1}: expected an object.`)
        return
      }
      const qq = q as Record<string, unknown>
      const n = typeof qq.n === 'number' ? qq.n : i + 1
      const type = qq.type === 'gridin' ? 'gridin' : qq.type === 'mc' || qq.type === undefined ? 'mc' : undefined
      if (type === undefined) {
        errors.push(`Q${n}: "type" must be "mc" or "gridin" if present.`)
        return
      }
      const points = typeof qq.points === 'number' && qq.points > 0 ? qq.points : NaN
      if (!Number.isFinite(points)) {
        errors.push(`Q${n}: "points" must be a positive number.`)
        return
      }
      if (type === 'gridin') {
        if (typeof qq.answer !== 'string' || !/^-?\d+(\.\d+)?$/.test(qq.answer.trim())) {
          errors.push(`Q${n}: grid-in "answer" must be a numeric string.`)
          return
        }
        questions.push({
          n, answer: qq.answer.trim(), points, type,
          topic: typeof qq.topic === 'string' ? qq.topic : undefined,
          digits: typeof qq.digits === 'number' ? qq.digits : undefined,
        })
        return
      }
      const { value, error } = validateAnswer(n, qq.answer)
      if (error) { errors.push(error); return }
      const letters = Array.isArray(value) ? value : [value!]
      highestLetterIndexUsed = Math.max(highestLetterIndexUsed, ...letters.map(letterIndex))
      questions.push({
        n, answer: value!, points, type: 'mc',
        topic: typeof qq.topic === 'string' ? qq.topic : undefined,
      })
    })
  }

  // choiceCount must cover every letter actually used, whatever was (or wasn't) declared —
  // never silently drop an answer that's out of a stated range instead of widening to fit it.
  const inferredMinimum = highestLetterIndexUsed + 1
  const choiceCount = Number.isFinite(declaredChoiceCount)
    ? Math.min(LETTERS.length, Math.max(declaredChoiceCount, inferredMinimum))
    : Math.min(LETTERS.length, Math.max(DEFAULT_CHOICE_COUNT, inferredMinimum))
  if (!Number.isFinite(declaredChoiceCount) && inferredMinimum > 0) {
    warnings.push(`No "choiceCount" was given — set to ${choiceCount} from the answers used (double-check this matches the real sheet).`)
  }

  const unscorableRaw = obj.unscorable
  const unscorable: UnscorableEntry[] = []
  if (unscorableRaw !== undefined) {
    if (!Array.isArray(unscorableRaw)) {
      errors.push('"unscorable" must be an array if present.')
    } else {
      unscorableRaw.forEach((u, i) => {
        if (typeof u !== 'object' || u === null) { errors.push(`unscorable[${i}]: expected an object.`); return }
        const uu = u as Record<string, unknown>
        const n = typeof uu.n === 'number' ? uu.n : NaN
        const reason = typeof uu.reason === 'string' ? uu.reason : ''
        if (!Number.isFinite(n) || !reason) {
          errors.push(`unscorable[${i}]: needs a numeric "n" and a "reason".`)
          return
        }
        unscorable.push({ n, reason })
      })
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    warnings,
    data: { title, choiceCount, questions: questions.sort((a, b) => a.n - b.n), unscorable },
  }
}

/** The exact ask-for-JSON prompt teachers copy and send to Claude alongside their quiz. Shows
 *  the literal top-level shape (not just prose) — an LLM reliably matches an example it can see
 *  and just as reliably drops fields that are only described, so the wrapper is spelled out. */
export function buildImportPromptText(): string {
  return [
    'Now give me the answers as JSON matching the marksheet/v1 schema. Return exactly this shape',
    '(a schema/title/choiceCount wrapper around the questions, not just the questions array):',
    '',
    '{',
    '  "schema": "marksheet/v1",',
    '  "title": "<the assessment\'s title>",',
    '  "choiceCount": <number of choices per question, e.g. 5>,',
    '  "questions": [',
    '    { "n": 1, "answer": "C", "points": 1, "topic": "..." },',
    '    { "n": 2, "answer": ["B","D"], "points": 2, "topic": "..." },',
    '    { "n": 3, "type": "gridin", "answer": "-0.25", "points": 2, "topic": "..." }',
    '  ],',
    '  "unscorable": [',
    '    { "n": 4, "reason": "asks for work shown" }',
    '  ]',
    '}',
    '',
    'Use a letter for multiple choice, an array of letters when more than one answer is correct,',
    'and type "gridin" with a numeric answer string for anything with a numeric result. Do not',
    'include question text. If a question can\'t be scored by bubble — it asks for work, a proof,',
    'or reads a value off a graph you\'re not fully sure of — omit it from "questions" and list it',
    'in "unscorable" with a one-line reason instead of guessing.',
  ].join('\n')
}
