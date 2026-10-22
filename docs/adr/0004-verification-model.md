# ADR-0004: Affiliation claim, verification case and evidence methods

Status: accepted (2026-10-22)

**Context.** Trust is the product. Historical alumni records are incomplete and not yet available
to us; most older alumni lack a university mailbox; peer endorsements can be gamed.

**Decision.**

- Separate concepts: account authenticated (session) → email verified → affiliation **claimed**
  (`affiliation_claims`) → affiliation **verified** (`verification_cases.state = 'verified'`) →
  permitted actions (policy module). There is no `is_verified` column.
- The case is a state machine with an append-only `verification_events` history and audit rows.
  `auto_verify` is allowed only from `pending`, so automation never overrides a human decision.
- Evidence methods today: `institutional_email` (configured map of mail domain → role it proves;
  a student mailbox cannot verify a faculty or alumni claim) and `admin_review`.
- Only the **role** is proven. Department, degree and year remain self-declared; the UI says so.
- Peer attestation is **deferred**. When added, it will be supplementary evidence for an admin,
  require attesters verified by a non-peer method, cap attestations per attester, and flag
  reciprocal or clustered attestations — never auto-verify on its own.

**Consequences.** Admin workload for alumni without mailboxes is the main scaling risk (measured
in the pilot). Reviewers see the user's evidence note; we do not store identity documents.

**Revisit when** the university provides alumni records (add a `record_match` method) or review
backlog exceeds an agreed turnaround.
