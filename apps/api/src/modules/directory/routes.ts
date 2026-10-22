import type { FastifyInstance } from 'fastify';
import { DirectorySearchQuery, type SearchResponse } from '@alumni/shared';
import type { AppDeps } from '../../app.ts';
import { parse } from '../../lib/http.ts';
import { assertVerifiedMember, loadViewer } from '../../policy/viewer.ts';
import { requireAuth } from '../identity/session.ts';
import { searchDirectory } from './service.ts';

export async function directoryRoutes(
  app: FastifyInstance,
  { pool, config }: AppDeps,
): Promise<void> {
  app.get(
    '/api/directory/search',
    { config: { rateLimit: { max: config.rateLimits.searchPerMin, timeWindow: '1 minute' } } },
    async (req): Promise<SearchResponse> => {
      const { userId } = requireAuth(req);
      assertVerifiedMember(await loadViewer(pool, userId));
      const query = parse(DirectorySearchQuery, req.query);
      const { results, nextCursor } = await searchDirectory(pool, userId, query);
      return { results, nextCursor };
    },
  );
}
