import { useState } from 'react';
import { X, Save, Trash2, Loader2, Plus, Minus } from 'lucide-react';
import type { MemberWithGovernance, CatalogOverride } from '../../api/client';

interface MemberEditorDrawerProps {
  member: MemberWithGovernance;
  allMembers: MemberWithGovernance[];
  onClose: () => void;
  onSave: (override: CatalogOverride) => void;
  onRemove: () => void;
  isSaving: boolean;
}

export default function MemberEditorDrawer({
  member,
  allMembers,
  onClose,
  onSave,
  onRemove,
  isSaving,
}: MemberEditorDrawerProps) {
  const [exposed, setExposed] = useState(member.exposed);
  const [pii, setPii] = useState(member.pii);
  const [description, setDescription] = useState(member.description || '');
  const [allowedGroupBy, setAllowedGroupBy] = useState<string[]>(
    member.allowedGroupBy || []
  );
  const [deniedGroupBy, setDeniedGroupBy] = useState<string[]>(
    member.deniedGroupBy || []
  );
  const [requiresTimeDimension, setRequiresTimeDimension] = useState(
    member.requiresTimeDimension || false
  );

  // Get all dimensions for group-by selection
  const dimensions = allMembers.filter((m) => m.type === 'dimension');

  const handleSave = () => {
    const override: CatalogOverride = {};

    // Only include changed values
    if (exposed !== member.exposed) override.exposed = exposed;
    if (pii !== member.pii) override.pii = pii;
    if (description && description !== member.description) {
      override.description = description;
    }
    if (allowedGroupBy.length > 0) override.allowedGroupBy = allowedGroupBy;
    if (deniedGroupBy.length > 0) override.deniedGroupBy = deniedGroupBy;
    if (requiresTimeDimension) override.requiresTimeDimension = true;

    onSave(override);
  };

  const toggleAllowed = (dim: string) => {
    setAllowedGroupBy((prev) =>
      prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]
    );
  };

  const toggleDenied = (dim: string) => {
    setDeniedGroupBy((prev) =>
      prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{member.name}</h2>
            <p className="text-sm text-gray-500">{member.title || member.type}</p>
          </div>
          <button
            className="p-1 hover:bg-gray-100 rounded"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Cube Info */}
          {member.cubeDescription && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">{member.cubeDescription}</p>
            </div>
          )}

          {/* Basic Settings */}
          <div className="space-y-4">
            <h3 className="font-medium">Visibility</h3>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={exposed}
                onChange={(e) => setExposed(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <p className="font-medium">Exposed</p>
                <p className="text-sm text-gray-500">
                  Allow this member to be used in queries
                </p>
              </div>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={pii}
                onChange={(e) => setPii(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <p className="font-medium text-red-600">PII</p>
                <p className="text-sm text-gray-500">
                  Mark as personally identifiable information (blocks all queries)
                </p>
              </div>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Description
            </label>
            <textarea
              className="input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for this member..."
            />
          </div>

          {/* Group-by Restrictions (only for measures) */}
          {member.type === 'measure' && (
            <>
              <div>
                <h3 className="font-medium mb-2">Allowed Group-By Dimensions</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Whitelist specific dimensions that can be used with this measure
                </p>
                <div className="border rounded-lg max-h-48 overflow-auto">
                  {dimensions.map((dim) => (
                    <label
                      key={dim.name}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={allowedGroupBy.includes(dim.name)}
                        onChange={() => toggleAllowed(dim.name)}
                        className="w-4 h-4"
                      />
                      <span className="font-mono text-sm">{dim.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Denied Group-By Dimensions</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Blacklist specific dimensions that cannot be used with this measure
                </p>
                <div className="border rounded-lg max-h-48 overflow-auto">
                  {dimensions.map((dim) => (
                    <label
                      key={dim.name}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={deniedGroupBy.includes(dim.name)}
                        onChange={() => toggleDenied(dim.name)}
                        className="w-4 h-4"
                      />
                      <span className="font-mono text-sm">{dim.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={requiresTimeDimension}
                  onChange={(e) => setRequiresTimeDimension(e.target.checked)}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">Requires Time Dimension</p>
                  <p className="text-sm text-gray-500">
                    Enforce that a time dimension must be included in queries
                  </p>
                </div>
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          {member.hasOverride ? (
            <button
              className="btn btn-danger flex items-center gap-2"
              onClick={onRemove}
            >
              <Trash2 className="w-4 h-4" />
              Remove Override
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
