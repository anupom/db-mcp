import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Play, Code, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react';
import { catalogApi, queryApi, type CubeQuery } from '../api/client';
import { useDatabaseContext } from '../context/DatabaseContext';
import DatabaseSelector from '../components/shared/DatabaseSelector';
import QueryBuilder from '../components/playground/QueryBuilder';
import ResultsTable from '../components/playground/ResultsTable';
import SqlPreview from '../components/playground/SqlPreview';

export default function PlaygroundPage() {
  const { databaseId } = useDatabaseContext();
  const [query, setQuery] = useState<CubeQuery>({
    measures: [],
    dimensions: [],
    limit: 100,
  });
  const [results, setResults] = useState<unknown[] | null>(null);
  const [sql, setSql] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'results' | 'sql'>('results');

  // Reset state when database changes
  useEffect(() => {
    setQuery({ measures: [], dimensions: [], limit: 100 });
    setResults(null);
    setSql(null);
    setActiveTab('results');
  }, [databaseId]);

  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ['catalogMembers', databaseId],
    queryFn: () => catalogApi.getMembers(databaseId!),
    enabled: !!databaseId,
  });

  const validateMutation = useMutation({
    mutationFn: (q: CubeQuery) => queryApi.validate(databaseId!, q),
  });

  const executeMutation = useMutation({
    mutationFn: (q: CubeQuery) => queryApi.execute(databaseId!, q),
    onSuccess: (data) => {
      setResults(data.data);
      setActiveTab('results');
    },
  });

  const sqlMutation = useMutation({
    mutationFn: (q: CubeQuery) => queryApi.getSql(databaseId!, q),
    onSuccess: (data) => {
      setSql(data.sql?.sql?.join('\n') || 'No SQL generated');
      setActiveTab('sql');
    },
  });

  const handleValidate = () => {
    if (!databaseId) return;
    validateMutation.mutate(query);
  };

  const handleExecute = () => {
    if (!databaseId) return;
    executeMutation.mutate(query);
  };

  const handleGetSql = () => {
    if (!databaseId) return;
    sqlMutation.mutate(query);
  };

  const handleExport = () => {
    if (!results || results.length === 0) return;

    const headers = Object.keys(results[0] as Record<string, unknown>);
    const csv = [
      headers.join(','),
      ...results.map((row) =>
        headers
          .map((h) => {
            const val = (row as Record<string, unknown>)[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get available members that are exposed and not PII
  const availableMembers = (catalogData?.members || []).filter(
    (m) => m.exposed && !m.pii
  );

  const measures = availableMembers.filter((m) => m.type === 'measure');
  const dimensions = availableMembers.filter((m) => m.type === 'dimension');
  const segments = availableMembers.filter((m) => m.type === 'segment');

  // Show prompt if no database selected
  if (!databaseId) {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Play className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Query Playground</h1>
              <p className="text-gray-600">Build and test queries against the semantic layer</p>
            </div>
          </div>
          <DatabaseSelector />
        </div>

        <div className="card text-center py-16 flex-1 flex flex-col items-center justify-center">
          <AlertCircle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No Database Selected</h2>
          <p className="text-gray-500 mb-4">Select a database from the dropdown above to start querying.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Play className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Query Playground</h1>
            <p className="text-gray-600">Build and test queries against the semantic layer</p>
          </div>
        </div>
        <DatabaseSelector />
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Query Builder */}
        <div className="col-span-4 flex flex-col">
          <div className="card flex-1 flex flex-col overflow-hidden">
            <h2 className="text-lg font-semibold mb-4">Query Builder</h2>
            {catalogLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <QueryBuilder
                query={query}
                onChange={setQuery}
                measures={measures}
                dimensions={dimensions}
                segments={segments}
              />
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <button
                className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
                onClick={handleValidate}
                disabled={validateMutation.isPending}
              >
                {validateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Validate
              </button>
              <button
                className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
                onClick={handleGetSql}
                disabled={sqlMutation.isPending}
              >
                {sqlMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Code className="w-4 h-4" />
                )}
                SQL
              </button>
              <button
                className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                onClick={handleExecute}
                disabled={executeMutation.isPending}
              >
                {executeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Execute
              </button>
            </div>

            {/* Validation Results */}
            {validateMutation.data && (
              <div
                className={`mt-4 p-3 rounded-lg ${
                  validateMutation.data.valid
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {validateMutation.data.valid ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span
                    className={`font-medium ${
                      validateMutation.data.valid ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {validateMutation.data.valid ? 'Query is valid' : 'Query has errors'}
                  </span>
                </div>
                {validateMutation.data.errors.length > 0 && (
                  <ul className="text-sm text-red-600 space-y-1">
                    {validateMutation.data.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                )}
                {validateMutation.data.warnings.length > 0 && (
                  <ul className="text-sm text-yellow-600 space-y-1 mt-2">
                    {validateMutation.data.warnings.map((warn, i) => (
                      <li key={i}>⚠ {warn}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Results / SQL */}
        <div className="col-span-8 flex flex-col">
          <div className="card flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex border-b">
                <button
                  className={`px-4 py-2 font-medium ${
                    activeTab === 'results'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveTab('results')}
                >
                  Results
                </button>
                <button
                  className={`px-4 py-2 font-medium ${
                    activeTab === 'sql'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setActiveTab('sql')}
                >
                  SQL
                </button>
              </div>
              {results && results.length > 0 && activeTab === 'results' && (
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={handleExport}
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {activeTab === 'results' ? (
                executeMutation.isPending ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : executeMutation.error ? (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">Error executing query</span>
                    </div>
                    <p className="text-sm text-red-600 mt-2">
                      {(executeMutation.error as Error).message}
                    </p>
                  </div>
                ) : results ? (
                  <ResultsTable data={results} />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    Execute a query to see results
                  </div>
                )
              ) : (
                <SqlPreview sql={sql} isLoading={sqlMutation.isPending} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
