import { useState } from 'react';
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { CubeQuery, MemberWithGovernance } from '../../api/client';

interface QueryBuilderProps {
  query: CubeQuery;
  onChange: (query: CubeQuery) => void;
  measures: MemberWithGovernance[];
  dimensions: MemberWithGovernance[];
  segments: MemberWithGovernance[];
}

export default function QueryBuilder({
  query,
  onChange,
  measures,
  dimensions,
  segments,
}: QueryBuilderProps) {
  const [expandedSections, setExpandedSections] = useState({
    measures: true,
    dimensions: true,
    filters: false,
    segments: false,
    options: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const addMeasure = (name: string) => {
    if (!query.measures?.includes(name)) {
      onChange({ ...query, measures: [...(query.measures || []), name] });
    }
  };

  const removeMeasure = (name: string) => {
    onChange({
      ...query,
      measures: query.measures?.filter((m) => m !== name) || [],
    });
  };

  const addDimension = (name: string) => {
    if (!query.dimensions?.includes(name)) {
      onChange({ ...query, dimensions: [...(query.dimensions || []), name] });
    }
  };

  const removeDimension = (name: string) => {
    onChange({
      ...query,
      dimensions: query.dimensions?.filter((d) => d !== name) || [],
    });
  };

  const addSegment = (name: string) => {
    if (!query.segments?.includes(name)) {
      onChange({ ...query, segments: [...(query.segments || []), name] });
    }
  };

  const removeSegment = (name: string) => {
    onChange({
      ...query,
      segments: query.segments?.filter((s) => s !== name) || [],
    });
  };

  const addFilter = () => {
    onChange({
      ...query,
      filters: [
        ...(query.filters || []),
        { member: '', operator: 'equals', values: [] },
      ],
    });
  };

  const updateFilter = (
    index: number,
    updates: Partial<{ member: string; operator: string; values: (string | number | boolean)[] }>
  ) => {
    const filters = [...(query.filters || [])];
    filters[index] = { ...filters[index], ...updates };
    onChange({ ...query, filters });
  };

  const removeFilter = (index: number) => {
    onChange({
      ...query,
      filters: query.filters?.filter((_, i) => i !== index) || [],
    });
  };

  return (
    <div className="flex-1 overflow-auto space-y-4">
      {/* Measures */}
      <Section
        title="Measures"
        count={query.measures?.length || 0}
        expanded={expandedSections.measures}
        onToggle={() => toggleSection('measures')}
      >
        <div className="space-y-2">
          {query.measures?.map((m) => (
            <SelectedItem key={m} name={m} onRemove={() => removeMeasure(m)} />
          ))}
          <MemberSelect
            members={measures}
            selected={query.measures || []}
            onSelect={addMeasure}
            placeholder="Add measure..."
          />
        </div>
      </Section>

      {/* Dimensions */}
      <Section
        title="Dimensions"
        count={query.dimensions?.length || 0}
        expanded={expandedSections.dimensions}
        onToggle={() => toggleSection('dimensions')}
      >
        <div className="space-y-2">
          {query.dimensions?.map((d) => (
            <SelectedItem key={d} name={d} onRemove={() => removeDimension(d)} />
          ))}
          <MemberSelect
            members={dimensions}
            selected={query.dimensions || []}
            onSelect={addDimension}
            placeholder="Add dimension..."
          />
        </div>
      </Section>

      {/* Filters */}
      <Section
        title="Filters"
        count={query.filters?.length || 0}
        expanded={expandedSections.filters}
        onToggle={() => toggleSection('filters')}
      >
        <div className="space-y-2">
          {query.filters?.map((filter, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
              <select
                className="input flex-1 text-xs"
                value={filter.member}
                onChange={(e) => updateFilter(i, { member: e.target.value })}
              >
                <option value="">Select member</option>
                {[...dimensions, ...measures].map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                className="input w-24 text-xs"
                value={filter.operator}
                onChange={(e) => updateFilter(i, { operator: e.target.value })}
              >
                <option value="equals">equals</option>
                <option value="notEquals">notEquals</option>
                <option value="contains">contains</option>
                <option value="gt">gt</option>
                <option value="gte">gte</option>
                <option value="lt">lt</option>
                <option value="lte">lte</option>
              </select>
              <input
                type="text"
                className="input flex-1 text-xs"
                placeholder="value"
                value={filter.values?.join(', ') || ''}
                onChange={(e) =>
                  updateFilter(i, {
                    values: e.target.value.split(',').map((v) => v.trim()).filter(Boolean),
                  })
                }
              />
              <button
                className="p-1 hover:bg-gray-200 rounded"
                onClick={() => removeFilter(i)}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ))}
          <button
            className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
            onClick={addFilter}
          >
            <Plus className="w-4 h-4" />
            Add filter
          </button>
        </div>
      </Section>

      {/* Segments */}
      <Section
        title="Segments"
        count={query.segments?.length || 0}
        expanded={expandedSections.segments}
        onToggle={() => toggleSection('segments')}
      >
        <div className="space-y-2">
          {query.segments?.map((s) => (
            <SelectedItem key={s} name={s} onRemove={() => removeSegment(s)} />
          ))}
          <MemberSelect
            members={segments}
            selected={query.segments || []}
            onSelect={addSegment}
            placeholder="Add segment..."
          />
        </div>
      </Section>

      {/* Options */}
      <Section
        title="Options"
        expanded={expandedSections.options}
        onToggle={() => toggleSection('options')}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Limit</label>
            <input
              type="number"
              className="input"
              value={query.limit || 100}
              onChange={(e) =>
                onChange({ ...query, limit: parseInt(e.target.value) || 100 })
              }
              min={1}
              max={1000}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Offset</label>
            <input
              type="number"
              className="input"
              value={query.offset || 0}
              onChange={(e) =>
                onChange({ ...query, offset: parseInt(e.target.value) || 0 })
              }
              min={0}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg">
      <button
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
        onClick={onToggle}
      >
        <span className="font-medium text-sm">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-2 text-xs text-gray-500">({count})</span>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function SelectedItem({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 px-2 py-1 rounded">
      <span className="font-mono text-xs text-blue-700">{name}</span>
      <button
        className="p-0.5 hover:bg-blue-100 rounded"
        onClick={onRemove}
      >
        <X className="w-3 h-3 text-blue-600" />
      </button>
    </div>
  );
}

function MemberSelect({
  members,
  selected,
  onSelect,
  placeholder,
}: {
  members: MemberWithGovernance[];
  selected: string[];
  onSelect: (name: string) => void;
  placeholder: string;
}) {
  const available = members.filter((m) => !selected.includes(m.name));

  return (
    <select
      className="input text-xs text-gray-500"
      value=""
      onChange={(e) => {
        if (e.target.value) onSelect(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {available.map((m) => (
        <option key={m.name} value={m.name}>
          {m.name} {m.title ? `(${m.title})` : ''}
        </option>
      ))}
    </select>
  );
}
