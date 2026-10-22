import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileDetail } from '@alumni/shared';
import { api } from '../api.ts';
import { ErrorNote, Field, Loading } from '../ui.tsx';

export function ProfileViewPage() {
  const { userId } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ['profile', userId];
  const profile = useQuery({
    queryKey: key,
    queryFn: () => api<ProfileDetail>('GET', `/api/profiles/${userId}`),
  });
  const [message, setMessage] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const connect = useMutation({
    mutationFn: () =>
      api('POST', '/api/connections/requests', {
        addresseeId: userId,
        message: message || undefined,
      }),
    onSuccess: refresh,
  });
  const respond = useMutation({
    mutationFn: (action: 'accept' | 'decline' | 'cancel') =>
      api('POST', `/api/connections/requests/${profile.data!.pendingRequestId}/${action}`),
    onSuccess: refresh,
  });
  const block = useMutation({
    mutationFn: () => api('POST', '/api/blocks', { userId }),
    onSuccess: () => navigate('/discover'),
  });

  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorNote error={profile.error} />;
  const p = profile.data!;
  return (
    <section className="card">
      <h1>{p.displayName}</h1>
      <p>
        <span className="tag">{p.role}</span> {p.department}
        {p.degree && `, ${p.degree}`}
        {p.graduationYear && ` (${p.graduationYear})`}
      </p>
      {p.headline && <p className="lead">{p.headline}</p>}
      <dl>
        {p.currentTitle || p.currentCompany ? (
          <>
            <dt>Works as</dt>
            <dd>{[p.currentTitle, p.currentCompany].filter(Boolean).join(' at ')}</dd>
          </>
        ) : null}
        {p.industry && (
          <>
            <dt>Industry</dt>
            <dd>{p.industry}</dd>
          </>
        )}
        {p.location && (
          <>
            <dt>Location</dt>
            <dd>{p.location}</dd>
          </>
        )}
        {p.skills.length > 0 && (
          <>
            <dt>Skills</dt>
            <dd>{p.skills.join(', ')}</dd>
          </>
        )}
        {p.researchInterests && (
          <>
            <dt>Research interests</dt>
            <dd>{p.researchInterests}</dd>
          </>
        )}
        <dt>Mentoring</dt>
        <dd>{p.mentorshipAvailable ? 'Open to mentoring' : 'Not currently mentoring'}</dd>
      </dl>

      <div className="actions" data-testid="relationship" data-state={p.relationship}>
        {p.relationship === 'connected' && <p>You are connected.</p>}
        {p.relationship === 'request_sent' && (
          <p>
            Request sent.{' '}
            <button className="secondary" onClick={() => respond.mutate('cancel')}>
              Cancel request
            </button>
          </p>
        )}
        {p.relationship === 'request_received' && (
          <p>
            {p.displayName} wants to connect.{' '}
            <button onClick={() => respond.mutate('accept')}>Accept</button>{' '}
            <button className="secondary" onClick={() => respond.mutate('decline')}>
              Decline
            </button>
          </p>
        )}
        {p.relationship === 'none' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connect.mutate();
            }}
          >
            <Field
              label="Add a note (optional)"
              hint="Say why you'd like to connect — it helps them respond."
            >
              <textarea
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <button disabled={connect.isPending}>Send connection request</button>
          </form>
        )}
        <ErrorNote error={connect.error ?? respond.error ?? block.error} />
        {p.relationship !== 'self' && (
          <button
            className="danger"
            onClick={() => {
              if (
                confirm(
                  `Block ${p.displayName}? They will no longer see you or be able to contact you.`,
                )
              )
                block.mutate();
            }}
          >
            Block
          </button>
        )}
      </div>
    </section>
  );
}
