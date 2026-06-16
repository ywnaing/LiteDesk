import { describe, expect, it } from 'vitest';
import {
  buildTablePreviewQuery,
  buildUserTablesQuery,
  clampRowLimit,
  isSelectQuery,
  MAX_QUERY_RESULT_ROWS,
  mapSqlJsResult,
  quoteIdentifier,
} from './queryHelpers';

describe('queryHelpers', () => {
  it('quotes SQLite identifiers safely', () => {
    expect(quoteIdentifier('users')).toBe('"users"');
    expect(quoteIdentifier('odd"name')).toBe('"odd""name"');
  });

  it('builds a limited table preview query', () => {
    expect(buildTablePreviewQuery('customers')).toBe(
      'SELECT * FROM "customers" LIMIT 100',
    );
    expect(buildTablePreviewQuery('customers', 25)).toBe(
      'SELECT * FROM "customers" LIMIT 25',
    );
  });

  it('clamps row limits to a safe positive range', () => {
    expect(clampRowLimit(0)).toBe(1);
    expect(clampRowLimit(25.8)).toBe(25);
    expect(clampRowLimit(Number.POSITIVE_INFINITY)).toBe(100);
    expect(clampRowLimit(MAX_QUERY_RESULT_ROWS + 1)).toBe(MAX_QUERY_RESULT_ROWS);
    expect(buildTablePreviewQuery('customers', MAX_QUERY_RESULT_ROWS + 1)).toBe(
      `SELECT * FROM "customers" LIMIT ${MAX_QUERY_RESULT_ROWS}`,
    );
  });

  it('builds the user table metadata query', () => {
    const sql = buildUserTablesQuery();

    expect(sql).toContain('sqlite_schema');
    expect(sql).toContain("type = 'table'");
    expect(sql).toContain("name NOT LIKE 'sqlite_%'");
  });

  it('allows SELECT and CTE queries only', () => {
    expect(isSelectQuery('SELECT * FROM users')).toBe(true);
    expect(isSelectQuery('  with recent as (select 1) select * from recent')).toBe(true);
    expect(
      isSelectQuery(
        'WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM nums WHERE n < 3) SELECT * FROM nums',
      ),
    ).toBe(true);
    expect(isSelectQuery('-- inspect users\nSELECT * FROM users')).toBe(true);
    expect(isSelectQuery('/* inspect users */ SELECT * FROM users;')).toBe(true);
    expect(isSelectQuery('UPDATE users SET name = "Ada"')).toBe(false);
    expect(isSelectQuery('WITH stale AS (SELECT 1) DELETE FROM users')).toBe(false);
    expect(isSelectQuery('')).toBe(false);
  });

  it('rejects multiple SQL statements while allowing semicolons in strings', () => {
    expect(isSelectQuery("SELECT 'one;two' AS label;")).toBe(true);
    expect(isSelectQuery('SELECT 1; SELECT 2')).toBe(false);
    expect(isSelectQuery('SELECT 1; -- second statement follows\nSELECT 2')).toBe(false);
  });

  it('maps sql.js empty and populated results', () => {
    expect(mapSqlJsResult([])).toEqual({
      columns: [],
      rows: [],
      rowCount: 0,
    });

    expect(
      mapSqlJsResult([
        {
          columns: ['id', 'name'],
          values: [
            [1, 'Ada'],
            [2, 'Grace'],
          ],
        },
      ]),
    ).toEqual({
      columns: ['id', 'name'],
      rows: [
        [1, 'Ada'],
        [2, 'Grace'],
      ],
      rowCount: 2,
    });
  });
});
