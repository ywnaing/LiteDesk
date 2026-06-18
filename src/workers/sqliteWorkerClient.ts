import { createAppError, deserializeAppError } from '../appErrors';
import { buildTablePageQuery, FIRST_ROWS_LIMIT } from '../sqlite/queryHelpers';
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
  timeoutId: ReturnType<typeof globalThis.setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class SQLiteWorkerClient {
  private readonly worker: Worker;
  private readonly pendingRequests = new Map<number, PendingRequest<unknown>>();
  private nextRequestId = 1;
  private isTerminated = false;

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
    const request = this.createRequest('loadDatabase', {
      fileName,
      fileBuffer,
    });

    return this.sendRequest(request, [fileBuffer]);
  }

  async listTables(): Promise<TableMetadata[]> {
    return this.sendRequest(this.createRequest('listTables'));
  }

  async getTableRowCount(tableName: string): Promise<number> {
    return this.sendRequest(this.createRequest('getTableRowCount', { tableName }));
  }

  async getTablePage(
    tableName: string,
    limit = FIRST_ROWS_LIMIT,
    offset = 0,
  ): Promise<QueryResult> {
    return this.sendRequest(
      this.createRequest('getTablePage', {
        tableName,
        limit,
        offset,
      }),
    );
  }

  async executeReadOnlyQuery(sql: string): Promise<QueryResult> {
    return this.sendRequest(this.createRequest('executeReadOnlyQuery', { sql }));
  }

  async closeDatabase(): Promise<void> {
    await this.sendRequest(this.createRequest('closeDatabase'));
  }

  getTablePageQuery(tableName: string, limit = FIRST_ROWS_LIMIT, offset = 0): string {
    return buildTablePageQuery(tableName, limit, offset);
  }

  terminate(): void {
    if (this.isTerminated) {
      return;
    }

    this.isTerminated = true;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleWorkerError);
    this.worker.removeEventListener('messageerror', this.handleWorkerMessageError);
    this.rejectAllPending(
      createAppError('WORKER_TERMINATED', 'SQLite worker was terminated.'),
    );
    this.worker.terminate();
  }

  private createRequest<TType extends SQLiteWorkerRequestType>(
    type: TType,
    payload?: Extract<SQLiteWorkerRequest, { type: TType }> extends {
      payload: infer TPayload;
    }
      ? TPayload
      : never,
  ): Extract<SQLiteWorkerRequest, { type: TType }> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return (payload === undefined ? { id, type } : { id, type, payload }) as Extract<
      SQLiteWorkerRequest,
      { type: TType }
    >;
  }

  private sendRequest<TType extends SQLiteWorkerRequestType>(
    request: Extract<SQLiteWorkerRequest, { type: TType }>,
    transfer?: Transferable[],
  ): Promise<SQLiteWorkerApi[TType]> {
    if (this.isTerminated) {
      return Promise.reject(
        createAppError('WORKER_TERMINATED', 'SQLite worker was terminated.'),
      );
    }

    return new Promise((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(
          createAppError(
            'WORKER_TIMEOUT',
            `SQLite worker request timed out: ${request.type}`,
          ),
        );
      }, DEFAULT_REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(request.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });

      try {
        this.worker.postMessage(request, transfer ?? []);
      } catch (error) {
        this.clearPendingRequest(request.id);
        reject(
          createAppError(
            'WORKER_POST_ERROR',
            error instanceof Error
              ? error.message
              : 'Unable to send request to SQLite worker.',
          ),
        );
      }
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

    this.clearPendingRequest(event.data.id);

    if (event.data.ok) {
      pending.resolve(event.data.data);
      return;
    }

    pending.reject(deserializeAppError(event.data.error));
  };

  private readonly handleWorkerError = (event: ErrorEvent): void => {
    this.rejectAllPending(
      createAppError(
        'WORKER_MESSAGE_ERROR',
        event.error instanceof Error ? event.error.message : event.message,
      ),
    );
  };

  private readonly handleWorkerMessageError = (): void => {
    this.rejectAllPending(
      createAppError(
        'WORKER_MESSAGE_ERROR',
        'SQLite worker message could not be decoded.',
      ),
    );
  };

  private clearPendingRequest(id: number): void {
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      return;
    }

    globalThis.clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(id);
  }

  private rejectAllPending(error: unknown): void {
    for (const pending of this.pendingRequests.values()) {
      globalThis.clearTimeout(pending.timeoutId);
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
