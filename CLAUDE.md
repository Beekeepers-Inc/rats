# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**rats** is a desktop application built with Rust and Tauri v2 that mimics Excel toolkit functionality. It works with tabular data formats and JSON files with schema inference, using DuckDB as the computation core. The application is optimized for memory efficiency and fast processing of huge datasets, runs offline, and targets MacOS and Windows platforms.

## Core Value Propositions

These define the application's competitive advantages and should guide all technical decisions:

- **Handle Massive Datasets**: Must efficiently process 100M+ rows on a standard laptop
- **Instant Results**: Target sub-second query performance on GB-scale data
- **No Cloud Upload**: All processing happens locally for complete data privacy
- **Familiar Interface**: Combine Excel-like spreadsheet UX with SPSS-like statistical workflows
- **One-Time Purchase**: Desktop software with perpetual license, not a subscription service

These requirements directly inform our architecture choices: DuckDB for analytical performance, Rust for memory safety and speed, offline-first design, and aggressive optimization for large-scale data operations.

## Tech Stack

- **Frontend Framework**: Tauri v2
- **Backend/Core**: Rust
- **Database Engine**: DuckDB (for in-memory data processing and querying)
- **Target Platforms**: MacOS, Windows
- **Key Requirements**:
  - Offline-first (no internet connection required)
  - Memory-optimized for large datasets
  - Support for multiple tabular formats (CSV, Excel, Parquet, etc.)
  - JSON support with schema inference
  - Excel-like toolkit functionality

## Development Commands

### Initial Setup
```bash
# Install Tauri CLI
cargo install tauri-cli

# Install dependencies
cargo build
```

### Development
```bash
# Run in development mode with hot reload
cargo tauri dev

# Build for current platform
cargo tauri build

# Build for specific platform
cargo tauri build --target x86_64-apple-darwin    # macOS Intel
cargo tauri build --target aarch64-apple-darwin   # macOS Apple Silicon
cargo tauri build --target x86_64-pc-windows-msvc # Windows
```

### Testing
```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test <test_name>

# Run tests for specific modules
cargo test import::        # Data Import module tests
cargo test editor::        # Data Editor module tests
cargo test statistics::    # Statistics module tests
cargo test transform::     # Transform module tests
cargo test visualization:: # Visualization module tests
cargo test export::        # Export module tests
cargo test duckdb_core::   # DuckDB core tests

# Run integration tests
cargo test --test integration_tests
cargo test --test duckdb_integration
```

### Linting and Formatting
```bash
# Format code
cargo fmt

# Check formatting without making changes
cargo fmt --check

# Run clippy for linting
cargo clippy

# Run clippy with all warnings
cargo clippy -- -W clippy::all
```

## Architecture

### Module Structure

The application is organized into six core modules for maintainability and separation of concerns:

**1. Data Import Module** (`src-tauri/src/import/`)
- File format detection and validation
- Readers for CSV, Excel (XLSX/XLS), Parquet, JSON, TSV
- Schema inference and type detection via DuckDB
- Chunked/streaming file loading for large datasets
- Encoding detection and handling
- Progress reporting for long imports
- Tauri commands: `import_file`, `detect_format`, `preview_import`

**2. Data Editor Module** (`src-tauri/src/editor/`)
- Cell-level CRUD operations
- Row/column insertion, deletion, reordering
- Excel-like spreadsheet operations (fill, copy, paste)
- Data validation and constraints
- Undo/redo stack management
- Real-time sync with DuckDB tables
- Tauri commands: `update_cell`, `insert_row`, `delete_column`, `undo`, `redo`

**3. Statistics Module** (`src-tauri/src/statistics/`)
- Descriptive statistics (mean, median, mode, std dev, quartiles)
- SPSS-like statistical tests (t-tests, ANOVA, chi-square, correlation)
- Frequency distributions and cross-tabulations
- Hypothesis testing
- Regression analysis (linear, logistic)
- Leverages DuckDB's statistical functions for performance
- Tauri commands: `calculate_descriptive_stats`, `run_ttest`, `compute_correlation`

