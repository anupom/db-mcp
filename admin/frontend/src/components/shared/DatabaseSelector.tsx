import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Database, Check, Settings, Loader2, AlertCircle } from 'lucide-react';
import { useDatabaseContext } from '../../context/DatabaseContext';

export default function DatabaseSelector() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { databaseId, setDatabaseId, activeDatabases, isLoading, error } = useDatabaseContext();

  const selectedDatabase = activeDatabases.find((db) => db.id === databaseId);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    setDatabaseId(id);
    setIsOpen(false);
  };

  const handleManageDatabases = () => {
    setIsOpen(false);
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-sm text-red-600">Error loading databases</span>
      </div>
    );
  }

  if (activeDatabases.length === 0) {
    return (
      <button
        onClick={handleManageDatabases}
        className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors"
      >
        <AlertCircle className="w-4 h-4 text-yellow-600" />
        <span className="text-sm text-yellow-700">No active databases</span>
        <span className="text-xs text-yellow-600 underline">Set up</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors min-w-[160px]"
      >
        <Database className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-gray-700 truncate flex-1 text-left">
          {selectedDatabase?.name || 'Select database'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase px-2">Active Databases</p>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {activeDatabases.map((db) => (
              <button
                key={db.id}
                onClick={() => handleSelect(db.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors ${
                  db.id === databaseId ? 'bg-blue-50' : ''
                }`}
              >
                <Database className={`w-4 h-4 ${db.id === databaseId ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 text-left">
                  <p className={`text-sm font-medium ${db.id === databaseId ? 'text-blue-700' : 'text-gray-700'}`}>
                    {db.name}
                  </p>
                  {db.description && (
                    <p className="text-xs text-gray-500 truncate">{db.description}</p>
                  )}
                </div>
                {db.id === databaseId && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 p-2">
            <button
              onClick={handleManageDatabases}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Manage Databases</span>
              <span className="ml-auto text-gray-400">&rarr;</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
