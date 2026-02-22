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
  if (!authEnabled) {
    return undefined;
  }

  // When authEnabled=true but ClerkProvider is missing (e.g. clerkPublishableKey is null),
  // useOrganization() throws synchronously. Catch it to avoid crashing the entire app.
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { organization } = useOrganization();
    return organization?.id;
  } catch (e) {
    if (e instanceof Error && e.message.includes('ClerkProvider')) {
      return undefined;
    }
    throw e;
  }
}
