import { useEffect, useRef, useState } from 'react';
import { DataTable } from './components/DataTable';
import { TableList } from './components/TableList';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  clampOffset,
  clampPageSize,
  getPaginationDisplay,
  getPaginationInfo,
  type DatabaseLoadResult,
  type PageSize,
  type QueryResult,
} from './sqlite';
import { SQLiteWorkerClient } from './workers/sqliteWorkerClient';

interface TableBrowseState {
  tableName: string;
  totalRows: number;
  pageSize: PageSize;
  offset: number;
}

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [sqliteClient, setSqliteClient] = useState<SQLiteWorkerClient | null>(null);
  const [hasDatabase, setHasDatabase] = useState(false);
  const [loadResult, setLoadResult] = useState<DatabaseLoadResult | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableBrowse, setTableBrowse] = useState<TableBrowseState | null>(null);
  const [query, setQuery] = useState('SELECT name, type FROM sqlite_schema LIMIT 100');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tableLoadRequestId = useRef(0);

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
    setTableBrowse(null);
    tableLoadRequestId.current += 1;

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
    await loadTablePage(tableName, DEFAULT_PAGE_SIZE, 0);
  }

  async function loadTablePage(tableName: string, pageSize: PageSize, offset: number) {
    if (!hasDatabase || !sqliteClient) {
      return;
    }

    setIsTableLoading(true);
    setError(null);
    setSelectedTable(tableName);
    const requestId = tableLoadRequestId.current + 1;
    tableLoadRequestId.current = requestId;

    try {
      const safePageSize = clampPageSize(pageSize);
      const totalRows = await sqliteClient.getTableRowCount(tableName);
      const safeOffset = clampOffset(offset, safePageSize, totalRows);
      const pageResult = await sqliteClient.getTablePage(
        tableName,
        safePageSize,
        safeOffset,
      );

      if (requestId !== tableLoadRequestId.current) {
        return;
      }

      setTableBrowse({
        tableName,
        totalRows,
        pageSize: safePageSize,
        offset: safeOffset,
      });
      setResult(pageResult);
      setError(null);
    } catch (queryError) {
      if (requestId !== tableLoadRequestId.current) {
        return;
      }

      setResult(null);
      setTableBrowse(null);
      setSelectedTable(null);
      setError(
        queryError instanceof Error ? queryError.message : 'Unable to load table page.',
      );
    } finally {
      if (requestId === tableLoadRequestId.current) {
        setIsTableLoading(false);
      }
    }
  }

  function handleRunQuery(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasDatabase || !sqliteClient) {
      setError('Open a SQLite database before running a query.');
      return;
    }

    tableLoadRequestId.current += 1;

    sqliteClient
      .executeReadOnlyQuery(query)
      .then((queryResult) => {
        setSelectedTable(null);
        setTableBrowse(null);
        setResult(queryResult);
        setError(null);
      })
      .catch((queryError: unknown) => {
        setSelectedTable(null);
        setTableBrowse(null);
        setResult(null);
        setError(queryError instanceof Error ? queryError.message : 'Invalid SQL.');
      });
  }

  function handlePageSizeChange(event: React.ChangeEvent<HTMLSelectElement>) {
    if (!tableBrowse) {
      return;
    }

    void loadTablePage(tableBrowse.tableName, Number(event.target.value) as PageSize, 0);
  }

  const paginationInfo = tableBrowse ? getPaginationInfo(tableBrowse) : null;
  const paginationDisplay = paginationInfo ? getPaginationDisplay(paginationInfo) : null;

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
            {paginationInfo ? (
              <span>{paginationDisplay?.rowRange}</span>
            ) : result ? (
              <span>
                {result.rowCount}
                {result.isTruncated ? '+' : ''} row(s)
              </span>
            ) : null}
          </div>
          {paginationInfo && tableBrowse && (
            <div className="pagination-bar" aria-label="Table pagination">
              <div className="pagination-info">{paginationDisplay?.pageSummary}</div>
              <label>
                Rows
                <select
                  disabled={isTableLoading}
                  onChange={handlePageSizeChange}
                  value={tableBrowse.pageSize}
                >
                  {PAGE_SIZE_OPTIONS.map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pagination-actions">
                <button
                  disabled={isTableLoading || !paginationInfo.canGoFirst}
                  onClick={() =>
                    void loadTablePage(
                      tableBrowse.tableName,
                      tableBrowse.pageSize,
                      paginationInfo.firstOffset,
                    )
                  }
                  type="button"
                >
                  First
                </button>
                <button
                  disabled={isTableLoading || !paginationInfo.canGoPrevious}
                  onClick={() =>
                    void loadTablePage(
                      tableBrowse.tableName,
                      tableBrowse.pageSize,
                      paginationInfo.previousOffset,
                    )
                  }
                  type="button"
                >
                  Previous
                </button>
                <button
                  disabled={isTableLoading || !paginationInfo.canGoNext}
                  onClick={() =>
                    void loadTablePage(
                      tableBrowse.tableName,
                      tableBrowse.pageSize,
                      paginationInfo.nextOffset,
                    )
                  }
                  type="button"
                >
                  Next
                </button>
                <button
                  disabled={isTableLoading || !paginationInfo.canGoLast}
                  onClick={() =>
                    void loadTablePage(
                      tableBrowse.tableName,
                      tableBrowse.pageSize,
                      paginationInfo.lastOffset,
                    )
                  }
                  type="button"
                >
                  Last
                </button>
              </div>
            </div>
          )}
          <DataTable result={result} />
        </section>
      </section>
    </main>
  );
}
