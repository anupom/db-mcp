import { Loader2, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import Editor from '@monaco-editor/react';

interface SqlPreviewProps {
  sql: string | null;
  isLoading: boolean;
}

export default function SqlPreview({ sql, isLoading }: SqlPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!sql) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Click "SQL" to see the generated query
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-end p-2 border-b">
        <button
          className="btn btn-secondary flex items-center gap-2 text-sm py-1"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="sql"
          value={sql}
          options={{
            readOnly: true,
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
    </div>
  );
}
