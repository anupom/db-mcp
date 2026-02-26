import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Table, ChevronRight, Eye, Loader2, Wand2, FileCode, Edit2, Save, X, AlertCircle } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { databaseApi, cubesApi, type CubeConfig } from '../api/client';
import { useDatabaseContext } from '../context/DatabaseContext';
import DatabaseSelector from '../components/shared/DatabaseSelector';
import TableList from '../components/database/TableList';
import CubeGeneratorModal from '../components/database/CubeGeneratorModal';
import YamlPreview from '../components/database/YamlPreview';

export default function DatabasePage() {
  const { databaseId, isLoading: dbLoading, databases } = useDatabaseContext();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [generatedYaml, setGeneratedYaml] = useState<string | null>(null);
  const [generatedConfig, setGeneratedConfig] = useState<CubeConfig | null>(null);
  const [selectedCubeFile, setSelectedCubeFile] = useState<string | null>(null);
  const [editingYaml, setEditingYaml] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });

  const queryClient = useQueryClient();

  // Reset selections when database changes
  useEffect(() => {
    setSelectedTable(null);
    setSelectedCubeFile(null);
    setEditingYaml(null);
    setGeneratedYaml(null);
    setGeneratedConfig(null);
  }, [databaseId]);

  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['tables', databaseId],
    queryFn: () => databaseApi.getTables(databaseId!),
    enabled: !!databaseId,
  });

  const { data: cubeFiles, isLoading: cubeFilesLoading } = useQuery({
    queryKey: ['cubeFiles', databaseId],
    queryFn: () => cubesApi.listFiles(databaseId!),
    enabled: !!databaseId,
  });

  const { data: tableDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['tableDetails', databaseId, selectedTable],
    queryFn: () => databaseApi.getTableDetails(databaseId!, selectedTable!),
    enabled: !!databaseId && !!selectedTable,
  });

  const { data: sampleData, isLoading: sampleLoading } = useQuery({
    queryKey: ['sampleData', databaseId, selectedTable],
    queryFn: () => databaseApi.getSampleData(databaseId!, selectedTable!),
    enabled: !!databaseId && !!selectedTable,
  });

  const { data: cubeFileContent, isLoading: cubeFileLoading } = useQuery({
    queryKey: ['cubeFile', databaseId, selectedCubeFile],
    queryFn: () => cubesApi.readFile(databaseId!, selectedCubeFile!),
    enabled: !!databaseId && !!selectedCubeFile,
  });

  const generateMutation = useMutation({
    mutationFn: async (config: CubeConfig) => {
      // Try LLM-enhanced generation first, fallback to rule-based
      try {
        const enhanced = await cubesApi.generateEnhanced(
          databaseId!,
          config.sql_table,
          config,
          sampleData?.data
        );
        return enhanced;
      } catch (llmError) {
        console.warn('LLM enhancement failed, using rule-based:', llmError);
        const result = await cubesApi.generateYaml(databaseId!, config);
        return { yaml: result.yaml, config };
      }
    },
    onSuccess: (data) => {
      setGeneratedYaml(data.yaml);
      setGeneratedConfig(data.config);
      setShowGenerator(false);
    },
  });

  const saveCubeMutation = useMutation({
    mutationFn: ({ fileName, config }: { fileName: string; config: CubeConfig }) =>
      cubesApi.createFile(databaseId!, fileName, config),
    onSuccess: () => {
      setGeneratedYaml(null);
      setGeneratedConfig(null);
      queryClient.invalidateQueries({ queryKey: ['cubeFiles', databaseId] });
      alert('Cube file saved successfully!');
    },
  });

  const updateCubeMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      cubesApi.updateFile(databaseId!, name, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cubeFile', databaseId, selectedCubeFile] });
      queryClient.invalidateQueries({ queryKey: ['cubeFiles', databaseId] });
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

  const handleGenerateAllCubes = async () => {
    if (!tables?.tables || tables.tables.length === 0) return;

    setIsGeneratingAll(true);
    const allTables = tables.tables;
    setGenerationProgress({ current: 0, total: allTables.length });

    for (let i = 0; i < allTables.length; i++) {
      const table = allTables[i];
      try {
        // Step 1: Get table details (rule-based suggestions)
        const details = await databaseApi.getTableDetails(databaseId!, table.table_name);

        // Step 2: Get sample data for LLM context
        const sample = await databaseApi.getSampleData(databaseId!, table.table_name);

        // Step 3: Build initial config from rules
        const initialConfig: CubeConfig = {
          name: table.table_name,
          sql_table: table.table_name,
          measures: details.suggestedMeasures.map(m => ({
            name: m.name,
            type: m.type,
            sql: m.sql,
            title: m.title,
          })),
          dimensions: details.suggestedDimensions.map(d => ({
            name: d.name,
            sql: d.sql,
            type: d.type,
            title: d.title,
            primary_key: d.primaryKey,
          })),
        };

        // Step 4: Enhance with LLM (with fallback to rule-based)
        try {
          const enhanced = await cubesApi.generateEnhanced(
            databaseId!,
            table.table_name,
            initialConfig,
            sample?.data
          );
          // Step 5: Save enhanced cube
          await cubesApi.createFile(databaseId!, table.table_name, enhanced.config);
        } catch (llmError) {
          console.warn(`LLM enhancement failed for ${table.table_name}, using rule-based:`, llmError);
          // Fallback: save rule-based config
          await cubesApi.createFile(databaseId!, table.table_name, initialConfig);
        }

        setGenerationProgress({ current: i + 1, total: allTables.length });
      } catch (error) {
        console.error(`Failed to generate cube for ${table.table_name}:`, error);
      }
    }

    setIsGeneratingAll(false);
    queryClient.invalidateQueries({ queryKey: ['cubeFiles', databaseId] });
  };

  // Show prompt if no database selected
  if (!databaseId) {
    const isInitializing = dbLoading || databases.length === 0;
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Database & Cubes</h1>
              <p className="text-gray-600">Explore tables and manage Cube definitions</p>
            </div>
          </div>
          {!isInitializing && <DatabaseSelector />}
        </div>

        <div className="card text-center py-16">
          {isInitializing ? (
            <>
              <Loader2 className="w-16 h-16 mx-auto text-blue-500 mb-4 animate-spin" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Setting Up Your Database</h2>
              <p className="text-gray-500 mb-4">We're preparing your database and generating schemas. This usually takes a few seconds.</p>
            </>
          ) : (
            <>
              <AlertCircle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">No Database Selected</h2>
              <p className="text-gray-500 mb-4">Select a database from the dropdown above to view tables and cubes.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Database & Cubes</h1>
            <p className="text-gray-600">Explore tables and manage Cube definitions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={handleGenerateAllCubes}
            disabled={isGeneratingAll || !tables?.tables?.length}
          >
            {isGeneratingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating ({generationProgress.current}/{generationProgress.total})
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate All Cubes
              </>
            )}
          </button>
          <DatabaseSelector />
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
          onClose={() => {
            setGeneratedYaml(null);
            setGeneratedConfig(null);
          }}
          onSave={(fileName) => {
            // Use the LLM-enhanced config if available, otherwise fall back to rule-based
            const config: CubeConfig = generatedConfig
              ? { ...generatedConfig, name: fileName }
              : {
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
