import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  buildTablePreviewQuery,
  buildUserTablesQuery,
  isSelectQuery,
  mapSqlJsResult,
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
    throw new Error('Open a SQLite database before running a query.');
  }

  return database;
}

function closeCurrentDatabase(): void {
  database?.close();
  database = null;
}

function listTablesFromDatabase(openDatabase: Database): TableMetadata[] {
  const result = openDatabase.exec(buildUserTablesQuery());
  const rows = mapSqlJsResult(result).rows;

  return rows.map(([name]) => ({
    name: String(name),
    type: 'table',
  }));
}

function executeReadOnlyQuery(sql: string): QueryResult {
  if (!isSelectQuery(sql)) {
    throw new Error('Only SELECT queries are supported in this phase.');
  }

  return mapSqlJsResult(requireDatabase().exec(sql));
}

async function handleRequest(request: SQLiteWorkerRequest): Promise<unknown> {
  switch (request.type) {
    case 'loadDatabase': {
      const SQL = await getSqliteModule();
      closeCurrentDatabase();
      database = new SQL.Database(new Uint8Array(request.payload.fileBuffer));

      return {
        fileName: request.payload.fileName,
        tables: listTablesFromDatabase(database),
      };
    }

    case 'listTables':
      return listTablesFromDatabase(requireDatabase());

    case 'previewTable':
      return executeReadOnlyQuery(
        buildTablePreviewQuery(request.payload.tableName, request.payload.limit),
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
