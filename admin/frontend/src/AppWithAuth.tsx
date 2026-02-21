import { ClerkProvider, SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { useAuthConfig } from './context/AuthContext';
import { AuthTokenInjector } from './components/auth/AuthTokenInjector';
import App from './App';

/**
 * Conditionally wraps the app with ClerkProvider when auth is enabled.
 * When auth is disabled (self-hosted), renders the app directly.
 */
export default function AppWithAuth() {
  const { authEnabled, clerkPublishableKey } = useAuthConfig();

  if (!authEnabled || !clerkPublishableKey) {
    // Self-hosted mode — no auth
    return <App />;
  }

  // SaaS mode — wrap with Clerk
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <AuthTokenInjector />
      <SignedIn>
        <App />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <SignIn />
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}
