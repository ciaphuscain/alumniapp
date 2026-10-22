import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { SearchResponse } from '@alumni/shared';
import { api } from '../api.ts';
import { ErrorNote, Field, Loading } from '../ui.tsx';

const EMPTY = {
  q: '',
  role: '',
  department: '',
  company: '',
  skill: '',
  location: '',
  gradYearFrom: '',
  gradYearTo: '',
  mentorship: false,
};

export function DiscoverPage() {
  const [form, setForm] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (k === 'mentorship') {
      if (v) params.set(k, 'true');
    } else if (typeof v === 'string' && v.trim()) params.set(k, v.trim());
  }
  const qs = params.toString();
  const results = useInfiniteQuery({
    queryKey: ['search', qs],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(qs);
      if (pageParam) p.set('cursor', pageParam);
      return api<SearchResponse>('GET', `/api/directory/search?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFilters(form);
  };
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  const people = results.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <div className="discover">
      <form className="card filters" onSubmit={submit} role="search" aria-label="Search alumni">
        <Field label="Search">
          <input value={form.q} onChange={set('q')} placeholder="Name, role, company, skill…" />
        </Field>
        <Field label="Member type">
          <select value={form.role} onChange={set('role')}>
            <option value="">Anyone</option>
            <option value="alumni">Alumni</option>
            <option value="student">Students</option>
            <option value="faculty">Faculty</option>
          </select>
        </Field>
        <Field label="Department">
          <input value={form.department} onChange={set('department')} />
        </Field>
        <Field label="Company">
          <input value={form.company} onChange={set('company')} />
        </Field>
        <Field label="Skill">
          <input value={form.skill} onChange={set('skill')} />
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={set('location')} />
        </Field>
        <div className="row">
          <Field label="Graduated from">
            <input type="number" value={form.gradYearFrom} onChange={set('gradYearFrom')} />
          </Field>
          <Field label="to">
            <input type="number" value={form.gradYearTo} onChange={set('gradYearTo')} />
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.mentorship}
            onChange={(e) => setForm({ ...form, mentorship: e.target.checked })}
          />
          Open to mentoring
        </label>
        <button>Search</button>
        <button
          type="button"
          className="secondary"
          onClick={() => (setForm(EMPTY), setFilters(EMPTY))}
        >
          Clear
        </button>
      </form>
      <section aria-live="polite" className="results">
        {results.isLoading && <Loading />}
        <ErrorNote error={results.error} />
        {results.isSuccess && people.length === 0 && (
          <p className="card">
            No members match these filters yet. Try fewer filters or a shorter search term.
          </p>
        )}
        <ul className="people">
          {people.map((p) => (
            <li key={p.userId} className="card person">
              <Link to={`/people/${p.userId}`}>
                <strong>{p.displayName}</strong>
              </Link>
              <span className="tag">{p.role}</span>
              {p.mentorshipAvailable && <span className="tag mentor">mentor</span>}
              <div>{p.headline}</div>
              <small>
                {[p.currentTitle, p.currentCompany].filter(Boolean).join(' at ')}
                {p.department && ` · ${p.department}`}
                {p.graduationYear && ` · ${p.graduationYear}`}
                {p.location && ` · ${p.location}`}
              </small>
            </li>
          ))}
        </ul>
        {results.hasNextPage && (
          <button onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage}>
            Show more
          </button>
        )}
      </section>
    </div>
  );
}
