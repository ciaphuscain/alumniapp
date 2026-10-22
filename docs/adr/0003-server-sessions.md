# ADR-0003: Opaque server-side sessions instead of JWTs

Status: accepted (2026-10-22)

**Context.** Suspension, revocation and logout must take effect immediately (privacy and safety
requirement). One web client on the same origin as the API.

**Decision.** 256-bit random token in an `HttpOnly; SameSite=Lax` cookie (`Secure` behind HTTPS);
only its SHA-256 is stored in `sessions`. Every request resolves the session joined to `users`
with `status = 'active'`, so suspension blocks access on the next request. CSRF: SameSite plus a
required `X-Requested-With: alumniapp` header on every non-GET request.

**Rejected.** JWT access tokens: revocation needs a denylist or short TTL + refresh flow — more
moving parts for no benefit with a single first-party client.

**Consequences.** One indexed lookup per request (cheap at this scale). Mobile clients would need
a token flow later.
