import { describe, expect, it } from 'vitest';
import {
  createErrorResponse,
  createSuccessResponse,
  isSQLiteWorkerResponse,
} from './sqliteWorkerMessages';

describe('sqliteWorkerMessages', () => {
  it('creates typed success responses', () => {
    expect(createSuccessResponse(7, { value: 42 })).toEqual({
      id: 7,
      ok: true,
      data: { value: 42 },
    });
  });

  it('creates typed error responses from errors and unknown values', () => {
    expect(createErrorResponse(3, new Error('bad query'))).toEqual({
      id: 3,
      ok: false,
      error: 'bad query',
    });

    expect(createErrorResponse(4, 'failed')).toEqual({
      id: 4,
      ok: false,
      error: 'failed',
    });
  });

  it('checks whether unknown messages look like worker responses', () => {
    expect(isSQLiteWorkerResponse({ id: 1, ok: true, data: null })).toBe(true);
    expect(isSQLiteWorkerResponse({ id: 1, ok: false, error: 'failed' })).toBe(true);
    expect(isSQLiteWorkerResponse({ id: '1', ok: true })).toBe(false);
    expect(isSQLiteWorkerResponse(null)).toBe(false);
  });
});
