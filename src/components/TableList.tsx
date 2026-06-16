import type { TableMetadata } from '../sqlite';

interface TableListProps {
  tables: TableMetadata[];
  selectedTable: string | null;
  onSelect: (tableName: string) => void;
}

export function TableList({ tables, selectedTable, onSelect }: TableListProps) {
  if (tables.length === 0) {
    return <p className="empty-state">No user tables found.</p>;
  }

  return (
    <nav className="table-list" aria-label="Database tables">
      {tables.map((table) => (
        <button
          className={table.name === selectedTable ? 'selected' : ''}
          key={table.name}
          onClick={() => onSelect(table.name)}
          type="button"
        >
          {table.name}
        </button>
      ))}
    </nav>
  );
}
