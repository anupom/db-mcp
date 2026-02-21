import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setTokenGetter } from '../../api/client';

/**
 * Injects the Clerk auth token getter into the API client.
 * Must be rendered inside ClerkProvider.
 */
export function AuthTokenInjector() {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}
