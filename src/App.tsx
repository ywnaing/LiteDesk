import { useEffect, useState } from 'react';
import { DataTable } from './components/DataTable';
import { TableList } from './components/TableList';
import type { DatabaseLoadResult, QueryResult } from './sqlite';
import { SQLiteWorkerClient } from './workers/sqliteWorkerClient';

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [sqliteClient, setSqliteClient] = useState<SQLiteWorkerClient | null>(null);
  const [hasDatabase, setHasDatabase] = useState(false);
  const [loadResult, setLoadResult] = useState<DatabaseLoadResult | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [query, setQuery] = useState('SELECT name, type FROM sqlite_schema LIMIT 100');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new SQLiteWorkerClient();
    setSqliteClient(client);

    return () => {
      client.terminate();
    };
  }, []);

  const fileLabel = loadResult
    ? `${loadResult.fileName} (${loadResult.tables.length} table${
        loadResult.tables.length === 1 ? '' : 's'
      })`
    : 'No database opened';

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSelectedTable(null);

    try {
      if (!sqliteClient) {
        throw new Error('SQLite worker is not ready yet.');
      }

      const loaded = await sqliteClient.loadDatabase(file.name, await file.arrayBuffer());

      setHasDatabase(true);
      setLoadResult(loaded);
    } catch (loadError) {
      setHasDatabase(false);
      setLoadResult(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load the selected database.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTableSelect(tableName: string) {
    if (!hasDatabase || !sqliteClient) {
      return;
    }

    try {
      const previewQuery = sqliteClient.getTablePreviewQuery(tableName);
      const previewResult = await sqliteClient.previewTable(tableName);

      setSelectedTable(tableName);
      setQuery(previewQuery);
      setResult(previewResult);
      setError(null);
    } catch (queryError) {
      setResult(null);
      setError(
        queryError instanceof Error ? queryError.message : 'Unable to preview table.',
      );
    }
  }

  function handleRunQuery(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasDatabase || !sqliteClient) {
      setError('Open a SQLite database before running a query.');
      return;
    }

    sqliteClient
      .executeReadOnlyQuery(query)
      .then((queryResult) => {
        setSelectedTable(null);
        setResult(queryResult);
        setError(null);
      })
      .catch((queryError: unknown) => {
        setSelectedTable(null);
        setResult(null);
        setError(queryError instanceof Error ? queryError.message : 'Invalid SQL.');
      });
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>LiteDesk SQLite Browser</h1>
          <p>{fileLabel}</p>
        </div>
        <label className="file-picker">
          <span>Open database</span>
          <input
            accept=".sqlite,.db,.sqlite3,application/x-sqlite3,application/vnd.sqlite3"
            aria-label="Open SQLite database"
            onChange={handleFileChange}
            type="file"
          />
        </label>
      </header>

      {isLoading && <div className="notice">Loading database...</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="workspace">
        <aside className="sidebar">
          <div className="section-heading">
            <h2>Tables</h2>
          </div>
          <TableList
            onSelect={handleTableSelect}
            selectedTable={selectedTable}
            tables={loadResult?.tables ?? []}
          />
        </aside>

        <section className="query-panel" aria-label="SQL query runner">
          <form onSubmit={handleRunQuery}>
            <div className="section-heading">
              <h2>Query</h2>
              <button disabled={!hasDatabase || !sqliteClient} type="submit">
                Run SELECT
              </button>
            </div>
            <textarea
              disabled={!hasDatabase || !sqliteClient}
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
              value={query}
            />
          </form>

          <div className="result-header">
            <h2>Results</h2>
            {result && (
              <span>
                {result.rowCount}
                {result.isTruncated ? '+' : ''} row(s)
              </span>
            )}
          </div>
          <DataTable result={result} />
        </section>
      </section>
    </main>
  );
}
