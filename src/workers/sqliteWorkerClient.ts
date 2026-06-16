import { buildTablePreviewQuery, FIRST_ROWS_LIMIT } from '../sqlite/queryHelpers';
import type { DatabaseLoadResult, QueryResult, TableMetadata } from '../sqlite/types';
import {
  isSQLiteWorkerResponse,
  type SQLiteWorkerApi,
  type SQLiteWorkerRequest,
  type SQLiteWorkerRequestType,
} from './sqliteWorkerMessages';

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class SQLiteWorkerClient {
  private readonly worker: Worker;
  private readonly pendingRequests = new Map<number, PendingRequest<unknown>>();
  private nextRequestId = 1;

  constructor(worker = createSQLiteWorker()) {
    this.worker = worker;
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleWorkerError);
    this.worker.addEventListener('messageerror', this.handleWorkerMessageError);
  }

  async loadDatabase(
    fileName: string,
    fileBuffer: ArrayBuffer,
  ): Promise<DatabaseLoadResult> {
    return this.request('loadDatabase', {
      fileName,
      fileBuffer,
    });
  }

  async listTables(): Promise<TableMetadata[]> {
    return this.request('listTables');
  }

  async previewTable(tableName: string, limit = FIRST_ROWS_LIMIT): Promise<QueryResult> {
    return this.request('previewTable', {
      tableName,
      limit,
    });
  }

  async executeReadOnlyQuery(sql: string): Promise<QueryResult> {
    return this.request('executeReadOnlyQuery', { sql });
  }

  async closeDatabase(): Promise<void> {
    await this.request('closeDatabase');
  }

  getTablePreviewQuery(tableName: string, limit = FIRST_ROWS_LIMIT): string {
    return buildTablePreviewQuery(tableName, limit);
  }

  terminate(): void {
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleWorkerError);
    this.worker.removeEventListener('messageerror', this.handleWorkerMessageError);
    this.rejectAllPending(new Error('SQLite worker was terminated.'));
    this.worker.terminate();
  }

  private request<TType extends SQLiteWorkerRequestType>(
    type: TType,
    payload?: Extract<SQLiteWorkerRequest, { type: TType }> extends {
      payload: infer TPayload;
    }
      ? TPayload
      : never,
  ): Promise<SQLiteWorkerApi[TType]> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const request = payload === undefined ? { id, type } : { id, type, payload };

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`SQLite worker request timed out: ${type}`));
      }, DEFAULT_REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });

      if (type === 'loadDatabase') {
        const fileBuffer = (payload as { fileBuffer: ArrayBuffer }).fileBuffer;
        this.worker.postMessage(request, [fileBuffer]);
        return;
      }

      this.worker.postMessage(request);
    });
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isSQLiteWorkerResponse(event.data)) {
      return;
    }

    const pending = this.pendingRequests.get(event.data.id);

    if (!pending) {
      return;
    }

    this.pendingRequests.delete(event.data.id);
    window.clearTimeout(pending.timeoutId);

    if (event.data.ok) {
      pending.resolve(event.data.data);
      return;
    }

    pending.reject(new Error(event.data.error));
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    this.rejectAllPending(event.error ?? new Error(event.message));
  };

  private readonly handleWorkerMessageError = (): void => {
    this.rejectAllPending(new Error('SQLite worker message could not be decoded.'));
  };

  private rejectAllPending(error: unknown): void {
    for (const pending of this.pendingRequests.values()) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(error);
    }

    this.pendingRequests.clear();
  }
}

function createSQLiteWorker(): Worker {
  return new Worker(new URL('./sqliteWorker.ts', import.meta.url), {
    type: 'module',
  });
}
