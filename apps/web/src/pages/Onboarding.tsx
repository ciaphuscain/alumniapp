import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AffiliationRole } from '@alumni/shared';
import { api } from '../api.ts';
import { useMe } from '../session.tsx';
import { ErrorNote, Field } from '../ui.tsx';

const STATE_TEXT: Record<string, string> = {
  pending: 'Waiting for review by a university administrator.',
  under_review: 'An administrator is reviewing your claim.',
  appealed: 'Your appeal is waiting for review.',
  rejected: 'Your claim was not verified. You can appeal with more evidence.',
  revoked: 'Your verification was revoked. Contact the alumni office.',
  verified: 'Your affiliation is verified.',
};

export function OnboardingPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [claim, setClaim] = useState({
    role: 'alumni' as AffiliationRole,
    department: '',
    degree: '',
    graduationYear: '',
    evidenceNote: '',
  });
  const [appealNote, setAppealNote] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });
  const submitClaim = useMutation({
    mutationFn: () =>
      api('PUT', '/api/me/affiliation', {
        role: claim.role,
        department: claim.department,
        degree: claim.degree || undefined,
        graduationYear: claim.graduationYear ? Number(claim.graduationYear) : undefined,
        evidenceNote: claim.evidenceNote || undefined,
      }),
    onSuccess: refresh,
  });
  const appeal = useMutation({
    mutationFn: () => api('POST', '/api/me/affiliation/appeal', { note: appealNote }),
    onSuccess: refresh,
  });
  const resend = useMutation({ mutationFn: () => api('POST', '/api/auth/resend-verification') });

  if (!me) return null;
  if (!me.emailVerified) {
    return (
      <section className="card narrow">
        <h1>Verify your email</h1>
        <p>Open the link we emailed to {me.email} to continue.</p>
        <button onClick={() => resend.mutate()} disabled={resend.isPending}>
          Resend link
        </button>
        {resend.isSuccess && <p>Sent.</p>}
      </section>
    );
  }

  const state = me.affiliation?.verificationState;
  const onClaim = (e: FormEvent) => {
    e.preventDefault();
    submitClaim.mutate();
  };
  return (
    <section className="card narrow">
      <h1>Your university affiliation</h1>
      {me.affiliation && (
        <p className={`status status-${state}`} data-testid="verification-state">
          <strong>{me.affiliation.role}</strong>, {me.affiliation.department} — {STATE_TEXT[state!]}
        </p>
      )}
      {state === 'verified' && (
        <p>
          Next: <Link to="/profile">complete your profile</Link> or{' '}
          <Link to="/discover">find alumni</Link>.
        </p>
      )}
      {(!me.affiliation || state === 'pending') && (
        <form onSubmit={onClaim}>
          <p>
            Only your role is proven by a university mailbox. Department and year are shown as you
            declare them. Alumni without a university mailbox are reviewed by an administrator.
          </p>
          <Field label="I am a">
            <select
              value={claim.role}
              onChange={(e) => setClaim({ ...claim, role: e.target.value as AffiliationRole })}
            >
              <option value="student">Current student</option>
              <option value="alumni">Alumnus / alumna</option>
              <option value="faculty">Faculty member</option>
            </select>
          </Field>
          <Field label="Department">
            <input
              required
              minLength={2}
              value={claim.department}
              onChange={(e) => setClaim({ ...claim, department: e.target.value })}
            />
          </Field>
          <Field label="Degree (optional)">
            <input
              value={claim.degree}
              onChange={(e) => setClaim({ ...claim, degree: e.target.value })}
            />
          </Field>
          <Field label="Graduation year (optional)">
            <input
              type="number"
              min={1900}
              max={3000}
              value={claim.graduationYear}
              onChange={(e) => setClaim({ ...claim, graduationYear: e.target.value })}
            />
          </Field>
          <Field
            label="Evidence for reviewers (optional)"
            hint="e.g. roll number, programme, years attended. Do not upload ID documents."
          >
            <textarea
              value={claim.evidenceNote}
              onChange={(e) => setClaim({ ...claim, evidenceNote: e.target.value })}
            />
          </Field>
          <ErrorNote error={submitClaim.error} />
          <button disabled={submitClaim.isPending}>
            {me.affiliation ? 'Update claim' : 'Submit claim'}
          </button>
        </form>
      )}
      {state === 'rejected' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            appeal.mutate();
          }}
        >
          <Field
            label="Appeal note"
            hint="Explain what evidence the reviewer should consider (10+ characters)."
          >
            <textarea
              required
              minLength={10}
              value={appealNote}
              onChange={(e) => setAppealNote(e.target.value)}
            />
          </Field>
          <ErrorNote error={appeal.error} />
          <button disabled={appeal.isPending}>Submit appeal</button>
        </form>
      )}
    </section>
  );
}
