import type { FastifyInstance } from 'fastify';
import { ProfileInput, type ProfileDetail } from '@alumni/shared';
import type { AppDeps } from '../../app.ts';
import { withTx } from '../../db/client.ts';
import { notFound } from '../../lib/errors.ts';
import { UserIdParam, parse } from '../../lib/http.ts';
import { MEMBER_FROM, viewableBy } from '../../policy/visibility.ts';
import { assertVerifiedMember, loadViewer } from '../../policy/viewer.ts';
import { requireAuth } from '../identity/session.ts';
import { normalizeSkills } from './skills.ts';

export async function profileRoutes(app: FastifyInstance, { pool }: AppDeps): Promise<void> {
  app.get('/api/me/profile', async (req) => {
    const { userId } = requireAuth(req);
    const { rows } = await pool.query(
      `SELECT p.*, coalesce(array_agg(s.skill ORDER BY s.skill) FILTER (WHERE s.skill IS NOT NULL), '{}') AS skills
         FROM profiles p LEFT JOIN profile_skills s ON s.user_id = p.user_id
        WHERE p.user_id = $1 GROUP BY p.user_id`,
      [userId],
    );
    const p = rows[0];
    if (!p) throw notFound('Profile');
    return {
      displayName: p.display_name,
      headline: p.headline,
      currentCompany: p.current_company,
      currentTitle: p.current_title,
      industry: p.industry,
      location: p.location,
      researchInterests: p.research_interests,
      mentorshipAvailable: p.mentorship_available,
      discoverability: p.discoverability,
      skills: p.skills,
    };
  });

  app.put('/api/me/profile', async (req) => {
    const { userId } = requireAuth(req);
    const input = parse(ProfileInput, req.body);
    const skills = normalizeSkills(input.skills);
    await withTx(pool, async (tx) => {
      await tx.query(
        `INSERT INTO profiles (user_id, display_name, headline, current_company, current_title, industry,
                               location, research_interests, mentorship_available, discoverability, skills_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, headline = EXCLUDED.headline,
           current_company = EXCLUDED.current_company, current_title = EXCLUDED.current_title,
           industry = EXCLUDED.industry, location = EXCLUDED.location,
           research_interests = EXCLUDED.research_interests,
           mentorship_available = EXCLUDED.mentorship_available,
           discoverability = EXCLUDED.discoverability, skills_text = EXCLUDED.skills_text,
           updated_at = now()`,
        [
          userId,
          input.displayName,
          input.headline,
          input.currentCompany,
          input.currentTitle,
          input.industry,
          input.location,
          input.researchInterests,
          input.mentorshipAvailable,
          input.discoverability,
          skills.join(' '),
        ],
      );
      await tx.query('DELETE FROM profile_skills WHERE user_id = $1', [userId]);
      if (skills.length) {
        await tx.query(
          'INSERT INTO profile_skills (user_id, skill) SELECT $1, unnest($2::text[])',
          [userId, skills],
        );
      }
    });
    return { status: 'saved' };
  });

  /** Profiles that are hidden, blocked, suspended or unverified answer 404 so existence is not revealed. */
  app.get('/api/profiles/:userId', async (req): Promise<ProfileDetail> => {
    const { userId: viewerId } = requireAuth(req);
    assertVerifiedMember(await loadViewer(pool, viewerId));
    const { userId } = parse(UserIdParam, req.params);
    const { rows } = await pool.query(
      `SELECT p.user_id, p.display_name, p.headline, p.current_company, p.current_title, p.industry,
              p.location, p.research_interests, p.mentorship_available,
              ac.role, ac.department, ac.degree, ac.graduation_year,
              coalesce((SELECT array_agg(s.skill ORDER BY s.skill) FROM profile_skills s WHERE s.user_id = p.user_id), '{}') AS skills,
              EXISTS (SELECT 1 FROM connections c
                       WHERE c.user_low = LEAST($1::uuid, p.user_id) AND c.user_high = GREATEST($1::uuid, p.user_id)) AS connected,
              (SELECT json_build_object('id', r.id, 'requester', r.requester_id) FROM connection_requests r
                WHERE r.state = 'pending'
                  AND ((r.requester_id = $1 AND r.addressee_id = p.user_id) OR (r.requester_id = p.user_id AND r.addressee_id = $1))
              ) AS pending
         FROM ${MEMBER_FROM}
        WHERE p.user_id = $2 AND ${viewableBy('$1')}`,
      [viewerId, userId],
    );
    const r = rows[0];
    if (!r) throw notFound('Profile');
    const pending = r.pending as { id: string; requester: string } | null;
    return {
      userId: r.user_id,
      displayName: r.display_name,
      headline: r.headline,
      role: r.role,
      department: r.department,
      degree: r.degree,
      graduationYear: r.graduation_year,
      currentCompany: r.current_company,
      currentTitle: r.current_title,
      industry: r.industry,
      location: r.location,
      researchInterests: r.research_interests,
      mentorshipAvailable: r.mentorship_available,
      skills: r.skills,
      relationship:
        r.user_id === viewerId
          ? 'self'
          : r.connected
            ? 'connected'
            : pending
              ? pending.requester === viewerId
                ? 'request_sent'
                : 'request_received'
              : 'none',
      pendingRequestId: pending?.id ?? null,
    };
  });
}
