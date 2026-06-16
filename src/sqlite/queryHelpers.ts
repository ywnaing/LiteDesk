import type { QueryExecResult } from 'sql.js';
import type { QueryResult } from './types';

export const FIRST_ROWS_LIMIT = 100;
export const MAX_QUERY_RESULT_ROWS = 1_000;

export function clampRowLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return FIRST_ROWS_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_QUERY_RESULT_ROWS);
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function buildTablePreviewQuery(
  tableName: string,
  limit = FIRST_ROWS_LIMIT,
): string {
  return `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT ${clampRowLimit(limit)}`;
}

export function buildUserTablesQuery(): string {
  return `
    SELECT name, type
    FROM sqlite_schema
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name COLLATE NOCASE
  `;
}

function stripLeadingComments(sql: string): string {
  let remaining = sql.trimStart();

  while (remaining.startsWith('--') || remaining.startsWith('/*')) {
    if (remaining.startsWith('--')) {
      const nextLineIndex = remaining.indexOf('\n');
      remaining =
        nextLineIndex === -1 ? '' : remaining.slice(nextLineIndex + 1).trimStart();
      continue;
    }

    const blockEndIndex = remaining.indexOf('*/');
    remaining =
      blockEndIndex === -1 ? '' : remaining.slice(blockEndIndex + 2).trimStart();
  }

  return remaining;
}

function hasAdditionalStatement(sql: string): boolean {
  let quote: "'" | '"' | '`' | '[' | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    if (quote) {
      if (quote === '[' && char === ']') {
        quote = null;
        continue;
      }

      if (char === quote) {
        if (nextChar === quote) {
          index += 1;
          continue;
        }

        quote = null;
      }

      continue;
    }

    if (char === '-' && nextChar === '-') {
      const nextLineIndex = sql.indexOf('\n', index + 2);
      index = nextLineIndex === -1 ? sql.length : nextLineIndex;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      const blockEndIndex = sql.indexOf('*/', index + 2);
      index = blockEndIndex === -1 ? sql.length : blockEndIndex + 1;
      continue;
    }

    if (char === "'" || char === '"' || char === '`' || char === '[') {
      quote = char;
      continue;
    }

    if (char === ';') {
      const afterSemicolon = stripLeadingComments(sql.slice(index + 1)).trim();
      return afterSemicolon.length > 0;
    }
  }

  return false;
}

function readKeyword(sql: string, startIndex = 0): string {
  const match = /^[a-z]+/i.exec(sql.slice(startIndex).trimStart());
  return match?.[0].toLowerCase() ?? '';
}

function readMainKeywordAfterWith(sql: string): string {
  let quote: "'" | '"' | '`' | '[' | null = null;
  let depth = 0;
  let hasSeenAsForCurrentCte = false;
  let isInsideCteBody = false;
  let cteExpressionClosed = false;

  for (let index = 'with'.length; index < sql.length; index += 1) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    if (quote) {
      if (quote === '[' && char === ']') {
        quote = null;
        continue;
      }

      if (char === quote) {
        if (nextChar === quote) {
          index += 1;
          continue;
        }

        quote = null;
      }

      continue;
    }

    if (char === '-' && nextChar === '-') {
      const nextLineIndex = sql.indexOf('\n', index + 2);
      index = nextLineIndex === -1 ? sql.length : nextLineIndex;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      const blockEndIndex = sql.indexOf('*/', index + 2);
      index = blockEndIndex === -1 ? sql.length : blockEndIndex + 1;
      continue;
    }

    if (char === "'" || char === '"' || char === '`' || char === '[') {
      quote = char;
      continue;
    }

    if (/[a-z]/i.test(char) && depth === 0) {
      const keyword = readKeyword(sql, index);

      if (cteExpressionClosed) {
        return keyword;
      }

      if (keyword === 'as') {
        hasSeenAsForCurrentCte = true;
      }

      index += keyword.length - 1;
      continue;
    }

    if (char === '(') {
      if (depth === 0 && hasSeenAsForCurrentCte) {
        isInsideCteBody = true;
      }

      depth += 1;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      cteExpressionClosed = depth === 0 && isInsideCteBody;
      isInsideCteBody = depth === 0 ? false : isInsideCteBody;
      continue;
    }

    if (!cteExpressionClosed || depth !== 0 || /\s/.test(char)) {
      continue;
    }

    if (char === ',') {
      hasSeenAsForCurrentCte = false;
      cteExpressionClosed = false;
      continue;
    }

    return readKeyword(sql, index);
  }

  return '';
}

export function isSelectQuery(sql: string): boolean {
  if (hasAdditionalStatement(sql)) {
    return false;
  }

  const normalized = stripLeadingComments(sql).trim();
  const firstKeyword = readKeyword(normalized);

  if (firstKeyword === 'select') {
    return true;
  }

  if (firstKeyword !== 'with') {
    return false;
  }

  return readMainKeywordAfterWith(normalized) === 'select';
}

export function mapSqlJsResult(execResult: QueryExecResult[]): QueryResult {
  const firstResult = execResult[0];

  if (!firstResult) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
    };
  }

  return {
    columns: firstResult.columns,
    rows: firstResult.values,
    rowCount: firstResult.values.length,
  };
}
