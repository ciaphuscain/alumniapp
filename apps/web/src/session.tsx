import { useQuery } from '@tanstack/react-query';
import type { MeResponse } from '@alumni/shared';
import { api, ApiError } from './api.ts';

/** Current user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<MeResponse>('GET', '/api/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

export const isVerifiedMember = (me: MeResponse | null | undefined) =>
  !!me?.emailVerified && me.affiliation?.verificationState === 'verified';
