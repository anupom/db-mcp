import { createContext, useContext } from 'react';
import { useOrganization } from '@clerk/clerk-react';

/**
 * Context to pass the Clerk org ID from the auth-enabled tree
 * down to components that need it. When auth is disabled,
 * this context provides undefined (the default).
 */
const OrgIdContext = createContext<string | undefined>(undefined);

export const OrgIdProvider = OrgIdContext.Provider;

/**
 * Hook to read the org ID from the auth-enabled tree.
 * Always calls useOrganization() unconditionally (Rules of Hooks safe).
 * Must be rendered inside ClerkProvider.
 */
export function useClerkOrgIdValue(): string | undefined {
  const { organization } = useOrganization();
  return organization?.id;
}

/**
 * Returns the current org ID. Works in both auth-enabled and
 * auth-disabled trees via context.
 */
export function useClerkOrgId(): string | undefined {
  return useContext(OrgIdContext);
}
