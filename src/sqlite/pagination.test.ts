import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  clampOffset,
  clampPageSize,
  getLastPageOffset,
  getPaginationDisplay,
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

  it('calculates fewer-than-page, exact-page, and partial-last-page display text', () => {
    const fewerThanPage = getPaginationInfo({
      pageSize: 100,
      offset: 0,
      totalRows: 25,
    });
    expect(getPaginationDisplay(fewerThanPage)).toEqual({
      rowRange: 'Rows 1-25 of 25',
      pageSummary: 'Page 1 of 1',
    });
    expect(fewerThanPage.canGoNext).toBe(false);
    expect(fewerThanPage.canGoLast).toBe(false);

    const exactPage = getPaginationInfo({
      pageSize: 100,
      offset: 0,
      totalRows: 100,
    });
    expect(getPaginationDisplay(exactPage)).toEqual({
      rowRange: 'Rows 1-100 of 100',
      pageSummary: 'Page 1 of 1',
    });
    expect(exactPage.canGoNext).toBe(false);
    expect(exactPage.canGoLast).toBe(false);

    const partialLastPage = getPaginationInfo({
      pageSize: 100,
      offset: 200,
      totalRows: 250,
    });
    expect(getPaginationDisplay(partialLastPage)).toEqual({
      rowRange: 'Rows 201-250 of 250',
      pageSummary: 'Page 3 of 3',
    });
    expect(partialLastPage.canGoNext).toBe(false);
    expect(partialLastPage.canGoLast).toBe(false);
  });

  it('handles empty result sets', () => {
    const emptyInfo = getPaginationInfo({ pageSize: 100, offset: 0, totalRows: 0 });
    expect(emptyInfo).toMatchObject({
      currentPage: 0,
      totalPages: 0,
      startRow: 0,
      endRow: 0,
      canGoFirst: false,
      canGoPrevious: false,
      canGoNext: false,
      canGoLast: false,
    });
    expect(getPaginationDisplay(emptyInfo)).toEqual({
      rowRange: 'Rows 0-0 of 0',
      pageSummary: 'Page 0 of 0',
    });
  });
});
