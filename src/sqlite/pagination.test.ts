import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  clampOffset,
  clampPageSize,
  getLastPageOffset,
  getPaginationInfo,
} from './pagination';

describe('pagination', () => {
  it('accepts only supported page sizes', () => {
    expect(clampPageSize(50)).toBe(50);
    expect(clampPageSize(100)).toBe(100);
    expect(clampPageSize(500)).toBe(500);
    expect(clampPageSize(25)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('clamps offsets to page boundaries', () => {
    expect(clampOffset(-1, 100, 250)).toBe(0);
    expect(clampOffset(100, 100, 250)).toBe(100);
    expect(clampOffset(999, 100, 250)).toBe(200);
    expect(getLastPageOffset(100, 0)).toBe(0);
    expect(getLastPageOffset(100, 250)).toBe(200);
  });

  it('calculates current page range and controls', () => {
    expect(getPaginationInfo({ pageSize: 100, offset: 100, totalRows: 250 })).toEqual({
      pageSize: 100,
      offset: 100,
      totalRows: 250,
      currentPage: 2,
      totalPages: 3,
      startRow: 101,
      endRow: 200,
      canGoFirst: true,
      canGoPrevious: true,
      canGoNext: true,
      canGoLast: true,
      firstOffset: 0,
      previousOffset: 0,
      nextOffset: 200,
      lastOffset: 200,
    });
  });

  it('handles empty result sets', () => {
    expect(getPaginationInfo({ pageSize: 100, offset: 0, totalRows: 0 })).toMatchObject({
      currentPage: 0,
      totalPages: 0,
      startRow: 0,
      endRow: 0,
      canGoFirst: false,
      canGoPrevious: false,
      canGoNext: false,
      canGoLast: false,
    });
  });
});
