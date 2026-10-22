-- Initial schema for the first vertical slice:
-- identity, affiliation verification, profiles, directory search, connections, blocks, audit.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- identity
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  email_verified_at timestamptz,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Server-assigned platform roles. Never writable through the public API.
CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE email_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify_email')),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ verification
-- What the user claims about their relationship with the university.
CREATE TABLE affiliation_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('student', 'alumni', 'faculty')),
  department      text NOT NULL,
  degree          text,
  graduation_year integer CHECK (graduation_year BETWEEN 1900 AND 3000),
  evidence_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Current verification decision for a claim. History lives in verification_events.
CREATE TABLE verification_cases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    uuid NOT NULL UNIQUE REFERENCES affiliation_claims(id) ON DELETE CASCADE,
  state       text NOT NULL DEFAULT 'pending'
              CHECK (state IN ('pending', 'under_review', 'verified', 'rejected', 'revoked', 'appealed')),
  method      text CHECK (method IN ('institutional_email', 'admin_review')),
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rationale   text,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'verified' OR method IS NOT NULL)
);
CREATE INDEX verification_cases_queue_idx ON verification_cases (state, created_at)
  WHERE state IN ('pending', 'under_review', 'appealed');

CREATE TABLE verification_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id    uuid NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  from_state text,
  to_state   text NOT NULL,
  method     text,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_events_case_idx ON verification_events (case_id, id);

-- ---------------------------------------------------------------- profiles
CREATE TABLE profiles (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name         text NOT NULL,
  headline             text NOT NULL DEFAULT '',
  current_company      text NOT NULL DEFAULT '',
  current_title        text NOT NULL DEFAULT '',
  industry             text NOT NULL DEFAULT '',
  location             text NOT NULL DEFAULT '',
  research_interests   text NOT NULL DEFAULT '',
  mentorship_available boolean NOT NULL DEFAULT false,
  discoverability      text NOT NULL DEFAULT 'verified_members'
                       CHECK (discoverability IN ('verified_members', 'hidden')),
  -- Denormalized copy of profile_skills, maintained in the same transaction, so that
  -- skills participate in the generated full-text vector.
  skills_text          text NOT NULL DEFAULT '',
  search_vector        tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', display_name), 'A')
   || setweight(to_tsvector('english', headline || ' ' || current_title || ' ' || current_company || ' ' || skills_text), 'B')
   || setweight(to_tsvector('english', industry || ' ' || research_interests || ' ' || location), 'C')
  ) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_search_idx ON profiles USING gin (search_vector);
CREATE INDEX profiles_name_trgm_idx ON profiles USING gin (display_name gin_trgm_ops);
CREATE INDEX profiles_company_trgm_idx ON profiles USING gin (current_company gin_trgm_ops);
CREATE INDEX profiles_location_trgm_idx ON profiles USING gin (location gin_trgm_ops);
CREATE INDEX profiles_industry_trgm_idx ON profiles USING gin (industry gin_trgm_ops);
CREATE INDEX profiles_name_order_idx ON profiles (display_name, user_id)
  WHERE discoverability = 'verified_members';

CREATE TABLE profile_skills (
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  skill   text NOT NULL CHECK (skill = lower(skill) AND length(skill) BETWEEN 1 AND 50),
  PRIMARY KEY (user_id, skill)
);
CREATE INDEX profile_skills_skill_idx ON profile_skills (skill);

CREATE INDEX affiliation_claims_dept_year_idx ON affiliation_claims (lower(department), graduation_year);

-- ----------------------------------------------------------- relationships
CREATE TABLE connection_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state        text NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending', 'accepted', 'declined', 'cancelled')),
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (requester_id <> addressee_id)
);
-- At most one pending request per unordered pair, whichever side sent it.
CREATE UNIQUE INDEX connection_requests_one_pending_per_pair
  ON connection_requests (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
  WHERE state = 'pending';
CREATE INDEX connection_requests_addressee_idx ON connection_requests (addressee_id, created_at DESC)
  WHERE state = 'pending';
CREATE INDEX connection_requests_requester_idx ON connection_requests (requester_id, created_at DESC)
  WHERE state = 'pending';

-- One row per connected pair, stored canonically (user_low < user_high).
CREATE TABLE connections (
  user_low                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_from_request_id uuid REFERENCES connection_requests(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high)
);
CREATE INDEX connections_high_idx ON connections (user_high);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

-- ------------------------------------------------------------------- audit
CREATE TABLE audit_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  subject_type text NOT NULL,
  subject_id   text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_subject_idx ON audit_events (subject_type, subject_id, id);
