# Development Guide

## Getting Started

This guide will help you set up a development environment and contribute to RATS.

## Prerequisites

### Required Software

1. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be 18.x or higher
   ```

2. **Rust** (latest stable)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustc --version
   ```

3. **DuckDB** (via Homebrew on macOS)
   ```bash
   brew install duckdb
   ```

4. **Git**
   ```bash
   git --version
   ```

### Platform-Specific Requirements

#### macOS
- Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```

#### Windows
- Visual Studio Build Tools 2019 or later
- Windows SDK

#### Linux
- Build essentials:
  ```bash
  sudo apt-get install build-essential libssl-dev pkg-config
  ```

---

## Project Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd rats
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Rust dependencies are managed by Cargo
# They will be installed on first build
```

### 3. Environment Configuration

Create a `.env` file if needed (currently not required).

### 4. First Run

```bash
# Development mode
npm run tauri:dev

# This will:
# 1. Install Rust dependencies
# 2. Build the Rust backend
# 3. Start Vite dev server
# 4. Launch the Tauri application
```

---

## Development Workflow

### Running the Application

```bash
# Development mode with hot reload
npm run tauri:dev

# The application will:
# - Watch for file changes
# - Auto-reload frontend on JS/CSS changes
# - Rebuild backend on Rust changes
```

### Building for Production

```bash
# Create production build
npm run tauri:build

# Output will be in:
# src-tauri/target/release/bundle/
```

---

## Project Structure

```
rats/
├── src/                        # Frontend source
│   ├── main.js                # Main application logic
│   ├── style.css              # Application styles
│   ├── index.html             # Entry HTML
│   └── assets/                # Static assets
│
├── src-tauri/                 # Backend source
│   ├── src/
│   │   ├── main.rs           # Application entry
│   │   ├── lib.rs            # Library exports
│   │   ├── duckdb_core/      # DuckDB module
│   │   ├── import/           # Import module
│   │   └── editor/           # Editor module
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Tauri configuration
│   └── build.rs              # Build script
│
├── docs/                      # Documentation
│   ├── README.md             # Overview
│   ├── ARCHITECTURE.md       # Architecture docs
│   ├── API.md               # API reference
│   ├── TECHNICAL.md         # Technical details
│   └── DEVELOPMENT.md       # This file
│
├── package.json              # Node.js config
├── vite.config.js           # Vite configuration
└── README.md                # Project readme
```

---

## Code Style Guide

### JavaScript

Follow standard JavaScript conventions:

```javascript
// Use const/let, not var
const myVariable = 'value';
let mutableVar = 0;

// Use async/await for asynchronous code
async function loadData() {
    try {
        const result = await invoke('query_data', { tableName: 'test' });
        return result;
    } catch (error) {
        console.error('Error:', error);
    }
}

// Use arrow functions for callbacks
array.map(item => item.value);

// Use template literals
const message = `Loaded ${count} rows`;
```

### Rust

Follow Rust standard conventions:

```rust
// Use snake_case for functions and variables
fn load_table_data(table_name: &str) -> Result<Vec<Row>, Error> {
    // ...
}

// Use PascalCase for types
struct TableInfo {
    columns: Vec<ColumnInfo>,
    row_count: usize,
}

// Use descriptive error messages
return Err(ImportError::Custom("Invalid file path".to_string()));

// Document public APIs
/// Executes a SQL query and returns typed results
pub fn execute_query(&self, query: &str) -> DuckResult<QueryResult> {
    // ...
}
```

### CSS

Follow BEM-like conventions:

```css
/* Component block */
.data-grid {
    display: table;
}

/* Component element */
.data-grid__header {
    font-weight: bold;
}

/* Component modifier */
.data-grid--sortable {
    cursor: pointer;
}

/* Use CSS variables for theming */
:root {
    --primary-color: #0078d4;
    --border-color: #d1d1d1;
}
```

---

## Testing

### Running Tests

```bash
# Run Rust tests
cd src-tauri
cargo test

# Run JavaScript tests (if added)
npm test
```

### Writing Tests

#### Rust Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_table_name() {
        assert_eq!(sanitize_table_name("my-data"), "my_data");
        assert_eq!(sanitize_table_name("Sales (2024)"), "Sales_2024");
    }

    #[test]
    fn test_execute_query() {
        let db = DatabaseConnection::new().unwrap();
        // ... test code
    }
}
```

#### Integration Tests

```rust
// src-tauri/tests/integration_test.rs
#[test]
fn test_csv_import() {
    // Test full CSV import flow
}
```

---

## Debugging

### Backend (Rust)

#### Enable Backtrace

```bash
RUST_BACKTRACE=1 npm run tauri:dev
```

#### Add Debug Prints

```rust
println!("Debug: query = {}", query);
dbg!(&result);  // Pretty-print debug
```

#### Use Rust Debugger

With VS Code and rust-analyzer:
1. Set breakpoints in Rust code
2. Run "Debug" configuration
3. Step through code

### Frontend (JavaScript)

#### Browser DevTools

The Tauri application includes devtools:
- Right-click → "Inspect Element"
- Or press `Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Windows/Linux)

#### Console Logging

```javascript
console.log('Data:', data);
console.error('Error:', error);
console.table(array);  // Pretty table view
```

