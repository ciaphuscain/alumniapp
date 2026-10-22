/**
 * Central visibility rules for member profiles. Directory search, profile view and
 * relationship actions all build their SQL from these fragments so that blocking,
 * suspension, verification and discoverability are enforced identically everywhere.
 *
 * Fragments expect the aliases produced by MEMBER_FROM and take the viewer id as a
 * positional parameter reference such as `$1`.
 */

export const MEMBER_FROM = `profiles p
  JOIN users u ON u.id = p.user_id
  JOIN affiliation_claims ac ON ac.user_id = p.user_id
  JOIN verification_cases vc ON vc.claim_id = ac.id`;

/** Target account is active and its university affiliation is currently verified. */
export const ACTIVE_VERIFIED = `(u.status = 'active' AND vc.state = 'verified')`;

/**
 * Neither side has blocked the other. Written as two NOT EXISTS clauses rather than one
 * with an OR so the planner can use hashed anti-joins / the primary key for each direction
 * (see docs/benchmarks/directory-search.md for the measured difference).
 */
export const notBlocked = (viewer: string) => `(
  NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = ${viewer} AND b.blocked_id = p.user_id)
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = p.user_id AND b.blocked_id = ${viewer}))`;

export const isConnected = (viewer: string) => `EXISTS (
  SELECT 1 FROM connections c
   WHERE c.user_low = LEAST(${viewer}::uuid, p.user_id) AND c.user_high = GREATEST(${viewer}::uuid, p.user_id))`;

/** May appear in the viewer's directory search results. */
export const searchableBy = (viewer: string) => `(
  ${ACTIVE_VERIFIED}
  AND p.discoverability = 'verified_members'
  AND p.user_id <> ${viewer}
  AND ${notBlocked(viewer)})`;

/**
 * May be opened by the viewer: their own profile, or an active verified member who has not
 * blocked/been blocked and is either discoverable or already connected to the viewer.
 */
export const viewableBy = (viewer: string) => `(
  p.user_id = ${viewer}
  OR (${ACTIVE_VERIFIED}
      AND ${notBlocked(viewer)}
      AND (p.discoverability = 'verified_members' OR ${isConnected(viewer)})))`;
