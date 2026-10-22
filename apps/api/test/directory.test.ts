import { describe, expect, it } from 'vitest';
import type { SearchResponse } from '@alumni/shared';
import { call, makeAdmin, makeMember, signUp, useTestApp, type Session } from './helpers.ts';

const ctx = useTestApp();

async function search(
  s: Session,
  qs = '',
): Promise<{ status: number; names: string[]; body: SearchResponse }> {
  const res = await call(ctx.app, 'GET', `/api/directory/search${qs}`, { session: s });
  const body = res.json<SearchResponse>();
  return {
    status: res.statusCode,
    names: body.results?.map((r) => r.displayName) ?? [],
    body,
  };
}

describe('directory search and profile visibility', () => {
  it('only lets verified members search', async () => {
    const unverified = await signUp(ctx, 'pending@gmail.com');
    expect((await search(unverified)).status).toBe(403);
    expect((await call(ctx.app, 'GET', '/api/directory/search')).statusCode).toBe(401);
  });

  it('excludes pending, hidden, blocked and suspended members everywhere', async () => {
    const admin = await makeAdmin(ctx);
    const viewer = await makeMember(ctx, {
      email: 'v@students.uni.edu',
      name: 'Viewer',
      role: 'student',
    });
    const visible = await makeMember(ctx, { email: 'vis@gmail.com', name: 'Visible Alum' }, admin);
    const pending = await makeMember(ctx, {
      email: 'pen@gmail.com',
      name: 'Pending Alum',
      verify: false,
    });
    const hidden = await makeMember(
      ctx,
      { email: 'hid@gmail.com', name: 'Hidden Alum', profile: { discoverability: 'hidden' } },
      admin,
    );
    const blocker = await makeMember(ctx, { email: 'blk@gmail.com', name: 'Blocking Alum' }, admin);
    const blockedByViewer = await makeMember(
      ctx,
      { email: 'bv@gmail.com', name: 'Blocked Alum' },
      admin,
    );
    const suspended = await makeMember(
      ctx,
      { email: 'sus@gmail.com', name: 'Suspended Alum' },
      admin,
    );

    await call(ctx.app, 'POST', '/api/blocks', {
      session: blocker,
      body: { userId: viewer.userId },
    });
    await call(ctx.app, 'POST', '/api/blocks', {
      session: viewer,
      body: { userId: blockedByViewer.userId },
    });
    const susp = await call(ctx.app, 'POST', `/api/admin/users/${suspended.userId}/suspend`, {
      session: admin,
      body: { rationale: 'spam reports' },
    });
    expect(susp.statusCode).toBe(200);

    expect((await search(viewer)).names).toEqual(['Visible Alum']);

    const view = (id: string) => call(ctx.app, 'GET', `/api/profiles/${id}`, { session: viewer });
    expect((await view(visible.userId)).statusCode).toBe(200);
    for (const s of [pending, hidden, blocker, blockedByViewer, suspended]) {
      expect((await view(s.userId)).statusCode).toBe(404);
    }
    // A blocked member cannot see the blocker either (both directions).
    expect(
      (await call(ctx.app, 'GET', `/api/profiles/${viewer.userId}`, { session: blocker }))
        .statusCode,
    ).toBe(404);
    // Suspension revoked the suspended member's session immediately.
    expect((await call(ctx.app, 'GET', '/api/me', { session: suspended })).statusCode).toBe(401);
  });

  it('removes a member whose verification is revoked', async () => {
    const admin = await makeAdmin(ctx);
    const viewer = await makeMember(ctx, {
      email: 'v@students.uni.edu',
      name: 'Viewer',
      role: 'student',
    });
    const alum = await makeMember(ctx, { email: 'alum@gmail.com', name: 'Revoked Alum' }, admin);
    expect((await search(viewer)).names).toEqual(['Revoked Alum']);
    const { rows } = await ctx.pool.query(
      'SELECT vc.id FROM verification_cases vc JOIN affiliation_claims ac ON ac.id = vc.claim_id WHERE ac.user_id = $1',
      [alum.userId],
    );
    await call(ctx.app, 'POST', `/api/admin/verification-cases/${rows[0].id}/decision`, {
      session: admin,
      body: { decision: 'revoke', rationale: 'evidence found to be forged' },
    });
    expect((await search(viewer)).names).toEqual([]);
    expect((await search(alum)).status).toBe(403);
  });

  it('filters by structured fields and prefix text', async () => {
    const admin = await makeAdmin(ctx);
    const viewer = await makeMember(ctx, {
      email: 'v@students.uni.edu',
      name: 'Viewer',
      role: 'student',
    });
    await makeMember(
      ctx,
      {
        email: 'priya@gmail.com',
        name: 'Priya Natarajan',
        department: 'Computer Science',
        graduationYear: 2012,
        profile: {
          currentCompany: 'Google',
          headline: 'Software engineer working on distributed systems',
          location: 'Bengaluru',
          skills: ['Distributed Systems', 'Go'],
          mentorshipAvailable: true,
        },
      },
      admin,
    );
    await makeMember(
      ctx,
      {
        email: 'arjun@gmail.com',
        name: 'Arjun Mehta',
        department: 'Electrical Engineering',
        graduationYear: 2018,
        profile: {
          currentCompany: 'Tata Power',
          headline: 'Grid analyst',
          location: 'Mumbai',
          skills: ['MATLAB'],
        },
      },
      admin,
    );
    await makeMember(ctx, {
      email: 'f@uni.edu',
      name: 'Prof Kumar',
      role: 'faculty',
      department: 'Physics',
    });

    expect((await search(viewer, '?department=computer%20science')).names).toEqual([
      'Priya Natarajan',
    ]);
    expect((await search(viewer, '?skill=DISTRIBUTED%20systems')).names).toEqual([
      'Priya Natarajan',
    ]);
    expect((await search(viewer, '?company=goog')).names).toEqual(['Priya Natarajan']);
    expect((await search(viewer, '?gradYearFrom=2015&gradYearTo=2020')).names).toEqual([
      'Arjun Mehta',
    ]);
    expect((await search(viewer, '?mentorship=true')).names).toEqual(['Priya Natarajan']);
    expect((await search(viewer, '?role=faculty')).names).toEqual(['Prof Kumar']);
    expect((await search(viewer, '?q=soft')).names).toEqual(['Priya Natarajan']); // prefix + stemming
    expect((await search(viewer, '?q=engineers')).names).toEqual(['Priya Natarajan']);
    expect((await search(viewer, '?q=Arjn%20Mehta')).names).toEqual(['Arjun Mehta']); // typo via trigram
    // LIKE wildcards in user input are literals, not "match everything".
    expect((await search(viewer, '?company=%25')).names).toEqual([]);
    expect((await search(viewer, '?bogus=1')).status).toBe(400);
  });

  it('paginates deterministically without duplicates or gaps', async () => {
    const admin = await makeAdmin(ctx);
    const viewer = await makeMember(ctx, {
      email: 'v@students.uni.edu',
      name: 'Viewer',
      role: 'student',
    });
    // Duplicate names force the id tiebreaker to matter.
    for (let i = 0; i < 7; i++) {
      await makeMember(
        ctx,
        {
          email: `dup${i}@gmail.com`,
          name: i % 2 ? 'Same Name' : `Alum ${i}`,
          profile: { headline: 'data scientist' },
        },
        admin,
      );
    }
    for (const base of ['?limit=3', '?limit=3&q=data']) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const { body } = await search(viewer, `${base}${cursor ? `&cursor=${cursor}` : ''}`);
        seen.push(...body.results.map((r) => r.userId));
        cursor = body.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    }
    expect((await search(viewer, '?cursor=not-a-cursor')).status).toBe(400);
  });
});
