import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { ErrorNote, Loading } from '../ui.tsx';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const qc = useQueryClient();
  const verify = useMutation({
    mutationFn: () => api('POST', '/api/auth/verify-email', { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const started = useRef(false);
  useEffect(() => {
    // Tokens are single-use, so guard against StrictMode's double effect.
    if (!started.current && token) {
      started.current = true;
      verify.mutate();
    }
  }, [token, verify]);

  return (
    <section className="card narrow">
      <h1>Email verification</h1>
      {verify.isPending && <Loading />}
      {verify.isSuccess && (
        <p>
          Your email is verified. <Link to="/">Continue</Link>
        </p>
      )}
      <ErrorNote
        error={verify.error ?? (!token ? new Error('This link is missing its token.') : null)}
      />
    </section>
  );
}
