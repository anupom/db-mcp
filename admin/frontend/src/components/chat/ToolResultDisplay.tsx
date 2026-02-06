import { Search, Database, CheckCircle, XCircle, Table } from 'lucide-react';

interface ToolResultDisplayProps {
  toolName: string;
  result: unknown;
}

export default function ToolResultDisplay({ toolName, result }: ToolResultDisplayProps) {
  // Parse result if it's a string
  let parsedResult = result;
  if (typeof result === 'string') {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      // Keep as string
    }
  }

  // Handle different tool types
  switch (toolName) {
    case 'search_catalog':
      return <CatalogResults result={parsedResult} />;
    case 'describe_member':
      return <MemberDescription result={parsedResult} />;
    case 'query_data':
      return <QueryResults result={parsedResult} />;
    case 'validate_query':
      return <ValidationResults result={parsedResult} />;
    default:
      return <GenericResult result={parsedResult} />;
  }
}

function CatalogResults({ result }: { result: unknown }) {
  if (!result || typeof result !== 'object') {
    return <GenericResult result={result} />;
  }

  const data = result as { results?: Array<{ name: string; type: string; description?: string; score?: number }> };
  const results = data.results || [];

  if (results.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-2">
        No results found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
        <Search className="w-4 h-4" />
        <span>{results.length} result{results.length !== 1 ? 's' : ''} found</span>
      </div>
      <div className="grid gap-2">
        {results.map((item, i) => (
          <div key={i} className="bg-gray-50 rounded-lg p-3 border">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                item.type === 'measure' ? 'bg-blue-100 text-blue-700' :
                item.type === 'dimension' ? 'bg-green-100 text-green-700' :
                'bg-purple-100 text-purple-700'
              }`}>
                {item.type}
              </span>
              <span className="font-mono text-sm font-medium">{item.name}</span>
            </div>
            {item.description && (
              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MemberDescription({ result }: { result: unknown }) {
  if (!result || typeof result !== 'object') {
    return <GenericResult result={result} />;
  }

  const member = result as {
    name?: string;
    type?: string;
    title?: string;
    description?: string;
    cubeName?: string;
    exposed?: boolean;
    pii?: boolean;
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 border">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-4 h-4 text-gray-600" />
        <span className="font-mono font-medium">{member.name}</span>
        {member.type && (
          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
            member.type === 'measure' ? 'bg-blue-100 text-blue-700' :
            member.type === 'dimension' ? 'bg-green-100 text-green-700' :
            'bg-purple-100 text-purple-700'
          }`}>
            {member.type}
          </span>
        )}
      </div>
      {member.title && member.title !== member.name && (
        <p className="text-sm font-medium text-gray-700">{member.title}</p>
      )}
      {member.description && (
        <p className="text-sm text-gray-600 mt-1">{member.description}</p>
      )}
      {member.cubeName && (
        <p className="text-xs text-gray-500 mt-2">Cube: {member.cubeName}</p>
      )}
      <div className="flex gap-3 mt-2 text-xs">
        {member.exposed !== undefined && (
          <span className={member.exposed ? 'text-green-600' : 'text-red-600'}>
            {member.exposed ? 'Exposed' : 'Hidden'}
          </span>
        )}
        {member.pii && (
          <span className="text-orange-600">PII</span>
        )}
      </div>
    </div>
  );
}

function QueryResults({ result }: { result: unknown }) {
  if (!result || typeof result !== 'object') {
    return <GenericResult result={result} />;
  }

  const data = result as { data?: unknown[]; error?: string };

  if (data.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <div className="flex items-center gap-2 text-red-700">
          <XCircle className="w-4 h-4" />
          <span className="font-medium">Query Error</span>
        </div>
        <p className="text-sm text-red-600 mt-1">{data.error}</p>
      </div>
    );
  }

  const rows = data.data || [];
  if (rows.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-2">
        Query returned no results
      </div>
    );
  }

  const columns = Object.keys(rows[0] as Record<string, unknown>);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b text-sm text-gray-600">
        <Table className="w-4 h-4" />
        <span>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th key={col} className="text-left py-2 px-3 font-medium text-gray-600 border-b whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                {columns.map((col) => {
                  const value = (row as Record<string, unknown>)[col];
                  return (
                    <td key={col} className="py-2 px-3 font-mono text-xs">
                      {formatValue(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <div className="px-3 py-2 bg-gray-50 border-t text-xs text-gray-500">
          Showing 10 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

function ValidationResults({ result }: { result: unknown }) {
  if (!result || typeof result !== 'object') {
    return <GenericResult result={result} />;
  }

  const data = result as { valid?: boolean; errors?: string[]; warnings?: string[] };

  return (
    <div className={`rounded-lg p-3 border ${
      data.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {data.valid ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ) : (
          <XCircle className="w-5 h-5 text-red-600" />
        )}
        <span className={`font-medium ${data.valid ? 'text-green-700' : 'text-red-700'}`}>
          {data.valid ? 'Query is valid' : 'Query has errors'}
        </span>
      </div>
      {data.errors && data.errors.length > 0 && (
        <ul className="text-sm text-red-600 space-y-1 ml-7">
          {data.errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
      {data.warnings && data.warnings.length > 0 && (
        <ul className="text-sm text-yellow-600 space-y-1 ml-7 mt-2">
          {data.warnings.map((warn, i) => (
            <li key={i}>{warn}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GenericResult({ result }: { result: unknown }) {
  if (result === null || result === undefined) {
    return <span className="text-gray-400 text-sm">No result</span>;
  }

  if (typeof result === 'string') {
    return <pre className="text-sm whitespace-pre-wrap bg-gray-50 rounded p-3 overflow-auto max-h-64">{result}</pre>;
  }

  return (
    <pre className="text-sm whitespace-pre-wrap bg-gray-50 rounded p-3 overflow-auto max-h-64 font-mono">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">null</span>;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-green-600' : 'text-red-600'}>
        {String(value)}
      </span>
    );
  }

  return String(value);
}
