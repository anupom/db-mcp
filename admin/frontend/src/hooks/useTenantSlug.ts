import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '../api/client';
import { useAuthConfig } from '../context/AuthContext';

/**
 * Fetches the current tenant's slug. Returns null when auth is disabled.
 * Also provides updateSlug mutation for org admins.
 */
export function useTenantSlug() {
  const { authEnabled } = useAuthConfig();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tenantInfo'],
    queryFn: () => tenantApi.getInfo(),
    enabled: authEnabled,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  const mutation = useMutation({
    mutationFn: (slug: string) => tenantApi.updateSlug(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantInfo'] });
    },
  });

  return {
    slug: data?.slug ?? null,
    isLoading: authEnabled ? isLoading : false,
    updateSlug: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    updateError: mutation.error,
  };
}
