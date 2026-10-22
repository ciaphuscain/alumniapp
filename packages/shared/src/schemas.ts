import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const password = z.string().min(12, 'Use at least 12 characters').max(256);

export const RegisterInput = z.strictObject({
  email,
  password,
  displayName: z.string().trim().min(2).max(100),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.strictObject({ email, password: z.string().min(1).max(256) });
export type LoginInput = z.infer<typeof LoginInput>;

export const VerifyEmailInput = z.strictObject({ token: z.string().min(20).max(200) });

export const AffiliationRole = z.enum(['student', 'alumni', 'faculty']);
export type AffiliationRole = z.infer<typeof AffiliationRole>;

export const VerificationState = z.enum([
  'pending',
  'under_review',
  'verified',
  'rejected',
  'revoked',
  'appealed',
]);
export type VerificationState = z.infer<typeof VerificationState>;

export const AffiliationClaimInput = z.strictObject({
  role: AffiliationRole,
  department: z.string().trim().min(2).max(120),
  degree: z.string().trim().max(120).optional(),
  graduationYear: z
    .number()
    .int()
    .min(1900)
    .max(currentYear + 8)
    .optional(),
  /** Free-text evidence for admin review (e.g. roll number, programme, years attended). */
  evidenceNote: z.string().trim().max(1000).optional(),
});
export type AffiliationClaimInput = z.infer<typeof AffiliationClaimInput>;

export const VerificationDecisionInput = z.strictObject({
  decision: z.enum(['start_review', 'verify', 'reject', 'revoke']),
  rationale: z.string().trim().min(3).max(1000),
});
export type VerificationDecisionInput = z.infer<typeof VerificationDecisionInput>;

export const Discoverability = z.enum(['verified_members', 'hidden']);

const shortText = z.string().trim().max(120);
export const ProfileInput = z.strictObject({
  displayName: z.string().trim().min(2).max(100),
  headline: z.string().trim().max(200).default(''),
  currentCompany: shortText.default(''),
  currentTitle: shortText.default(''),
  industry: shortText.default(''),
  location: shortText.default(''),
  researchInterests: z.string().trim().max(500).default(''),
  mentorshipAvailable: z.boolean().default(false),
  discoverability: Discoverability.default('verified_members'),
  skills: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

const optionalText = z.string().trim().min(1).max(120).optional();
export const DirectorySearchQuery = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  role: AffiliationRole.optional(),
  department: optionalText,
  company: optionalText,
  industry: optionalText,
  location: optionalText,
  skill: optionalText,
  gradYearFrom: z.coerce.number().int().min(1900).max(3000).optional(),
  gradYearTo: z.coerce.number().int().min(1900).max(3000).optional(),
  mentorship: z.enum(['true']).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DirectorySearchQuery = z.infer<typeof DirectorySearchQuery>;

export const ConnectionRequestInput = z.strictObject({
  addresseeId: z.uuid(),
  message: z.string().trim().max(500).optional(),
});

export interface MeResponse {
  id: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  status: 'active' | 'suspended' | 'deleted';
  affiliation: {
    role: AffiliationRole;
    department: string;
    degree: string | null;
    graduationYear: number | null;
    verificationState: VerificationState;
    verificationMethod: string | null;
  } | null;
  hasProfile: boolean;
}

export interface ProfileSummary {
  userId: string;
  displayName: string;
  headline: string;
  role: AffiliationRole;
  department: string;
  graduationYear: number | null;
  currentCompany: string;
  currentTitle: string;
  location: string;
  mentorshipAvailable: boolean;
  skills: string[];
}

export interface ProfileDetail extends ProfileSummary {
  industry: string;
  researchInterests: string;
  degree: string | null;
  relationship: 'self' | 'connected' | 'request_sent' | 'request_received' | 'none';
  pendingRequestId: string | null;
}

export interface SearchResponse {
  results: ProfileSummary[];
  nextCursor: string | null;
}

export interface ConnectionRequestView {
  id: string;
  state: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string | null;
  createdAt: string;
  other: { userId: string; displayName: string; headline: string };
}
