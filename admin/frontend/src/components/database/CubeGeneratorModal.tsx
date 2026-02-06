import { useState } from 'react';
import { X, Loader2, Plus, Minus } from 'lucide-react';
import type { TableDetails, CubeConfig, SuggestedMeasure, SuggestedDimension } from '../../api/client';

interface CubeGeneratorModalProps {
  tableDetails: TableDetails;
  onClose: () => void;
  onGenerate: (config: CubeConfig) => void;
  isLoading: boolean;
}

export default function CubeGeneratorModal({
  tableDetails,
  onClose,
  onGenerate,
  isLoading,
}: CubeGeneratorModalProps) {
  const [cubeName, setCubeName] = useState(
    tableDetails.table.table_name.charAt(0).toUpperCase() +
      tableDetails.table.table_name.slice(1)
  );
  const [cubeTitle, setCubeTitle] = useState('');
  const [cubeDescription, setCubeDescription] = useState('');
  const [selectedMeasures, setSelectedMeasures] = useState<Set<string>>(
    new Set(tableDetails.suggestedMeasures.map((m) => m.name))
  );
  const [selectedDimensions, setSelectedDimensions] = useState<Set<string>>(
    new Set(tableDetails.suggestedDimensions.map((d) => d.name))
  );

  const toggleMeasure = (name: string) => {
    const next = new Set(selectedMeasures);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedMeasures(next);
  };

  const toggleDimension = (name: string) => {
    const next = new Set(selectedDimensions);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedDimensions(next);
  };

  const handleGenerate = () => {
    const config: CubeConfig = {
      name: cubeName,
      sql_table: tableDetails.table.table_name,
      title: cubeTitle || undefined,
      description: cubeDescription || undefined,
      measures: tableDetails.suggestedMeasures
        .filter((m) => selectedMeasures.has(m.name))
        .map((m) => ({
          name: m.name,
          type: m.type,
          sql: m.sql,
          title: m.title,
        })),
      dimensions: tableDetails.suggestedDimensions
        .filter((d) => selectedDimensions.has(d.name))
        .map((d) => ({
          name: d.name,
          sql: d.sql,
          type: d.type,
          title: d.title,
          primary_key: d.primaryKey,
        })),
    };
    onGenerate(config);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Generate Cube Definition</h2>
          <button
            className="p-1 hover:bg-gray-100 rounded"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-medium">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cube Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={cubeName}
                  onChange={(e) => setCubeName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  className="input"
                  value={cubeTitle}
                  onChange={(e) => setCubeTitle(e.target.value)}
                  placeholder={cubeName}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                className="input"
                rows={2}
                value={cubeDescription}
                onChange={(e) => setCubeDescription(e.target.value)}
                placeholder="Describe this cube..."
              />
            </div>
          </div>

          {/* Measures */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">
                Measures ({selectedMeasures.size} selected)
              </h3>
              <div className="flex gap-2">
                <button
                  className="text-sm text-blue-600 hover:underline"
                  onClick={() =>
                    setSelectedMeasures(
                      new Set(tableDetails.suggestedMeasures.map((m) => m.name))
                    )
                  }
                >
                  Select all
                </button>
                <button
                  className="text-sm text-gray-600 hover:underline"
                  onClick={() => setSelectedMeasures(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="border rounded-lg divide-y max-h-48 overflow-auto">
              {tableDetails.suggestedMeasures.map((measure) => (
                <MeasureRow
                  key={measure.name}
                  measure={measure}
                  selected={selectedMeasures.has(measure.name)}
                  onToggle={() => toggleMeasure(measure.name)}
                />
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">
                Dimensions ({selectedDimensions.size} selected)
              </h3>
              <div className="flex gap-2">
                <button
                  className="text-sm text-blue-600 hover:underline"
                  onClick={() =>
                    setSelectedDimensions(
                      new Set(tableDetails.suggestedDimensions.map((d) => d.name))
                    )
                  }
                >
                  Select all
                </button>
                <button
                  className="text-sm text-gray-600 hover:underline"
                  onClick={() => setSelectedDimensions(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="border rounded-lg divide-y max-h-48 overflow-auto">
              {tableDetails.suggestedDimensions.map((dimension) => (
                <DimensionRow
                  key={dimension.name}
                  dimension={dimension}
                  selected={selectedDimensions.has(dimension.name)}
                  onToggle={() => toggleDimension(dimension.name)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={handleGenerate}
            disabled={isLoading || !cubeName || selectedMeasures.size === 0}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Generate YAML
          </button>
        </div>
      </div>
    </div>
  );
}

function MeasureRow({
  measure,
  selected,
  onToggle,
}: {
  measure: SuggestedMeasure;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 ${
        selected ? 'bg-blue-50' : ''
      }`}
      onClick={onToggle}
    >
      <button className={`p-1 rounded ${selected ? 'text-blue-600' : 'text-gray-400'}`}>
        {selected ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm">{measure.name}</p>
        <p className="text-xs text-gray-500">{measure.title}</p>
      </div>
      <span className="badge badge-blue">{measure.type}</span>
    </div>
  );
}

function DimensionRow({
  dimension,
  selected,
  onToggle,
}: {
  dimension: SuggestedDimension;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 ${
        selected ? 'bg-blue-50' : ''
      }`}
      onClick={onToggle}
    >
      <button className={`p-1 rounded ${selected ? 'text-blue-600' : 'text-gray-400'}`}>
        {selected ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm">
          {dimension.name}
          {dimension.primaryKey && (
            <span className="ml-2 text-xs text-yellow-600">(PK)</span>
          )}
        </p>
        <p className="text-xs text-gray-500">{dimension.title}</p>
      </div>
      <span className="badge badge-green">{dimension.type}</span>
    </div>
  );
}
