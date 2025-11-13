# API Reference

## Tauri Commands

All commands are invoked from the frontend using `invoke()` from `@tauri-apps/api/core`.

### import_file

Imports a CSV or Excel file into the database.

**Command**: `import_file`

**Parameters**:
```typescript
{
  filePath: string,      // Absolute path to the file
  tableName?: string     // Optional table name (defaults to filename)
}
```

**Returns**:
```typescript
Promise<ImportResult>

interface ImportResult {
  success: boolean,
  message: string,
  table_name: string,
  rows_imported: number
}
```

**Errors**:
- File not found
- Unsupported file format
- Database error
- Parse error

**Events Emitted**:
- `import-progress`: Progress updates during import

**Example**:
```javascript
try {
  const result = await invoke('import_file', {
    filePath: '/path/to/data.csv',
    tableName: 'my_data'
  });
  console.log(`Imported ${result.rows_imported} rows`);
} catch (error) {
  console.error('Import failed:', error);
}
```

**Progress Events**:
```javascript
await listen('import-progress', (event) => {
  const { rows_imported, status } = event.payload;
  console.log(`${status}: ${rows_imported} rows`);
});
```

---

### preview_file

Generates a preview of a file's contents.

**Command**: `preview_file`

**Parameters**:
```typescript
{
  filePath: string,    // Absolute path to the file
  rows?: number        // Number of rows to preview (default: 10)
}
```

**Returns**:
```typescript
Promise<PreviewData>

interface PreviewData {
  columns: string[],
  rows: string[][],
  total_rows: number
}
```

**Errors**:
- File not found
- Unsupported file format
- Parse error

**Example**:
```javascript
const preview = await invoke('preview_file', {
  filePath: '/path/to/data.csv',
  rows: 10
});

console.log('Columns:', preview.columns);
console.log('Total rows:', preview.total_rows);
console.log('Preview rows:', preview.rows);
```

---

### query_data

Queries data from an imported table with pagination.

**Command**: `query_data`

**Parameters**:
```typescript
{
  tableName: string,   // Name of the table to query
  limit?: number,      // Max rows to return (default: 1000)
  offset?: number      // Starting row index (default: 0)
}
```

**Returns**:
```typescript
Promise<QueryResult>

interface QueryResult {
  columns: string[],
  rows: JsonValue[][],
  total_rows: number
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
```

**Errors**:
- Table not found
- Database error
- Invalid parameters

**Example**:
```javascript
// Load first 1000 rows
const data = await invoke('query_data', {
  tableName: 'my_data',
  limit: 1000,
  offset: 0
});

// Load next 1000 rows
const nextPage = await invoke('query_data', {
  tableName: 'my_data',
  limit: 1000,
  offset: 1000
});
```

---

### get_table_info

Gets metadata about a table.

**Command**: `get_table_info`

**Parameters**:
```typescript
{
  tableName: string    // Name of the table
}
```

**Returns**:
```typescript
Promise<TableInfo>

interface TableInfo {
  columns: ColumnInfo[],
  row_count: number
}

interface ColumnInfo {
  name: string,
  data_type: string
}
```

**Errors**:
- Table not found
- Database error

**Example**:
```javascript
const info = await invoke('get_table_info', {
  tableName: 'my_data'
});

console.log('Columns:', info.columns);
console.log('Total rows:', info.row_count);

info.columns.forEach(col => {
  console.log(`${col.name}: ${col.data_type}`);
});
```

---

### reorder_rows

Sorts a table by one or more columns.

**Command**: `reorder_rows`

**Parameters**:
```typescript
{
  tableName: string,
  sortColumns: SortColumn[]
}

interface SortColumn {
  column: string,
  ascending: boolean
}
```

**Returns**:
```typescript
Promise<ReorderResult>

interface ReorderResult {
  success: boolean,
  message: string
}
```

**Errors**:
- Table not found
- Column not found
- Database error

**Example**:
```javascript
// Sort by age ascending
await invoke('reorder_rows', {
  tableName: 'my_data',
  sortColumns: [
    { column: 'age', ascending: true }
  ]
});

// Multi-column sort: age ascending, then name descending
await invoke('reorder_rows', {
  tableName: 'my_data',
  sortColumns: [
    { column: 'age', ascending: true },
    { column: 'name', ascending: false }
  ]
});
```

---

## Events

### import-progress

Emitted during file import to provide progress updates.

**Event Name**: `import-progress`

**Payload**:
```typescript
interface ImportProgress {
  rows_imported: number,
  total_rows?: number,
  status: string
}
```

**Listener Setup**:
```javascript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('import-progress', (event) => {
  const progress = event.payload;
  updateProgressUI(progress.status, progress.rows_imported);
});

// Later, to remove listener
unlisten();
```

