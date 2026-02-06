import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Search, Filter, Loader2, AlertTriangle } from 'lucide-react';
import { catalogApi, type MemberWithGovernance, type CatalogOverride } from '../api/client';
import MemberList from '../components/governance/MemberList';
import MemberEditorDrawer from '../components/governance/MemberEditorDrawer';

type FilterType = 'all' | 'measure' | 'dimension' | 'segment';
type StatusFilter = 'all' | 'exposed' | 'hidden' | 'pii' | 'override';

export default function GovernancePage() {
  const [selectedMember, setSelectedMember] = useState<MemberWithGovernance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['catalogMembers'],
    queryFn: () => catalogApi.getMembers(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, override }: { name: string; override: CatalogOverride }) =>
      catalogApi.updateMember(name, override),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogMembers'] });
      setSelectedMember(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (name: string) => catalogApi.removeMember(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogMembers'] });
      setSelectedMember(null);
    },
  });

  const updateDefaultsMutation = useMutation({
    mutationFn: (defaults: { exposed?: boolean; pii?: boolean }) =>
      catalogApi.updateDefaults(defaults),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogMembers'] });
    },
  });

  // Filter members
  const filteredMembers = (data?.members || []).filter((member) => {
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (
        !member.name.toLowerCase().includes(search) &&
        !member.title?.toLowerCase().includes(search) &&
        !member.description?.toLowerCase().includes(search)
      ) {
        return false;
      }
    }

    // Type filter
    if (typeFilter !== 'all' && member.type !== typeFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === 'exposed' && !member.exposed) return false;
    if (statusFilter === 'hidden' && member.exposed) return false;
    if (statusFilter === 'pii' && !member.pii) return false;
    if (statusFilter === 'override' && !member.hasOverride) return false;

    return true;
  });

  // Stats
  const stats = {
    total: data?.members.length || 0,
    exposed: data?.members.filter((m) => m.exposed).length || 0,
    hidden: data?.members.filter((m) => !m.exposed).length || 0,
    pii: data?.members.filter((m) => m.pii).length || 0,
    overrides: data?.members.filter((m) => m.hasOverride).length || 0,
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="card bg-red-50 border border-red-200">
          <div className="flex items-center gap-3 text-red-700">
            <AlertTriangle className="w-6 h-6" />
            <div>
              <h3 className="font-semibold">Error loading governance data</h3>
              <p className="text-sm">{(error as Error).message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Governance</h1>
          <p className="text-gray-600">Manage member visibility and access controls</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Total Members</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Exposed</p>
          <p className="text-2xl font-bold text-green-600">{stats.exposed}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Hidden</p>
          <p className="text-2xl font-bold text-gray-600">{stats.hidden}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">PII Fields</p>
          <p className="text-2xl font-bold text-red-600">{stats.pii}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Overrides</p>
          <p className="text-2xl font-bold text-blue-600">{stats.overrides}</p>
        </div>
      </div>

      {/* Defaults Panel */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Default Settings</h2>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data?.defaults?.exposed ?? true}
              onChange={(e) => updateDefaultsMutation.mutate({ exposed: e.target.checked })}
              className="w-4 h-4"
            />
            <span>Expose members by default</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data?.defaults?.pii ?? false}
              onChange={(e) => updateDefaultsMutation.mutate({ pii: e.target.checked })}
              className="w-4 h-4"
            />
            <span>Mark as PII by default</span>
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search members..."
              className="input pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              className="input w-auto"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as FilterType)}
            >
              <option value="all">All Types</option>
              <option value="measure">Measures</option>
              <option value="dimension">Dimensions</option>
              <option value="segment">Segments</option>
            </select>
            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Status</option>
              <option value="exposed">Exposed</option>
              <option value="hidden">Hidden</option>
              <option value="pii">PII</option>
              <option value="override">Has Override</option>
            </select>
          </div>
        </div>
      </div>

      {/* Member List */}
      {isLoading ? (
        <div className="card flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <MemberList
          members={filteredMembers}
          onSelect={setSelectedMember}
        />
      )}

      {/* Editor Drawer */}
      {selectedMember && (
        <MemberEditorDrawer
          member={selectedMember}
          allMembers={data?.members || []}
          onClose={() => setSelectedMember(null)}
          onSave={(override) => updateMutation.mutate({ name: selectedMember.name, override })}
          onRemove={() => removeMutation.mutate(selectedMember.name)}
          isSaving={updateMutation.isPending}
        />
      )}
    </div>
  );
}
