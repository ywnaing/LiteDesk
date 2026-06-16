# LiteDesk SQLite Browser

Browser-based SQLite database viewer built with React, TypeScript, Vite, and sql.js.

## Features

- Open a local `.sqlite` or `.db` file with a file input.
- Load the database in a Web Worker through sql.js WebAssembly.
- List user tables from `sqlite_schema`.
- Preview the first 100 rows from a selected table.
- Run custom `SELECT` queries.
- Display query result columns, rows, and SQL errors.

This phase intentionally does not include row editing, save/export, Monaco editor, OPFS storage, or a complex data grid.

## Setup

```bash
npm install
npm run dev
```

Open the printed Vite URL, choose a local SQLite database file, then select a table or run a custom `SELECT`.

## Scripts

```bash
npm run dev          # start Vite
npm run build        # type-check and build
npm run test         # run Vitest in watch mode
npm run test:run     # run tests once
npm run lint         # run ESLint
npm run format       # format files with Prettier
npm run format:check # check formatting
```

## Project Structure

```text
src/
  components/ UI-only table/list components
  sqlite/     Shared SQLite types and pure query helpers
  workers/    SQLite worker, typed worker messages, and worker client
  App.tsx     React state and UI composition
```

The sql.js database instance is owned by `src/workers/sqliteWorker.ts`. React talks to it through `SQLiteWorkerClient`, which uses request/response IDs so later query cancellation, export, editing, and OPFS persistence can be added without changing component-level SQLite execution.
