import initSqlJs, { type Database, type SqlJsStatic, type Statement } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { createAppError } from '../appErrors';
import {
  buildTablePageQuery,
  buildTableRowCountQuery,
  buildUserTablesQuery,
  isSelectQuery,
  MAX_QUERY_RESULT_ROWS,
} from '../sqlite/queryHelpers';
import type { QueryResult, TableMetadata } from '../sqlite/types';
import {
  createErrorResponse,
  createSuccessResponse,
  type SQLiteWorkerRequest,
} from './sqliteWorkerMessages';

let sqliteModulePromise: Promise<SqlJsStatic> | null = null;
let database: Database | null = null;

function getSqliteModule(): Promise<SqlJsStatic> {
  sqliteModulePromise ??= initSqlJs({
    locateFile: () => wasmUrl,
  });

  return sqliteModulePromise;
}

function requireDatabase(): Database {
  if (!database) {
    throw createAppError(
      'DATABASE_NOT_OPEN',
      'Open a SQLite database before running a query.',
    );
  }

  return database;
}

function closeCurrentDatabase(): void {
  database?.close();
  database = null;
}

function listTablesFromDatabase(openDatabase: Database): TableMetadata[] {
  const result = openDatabase.exec(buildUserTablesQuery());
  const rows = result[0]?.values ?? [];

  return rows.map(([name]) => ({
    name: String(name),
    type: 'table',
  }));
}

function executeReadOnlyQuery(sql: string): QueryResult {
  if (!isSelectQuery(sql)) {
    throw createAppError(
      'INVALID_SQL',
      'Only SELECT queries are supported in this phase.',
    );
  }

  return executeQueryWithRowLimit(requireDatabase(), sql, MAX_QUERY_RESULT_ROWS);
}

function getTableRowCount(tableName: string): number {
  const result = requireDatabase().exec(buildTableRowCountQuery(tableName));
  const value = result[0]?.values[0]?.[0];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function executeQueryWithRowLimit(
  openDatabase: Database,
  sql: string,
  maxRows: number,
): QueryResult {
  let statement: Statement | null = null;

  try {
    statement = openDatabase.prepare(sql);
    const columns = statement.getColumnNames();
    const rows: unknown[][] = [];
    let isTruncated = false;

    while (statement.step()) {
      if (rows.length >= maxRows) {
        isTruncated = true;
        break;
      }

      rows.push(statement.get());
    }

    return {
      columns,
      rows,
      rowCount: rows.length,
      isTruncated,
    };
  } finally {
    statement?.free();
  }
}

async function handleRequest(request: SQLiteWorkerRequest): Promise<unknown> {
  switch (request.type) {
    case 'loadDatabase': {
      const SQL = await getSqliteModule();
      const nextDatabase = new SQL.Database(new Uint8Array(request.payload.fileBuffer));
      let tables: TableMetadata[];

      try {
        tables = listTablesFromDatabase(nextDatabase);
      } catch (error) {
        nextDatabase.close();
        throw error;
      }

      closeCurrentDatabase();
      database = nextDatabase;

      return {
        fileName: request.payload.fileName,
        tables,
      };
    }

    case 'listTables':
      return listTablesFromDatabase(requireDatabase());

    case 'getTableRowCount':
      return getTableRowCount(request.payload.tableName);

    case 'getTablePage':
      return executeReadOnlyQuery(
        buildTablePageQuery(
          request.payload.tableName,
          request.payload.limit,
          request.payload.offset,
        ),
      );

    case 'executeReadOnlyQuery':
      return executeReadOnlyQuery(request.payload.sql);

    case 'closeDatabase':
      closeCurrentDatabase();
      return null;
  }
}

self.addEventListener('message', (event: MessageEvent<SQLiteWorkerRequest>) => {
  const request = event.data;

  void handleRequest(request)
    .then((data) => {
      self.postMessage(createSuccessResponse(request.id, data));
    })
    .catch((error: unknown) => {
      self.postMessage(createErrorResponse(request.id, error));
    });
});
