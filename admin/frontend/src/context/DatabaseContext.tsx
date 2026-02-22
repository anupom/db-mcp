import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { databasesApi, type DatabaseSummary } from '../api/client';
import { useClerkOrgId } from '../hooks/useClerkOrgId';

const STORAGE_KEY = 'db-mcp-selected-database';

interface DatabaseContextType {
  databaseId: string | null;
  setDatabaseId: (id: string | null) => void;
  databases: DatabaseSummary[];
  activeDatabases: DatabaseSummary[];
  isLoading: boolean;
  error: Error | null;
  refetchDatabases: () => void;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const orgId = useClerkOrgId();

  const storageKey = orgId ? `${STORAGE_KEY}-${orgId}` : STORAGE_KEY;

  const [databaseId, setDatabaseIdState] = useState<string | null>(() => {
    // Initialize from localStorage (org-scoped when auth is enabled)
    const stored = localStorage.getItem(storageKey);
    return stored || null;
  });

  // Clear selection when org changes (storageKey changes)
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    setDatabaseIdState(stored || null);
  }, [storageKey]);

  // Include orgId in query key so database list refetches on org switch
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['databases', orgId],
    queryFn: () => databasesApi.list(),
    staleTime: 30000,
  });

  const databases = data?.databases || [];
  const activeDatabases = useMemo(
    () => databases.filter((db) => db.status === 'active'),
    [databases]
  );

  // Set database ID and persist to localStorage (org-scoped)
  const setDatabaseId = useCallback((id: string | null) => {
    setDatabaseIdState(id);
    if (id) {
      localStorage.setItem(storageKey, id);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  // Auto-select first active database if none selected or selected is no longer active
  useEffect(() => {
    if (isLoading) return;

    const isSelectedActive = activeDatabases.some((db) => db.id === databaseId);

    if (!isSelectedActive && activeDatabases.length > 0) {
      // Select first active database
      setDatabaseId(activeDatabases[0].id);
    } else if (activeDatabases.length === 0 && databaseId) {
      // No active databases, clear selection
      setDatabaseId(null);
    }
  }, [activeDatabases, databaseId, isLoading, setDatabaseId]);

  // Refetch databases and invalidate related queries
  const refetchDatabases = useCallback(() => {
    refetch();
    // Invalidate database-specific queries when database list changes
    queryClient.invalidateQueries({ queryKey: ['databases'] });
  }, [refetch, queryClient]);

  const value = useMemo(
    () => ({
      databaseId,
      setDatabaseId,
      databases,
      activeDatabases,
      isLoading,
      error: error as Error | null,
      refetchDatabases,
    }),
    [databaseId, setDatabaseId, databases, activeDatabases, isLoading, error, refetchDatabases]
  );

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabaseContext(): DatabaseContextType {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabaseContext must be used within a DatabaseProvider');
  }
  return context;
}
