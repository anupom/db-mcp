import { Bot, User, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { UIMessage } from 'ai';
import ToolResultDisplay from './ToolResultDisplay';

interface ChatMessageProps {
  message: UIMessage;
}

// Define a simplified tool invocation type for our display purposes
interface ToolInvocationPart {
  type: 'tool-invocation';
  toolInvocationId: string;
  toolName: string;
  args: unknown;
  state: 'call' | 'partial-call' | 'result';
  result?: unknown;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // Extract text content from parts
  const textContent = message.parts
    ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('') || '';

  // Extract tool invocations from parts
  const toolInvocations = (message.parts?.filter(
    (part) => part.type === 'tool-invocation'
  ) || []) as unknown as ToolInvocationPart[];

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
          <Bot className="w-5 h-5 text-blue-600" />
        </div>
      )}

      <div className={`flex-1 max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Message content */}
        {textContent && (
          <div className={`rounded-lg px-4 py-2 ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-800'
          }`}>
            <div className="whitespace-pre-wrap text-sm">{textContent}</div>
          </div>
        )}

        {/* Tool invocations */}
        {toolInvocations.length > 0 && (
          <div className="mt-2 space-y-2">
            {toolInvocations.map((invocation) => (
              <ToolInvocationCard key={invocation.toolInvocationId} invocation={invocation} />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-600" />
        </div>
      )}
    </div>
  );
}

function ToolInvocationCard({ invocation }: { invocation: ToolInvocationPart }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toolDisplayNames: Record<string, string> = {
    search_catalog: 'Search Catalog',
    describe_member: 'Describe Member',
    query_data: 'Query Data',
    validate_query: 'Validate Query',
  };

  const displayName = toolDisplayNames[invocation.toolName] || invocation.toolName;

  // Check if tool is still running
  const isRunning = invocation.state === 'call' || invocation.state === 'partial-call';
  const hasResult = invocation.state === 'result';

  return (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Wrench className="w-4 h-4 text-gray-500" />
        <span className="font-medium text-sm text-gray-700">{displayName}</span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1 text-xs text-blue-600">
            <span className="animate-pulse">Running...</span>
          </span>
        )}
        {!isRunning && (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
          )
        )}
      </button>

      {isExpanded ? (
        <div className="p-3 border-t">
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">Arguments:</div>
            <pre className="text-xs bg-gray-50 rounded p-2 overflow-auto max-h-32 font-mono">
              {String(JSON.stringify(invocation.args, null, 2))}
            </pre>
          </div>

          {hasResult && invocation.result ? (
            <div>
              <div className="text-xs text-gray-500 mb-1">Result:</div>
              <ToolResultDisplay
                toolName={invocation.toolName}
                result={invocation.result}
              />
            </div>
          ) : null}

          {isRunning ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Executing tool...</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
