import { describe, expect, it } from 'vitest';
import {
  AppError,
  createAppError,
  deserializeAppError,
  serializeAppError,
  toAppError,
} from './appErrors';

describe('appErrors', () => {
  it('creates typed app errors', () => {
    const error = createAppError('INVALID_SQL', 'Only SELECT queries are supported.');

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('INVALID_SQL');
    expect(error.message).toBe('Only SELECT queries are supported.');
  });

  it('maps unknown errors while preserving useful messages', () => {
    expect(
      toAppError(new Error('near "FROM": syntax error'), 'SQLITE_ERROR'),
    ).toMatchObject({
      code: 'SQLITE_ERROR',
      message: 'near "FROM": syntax error',
    });

    expect(toAppError('worker failed', 'UNKNOWN_ERROR')).toMatchObject({
      code: 'UNKNOWN_ERROR',
      message: 'worker failed',
    });
  });

  it('serializes and deserializes app errors across worker messages', () => {
    const serialized = serializeAppError(
      createAppError('WORKER_TIMEOUT', 'SQLite worker request timed out: loadDatabase'),
      'UNKNOWN_ERROR',
    );

    expect(serialized).toEqual({
      code: 'WORKER_TIMEOUT',
      message: 'SQLite worker request timed out: loadDatabase',
    });

    expect(deserializeAppError(serialized)).toMatchObject(serialized);
  });
});
