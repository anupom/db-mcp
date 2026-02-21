import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';

interface AuthConfig {
  authEnabled: boolean;
  clerkPublishableKey: string | null;
  loaded: boolean;
}

const AuthConfigContext = createContext<AuthConfig>({
  authEnabled: false,
  clerkPublishableKey: null,
  loaded: false,
});

export function AuthConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig>({
    authEnabled: false,
    clerkPublishableKey: null,
    loaded: false,
  });

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig({
          authEnabled: data.authEnabled ?? false,
          clerkPublishableKey: data.clerkPublishableKey ?? null,
          loaded: true,
        });
      })
      .catch(() => {
        // If config fetch fails, assume self-hosted mode
        setConfig({ authEnabled: false, clerkPublishableKey: null, loaded: true });
      });
  }, []);

  const value = useMemo(() => config, [config]);

  if (!config.loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <AuthConfigContext.Provider value={value}>
      {children}
    </AuthConfigContext.Provider>
  );
}

export function useAuthConfig(): AuthConfig {
  return useContext(AuthConfigContext);
}
