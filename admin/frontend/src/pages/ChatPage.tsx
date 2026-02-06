import { useRef, useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { useChat, Chat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageCircle, Send, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import ChatMessage from '../components/chat/ChatMessage';

// Create a chat transport that connects to our backend
const chatTransport = new DefaultChatTransport({
  api: '/api/chat',
});

// Create a chat instance
const chatInstance = new Chat({
  transport: chatTransport,
});

export default function ChatPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
  } = useChat({
    chat: chatInstance,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleClearChat = () => {
    setMessages([]);
    setInputValue('');
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue;
    setInputValue('');
    await sendMessage({ text: message });
  };

  const handleSuggestionClick = (prompt: string) => {
    setInputValue(prompt);
  };

  const suggestedPrompts = [
    'What measures are available?',
    'Show me all dimensions for orders',
    'Query total orders by status',
    'Describe the orders count measure',
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">AI Chat</h1>
              <p className="text-gray-600">Ask questions about your data using natural language</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="btn btn-secondary flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Clear Chat
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <MessageCircle className="w-16 h-16 text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Start a conversation</h2>
            <p className="text-gray-500 mb-6 text-center max-w-md">
              Ask questions about your data, explore available measures and dimensions,
              or run queries using natural language.
            </p>

            {/* Suggested Prompts */}
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSuggestionClick(prompt)}
                  className="text-left px-4 py-3 bg-white border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-700"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <span className="text-sm text-gray-500">
                    {status === 'submitted' ? 'Connecting...' : 'Thinking...'}
                  </span>
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">Error</span>
                </div>
                <p className="text-sm text-red-600 mt-1">{error.message}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t bg-white">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Ask about your data..."
              className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
              <span className="sr-only">Send</span>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            The AI assistant can search the catalog, describe members, and query data.
          </p>
        </form>
      </div>
    </div>
  );
}
