export const PAGE_SIZE_OPTIONS = [50, 100, 500] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 100;

export interface PaginationState {
  pageSize: PageSize;
  offset: number;
  totalRows: number;
}

export interface PaginationInfo extends PaginationState {
  currentPage: number;
  totalPages: number;
  startRow: number;
  endRow: number;
  canGoFirst: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  canGoLast: boolean;
  firstOffset: number;
  previousOffset: number;
  nextOffset: number;
  lastOffset: number;
}

export interface PaginationDisplay {
  rowRange: string;
  pageSummary: string;
}

export function isPageSize(value: number): value is PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize);
}

export function clampPageSize(value: number): PageSize {
  return isPageSize(value) ? value : DEFAULT_PAGE_SIZE;
}

export function clampOffset(
  offset: number,
  pageSize: PageSize,
  totalRows: number,
): number {
  if (!Number.isFinite(offset) || offset < 0) {
    return 0;
  }

  if (totalRows <= 0) {
    return 0;
  }

  const lastOffset = getLastPageOffset(pageSize, totalRows);
  return Math.min(Math.trunc(offset), lastOffset);
}

export function getLastPageOffset(pageSize: PageSize, totalRows: number): number {
  if (totalRows <= 0) {
    return 0;
  }

  return Math.floor((totalRows - 1) / pageSize) * pageSize;
}

export function getPaginationInfo(state: PaginationState): PaginationInfo {
  const pageSize = clampPageSize(state.pageSize);
  const totalRows = Math.max(0, Math.trunc(state.totalRows));
  const offset = clampOffset(state.offset, pageSize, totalRows);
  const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);
  const currentPage = totalRows === 0 ? 0 : Math.floor(offset / pageSize) + 1;
  const firstOffset = 0;
  const previousOffset = clampOffset(offset - pageSize, pageSize, totalRows);
  const nextOffset = clampOffset(offset + pageSize, pageSize, totalRows);
  const lastOffset = getLastPageOffset(pageSize, totalRows);

  return {
    pageSize,
    offset,
    totalRows,
    currentPage,
    totalPages,
    startRow: totalRows === 0 ? 0 : offset + 1,
    endRow: Math.min(offset + pageSize, totalRows),
    canGoFirst: offset > 0,
    canGoPrevious: offset > 0,
    canGoNext: offset + pageSize < totalRows,
    canGoLast: offset < lastOffset,
    firstOffset,
    previousOffset,
    nextOffset,
    lastOffset,
  };
}

export function getPaginationDisplay(info: PaginationInfo): PaginationDisplay {
  return {
    rowRange: `Rows ${info.startRow}-${info.endRow} of ${info.totalRows}`,
    pageSummary: `Page ${info.currentPage} of ${info.totalPages}`,
  };
}
