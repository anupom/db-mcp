interface ResultsTableProps {
  data: unknown[];
}

export default function ResultsTable({ data }: ResultsTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No results
      </div>
    );
  }

  const columns = Object.keys(data[0] as Record<string, unknown>);

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-gray-600 border-b">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="text-left py-2 px-3 font-medium text-gray-600 border-b whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b hover:bg-gray-50">
              <td className="py-2 px-3 text-gray-400">{i + 1}</td>
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
      <div className="sticky bottom-0 bg-gray-100 border-t px-3 py-2 text-sm text-gray-600">
        {data.length} row{data.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">null</span>;
  }

  if (typeof value === 'number') {
    // Format numbers nicely
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

  if (value instanceof Date || (typeof value === 'string' && isDateString(value))) {
    try {
      const date = new Date(value as string);
      return date.toLocaleString();
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function isDateString(value: string): boolean {
  // Check if it looks like an ISO date
  return /^\d{4}-\d{2}-\d{2}(T|\s)/.test(value);
}
