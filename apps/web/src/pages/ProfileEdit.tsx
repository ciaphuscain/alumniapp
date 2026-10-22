import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { useMe } from '../session.tsx';
import { ErrorNote, Field, Loading } from '../ui.tsx';

interface OwnProfile {
  displayName: string;
  headline: string;
  currentCompany: string;
  currentTitle: string;
  industry: string;
  location: string;
  researchInterests: string;
  mentorshipAvailable: boolean;
  discoverability: 'verified_members' | 'hidden';
  skills: string[];
}

export function ProfileEditPage() {
  const profile = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api<OwnProfile>('GET', '/api/me/profile'),
  });
  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorNote error={profile.error} />;
  return <ProfileForm initial={profile.data!} />;
}

function ProfileForm({ initial }: { initial: OwnProfile }) {
  const { data: me } = useMe();
  const [p, setP] = useState(initial);
  const [skills, setSkills] = useState(initial.skills.join(', '));
  const save = useMutation({
    mutationFn: () =>
      api('PUT', '/api/me/profile', {
        ...p,
        skills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
  });
  const text = (key: keyof OwnProfile) => ({
    value: p[key] as string,
    onChange: (e: { target: { value: string } }) => setP({ ...p, [key]: e.target.value }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <section className="card">
      <h1>Your profile</h1>
      {me?.affiliation?.verificationState !== 'verified' && (
        <p className="status">
          Your profile is not visible to anyone until your affiliation is verified.{' '}
          <Link to="/onboarding">Check status</Link>
        </p>
      )}
      <form onSubmit={submit}>
        <div className="grid">
          <Field label="Full name">
            <input required minLength={2} {...text('displayName')} />
          </Field>
          <Field label="Headline">
            <input
              {...text('headline')}
              placeholder="e.g. Backend engineer, mentoring final-years"
            />
          </Field>
          <Field label="Current company">
            <input {...text('currentCompany')} />
          </Field>
          <Field label="Current title">
            <input {...text('currentTitle')} />
          </Field>
          <Field label="Industry">
            <input {...text('industry')} />
          </Field>
          <Field label="Location">
            <input {...text('location')} />
          </Field>
        </div>
        <Field label="Skills" hint="Comma-separated">
          <input value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>
        <Field label="Research interests">
          <textarea {...text('researchInterests')} />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={p.mentorshipAvailable}
            onChange={(e) => setP({ ...p, mentorshipAvailable: e.target.checked })}
          />
          I am open to mentoring
        </label>
        <Field label="Who can find me">
          <select
            value={p.discoverability}
            onChange={(e) =>
              setP({ ...p, discoverability: e.target.value as OwnProfile['discoverability'] })
            }
          >
            <option value="verified_members">Verified members (appear in Discover)</option>
            <option value="hidden">Only my connections</option>
          </select>
        </Field>
        <ErrorNote error={save.error} />
        <button disabled={save.isPending}>Save profile</button>
        {save.isSuccess && <span role="status"> Saved.</span>}
      </form>
    </section>
  );
}
