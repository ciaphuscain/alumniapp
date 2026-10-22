import type { DirectorySearchQuery, ProfileSummary } from '@alumni/shared';
import type { Queryable } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { MEMBER_FROM, searchableBy } from '../../policy/visibility.ts';
import { normalizeSkills } from '../profiles/skills.ts';

type Cursor = { m: 'rank'; r: string; id: string } | { m: 'name'; n: string; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(raw: string, mode: Cursor['m']): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    const uuidOk = typeof c.id === 'string' && /^[0-9a-f-]{36}$/i.test(c.id);
    if (
      c.m === mode &&
      uuidOk &&
      (c.m === 'rank' ? /^-?\d+(\.\d+)?$/.test(c.r) : typeof c.n === 'string')
    ) {
      return c;
    }
  } catch {
    // fall through
  }
  throw new AppError('VALIDATION', 'Invalid cursor');
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Turns free text into a prefix-matching tsquery ("data sci" -> "data:* & sci:*"), or null. */
export function toPrefixTsQuery(q: string): string | null {
  const tokens =
    q
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 8) ?? [];
  return tokens.length ? tokens.map((t) => `${t}:*`).join(' & ') : null;
}

export interface SearchResult {
  results: ProfileSummary[];
  nextCursor: string | null;
  sql: string;
  params: unknown[];
}

/**
 * Directory search. Visibility is applied in SQL through the shared policy fragment, so
 * hidden, blocked, suspended and unverified members can never appear in results.
 * Ordering is deterministic (rank or name, then user id) and pagination is keyset-based.
 */
export function buildSearch(
  viewerId: string,
  f: DirectorySearchQuery,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [viewerId];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [searchableBy('$1')];

  if (f.role) where.push(`ac.role = ${p(f.role)}`);
  if (f.department) where.push(`lower(ac.department) = lower(${p(f.department)})`);
  if (f.gradYearFrom !== undefined) where.push(`ac.graduation_year >= ${p(f.gradYearFrom)}`);
  if (f.gradYearTo !== undefined) where.push(`ac.graduation_year <= ${p(f.gradYearTo)}`);
  if (f.company) where.push(`p.current_company ILIKE ${p(`%${escapeLike(f.company)}%`)}`);
  if (f.industry) where.push(`p.industry ILIKE ${p(`%${escapeLike(f.industry)}%`)}`);
  if (f.location) where.push(`p.location ILIKE ${p(`%${escapeLike(f.location)}%`)}`);
  if (f.mentorship === 'true') where.push('p.mentorship_available');
  if (f.skill) {
    const [skill] = normalizeSkills([f.skill]);
    where.push(
      `EXISTS (SELECT 1 FROM profile_skills s WHERE s.user_id = p.user_id AND s.skill = ${p(skill)})`,
    );
  }

  const tsq = f.q ? toPrefixTsQuery(f.q) : null;
  let rankExpr = '0::numeric';
  if (f.q && tsq) {
    const tq = p(tsq);
    const raw = p(f.q);
    where.push(`(p.search_vector @@ to_tsquery('english', ${tq}) OR p.display_name % ${raw})`);
    rankExpr = `round((ts_rank(p.search_vector, to_tsquery('english', ${tq})) + similarity(p.display_name, ${raw}))::numeric, 6)`;
  } else if (f.q) {
    where.push(`p.display_name % ${p(f.q)}`);
  }

  const mode: Cursor['m'] = f.q ? 'rank' : 'name';
  const cursorWhere: string[] = [];
  if (f.cursor) {
    const c = decodeCursor(f.cursor, mode);
    if (c.m === 'rank') {
      const r = p(c.r);
      cursorWhere.push(
        `(rank < ${r}::numeric OR (rank = ${r}::numeric AND user_id > ${p(c.id)}::uuid))`,
      );
    } else {
      cursorWhere.push(`(display_name, user_id) > (${p(c.n)}, ${p(c.id)}::uuid)`);
    }
  }
  const order = mode === 'rank' ? 'rank DESC, user_id' : 'display_name, user_id';
  const sql = `
    SELECT * FROM (
      SELECT p.user_id, p.display_name, p.headline, p.current_company, p.current_title, p.location,
             p.mentorship_available, ac.role, ac.department, ac.graduation_year,
             ${rankExpr} AS rank
        FROM ${MEMBER_FROM}
       WHERE ${where.join('\n         AND ')}
    ) candidates
    ${cursorWhere.length ? `WHERE ${cursorWhere.join(' AND ')}` : ''}
    ORDER BY ${order}
    LIMIT ${p(f.limit + 1)}`;
  return { sql, params };
}

export async function searchDirectory(
  db: Queryable,
  viewerId: string,
  f: DirectorySearchQuery,
): Promise<SearchResult> {
  const { sql, params } = buildSearch(viewerId, f);
  const { rows } = await db.query(sql, params);
  const page = rows.slice(0, f.limit);
  const ids = page.map((r) => r.user_id);
  const skills = new Map<string, string[]>();
  if (ids.length) {
    const s = await db.query<{ user_id: string; skills: string[] }>(
      `SELECT user_id, array_agg(skill ORDER BY skill) AS skills FROM profile_skills
        WHERE user_id = ANY($1::uuid[]) GROUP BY user_id`,
      [ids],
    );
    for (const r of s.rows) skills.set(r.user_id, r.skills);
  }
  const last = page.at(-1);
  const nextCursor =
    rows.length > f.limit && last
      ? encodeCursor(
          f.q
            ? { m: 'rank', r: String(last.rank), id: last.user_id }
            : { m: 'name', n: last.display_name, id: last.user_id },
        )
      : null;
  return {
    results: page.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      headline: r.headline,
      role: r.role,
      department: r.department,
      graduationYear: r.graduation_year,
      currentCompany: r.current_company,
      currentTitle: r.current_title,
      location: r.location,
      mentorshipAvailable: r.mentorship_available,
      skills: skills.get(r.user_id) ?? [],
    })),
    nextCursor,
    sql,
    params,
  };
}
