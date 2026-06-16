export type AppErrorCode =
  | 'DATABASE_NOT_OPEN'
  | 'INVALID_SQL'
  | 'SQLITE_ERROR'
  | 'WORKER_TIMEOUT'
  | 'WORKER_TERMINATED'
  | 'WORKER_MESSAGE_ERROR'
  | 'WORKER_POST_ERROR'
  | 'UNKNOWN_ERROR';

export interface AppErrorShape {
  code: AppErrorCode;
  message: string;
}

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function createAppError(code: AppErrorCode, message: string): AppError {
  return new AppError(code, message);
}

export function toAppError(error: unknown, fallbackCode: AppErrorCode): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return createAppError(fallbackCode, error.message);
  }

  if (typeof error === 'string') {
    return createAppError(fallbackCode, error);
  }

  return createAppError(fallbackCode, 'An unexpected error occurred.');
}

export function serializeAppError(
  error: unknown,
  fallbackCode: AppErrorCode,
): AppErrorShape {
  const appError = toAppError(error, fallbackCode);

  return {
    code: appError.code,
    message: appError.message,
  };
}

export function deserializeAppError(error: AppErrorShape): AppError {
  return createAppError(error.code, error.message);
}