### DuckDB Queries

#### Log Queries

```rust
println!("Executing query: {}", query);
let result = conn.execute(&query, [])?;
println!("Query returned {} rows", result);
```

#### Test Queries Directly

```bash
# Open DuckDB CLI
duckdb

# Test queries
CREATE TABLE test AS SELECT * FROM read_csv_auto('data.csv');
DESCRIBE test;
SELECT * FROM test LIMIT 10;
```

---

## Common Development Tasks

### Adding a New Tauri Command

1. **Define the function in Rust**:
```rust
// src-tauri/src/mymodule/mod.rs
#[tauri::command(rename_all = "camelCase")]
pub async fn my_command(
    state: State<'_, AppState>,
    param: String,
) -> Result<MyResult, String> {
    // Implementation
    Ok(MyResult { /* ... */ })
}
```

2. **Register the command**:
```rust
// src-tauri/src/main.rs
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    mymodule::my_command,
])
```

3. **Call from frontend**:
```javascript
// src/main.js
const result = await invoke('myCommand', { param: 'value' });
```

### Adding a New Module

1. **Create module directory**:
```bash
mkdir src-tauri/src/mymodule
touch src-tauri/src/mymodule/mod.rs
```

2. **Declare module**:
```rust
// src-tauri/src/lib.rs
pub mod mymodule;
```

3. **Implement module**:
```rust
// src-tauri/src/mymodule/mod.rs
use tauri::State;
use crate::AppState;

// Module code here
```

### Adding a Dependency

#### Rust Dependency

```bash
cd src-tauri
cargo add package-name
```

Or manually edit `Cargo.toml`:
```toml
[dependencies]
package-name = "1.0"
```

#### JavaScript Dependency

```bash
npm install package-name
```

### Updating Dependencies

```bash
# Update JavaScript dependencies
npm update

# Update Rust dependencies
cd src-tauri
cargo update
```

---

## Performance Optimization

### Profiling Rust Code

```bash
# Build with profiling
cargo build --release
cargo install flamegraph
flamegraph -- ./target/release/rats
```

### Profiling JavaScript

Use browser DevTools:
1. Open DevTools
2. Go to "Performance" tab
3. Record profile
4. Analyze results

### Memory Profiling

```rust
// Add memory profiling
use std::alloc::{GlobalAlloc, Layout, System};

struct CountingAllocator;

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        println!("Allocating {} bytes", layout.size());
        System.alloc(layout)
    }
    // ... etc
}
```

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Build and Test

on: [push, pull_request]

jobs:
  build:
    runs-on: macos-latest

    steps:
    - uses: actions/checkout@v2

    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'

    - name: Setup Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable

    - name: Install DuckDB
      run: brew install duckdb

    - name: Install dependencies
      run: npm install

    - name: Run tests
      run: |
        cd src-tauri
        cargo test

    - name: Build application
      run: npm run tauri:build
```

---

## Release Process

### Version Bumping

1. Update version in `package.json`
2. Update version in `src-tauri/Cargo.toml`
3. Update version in `src-tauri/tauri.conf.json`

### Creating a Release

```bash
# 1. Ensure all tests pass
npm run tauri:dev
# Test application

# 2. Build for release
npm run tauri:build

# 3. Create git tag
git tag v1.0.0
git push origin v1.0.0

# 4. Create GitHub release
# Upload bundles from src-tauri/target/release/bundle/
```

---

## Troubleshooting

### "DuckDB not found" Error

**Solution**:
```bash
# Install DuckDB
brew install duckdb

# Set library path
export RUSTFLAGS="-L /opt/homebrew/lib"
npm run tauri:dev
```

### "Statement was not executed yet" Error

**Solution**: This was fixed with the DESCRIBE-based approach. Ensure you're using the latest code from `duckdb_core/mod.rs`.

### Tauri Build Fails

**Common causes**:
1. Missing Rust toolchain: `rustup update`
2. Missing Xcode tools: `xcode-select --install`
3. Outdated dependencies: `cargo update`

### Import Stuck at "Loading..."

**Debug steps**:
1. Check browser console for errors
2. Check backend logs
3. Verify file format is supported
4. Try a smaller test file

---

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Update documentation
6. Submit pull request

### Code Review Checklist

- [ ] Code follows style guide
- [ ] Tests pass
- [ ] New features have tests
- [ ] Documentation updated
- [ ] No console errors/warnings
- [ ] Performance impact considered

---

## Resources

### Tauri Documentation
- [Tauri Guides](https://tauri.app/v1/guides/)
- [Tauri API Reference](https://tauri.app/v1/api/js/)

### DuckDB Documentation
- [DuckDB Docs](https://duckdb.org/docs/)
- [DuckDB Rust Crate](https://docs.rs/duckdb/)

### Rust Resources
- [The Rust Book](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)

### JavaScript/Vite
- [Vite Docs](https://vitejs.dev/)
- [MDN Web Docs](https://developer.mozilla.org/)

---

## Getting Help

### Community

- GitHub Issues: Report bugs and request features
- Discussions: Ask questions and share ideas

### Contact

For questions about development:
1. Check existing documentation
2. Search GitHub issues
3. Create new issue with details

---

## License

See LICENSE file for details.
