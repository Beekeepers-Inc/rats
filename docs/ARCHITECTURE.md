# Architecture Documentation

## System Overview

RATS follows a client-server architecture pattern where:
- **Frontend (Client)**: JavaScript/HTML/CSS running in a WebView
- **Backend (Server)**: Rust application with Tauri framework
- **Database**: DuckDB in-memory database for data processing

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   main.js   │  │  style.css   │  │   index.html     │  │
│  │             │  │              │  │                  │  │
│  │ - UI Logic  │  │ - Grid       │  │  - DOM Structure │  │
│  │ - Events    │  │ - Modals     │  │  - Layout       │  │
│  │ - Tauri API │  │ - Loading    │  │                  │  │
│  └──────┬──────┘  └──────────────┘  └──────────────────┘  │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │ Tauri IPC Bridge
┌─────────┼────────────────────────────────────────────────────┐
│         │                  Backend (Rust)                     │
│  ┌──────▼──────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   main.rs   │  │     lib.rs      │  │   AppState      │ │
│  │             │  │                 │  │                 │ │
│  │ - Setup     │  │ - Module Exports│  │ - DB Connection │ │
│  │ - Plugins   │  │ - State Mgmt    │  │ - Mutex Lock    │ │
│  │ - Commands  │  │                 │  │                 │ │
│  └─────────────┘  └─────────────────┘  └────────┬────────┘ │
│                                                   │          │
│  ┌────────────────────┐  ┌───────────────────┐  │          │
│  │ duckdb_core/mod.rs │  │  import/mod.rs    │  │          │
│  │                    │  │                   │  │          │
│  │ - execute_query()  │  │ - import_file()   │  │          │
│  │ - get_table_info() │  │ - preview_file()  │  │          │
│  │ - query_data()     │  │ - CSV parser      │  │          │
│  │                    │  │ - Excel parser    │  │          │
│  └─────────┬──────────┘  └─────────┬─────────┘  │          │
│            │                       │             │          │
│  ┌─────────▼───────────────────────▼─────────────▼────────┐ │
│  │              DuckDB Connection                          │ │
│  │                                                         │ │
│  │  - In-memory database                                  │ │
│  │  - 4GB memory limit                                    │ │
│  │  - 4 threads configured                                │ │
│  │  - OLAP query optimization                             │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Module Breakdown

### Frontend Modules

#### main.js
**Purpose**: Main application logic and UI management

**Key Functions**:
- `handleImportClick()`: Opens file dialog and shows preview
- `handleConfirmImport()`: Initiates file import process
- `loadTableData()`: Fetches data from backend and displays in grid
- `displayData()`: Renders data grid with rows and columns
- `handleSortClick()`: Opens sort dialog
- `handleConfirmSort()`: Applies sorting to data
- `showLoading()` / `hideLoading()`: Manages loading overlay
- `setupProgressListener()`: Listens for import progress events

**State Management**:
- `currentTable`: Currently loaded table name
- `currentData`: Currently displayed dataset
- `currentColumns`: Column names of current dataset
- `selectedFilePath`: Path of file selected for import

#### style.css
**Purpose**: Application styling with Excel-like appearance

**Key Components**:
- Grid styling (`.data-grid`)
- Modal dialogs (`.modal`, `.modal-content`)
- Loading overlay (`#loading-overlay`)
- Toolbar and status bar styling
- Button styles (`.btn`, `.btn-primary`)

### Backend Modules

#### main.rs
**Purpose**: Application entry point and Tauri configuration

**Responsibilities**:
- Initialize Tauri plugins (dialog, filesystem, shell)
- Create and manage AppState
- Register command handlers
- Run the Tauri application

**Registered Commands**:
- `import::import_file`
- `import::preview_file`
- `duckdb_core::query_data`
- `duckdb_core::get_table_info`
- `editor::reorder_rows`

#### lib.rs
**Purpose**: Library exports and shared state

**Components**:
- `AppState`: Global application state with DuckDB connection
- Module declarations

**AppState Structure**:
```rust
pub struct AppState {
    pub db: Mutex<duckdb_core::DatabaseConnection>,
}
```

#### duckdb_core/mod.rs
**Purpose**: DuckDB integration and query execution

**Key Structures**:
- `DatabaseConnection`: Wrapper around DuckDB connection
- `QueryResult`: Result of query execution with columns and rows
- `TableInfo`: Metadata about a table (columns, row count)
- `ColumnInfo`: Column name and data type

**Key Functions**:
- `DatabaseConnection::new()`: Creates in-memory DuckDB connection
- `execute_query(query)`: Executes SQL and returns typed results
- `get_table_info_internal(table_name)`: Gets table metadata
- `query_data(table_name, limit, offset)`: Fetches paginated data
- `get_table_info(table_name)`: Command handler for table info

**Query Execution Flow**:
1. Use `DESCRIBE` to get column information
2. Prepare actual data query
3. Execute query and iterate rows
4. Convert DuckDB types to JSON values
5. Return structured QueryResult

#### import/mod.rs
**Purpose**: File import functionality for CSV and Excel

**Key Structures**:
- `ImportResult`: Result of import operation
- `PreviewData`: Preview of first N rows
- `ImportProgress`: Progress event payload
- `ImportError`: Custom error type for imports

**Key Functions**:
- `import_file(file_path, table_name)`: Main import handler
- `preview_file(file_path, rows)`: Generate file preview
- `import_csv_with_duckdb()`: CSV import using DuckDB native
- `import_excel_with_duckdb()`: Excel import using calamine
- `detect_file_format(path)`: Determines file type from extension
- `sanitize_table_name(name)`: Cleans table name for SQL safety

