import { useState, useEffect } from 'react';
import {
  Database,
  Plus,
  RefreshCw,
  Play,
  Square,
  Trash2,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  databasesApi,
  type DatabaseSummary,
  type DatabaseStatus,
  type DatabaseType,
} from '../api/client';
import { useTenantSlug } from '../hooks/useTenantSlug';
import { buildMcpUrl } from '../utils/mcp-url';
import DatabaseFormModal from '../components/databases/DatabaseFormModal';


const STATUS_ICONS: Record<DatabaseStatus, typeof CheckCircle> = {
  active: CheckCircle,
  inactive: Square,
  error: XCircle,
  initializing: Loader2,
};

const STATUS_COLORS: Record<DatabaseStatus, string> = {
  active: 'text-green-500',
  inactive: 'text-gray-400',
  error: 'text-red-500',
  initializing: 'text-blue-500',
};

const DB_TYPE_LABELS: Record<DatabaseType, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  redshift: 'Redshift',
  clickhouse: 'ClickHouse',
};

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<DatabaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { slug: tenantSlug } = useTenantSlug();

  const fetchDatabases = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await databasesApi.list();
      setDatabases(response.databases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load databases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabases();
  }, []);

  // Auto-poll when no databases exist (waiting for auto-initialization)
  useEffect(() => {
    if (databases.length > 0 || loading) return;
    const interval = setInterval(fetchDatabases, 2000);
    return () => clearInterval(interval);
  }, [databases.length, loading]);

  const handleActivate = async (id: string) => {
    try {
      setActionLoading(id);
      await databasesApi.activate(id);
      await fetchDatabases();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to activate database');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      setActionLoading(id);
      await databasesApi.deactivate(id);
      await fetchDatabases();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate database');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    const displayName = databases.find(d => d.id === id)?.slug ?? id;
    if (!confirm(`Are you sure you want to delete database "${displayName}"?`)) {
      return;
    }

    try {
      setActionLoading(id);
      await databasesApi.delete(id);
      await fetchDatabases();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete database');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTest = async (id: string) => {
    try {
      setActionLoading(id);
      const result = await databasesApi.test(id);
      alert(result.success ? `Connection successful! (${result.latencyMs}ms)` : `Connection failed: ${result.message}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to test connection');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDatabaseCreated = () => {
    setShowCreateModal(false);
    fetchDatabases();
  };

  if (loading && databases.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Empty state — workspace is being set up or user needs to connect a database
  if (databases.length === 0 && !loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Database className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Setting up your workspace...</h1>
          <p className="text-gray-500">
            Your sample database is being configured automatically. This usually takes a few seconds.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <button
            onClick={fetchDatabases}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Connect Your Database
          </button>
        </div>

        {showCreateModal && (
          <DatabaseFormModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={handleDatabaseCreated}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-7 h-7" />
            Databases
          </h1>
          <p className="text-gray-500 mt-1">
            Manage database connections for multi-tenant MCP endpoints
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchDatabases}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Database
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Database list */}
      {databases.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Database
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  MCP Endpoint
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {databases.map((db) => {
                const StatusIcon = STATUS_ICONS[db.status];
                const isLoading = actionLoading === db.id;

                return (
                  <tr key={db.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{db.name}</div>
                        {(db.slug ?? db.id) !== 'default' && (
                          <div className="text-sm text-gray-500">{db.slug ?? db.id}</div>
                        )}
                        {db.description && (
                          <div className="text-xs text-gray-400 mt-1">{db.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                        {DB_TYPE_LABELS[db.connectionType]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`flex items-center gap-1 ${STATUS_COLORS[db.status]}`}>
                        <StatusIcon
                          className={`w-4 h-4 ${db.status === 'initializing' ? 'animate-spin' : ''}`}
                        />
                        <span className="capitalize">{db.status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {db.status === 'active' ? (
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                          {buildMcpUrl(db.id, tenantSlug)}
                        </code>
                      ) : (
                        <span className="text-gray-400 text-sm">Not active</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <>
                            <button
                              onClick={() => handleTest(db.id)}
                              className="text-gray-400 hover:text-gray-600"
                              title="Test Connection"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            {db.status === 'active' ? (
                              <button
                                onClick={() => handleDeactivate(db.id)}
                                className="text-yellow-500 hover:text-yellow-600"
                                title="Deactivate"
                              >
                                <Square className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(db.id)}
                                className="text-green-500 hover:text-green-600"
                                title="Activate"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            {(db.slug ?? db.id) !== 'default' && db.status !== 'active' && (
                              <button
                                onClick={() => handleDelete(db.id)}
                                className="text-red-400 hover:text-red-600"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium text-blue-900 mb-2">Multi-Database MCP Endpoints</h3>
        <p className="text-sm text-blue-700">
          Each active database gets its own MCP endpoint at{' '}
          <code className="bg-blue-100 px-1 rounded">
            {tenantSlug ? `/mcp/${tenantSlug}/:databaseId` : '/mcp/:databaseId'}
          </code>.
          Configure your MCP clients to connect to the specific database endpoint.
          The legacy <code className="bg-blue-100 px-1 rounded">/mcp</code> endpoint continues to work with the default database.
        </p>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <DatabaseFormModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleDatabaseCreated}
        />
      )}

    </div>
  );
}
