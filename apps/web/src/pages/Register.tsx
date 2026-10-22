import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api.ts';
import { ErrorNote, Field } from '../ui.tsx';

export function RegisterPage() {
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const register = useMutation({ mutationFn: () => api('POST', '/api/auth/register', form) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate();
  };

  if (register.isSuccess) {
    return (
      <section className="card narrow">
        <h1>Check your email</h1>
        <p>
          We sent a verification link to <strong>{form.email}</strong>. Open it, then{' '}
          <Link to="/login">sign in</Link>.
        </p>
      </section>
    );
  }
  return (
    <section className="card narrow">
      <h1>Join the alumni network</h1>
      <p>
        Use your university email if you have one: it verifies student and faculty accounts
        instantly.
      </p>
      <form onSubmit={submit}>
        <Field label="Full name">
          <input
            required
            minLength={2}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password" hint="At least 12 characters">
          <input
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <ErrorNote error={register.error} />
        <button disabled={register.isPending}>Create account</button>
      </form>
      <p>
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
