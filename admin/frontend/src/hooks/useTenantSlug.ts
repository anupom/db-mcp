import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '../api/client';
import { useAuthConfig } from '../context/AuthContext';

/**
 * Fetches the current tenant's slug. Returns null when auth is disabled.
 */
export function useTenantSlug(): { slug: string | null; isLoading: boolean } {
  const { authEnabled } = useAuthConfig();

  const { data, isLoading } = useQuery({
    queryKey: ['tenantInfo'],
    queryFn: () => tenantApi.getInfo(),
    enabled: authEnabled,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  return {
    slug: data?.slug ?? null,
    isLoading: authEnabled ? isLoading : false,
  };
}
