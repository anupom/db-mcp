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
  Rocket,
  Copy,
  Check,
  ArrowRight,
  Table2,
  Shield,
  MessageSquare,
  Cable,
  Key,
} from 'lucide-react';
import {
  databasesApi,
  type DatabaseSummary,
  type DatabaseStatus,
  type DatabaseType,
} from '../api/client';
import { useAuthConfig } from '../context/AuthContext';
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

  const [justInitialized, setJustInitialized] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [cubeNames, setCubeNames] = useState<string[]>([]);

  const { authEnabled } = useAuthConfig();
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

  const handleInitializeDefault = async () => {
    try {
      setLoading(true);
      const result = await databasesApi.initializeDefault();
      const dbId = result.databaseId || 'default';
      await fetchDatabases();
      try {
        const meta = await databasesApi.getCubeMeta(dbId);
        setCubeNames(meta.cubes.map(c => c.title || c.name));
      } catch {
        // Non-critical — show success screen even if cube meta fails
      }
      setJustInitialized(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to initialize default database');
    } finally {
      setLoading(false);
    }
  };

  const handleDatabaseCreated = () => {
    setShowCreateModal(false);
    fetchDatabases();
  };

  const mcpPath = buildMcpUrl('default', tenantSlug);
  const mcpEndpoint = typeof window !== 'undefined' ? `${window.location.origin}${mcpPath}` : mcpPath;

  const claudeConfig = JSON.stringify({
    mcpServers: {
      'db-mcp': {
        url: mcpEndpoint,
        ...(authEnabled ? { headers: { Authorization: 'Bearer <your-api-key>' } } : {}),
      },
    },
  }, null, 2);

  const copyEndpoint = () => {
    navigator.clipboard.writeText(mcpEndpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const copyConfig = () => {
    navigator.clipboard.writeText(claudeConfig);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  if (loading && databases.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Success screen after initializing demo data
  if (justInitialized) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h1>
          <p className="text-gray-500">
            The demo e-commerce database is ready. Connect your AI assistant using the MCP endpoint below.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {/* Step 1 — Database Connected */}
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Database Connected</h3>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">PostgreSQL</span>
                    <span className={`flex items-center gap-1 ${STATUS_COLORS.active}`}>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="text-xs">Active</span>
                    </span>
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Step 2 — Cubes Ready */}
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Cubes Ready</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {cubeNames.length > 0
                    ? <>{cubeNames.length} cubes loaded: <span className="font-medium text-gray-700">{cubeNames.join(', ')}</span></>
                    : 'Cubes loaded from demo data'
                  }
                </p>
                <a href="/tables" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-2">
                  <Table2 className="w-3.5 h-3.5" />
                  Explore tables &amp; generate more cubes
                </a>
              </div>
            </div>
          </div>

          {/* Step 3 — MCP Endpoint Ready */}
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 mb-3">MCP Endpoint Ready</h3>

                {/* Endpoint URL */}
                <div className="flex items-center gap-2 mb-4">
                  <code className="flex-1 bg-gray-50 px-4 py-2 rounded-lg text-sm font-mono text-gray-800 border">
                    {mcpEndpoint}
                  </code>
                  <button
                    onClick={copyEndpoint}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600"
                    title="Copy endpoint"
                  >
                    {copiedEndpoint ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Claude Desktop Config */}
                <div>
                  <p className="text-xs text-gray-500 mb-2">
                    Add this to your Claude Desktop settings (Settings &gt; MCP Servers):
                  </p>
                  <div className="relative">
                    <pre className="bg-gray-50 px-4 py-3 rounded-lg text-sm font-mono text-gray-800 border overflow-x-auto">
                      {claudeConfig}
                    </pre>
                    <button
                      onClick={copyConfig}
                      className="absolute top-2 right-2 px-2 py-1 bg-white hover:bg-gray-100 rounded border text-xs text-gray-600 flex items-center gap-1"
                    >
                      {copiedConfig ? <><Check className="w-3 h-3 text-green-600" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Auth note when auth is enabled */}
                {authEnabled && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <Key className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      This endpoint requires an API key. Create one in{' '}
                      <a href="/api-keys" className="font-medium underline hover:text-amber-900">API Keys</a>{' '}
                      and replace <code className="bg-amber-100 px-1 rounded text-xs">&lt;your-api-key&gt;</code> in the config above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <h3 className="font-medium text-blue-900 mb-3">Next Steps</h3>
          <div className="grid grid-cols-2 gap-3">
            <a href="/tables" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900">
              <Table2 className="w-4 h-4" /> Explore tables and generate cubes
            </a>
            <a href="/governance" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900">
              <Shield className="w-4 h-4" /> Configure governance rules
            </a>
            <a href="/chat" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900">
              <MessageSquare className="w-4 h-4" /> Try the AI chat interface
            </a>
            <a href="/mcp" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900">
              <Cable className="w-4 h-4" /> View MCP tools and config
            </a>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => setJustInitialized(false)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
          >
            Continue to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Welcome screen when no databases exist
  if (databases.length === 0 && !loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Database className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to DB-MCP</h1>
          <p className="text-gray-500">
            Connect your database to give AI assistants governed access to your data through MCP.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Demo Data Card */}
          <button
            onClick={handleInitializeDefault}
            className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 text-left border-2 border-transparent hover:border-blue-200"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Rocket className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Try with Demo Data</h3>
            </div>
            <p className="text-sm text-gray-500">
              Set up the built-in e-commerce database with sample orders, products, and users. Perfect for exploring the platform.
            </p>
          </button>

          {/* Connect Database Card */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 text-left border-2 border-transparent hover:border-blue-200"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Plus className="w-5 h-5 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Connect Your Database</h3>
            </div>
            <p className="text-sm text-gray-500">
              Connect PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, or ClickHouse. Configure governance and generate cubes.
            </p>
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
                        <div className="text-sm text-gray-500">{db.slug ?? db.id}</div>
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
