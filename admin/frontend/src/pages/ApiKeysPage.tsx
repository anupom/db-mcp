import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';
import { apiKeysApi, type ApiKeyInfo } from '../api/client';

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiKeysApi.create(name),
    onSuccess: (result) => {
      setCreatedKey(result.rawKey);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleCreate = () => {
    if (newKeyName.trim()) {
      createMutation.mutate(newKeyName.trim());
    }
  };

  const handleCopy = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseCreated = () => {
    setCreatedKey(null);
    setShowCreateModal(false);
    setCopied(false);
  };

  const activeKeys = data?.keys.filter(k => !k.revokedAt) || [];
  const revokedKeys = data?.keys.filter(k => k.revokedAt) || [];

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6" />
            API Keys
          </h1>
          <p className="text-gray-600 mt-1">
            Manage API keys for MCP endpoint access
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Key
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error instanceof Error ? error.message : 'Failed to load API keys'}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-500">Loading API keys...</div>
      ) : activeKeys.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No API keys</h3>
          <p className="text-gray-500 mt-1">Create an API key to connect Claude Desktop or other MCP clients.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeKeys.map((key) => (
            <ApiKeyRow key={key.id} apiKey={key} onRevoke={() => revokeMutation.mutate(key.id)} />
          ))}
        </div>
      )}

      {revokedKeys.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-500 mb-3">Revoked Keys</h2>
          <div className="space-y-3 opacity-60">
            {revokedKeys.map((key) => (
              <ApiKeyRow key={key.id} apiKey={key} revoked />
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            {createdKey ? (
              <>
                <h2 className="text-lg font-semibold mb-4">API Key Created</h2>
                <p className="text-sm text-gray-600 mb-3">
                  Copy this key now. You won't be able to see it again.
                </p>
                <div className="flex items-center gap-2 bg-gray-100 p-3 rounded font-mono text-sm break-all">
                  <span className="flex-1">{createdKey}</span>
                  <button onClick={handleCopy} className="shrink-0 text-gray-500 hover:text-gray-700">
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleCloseCreated}
                  className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-4">Create API Key</h2>
                <label className="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Claude Desktop, Production"
                  className="w-full border rounded-lg px-3 py-2 mb-4"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                {createMutation.error && (
                  <p className="text-red-600 text-sm mb-3">
                    {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create key'}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowCreateModal(false); setNewKeyName(''); }}
                    className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newKeyName.trim() || createMutation.isPending}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeyRow({ apiKey, onRevoke, revoked }: { apiKey: ApiKeyInfo; onRevoke?: () => void; revoked?: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
      <div>
        <div className="font-medium">{apiKey.name}</div>
        <div className="text-sm text-gray-500 font-mono">{apiKey.keyPrefix}...</div>
        <div className="text-xs text-gray-400 mt-1">
          Created {new Date(apiKey.createdAt).toLocaleDateString()}
          {apiKey.lastUsedAt && ` · Last used ${new Date(apiKey.lastUsedAt).toLocaleDateString()}`}
          {apiKey.revokedAt && ` · Revoked ${new Date(apiKey.revokedAt).toLocaleDateString()}`}
        </div>
      </div>
      {!revoked && onRevoke && (
        <button
          onClick={onRevoke}
          className="text-red-500 hover:text-red-700 p-2"
          title="Revoke key"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
