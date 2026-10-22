import type { ReactNode } from 'react';

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="error">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </p>
  );
}

export function Loading() {
  return <p aria-live="polite">Loading…</p>;
}
