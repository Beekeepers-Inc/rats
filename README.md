# rats - Data Analysis Tool

Desktop application for data analysis with Excel-like interface, built with Rust and Tauri v2.

## Features

- **Excel/CSV Import**: Load CSV and Excel (.xlsx, .xls) files
- **Data Grid Display**: Excel-like interface with virtual scrolling
- **Row Ordering**: Sort data by any column (ascending/descending)
- **Offline-First**: All processing happens locally
- **Cross-Platform**: Runs on macOS and Windows

## Development

### Prerequisites

- Node.js 24+ and npm
- Rust 1.87+
- Platform-specific tools:
  - macOS: Xcode Command Line Tools
  - Windows: Microsoft Visual C++ Build Tools

### Running in Development Mode

```bash
# Install dependencies
npm install

# Start development server with hot-reload
npm run tauri:dev
```

The app will open automatically. Changes to the frontend are hot-reloaded.

### Testing

1. Click "Import File" button
2. Select `sample-data.csv` from the project root
3. Preview will show first 10 rows
4. Click "Import" to load the full dataset
5. Click "Sort Rows" to test sorting functionality
6. Open browser console (right-click → Inspect) to see debug logs

## Building for Distribution

See [BUILD.md](BUILD.md) for detailed build instructions.

Quick build:
```bash
npm run tauri:build
```

Output locations:
- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/msi/`

## Project Structure

```
rats/
├── src/                    # Frontend (Vite + vanilla JS)
│   ├── main.js            # Application logic
│   └── style.css          # Styles
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── duckdb_core/   # Database layer
│   │   ├── import/        # CSV/Excel import module
│   │   ├── editor/        # Row ordering module
│   │   ├── lib.rs         # Library root
│   │   └── main.rs        # App entry point
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── index.html             # Frontend entry point
├── package.json           # Node dependencies
└── CLAUDE.md             # Development guide for Claude Code
```

## Core Value Propositions

- **Handle Massive Datasets**: 100M+ rows on a laptop (future DuckDB integration)
- **Instant Results**: Sub-second queries on GB-scale data
- **No Cloud Upload**: All processing local (data privacy)
- **Familiar Interface**: Excel-like + SPSS-like workflows
- **One-Time Purchase**: Desktop software, not subscription

## Current Limitations

- In-memory storage only (DuckDB integration planned)
- Limited to available RAM
- Basic Excel-like features (more coming soon)

## Roadmap

- [ ] DuckDB integration for true 100M+ row support
- [ ] Statistics module (descriptive stats, t-tests, correlation)
- [ ] Transform module (pivot, join, aggregations)
- [ ] Visualization module (charts and plots)
- [ ] Export module (save to CSV/Excel/Parquet)
- [ ] Formula evaluation
- [ ] Cell editing
- [ ] Undo/redo

## License

See [LICENSE](LICENSE) file for details.