**4. Transform Module** (`src-tauri/src/transform/`)
- Data cleaning (remove duplicates, handle missing values)
- Column transformations (type casting, string manipulation, date parsing)
- Filtering and sorting operations
- Pivot/unpivot operations
- Join/merge operations across tables
- Aggregations and grouping
- Custom formula evaluation
- Tauri commands: `filter_data`, `pivot_table`, `join_tables`, `apply_formula`

**5. Visualization Module** (`src-tauri/src/visualization/`)
- Chart generation (bar, line, scatter, histogram, box plot, heatmap)
- Statistical plots (Q-Q plots, distribution curves)
- Data aggregation for visualization
- Export charts as images (PNG, SVG)
- Integration with frontend charting libraries
- Tauri commands: `generate_chart_data`, `export_chart`

**6. Export Module** (`src-tauri/src/export/`)
- Writers for CSV, Excel, Parquet, JSON
- Format-specific options (delimiters, compression, sheet names)
- Filtered/transformed data export from DuckDB
- Batch export of multiple tables
- Progress reporting for large exports
- Tauri commands: `export_file`, `export_selection`, `export_multiple_sheets`

### Shared Infrastructure

**DuckDB Core** (`src-tauri/src/duckdb_core/`)
- Connection management and pooling
- Query execution and streaming results
- Extension loading (json, parquet, excel)
- Memory and configuration management
- Error handling and logging

**Frontend** (`src/`)
- Module-specific UI components
- Unified data grid with virtual scrolling
- Navigation between modules
- State management for active dataset and operations

### Data Flow

**Import Flow**
1. User selects file → Import module detects format → Validates and previews
2. User confirms → Import module streams data into DuckDB table
3. Schema inferred and table created → Frontend loads initial view

**Edit Flow**
1. User modifies cells/rows/columns → Editor module validates changes
2. Changes applied to DuckDB table → Undo state saved
3. Frontend updates grid view → Change propagates to other modules

**Analysis Flow**
1. User selects data range → Statistics/Transform module queries DuckDB
2. Operations executed (compute stats, pivot, filter, etc.)
3. Results returned to frontend → Displayed in module-specific UI
4. User can visualize results → Visualization module generates charts

**Export Flow**
1. User chooses format and options → Export module queries current DuckDB state
2. Data streamed from DuckDB → Format writer processes chunks
3. File written to disk → Progress reported to frontend

### Memory Optimization Strategy

- Use DuckDB's streaming query results to avoid loading entire datasets
- Implement chunk-based reading for large files
- Virtual scrolling in UI to render only visible cells
- Lazy loading of sheets/tables
- Connection pooling for multiple file operations
- Proper Drop implementations to release DuckDB resources

## Key Design Decisions

**Modular Architecture**: Six independent modules (Import, Editor, Statistics, Transform, Visualization, Export) enable parallel development, easier testing, and better maintainability. Each module has clear boundaries and communicates through DuckDB as the central data store.

**Why DuckDB**: In-process analytical database optimized for OLAP queries, perfect for Excel-like operations on large datasets without external database server. Acts as the single source of truth shared by all modules.

**Offline-First**: All computation happens locally using DuckDB embedded engine. No network calls required for core functionality.

**Schema Inference**: DuckDB provides automatic type detection for JSON and CSV files. Leverage `read_json_auto()` and `read_csv_auto()` functions.

**Platform Support**: Tauri v2 provides native installers for MacOS and Windows. Use conditional compilation for platform-specific code when needed.

## Important Considerations

**DuckDB Configuration**
- Configure memory limits based on available system RAM
- Use appropriate DuckDB extensions (json, parquet, excel)
- Set temp directory for spill-to-disk operations on large queries

**File Format Support**
- Excel: Use calamine or rust-xlsxwriter crates
- Parquet: DuckDB has native support
- JSON: DuckDB's `read_json_auto()` handles nested structures
- CSV: DuckDB's `read_csv_auto()` with encoding detection

**Error Handling**
- Gracefully handle malformed data files
- Provide clear error messages for schema inference failures
- Handle DuckDB memory limits and suggest disk spilling

**Tauri Security**
- Use Tauri's scope system to restrict file system access
- Validate file paths and prevent directory traversal
- Sanitize user input in SQL queries to prevent injection
