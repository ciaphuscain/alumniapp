import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { useMe } from '../session.tsx';
import { ErrorNote, Loading } from '../ui.tsx';

interface CaseView {
  id: string;
  state: string;
  createdAt: string;
  user: { id: string; email: string; displayName: string | null };
  claim: {
    role: string;
    department: string;
    degree: string | null;
    graduationYear: number | null;
    evidenceNote: string | null;
  };
  history: { from: string | null; to: string; note: string | null; at: string }[];
}

export function AdminVerificationPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const cases = useQuery({
    queryKey: ['admin-cases'],
    queryFn: () => api<{ cases: CaseView[] }>('GET', '/api/admin/verification-cases'),
    enabled: !!me?.isAdmin,
  });
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      api('POST', `/api/admin/verification-cases/${id}/decision`, {
        decision,
        rationale: rationale[id] ?? '',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-cases'] }),
  });

  if (!me?.isAdmin) return <p>Administrators only.</p>;
  return (
    <section className="card">
      <h1>Verification queue</h1>
      {cases.isLoading && <Loading />}
      <ErrorNote error={cases.error ?? decide.error} />
      {cases.data?.cases.length === 0 && <p>No claims are waiting for review.</p>}
      <ul className="plain">
        {cases.data?.cases.map((c) => (
          <li key={c.id} className="case" data-testid="case">
            <h3>
              {c.user.displayName} &lt;{c.user.email}&gt; <span className="tag">{c.state}</span>
            </h3>
            <p>
              Claims: <strong>{c.claim.role}</strong>, {c.claim.department}
              {c.claim.degree && `, ${c.claim.degree}`}
              {c.claim.graduationYear && ` (${c.claim.graduationYear})`}
            </p>
            {c.claim.evidenceNote && <blockquote>{c.claim.evidenceNote}</blockquote>}
            <details>
              <summary>History</summary>
              <ol>
                {c.history.map((h, i) => (
                  <li key={i}>
                    {h.from ?? 'new'} → {h.to} {h.note && `— ${h.note}`}
                  </li>
                ))}
              </ol>
            </details>
            <label className="field">
              <span>Decision rationale (recorded in the audit log)</span>
              <input
                value={rationale[c.id] ?? ''}
                onChange={(e) => setRationale({ ...rationale, [c.id]: e.target.value })}
              />
            </label>
            <button onClick={() => decide.mutate({ id: c.id, decision: 'verify' })}>Verify</button>{' '}
            <button
              className="danger"
              onClick={() => decide.mutate({ id: c.id, decision: 'reject' })}
            >
              Reject
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
