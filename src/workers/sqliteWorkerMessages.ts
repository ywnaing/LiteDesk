import { serializeAppError, type AppErrorShape } from '../appErrors';
import type { DatabaseLoadResult, QueryResult, TableMetadata } from '../sqlite/types';

export type SQLiteWorkerRequest =
  | {
      id: number;
      type: 'loadDatabase';
      payload: {
        fileName: string;
        fileBuffer: ArrayBuffer;
      };
    }
  | {
      id: number;
      type: 'listTables';
    }
  | {
      id: number;
      type: 'previewTable';
      payload: {
        tableName: string;
        limit: number;
      };
    }
  | {
      id: number;
      type: 'executeReadOnlyQuery';
      payload: {
        sql: string;
      };
    }
  | {
      id: number;
      type: 'closeDatabase';
    };

export type SQLiteWorkerResponse<T = unknown> =
  | {
      id: number;
      ok: true;
      data: T;
    }
  | {
      id: number;
      ok: false;
      error: AppErrorShape;
    };

export interface SQLiteWorkerApi {
  loadDatabase: DatabaseLoadResult;
  listTables: TableMetadata[];
  previewTable: QueryResult;
  executeReadOnlyQuery: QueryResult;
  closeDatabase: null;
}

export type SQLiteWorkerRequestType = keyof SQLiteWorkerApi;

export function createSuccessResponse<T>(id: number, data: T): SQLiteWorkerResponse<T> {
  return {
    id,
    ok: true,
    data,
  };
}

export function createErrorResponse(id: number, error: unknown): SQLiteWorkerResponse {
  return {
    id,
    ok: false,
    error: serializeAppError(error, 'SQLITE_ERROR'),
  };
}

export function isSQLiteWorkerResponse(
  message: unknown,
): message is SQLiteWorkerResponse {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as Partial<SQLiteWorkerResponse>;

  if (typeof candidate.id !== 'number' || typeof candidate.ok !== 'boolean') {
    return false;
  }

  if (candidate.ok) {
    return 'data' in candidate;
  }

  if (!('error' in candidate)) {
    return false;
  }

  const error = candidate.error;

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}
