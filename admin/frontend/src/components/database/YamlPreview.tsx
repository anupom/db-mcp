import { useState } from 'react';
import { X, Save, Copy, Check, Loader2 } from 'lucide-react';
import Editor from '@monaco-editor/react';

interface YamlPreviewProps {
  yaml: string;
  tableName: string;
  onClose: () => void;
  onSave: (fileName: string) => void;
  isSaving: boolean;
}

export default function YamlPreview({
  yaml,
  tableName,
  onClose,
  onSave,
  isSaving,
}: YamlPreviewProps) {
  const [content, setContent] = useState(yaml);
  const [fileName, setFileName] = useState(tableName.toLowerCase());
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Generated Cube YAML</h2>
          <button
            className="p-1 hover:bg-gray-100 rounded"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            defaultLanguage="yaml"
            value={content}
            onChange={(value) => setContent(value || '')}
            options={{
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

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">File name:</label>
            <input
              type="text"
              className="input w-48"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
            <span className="text-sm text-gray-500">.yml</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn btn-secondary flex items-center gap-2"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={() => onSave(fileName)}
              disabled={isSaving || !fileName}
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              Save File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
