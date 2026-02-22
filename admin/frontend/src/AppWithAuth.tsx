import { ClerkProvider, SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { useAuthConfig } from './context/AuthContext';
import { AuthTokenInjector } from './components/auth/AuthTokenInjector';
import { OrgIdProvider, useClerkOrgIdValue } from './hooks/useClerkOrgId';
import App from './App';

/**
 * Inner wrapper that reads the Clerk org ID (unconditionally, Rules-of-Hooks safe)
 * and provides it to the rest of the app via context.
 */
function AuthenticatedApp() {
  const orgId = useClerkOrgIdValue();
  return (
    <OrgIdProvider value={orgId}>
      <App />
    </OrgIdProvider>
  );
}

/**
 * Conditionally wraps the app with ClerkProvider when auth is enabled.
 * When auth is disabled (self-hosted), renders the app directly.
 */
export default function AppWithAuth() {
  const { authEnabled, clerkPublishableKey } = useAuthConfig();

  if (!authEnabled || !clerkPublishableKey) {
    // Self-hosted mode — no auth, orgId = undefined via default context
    return <App />;
  }

  // SaaS mode — wrap with Clerk
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <AuthTokenInjector />
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <SignIn />
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}
