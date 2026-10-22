import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConnectionRequestView } from '@alumni/shared';
import { api } from '../api.ts';
import { ErrorNote, Loading } from '../ui.tsx';

interface ConnectionView {
  userId: string;
  displayName: string;
  headline: string;
  currentCompany: string;
}

export function ConnectionsPage() {
  const qc = useQueryClient();
  const incoming = useQuery({
    queryKey: ['requests', 'incoming'],
    queryFn: () =>
      api<{ requests: ConnectionRequestView[] }>(
        'GET',
        '/api/connections/requests?direction=incoming',
      ),
  });
  const outgoing = useQuery({
    queryKey: ['requests', 'outgoing'],
    queryFn: () =>
      api<{ requests: ConnectionRequestView[] }>(
        'GET',
        '/api/connections/requests?direction=outgoing',
      ),
  });
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: () => api<{ connections: ConnectionView[] }>('GET', '/api/connections'),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' | 'cancel' }) =>
      api('POST', `/api/connections/requests/${id}/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  return (
    <div className="stack">
      <section className="card">
        <h2>Requests for you</h2>
        {incoming.isLoading && <Loading />}
        <ErrorNote error={incoming.error ?? act.error} />
        {incoming.data?.requests.length === 0 && <p>No pending requests.</p>}
        <ul className="plain">
          {incoming.data?.requests.map((r) => (
            <li key={r.id} data-testid="incoming-request">
              <Link to={`/people/${r.other.userId}`}>{r.other.displayName}</Link> —{' '}
              {r.other.headline}
              {r.message && <blockquote>{r.message}</blockquote>}
              <button onClick={() => act.mutate({ id: r.id, action: 'accept' })}>
                Accept
              </button>{' '}
              <button
                className="secondary"
                onClick={() => act.mutate({ id: r.id, action: 'decline' })}
              >
                Decline
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>Sent requests</h2>
        {outgoing.data?.requests.length === 0 && <p>You have no pending sent requests.</p>}
        <ul className="plain">
          {outgoing.data?.requests.map((r) => (
            <li key={r.id}>
              <Link to={`/people/${r.other.userId}`}>{r.other.displayName}</Link>{' '}
              <button
                className="secondary"
                onClick={() => act.mutate({ id: r.id, action: 'cancel' })}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>Your connections</h2>
        {connections.data?.connections.length === 0 && (
          <p>
            No connections yet. <Link to="/discover">Find alumni</Link> to get started.
          </p>
        )}
        <ul className="plain" data-testid="connections">
          {connections.data?.connections.map((c) => (
            <li key={c.userId}>
              <Link to={`/people/${c.userId}`}>{c.displayName}</Link> — {c.headline}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
