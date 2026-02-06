import { Table } from 'lucide-react';
import type { TableInfo } from '../../api/client';

interface TableListProps {
  tables: TableInfo[];
  selectedTable: string | null;
  onSelect: (tableName: string) => void;
}

export default function TableList({ tables, selectedTable, onSelect }: TableListProps) {
  if (tables.length === 0) {
    return <p className="text-gray-500 text-sm">No tables found</p>;
  }

  return (
    <ul className="space-y-1">
      {tables.map((table) => (
        <li key={table.table_name}>
          <button
            className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              selectedTable === table.table_name
                ? 'bg-blue-100 text-blue-700'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            onClick={() => onSelect(table.table_name)}
          >
            <Table className="w-4 h-4 flex-shrink-0" />
            <span className="font-mono text-sm truncate">{table.table_name}</span>
            <span className="text-xs text-gray-400 ml-auto">
              {table.columns.length}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
