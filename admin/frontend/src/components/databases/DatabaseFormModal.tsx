import { useState } from 'react';
import { X, Database, Loader2 } from 'lucide-react';
import { databasesApi, type DatabaseType, type CreateDatabaseInput, type DatabaseConfig } from '../../api/client';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  /** When provided, the modal operates in edit mode */
  editDatabase?: DatabaseConfig;
}

const DB_TYPES: { value: DatabaseType; label: string }[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'redshift', label: 'Redshift' },
  { value: 'clickhouse', label: 'ClickHouse' },
];

export default function DatabaseFormModal({ onClose, onSuccess, editDatabase }: Props) {
  const isEdit = !!editDatabase;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — pre-fill from editDatabase when editing
  const conn = editDatabase?.connection;
  const [id, setId] = useState(editDatabase?.id ?? '');
  const [name, setName] = useState(editDatabase?.name ?? '');
  const [description, setDescription] = useState(editDatabase?.description ?? '');
  const [dbType, setDbType] = useState<DatabaseType>(conn?.type ?? 'postgres');
  const [host, setHost] = useState(conn?.host ?? 'localhost');
  const [port, setPort] = useState(String(conn?.port ?? '5432'));
  const [database, setDatabase] = useState(conn?.database ?? '');
  const [user, setUser] = useState(conn?.user ?? '');
  const [password, setPassword] = useState(isEdit ? '' : '');
  const [ssl, setSsl] = useState(conn?.ssl ?? false);

  // Cloud-specific fields
  const [projectId, setProjectId] = useState(conn?.projectId ?? '');
  const [account, setAccount] = useState(conn?.account ?? '');
  const [warehouse, setWarehouse] = useState(conn?.warehouse ?? '');

  // Advanced settings
  const [maxLimit, setMaxLimit] = useState(String(editDatabase?.maxLimit ?? '1000'));
  const [cubeApiUrl, setCubeApiUrl] = useState(editDatabase?.cubeApiUrl ?? '');
  const [jwtSecret, setJwtSecret] = useState('');

  const getDefaultPort = (type: DatabaseType): string => {
    switch (type) {
      case 'postgres':
      case 'redshift':
        return '5432';
      case 'mysql':
        return '3306';
      case 'clickhouse':
        return '8123';
      default:
        return '';
    }
  };

  const handleTypeChange = (newType: DatabaseType) => {
    setDbType(newType);
    setPort(getDefaultPort(newType));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isEdit) {
        // Build partial update — only include changed fields
        const update: Partial<CreateDatabaseInput> = {
          name,
          description: description || undefined,
          connection: { type: dbType },
          maxLimit: parseInt(maxLimit) || 1000,
          cubeApiUrl: cubeApiUrl || undefined,
          jwtSecret: jwtSecret || undefined,
        };

        if (['postgres', 'mysql', 'redshift', 'clickhouse'].includes(dbType)) {
          update.connection!.host = host;
          update.connection!.port = parseInt(port);
          update.connection!.database = database;
          update.connection!.user = user;
          // Only send password if the user actually typed a new one
          if (password) {
            update.connection!.password = password;
          }
          update.connection!.ssl = ssl;
        }

        if (dbType === 'bigquery') {
          update.connection!.projectId = projectId;
        }

        if (dbType === 'snowflake') {
          update.connection!.account = account;
          update.connection!.warehouse = warehouse;
          update.connection!.database = database;
          update.connection!.user = user;
          if (password) {
            update.connection!.password = password;
          }
        }

        // Strip undefined jwtSecret so we don't clear it
        if (!jwtSecret) {
          delete update.jwtSecret;
        }

        await databasesApi.update(editDatabase!.id, update);
      } else {
        const input: CreateDatabaseInput = {
          id: id.toLowerCase().replace(/\s+/g, '-'),
          name,
          description: description || undefined,
          connection: {
            type: dbType,
          },
          maxLimit: parseInt(maxLimit) || 1000,
          cubeApiUrl: cubeApiUrl || undefined,
          jwtSecret: jwtSecret || undefined,
        };

        // Add connection details based on type
        if (['postgres', 'mysql', 'redshift', 'clickhouse'].includes(dbType)) {
          input.connection.host = host;
          input.connection.port = parseInt(port);
          input.connection.database = database;
          input.connection.user = user;
          input.connection.password = password;
          input.connection.ssl = ssl;
        }

        if (dbType === 'bigquery') {
          input.connection.projectId = projectId;
        }

        if (dbType === 'snowflake') {
          input.connection.account = account;
          input.connection.warehouse = warehouse;
          input.connection.database = database;
          input.connection.user = user;
          input.connection.password = password;
        }

        await databasesApi.create(input);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? 'update' : 'create'} database`);
    } finally {
      setLoading(false);
    }
  };

  const showHostPort = ['postgres', 'mysql', 'redshift', 'clickhouse'].includes(dbType);
  const showBigQuery = dbType === 'bigquery';
  const showSnowflake = dbType === 'snowflake';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5" />
            {isEdit ? 'Edit Database' : 'Add Database'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="my-database"
                  pattern="[a-z0-9-]+"
                  required
                  disabled={isEdit}
                />
                {!isEdit && <p className="text-xs text-gray-500 mt-1">URL-safe ID (lowercase, hyphens)</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="My Database"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description"
              />
            </div>

            {/* Database Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Database Type <span className="text-red-500">*</span>
              </label>
              <select
                value={dbType}
                onChange={(e) => handleTypeChange(e.target.value as DatabaseType)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {DB_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Connection - Host/Port based */}
            {showHostPort && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Host <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="localhost"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Port <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Database <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      User <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password {!isEdit && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={isEdit ? 'Leave empty to keep current' : ''}
                      required={!isEdit}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ssl"
                    checked={ssl}
                    onChange={(e) => setSsl(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="ssl" className="text-sm text-gray-700">
                    Enable SSL
                  </label>
                </div>
              </>
            )}

            {/* BigQuery */}
            {showBigQuery && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="my-gcp-project"
                  required
                />
              </div>
            )}

            {/* Snowflake */}
            {showSnowflake && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="abc12345.us-east-1"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Warehouse <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Database <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      User <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={user}
                      onChange={(e) => setUser(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password {!isEdit && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={isEdit ? 'Leave empty to keep current' : ''}
                      required={!isEdit}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Advanced Settings */}
            <details className="border rounded-lg">
              <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-gray-700 bg-gray-50 rounded-t-lg">
                Advanced Settings
              </summary>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Query Limit
                  </label>
                  <input
                    type="number"
                    value={maxLimit}
                    onChange={(e) => setMaxLimit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="1000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Semantic Layer URL (optional)
                  </label>
                  <input
                    type="url"
                    value={cubeApiUrl}
                    onChange={(e) => setCubeApiUrl(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Leave empty to use the default"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to use the default semantic layer endpoint
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Secret (optional)
                  </label>
                  <input
                    type="password"
                    value={jwtSecret}
                    onChange={(e) => setJwtSecret(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={isEdit ? 'Leave empty to keep current' : 'Leave empty to use global secret'}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Must be at least 32 characters if provided
                  </p>
                </div>
              </div>
            </details>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
