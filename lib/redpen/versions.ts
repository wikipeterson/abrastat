// Multi-version (A/B) assessment helpers. Two RedPenAssessment docs sharing a versionGroupId
// *are* the two versions — same printed shape, different correct answers — so "the version
// group" is never its own document, just a shared field. See types.ts's versionGroupId/
// versionLabel and the FORM-bubble design in geometry.ts/scanPipeline.ts.

import { listAssessments } from './storage'
import { RedPenAssessment } from './types'

/** Every assessment sharing `groupId`, in versionLabel order (falls back to insertion order for
 *  a label that's missing or unrecognized, though every version created through the app has
 *  one). Thin client-side filter over listAssessments, matching this file's established
 *  "one ownerId query, filter the rest client-side" convention (see storage.ts's header). */
export async function listVersionGroup(userId: string, groupId: string): Promise<RedPenAssessment[]> {
  const all = await listAssessments(userId)
  return all
    .filter(a => a.versionGroupId === groupId)
    .sort((a, b) => (a.versionLabel ?? '').localeCompare(b.versionLabel ?? ''))
}

/** The "primary" version of a group — Version A by convention, since that's the one a version
 *  group's RedPenAdministration.assessmentId always points at (print-shape metadata, and the
 *  anchor used to find that group's administrations when regrading). Falls back to the first
 *  member if none is labeled 'A' for some reason, rather than returning nothing. */
export function primaryOfGroup(members: RedPenAssessment[]): RedPenAssessment | undefined {
  return members.find(a => a.versionLabel === 'A') ?? members[0]
}