**Status Messages**:
- `"Starting import..."`
- `"Reading CSV file..."`
- `"Analyzing data..."`
- `"Importing... N rows"`
- `"Finalizing import..."`
- `"Import complete!"`

---

## Data Types

### DuckDB to JSON Type Mapping

The backend automatically converts DuckDB types to JSON:

| DuckDB Type  | JSON Type | Notes                          |
|--------------|-----------|--------------------------------|
| NULL         | null      |                                |
| BOOLEAN      | boolean   |                                |
| TINYINT      | number    | 8-bit integer                  |
| SMALLINT     | number    | 16-bit integer                 |
| INTEGER      | number    | 32-bit integer                 |
| BIGINT       | number    | 64-bit integer                 |
| FLOAT        | number    | 32-bit float, null if invalid  |
| DOUBLE       | number    | 64-bit float, null if invalid  |
| VARCHAR/TEXT | string    | UTF-8 encoded                  |
| Other types  | string    | Formatted as debug string      |

### Type Detection

**CSV Files**: DuckDB automatically infers types using `read_csv_auto`:
- Samples all rows (`sample_size=-1`)
- Detects numeric types (integers, floats)
- Detects dates and timestamps
- Falls back to VARCHAR for mixed types

**Excel Files**: Initially imported as VARCHAR:
- DuckDB optimizes storage internally
- Can be cast explicitly if needed

---

## Error Handling

All commands return `Promise<T>` and may reject with error strings.

**Error Types**:

1. **File Errors**:
   - "IO error: File not found"
   - "Unsupported file format"

2. **Parse Errors**:
   - "CSV error: Invalid delimiter"
   - "Excel error: Corrupted file"

3. **Database Errors**:
   - "DuckDB error: Table already exists"
   - "Query error: Invalid SQL"

4. **Validation Errors**:
   - "No sort columns specified"
   - "Failed to get table info"

**Frontend Error Handling**:
```javascript
try {
  const result = await invoke('import_file', {
    filePath: path
  });
  // Success
} catch (error) {
  // error is a string
  if (error.includes('not found')) {
    console.error('File not found');
  } else if (error.includes('Unsupported')) {
    console.error('Unsupported file format');
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## File Dialog API

The application uses Tauri's dialog plugin for file selection.

**Import**:
```javascript
import { open } from '@tauri-apps/plugin-dialog';
```

**Usage**:
```javascript
const selected = await open({
  multiple: false,
  filters: [
    {
      name: 'Data Files',
      extensions: ['csv', 'xlsx', 'xls', 'xlsm']
    }
  ]
});

if (selected) {
  const filePath = typeof selected === 'string' ? selected : selected.path;
  // Use filePath
}
```

---

## Performance Considerations

### Pagination
- Default limit: 1000 rows
- Recommended for large datasets: 500-2000 rows
- Use offset for pagination

### Import Performance
- **CSV**: Very fast with parallel processing
  - 100K rows: ~1-2 seconds
  - 1M rows: ~10-15 seconds
- **Excel**: Moderate speed with transaction batching
  - 100K rows: ~10-20 seconds
  - 1M rows: ~2-3 minutes

### Query Performance
- Indexed automatically by DuckDB
- Fast even for millions of rows
- Sorting may take longer on large datasets

### Memory Usage
- Configured limit: 4GB
- DuckDB manages memory efficiently
- Consider pagination for very large results

---

## Supported File Formats

### CSV (.csv)
- **Delimiter**: Auto-detected (comma, semicolon, tab, pipe)
- **Encoding**: UTF-8
- **Headers**: Required (first row)
- **Quoting**: Standard CSV quoting rules
- **Max Size**: Limited by available memory

### Excel (.xlsx, .xlsm, .xlsb, .xls)
- **Sheets**: First sheet only
- **Headers**: First row
- **Max Rows**: 1,048,576 (Excel limit)
- **Max Columns**: 16,384 (Excel limit)
- **Formulas**: Values only (not formulas)
- **Formatting**: Ignored

---

## Security

### SQL Injection
- Table names are sanitized
- No user-provided SQL queries
- Parameterized queries where applicable

### File Access
- Sandboxed filesystem access
- User must explicitly select files
- No arbitrary file access

### Data Privacy
- In-memory database only
- No data persisted to disk
- Data cleared on app close

---

## Future API Enhancements

Planned additions:

1. **export_data**: Export table to file
2. **execute_query**: Custom SQL queries
3. **create_view**: Create virtual views
4. **aggregate_data**: Built-in aggregations
5. **filter_data**: Filter rows by criteria
6. **join_tables**: Join multiple tables
7. **save_database**: Persist database to disk
8. **load_database**: Load persisted database