**CSV Import Strategy**:
- Uses DuckDB's `read_csv_auto` function
- Enables parallel processing (`parallel=true`)
- Automatic schema inference (`sample_size=-1`)
- Direct table creation from CSV

**Excel Import Strategy**:
- Manual parsing with calamine crate
- Transaction-based insertion (BEGIN/COMMIT)
- Batch progress updates (every 1000 rows)
- VARCHAR columns with DuckDB type optimization

#### editor/mod.rs
**Purpose**: Data manipulation operations

**Key Structures**:
- `ReorderResult`: Result of reordering operation
- `SortColumn`: Column name and sort direction

**Key Functions**:
- `reorder_rows(table_name, sort_columns)`: Sorts table data

**Sorting Strategy**:
1. Create temporary sorted table
2. Drop original table
3. Rename temporary table to original name
4. Maintains data persistence

## Data Flow

### File Import Flow

```
User clicks Import
       ↓
File dialog opens (Tauri plugin-dialog)
       ↓
User selects file
       ↓
preview_file() called
       ↓
Frontend displays preview in modal
       ↓
User confirms import
       ↓
Loading overlay shown
       ↓
import_file() called
       ↓
Emit progress: "Starting import..."
       ↓
Detect file format (CSV or Excel)
       ↓
┌──────────────────┬──────────────────┐
│   CSV Import     │   Excel Import   │
│                  │                  │
│ DuckDB native    │ Manual parsing   │
│ read_csv_auto    │ with calamine    │
│ Parallel: true   │ Transactions     │
│ Fast!            │ Batch updates    │
└──────────────────┴──────────────────┘
       ↓
Emit progress events (rows imported)
       ↓
Table created in DuckDB
       ↓
Emit: "Import complete!"
       ↓
query_data() called to load data
       ↓
displayData() renders grid
       ↓
Loading overlay hidden
       ↓
Success!
```

### Query Execution Flow

```
Frontend calls query_data()
       ↓
Backend receives command
       ↓
Lock AppState mutex
       ↓
Get DatabaseConnection
       ↓
Build SQL query with LIMIT/OFFSET
       ↓
execute_query() called
       ↓
┌────────────────────────┐
│ DESCRIBE query         │
│ Get column names/types │
└───────────┬────────────┘
            ↓
┌────────────────────────┐
│ Actual data query      │
│ Fetch rows             │
└───────────┬────────────┘
            ↓
Convert DuckDB types → JSON
       ↓
Build QueryResult structure
       ↓
Return to frontend
       ↓
displayData() renders in grid
```

## State Management

### Backend State
- **Global State**: `AppState` managed by Tauri
- **Thread Safety**: Mutex-protected database connection
- **Lifetime**: Application lifecycle
- **Access**: Via `State<'_, AppState>` parameter injection

### Frontend State
- **Local Variables**: `currentTable`, `currentData`, `currentColumns`
- **DOM State**: Element references cached at initialization
- **Event State**: Progress updates via Tauri event system

## Event System

### Tauri Events
- **Event Name**: `import-progress`
- **Direction**: Backend → Frontend
- **Payload**: `ImportProgress` structure
- **Purpose**: Real-time progress updates during import

### Event Flow
```
Backend                         Frontend
───────                         ────────
window.emit("import-progress",  listen("import-progress",
  ImportProgress {                (event) => {
    rows_imported: 1000,            updateUI(event.payload)
    status: "Importing..."        })
  })
```

## Performance Optimizations

### CSV Import
- **Parallel Processing**: DuckDB's multi-threaded CSV reader
- **Schema Inference**: Automatic type detection
- **Direct Loading**: No intermediate processing

### Excel Import
- **Transaction Batching**: 1000 rows per transaction
- **Progress Updates**: Every 1000 rows to avoid UI flooding
- **Memory Efficient**: Streaming row processing

### Query Execution
- **DESCRIBE-based**: Compatible column detection
- **Pagination**: LIMIT/OFFSET for large datasets
- **Type Conversion**: Direct DuckDB → JSON mapping

### UI Rendering
- **Virtual Scrolling**: Not yet implemented (future enhancement)
- **Batch Updates**: Single DOM update per data load
- **CSS Optimization**: Hardware-accelerated animations

## Security Considerations

### SQL Injection Prevention
- **Table Names**: Sanitized with `sanitize_table_name()`
- **Parameters**: Limited to trusted internal queries
- **User Input**: File paths only, no direct SQL input

### File Access
- **Sandboxing**: Tauri filesystem plugin with permissions
- **Validation**: File format detection and validation
- **Error Handling**: Graceful failure on invalid files

## Error Handling

### Backend Errors
- Custom error types with `thiserror`
- Result types for fallible operations
- Error propagation with `?` operator
- User-friendly error messages

### Frontend Errors
- Try-catch blocks around async operations
- User alerts for errors
- Console logging for debugging
- Status text updates

## Future Architecture Improvements

1. **Virtual Scrolling**: Handle millions of rows efficiently
2. **Web Workers**: Offload heavy computations in frontend
3. **Caching Layer**: Cache query results for better performance
4. **Streaming**: Stream large datasets instead of loading all at once
5. **Database Persistence**: Option to save data to disk
6. **Multi-table Support**: Work with multiple datasets simultaneously
7. **Query Builder**: Visual query interface
8. **Export Functionality**: Export processed data to various formats
