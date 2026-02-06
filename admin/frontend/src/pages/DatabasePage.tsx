import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Table, ChevronRight, Eye, Loader2, Wand2, FileCode, Edit2, Save, X } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { databaseApi, cubesApi, type TableDetails, type CubeConfig } from '../api/client';
import TableList from '../components/database/TableList';
import CubeGeneratorModal from '../components/database/CubeGeneratorModal';
import YamlPreview from '../components/database/YamlPreview';

export default function DatabasePage() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [generatedYaml, setGeneratedYaml] = useState<string | null>(null);
  const [selectedCubeFile, setSelectedCubeFile] = useState<string | null>(null);
  const [editingYaml, setEditingYaml] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => databaseApi.getTables(),
  });

  const { data: cubeFiles, isLoading: cubeFilesLoading } = useQuery({
    queryKey: ['cubeFiles'],
    queryFn: () => cubesApi.listFiles(),
  });

  const { data: tableDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['tableDetails', selectedTable],
    queryFn: () => (selectedTable ? databaseApi.getTableDetails(selectedTable) : null),
    enabled: !!selectedTable,
  });

  const { data: sampleData, isLoading: sampleLoading } = useQuery({
    queryKey: ['sampleData', selectedTable],
    queryFn: () => (selectedTable ? databaseApi.getSampleData(selectedTable) : null),
    enabled: !!selectedTable,
  });

  const { data: cubeFileContent, isLoading: cubeFileLoading } = useQuery({
    queryKey: ['cubeFile', selectedCubeFile],
    queryFn: () => (selectedCubeFile ? cubesApi.readFile(selectedCubeFile) : null),
    enabled: !!selectedCubeFile,
  });

  const generateMutation = useMutation({
    mutationFn: (config: CubeConfig) => cubesApi.generateYaml(config),
    onSuccess: (data) => {
      setGeneratedYaml(data.yaml);
      setShowGenerator(false);
    },
  });

  const saveCubeMutation = useMutation({
    mutationFn: ({ fileName, config }: { fileName: string; config: CubeConfig }) =>
      cubesApi.createFile(fileName, config),
    onSuccess: () => {
      setGeneratedYaml(null);
      queryClient.invalidateQueries({ queryKey: ['cubeFiles'] });
      alert('Cube file saved successfully!');
    },
  });

  const updateCubeMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      cubesApi.updateFile(name, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cubeFile', selectedCubeFile] });
      queryClient.invalidateQueries({ queryKey: ['cubeFiles'] });
      setEditingYaml(null);
      alert('Cube file updated successfully!');
    },
  });

  const handleSelectCubeFile = (name: string) => {
    setSelectedCubeFile(name);
    setSelectedTable(null);
    setEditingYaml(null);
  };

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    setSelectedCubeFile(null);
    setEditingYaml(null);
  };

  const handleEditYaml = () => {
    if (cubeFileContent?.content) {
      setEditingYaml(cubeFileContent.content);
    }
  };

  const handleSaveYaml = () => {
    if (selectedCubeFile && editingYaml) {
      updateCubeMutation.mutate({ name: selectedCubeFile, content: editingYaml });
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Database className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Database & Cubes</h1>
          <p className="text-gray-600">Explore tables and manage Cube definitions</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="col-span-3 space-y-6">
          {/* Cube Files */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileCode className="w-5 h-5 text-purple-600" />
              Cube Files
            </h2>
            {cubeFilesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : cubeFiles?.files && cubeFiles.files.length > 0 ? (
              <ul className="space-y-1">
                {cubeFiles.files.map((file) => (
                  <li key={file.name}>
                    <button
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        selectedCubeFile === file.name
                          ? 'bg-purple-100 text-purple-700'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                      onClick={() => handleSelectCubeFile(file.name)}
                    >
                      <FileCode className="w-4 h-4 flex-shrink-0" />
                      <span className="font-mono text-sm truncate">{file.name}.yml</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No cube files found</p>
            )}
          </div>

          {/* Tables */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Table className="w-5 h-5" />
              Tables
            </h2>
            {tablesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <TableList
                tables={tables?.tables || []}
                selectedTable={selectedTable}
                onSelect={handleSelectTable}
              />
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-9">
          {/* Cube File View */}
          {selectedCubeFile ? (
            <div className="space-y-6">
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <FileCode className="w-5 h-5 text-purple-600" />
                      {selectedCubeFile}.yml
                    </h2>
                    <p className="text-gray-500 text-sm">Cube definition file</p>
                  </div>
                  <div className="flex gap-2">
                    {editingYaml !== null ? (
                      <>
                        <button
                          className="btn btn-secondary flex items-center gap-2"
                          onClick={() => setEditingYaml(null)}
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                        <button
                          className="btn btn-primary flex items-center gap-2"
                          onClick={handleSaveYaml}
                          disabled={updateCubeMutation.isPending}
                        >
                          {updateCubeMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Save
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-secondary flex items-center gap-2"
                        onClick={handleEditYaml}
                        disabled={cubeFileLoading}
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {cubeFileLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden" style={{ height: '500px' }}>
                    <Editor
                      height="100%"
                      defaultLanguage="yaml"
                      value={editingYaml !== null ? editingYaml : cubeFileContent?.content || ''}
                      onChange={(value) => editingYaml !== null && setEditingYaml(value || '')}
                      options={{
                        readOnly: editingYaml === null,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                      }}
                      theme="vs-light"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : selectedTable ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <ChevronRight className="w-5 h-5" />
                      {selectedTable}
                    </h2>
                    <p className="text-gray-500 text-sm">
                      {tableDetails?.table.columns.length || 0} columns
                    </p>
                  </div>
                  <button
                    className="btn btn-primary flex items-center gap-2"
                    onClick={() => setShowGenerator(true)}
                    disabled={!tableDetails}
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate Cube
                  </button>
                </div>
              </div>

              {/* Columns */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Columns</h3>
                {detailsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Column</th>
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Nullable</th>
                          <th className="text-left py-2 px-3">Default</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableDetails?.table.columns.map((col) => (
                          <tr key={col.column_name} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3 font-mono">{col.column_name}</td>
                            <td className="py-2 px-3">
                              <span className="badge badge-blue">{col.data_type}</span>
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`badge ${col.is_nullable === 'YES' ? 'badge-yellow' : 'badge-gray'}`}
                              >
                                {col.is_nullable}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-gray-500 font-mono text-xs">
                              {col.column_default || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sample Data */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Sample Data
                </h3>
                {sampleLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : sampleData?.data && sampleData.data.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          {Object.keys(sampleData.data[0]).map((key) => (
                            <th key={key} className="text-left py-2 px-3 font-mono">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleData.data.map((row, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="py-2 px-3 font-mono text-xs">
                                {val === null ? (
                                  <span className="text-gray-400">NULL</span>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">No sample data available</p>
                )}
              </div>
            </div>
          ) : (
            <div className="card text-center py-16">
              <Database className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Select a cube file or table to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Cube Generator Modal */}
      {showGenerator && tableDetails && (
        <CubeGeneratorModal
          tableDetails={tableDetails}
          onClose={() => setShowGenerator(false)}
          onGenerate={(config) => generateMutation.mutate(config)}
          isLoading={generateMutation.isPending}
        />
      )}

      {/* YAML Preview */}
      {generatedYaml && tableDetails && (
        <YamlPreview
          yaml={generatedYaml}
          tableName={selectedTable || ''}
          onClose={() => setGeneratedYaml(null)}
          onSave={(fileName) => {
            const config: CubeConfig = {
              name: fileName,
              sql_table: selectedTable || '',
              measures: tableDetails.suggestedMeasures.map((m) => ({
                name: m.name,
                type: m.type,
                sql: m.sql,
                title: m.title,
              })),
              dimensions: tableDetails.suggestedDimensions.map((d) => ({
                name: d.name,
                sql: d.sql,
                type: d.type,
                title: d.title,
                primary_key: d.primaryKey,
              })),
            };
            saveCubeMutation.mutate({ fileName, config });
          }}
          isSaving={saveCubeMutation.isPending}
        />
      )}
    </div>
  );
}
