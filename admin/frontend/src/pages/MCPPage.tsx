import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plug, ChevronDown, ChevronRight, Copy, Check, Loader2, AlertTriangle, AlertCircle, Server, Terminal, Globe } from 'lucide-react';
import { mcpApi, type MCPTool } from '../api/client';
import { useDatabaseContext } from '../context/DatabaseContext';
import DatabaseSelector from '../components/shared/DatabaseSelector';

function ToolCard({ tool, isExpanded, onToggle }: { tool: MCPTool; isExpanded: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);

  const copySchema = () => {
    navigator.clipboard.writeText(JSON.stringify(tool.inputSchema, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
        <div className="flex-1">
          <h3 className="font-mono font-semibold text-blue-600">{tool.name}</h3>
          <p className="text-sm text-gray-600">{tool.description}</p>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 pl-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Input Schema</span>
            <button
              onClick={copySchema}
              className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
            {JSON.stringify(tool.inputSchema, null, 2)}
          </pre>

          {tool.inputSchema.required && (
            <div className="mt-3">
              <span className="text-sm font-medium text-gray-700">Required: </span>
              <span className="text-sm text-gray-600">
                {(tool.inputSchema.required as string[]).map((r) => (
                  <code key={r} className="bg-gray-100 px-1 rounded mx-1">{r}</code>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MCPPage() {
  const { databaseId, activeDatabases } = useDatabaseContext();
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set(['catalog.search']));
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const selectedDatabase = activeDatabases.find((db) => db.id === databaseId);

  const { data: serverInfo, isLoading: infoLoading, error: infoError } = useQuery({
    queryKey: ['mcpInfo', databaseId],
    queryFn: () => mcpApi.getInfo(databaseId!),
    enabled: !!databaseId,
  });

  const { data: toolsData, isLoading: toolsLoading, error: toolsError } = useQuery({
    queryKey: ['mcpTools', databaseId],
    queryFn: () => mcpApi.getTools(databaseId!),
    enabled: !!databaseId,
  });

  const toggleTool = (name: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Build the endpoint URL with databaseId
  const mcpEndpoint = databaseId ? `/mcp/${databaseId}` : '';
  const fullEndpoint = typeof window !== 'undefined' ? `${window.location.origin}${mcpEndpoint}` : mcpEndpoint;

  const integrationSnippet = serverInfo && databaseId
    ? `{
  "mcpServers": {
    "${serverInfo.name}-${databaseId}": {
      "command": "node",
      "args": ["dist/index.js", "--database", "${databaseId}"],
      "cwd": "/path/to/${serverInfo.name}"
    }
  }
}`
    : '';

  const curlExample = databaseId
    ? `curl -X POST ${fullEndpoint} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
    : '';

  const copyIntegrationSnippet = () => {
    navigator.clipboard.writeText(integrationSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const copyCurlExample = () => {
    navigator.clipboard.writeText(curlExample);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const copyEndpoint = () => {
    if (fullEndpoint) {
      navigator.clipboard.writeText(fullEndpoint);
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    }
  };

  const isLoading = infoLoading || toolsLoading;
  const error = infoError || toolsError;

  // Show prompt if no database selected
  if (!databaseId) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Plug className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">MCP Server</h1>
              <p className="text-gray-600">Tool definitions and integration information</p>
            </div>
          </div>
          <DatabaseSelector />
        </div>

        <div className="card text-center py-16">
          <AlertCircle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No Database Selected</h2>
          <p className="text-gray-500 mb-4">Select a database from the dropdown above to view MCP endpoint information.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Plug className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">MCP Server</h1>
              <p className="text-gray-600">Tool definitions and integration information</p>
            </div>
          </div>
          <DatabaseSelector />
        </div>

        <div className="card bg-red-50 border border-red-200">
          <div className="flex items-center gap-3 text-red-700">
            <AlertTriangle className="w-6 h-6" />
            <div>
              <h3 className="font-semibold">Error loading MCP data</h3>
              <p className="text-sm">{(error as Error).message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Plug className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">MCP Server</h1>
            <p className="text-gray-600">
              Tool definitions and integration information
              {selectedDatabase && (
                <span className="text-blue-600 ml-1">({selectedDatabase.name})</span>
              )}
            </p>
          </div>
        </div>
        <DatabaseSelector />
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Server Info Card */}
          <div className="card mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold">Server Info</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-mono font-medium">{serverInfo?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Version</p>
                <p className="font-mono font-medium">{serverInfo?.version}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Transports</p>
                <div className="flex gap-2 flex-wrap">
                  {serverInfo?.transports.stdio && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded font-mono">stdio</span>
                  )}
                  {serverInfo?.transports.http && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-mono">http</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Database</p>
                <p className="font-mono font-medium">{databaseId}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">{serverInfo?.description}</p>
          </div>

          {/* HTTP Connection Card */}
          <div className="card mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold">HTTP Connection</h2>
              <span className="ml-auto px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                Streamable HTTP
              </span>
            </div>

            {/* Endpoint URL */}
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-2">Endpoint URL (for database: {databaseId})</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-100 px-3 py-2 rounded-lg font-mono text-sm">
                  {fullEndpoint}
                </code>
                <button
                  onClick={copyEndpoint}
                  className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1"
                >
                  {copiedEndpoint ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedEndpoint ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Connection Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-blue-900 mb-2">How to Connect</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>1. Send a POST request to initialize a session (no session ID required)</li>
                <li>2. Use the returned <code className="bg-blue-100 px-1 rounded">mcp-session-id</code> header for subsequent requests</li>
                <li>3. For streaming responses, use GET with the session ID</li>
                <li>4. Send DELETE to close the session when done</li>
              </ul>
            </div>

            {/* Curl Example */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Test with curl</span>
                <button
                  onClick={copyCurlExample}
                  className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1 ml-auto"
                >
                  {copiedCurl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedCurl ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                {curlExample}
              </pre>
            </div>
          </div>

          {/* Claude Desktop Integration (for stdio transport) */}
          {serverInfo?.transports.stdio && (
            <div className="card mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Terminal className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold">Claude Desktop Integration</h2>
                <span className="ml-auto px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                  stdio
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                For local development with Claude Desktop, add this to your Claude Desktop config (configured for database: <code className="bg-gray-100 px-1 rounded">{databaseId}</code>):
              </p>
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={copyIntegrationSnippet}
                  className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1 ml-auto"
                >
                  {copiedSnippet ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedSnippet ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                {integrationSnippet}
              </pre>
            </div>
          )}

          {/* Tools List */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Available Tools ({toolsData?.tools.length || 0})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setExpandedTools(new Set(toolsData?.tools.map((t) => t.name) || []))}
                className="btn btn-secondary text-sm"
              >
                Expand All
              </button>
              <button
                onClick={() => setExpandedTools(new Set())}
                className="btn btn-secondary text-sm"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {toolsData?.tools.map((tool) => (
              <ToolCard
                key={tool.name}
                tool={tool}
                isExpanded={expandedTools.has(tool.name)}
                onToggle={() => toggleTool(tool.name)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
