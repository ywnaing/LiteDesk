export interface TableMetadata {
  name: string;
  type: 'table';
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

export interface DatabaseLoadResult {
  fileName: string;
  tables: TableMetadata[];
}

export interface DatabaseOpenResult<TDatabase> {
  browserDb: TDatabase;
  loadResult: DatabaseLoadResult;
}

export interface QueryExecutionResult {
  result: QueryResult | null;
  error: string | null;
}
