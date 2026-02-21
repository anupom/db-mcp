import { useOrganization } from '@clerk/clerk-react';

/**
 * Returns the current Clerk org ID when auth is enabled.
 * When auth is disabled, returns undefined without calling any Clerk hooks.
 *
 * Note: Hooks can't be called conditionally in the same component,
 * so we use a separate component/hook pattern. When authEnabled is false,
 * we return undefined immediately. When true, we call the Clerk hook.
 * This is safe because authEnabled doesn't change during the component's lifecycle.
 */
export function useClerkOrgId(authEnabled: boolean): string | undefined {
  // We always call the hook but only use its result when auth is enabled.
  // This is safe because when auth is enabled, ClerkProvider is always in the tree above us
  // (see AppWithAuth.tsx), and when auth is disabled, we never render inside ClerkProvider,
  // so we need the guard.
  if (!authEnabled) {
    return undefined;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { organization } = useOrganization();
  return organization?.id;
}
