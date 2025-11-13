# RATS - Data Analysis Tool Documentation

## Overview

RATS is a desktop data analysis application built with Tauri v2, providing an Excel-like interface for importing, viewing, and analyzing CSV and Excel files. It uses DuckDB as the analytical database engine for high-performance data processing.

## Key Features

- **File Import**: Support for CSV, XLS, XLSX, XLSM formats
- **Real-time Progress**: Live progress tracking during file imports with row counts
- **High Performance**: Optimized with DuckDB's parallel processing capabilities
- **Data Viewing**: Excel-like grid interface with pagination
- **Data Sorting**: Multi-column sorting capabilities
- **Type Detection**: Automatic schema inference for imported data
- **Loading Screens**: User-friendly loading overlays with progress indicators

## Technology Stack

- **Frontend**: Vanilla JavaScript + Vite
- **Backend**: Rust + Tauri v2
- **Database**: DuckDB (in-memory analytical database)
- **File Parsing**:
  - CSV: DuckDB native `read_csv_auto`
  - Excel: calamine crate
- **UI**: Custom CSS with Excel-like styling

## Architecture

```
rats/
├── src/                    # Frontend code
│   ├── main.js            # Main application logic
│   ├── style.css          # Application styles
│   └── index.html         # Entry HTML file
├── src-tauri/             # Backend Rust code
│   ├── src/
│   │   ├── main.rs       # Application entry point
│   │   ├── lib.rs        # Library exports
│   │   ├── duckdb_core/  # DuckDB integration
│   │   │   └── mod.rs    # Query execution and database
│   │   ├── import/       # File import logic
│   │   │   └── mod.rs    # CSV/Excel import handlers
│   │   └── editor/       # Data manipulation
│   │       └── mod.rs    # Sorting and reordering
│   └── Cargo.toml        # Rust dependencies
└── docs/                  # Documentation
    ├── README.md         # This file
    ├── ARCHITECTURE.md   # System architecture
    ├── API.md           # API reference
    └── DEVELOPMENT.md   # Development guide
```

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- Rust (latest stable)
- DuckDB installed via Homebrew (macOS):
  ```bash
  brew install duckdb
  ```

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd rats

# Install frontend dependencies
npm install

# Run development server
npm run tauri:dev
```

### Building

```bash
# Build for production
npm run tauri:build
```

## User Guide

### Importing Files

1. Click the "Import" button in the toolbar
2. Select a CSV or Excel file from the file dialog
3. Preview the first 10 rows of your data
4. Click "Confirm" to import
5. Watch real-time progress as rows are imported
6. View your data in the grid once complete

### Sorting Data

1. Import a file
2. Click the "Sort" button
3. Select a column to sort by
4. Choose ascending or descending order
5. Click "Confirm" to apply sorting

## Performance

- **CSV Import**: Parallel processing enabled for faster large file imports
- **Excel Import**: Transaction batching (1000 rows/batch) for optimal performance
- **Query Execution**: DuckDB's DESCRIBE-based column detection for compatibility
- **Memory**: Configured for 4GB limit with 4 threads

## Browser Support

The application is a desktop app built with Tauri, running on:
- macOS (Apple Silicon and Intel)
- Windows
- Linux

## Documentation

- [Architecture Guide](./ARCHITECTURE.md) - System design and component details
- [API Reference](./API.md) - Complete API documentation
- [Development Guide](./DEVELOPMENT.md) - Setup and contribution guidelines
- [Technical Implementation](./TECHNICAL.md) - Implementation details and fixes
- [Changelog](./CHANGELOG.md) - Version history and bug fixes

## License

See LICENSE file for details.

## Support

For issues and feature requests, please open an issue in the repository.
