import type { QueryResult } from '../sqlite';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (value instanceof Uint8Array) {
    return `<BLOB ${value.byteLength} bytes>`;
  }

  return String(value);
}

export function DataTable({ result }: { result: QueryResult | null }) {
  if (!result) {
    return <p className="empty-state">No result to display.</p>;
  }

  if (result.columns.length === 0) {
    return <p className="empty-state">Query returned no columns.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {result.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {result.columns.map((column, columnIndex) => (
                <td key={`${rowIndex}-${column}`}>{formatCell(row[columnIndex])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
