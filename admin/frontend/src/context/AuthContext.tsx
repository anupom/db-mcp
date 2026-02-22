import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';

interface AuthConfig {
  authEnabled: boolean;
  clerkPublishableKey: string | null;
  loaded: boolean;
  error: string | null;
}

const AuthConfigContext = createContext<AuthConfig>({
  authEnabled: false,
  clerkPublishableKey: null,
  loaded: false,
  error: null,
});

export function AuthConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig>({
    authEnabled: false,
    clerkPublishableKey: null,
    loaded: false,
    error: null,
  });

  const loadConfig = () => {
    setConfig(prev => ({ ...prev, error: null }));
    fetch('/api/config')
      .then(res => {
        if (!res.ok) throw new Error(`Config endpoint returned ${res.status}`);
        return res.json();
      })
      .then(data => {
        setConfig({
          authEnabled: data.authEnabled ?? false,
          clerkPublishableKey: data.clerkPublishableKey ?? null,
          loaded: true,
          error: null,
        });
      })
      .catch((err) => {
        setConfig(prev => ({
          ...prev,
          loaded: true,
          error: err instanceof Error ? err.message : 'Failed to load configuration',
        }));
      });
  };

  useEffect(() => { loadConfig(); }, []);

  const value = useMemo(() => config, [config]);

  if (!config.loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (config.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <p className="text-red-600">Failed to load app configuration: {config.error}</p>
          <button
            onClick={loadConfig}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
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
