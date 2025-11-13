# Changelog

All notable changes to the RATS (Rapid Analysis Toolset for Spreadsheets) project.

## [0.1.0] - 2025-11-13

### Fixed

#### Critical Bug: Incorrect Row Count Display
- **Issue**: App displayed "Loading all 1 rows" after successfully importing 2 million rows
- **Root Cause**: `execute_query()` in `src-tauri/src/duckdb_core/mod.rs` was returning `collected_rows.len()` (the size of the current query result) instead of the actual table total
- **Fix**:
  - Added `extract_table_name()` helper function to parse table name from SQL query
  - Modified `execute_query()` to run separate `COUNT(*)` query for accurate total row count
  - File: `src-tauri/src/duckdb_core/mod.rs:46-128`

#### Critical Bug: Virtual Scroll Browser Height Limitation
- **Issue**: Scrolling stopped at row 1,048,581 out of 2,000,000 rows
- **Root Cause**: Browser maximum element height limitation (~33,554,432 pixels). With 2M rows × 32px/row = 64M pixels, it exceeded browser limits
- **Fix**: Implemented scaling factor algorithm in virtual scroller
  - Calculate scale factor: `fullHeight / MAX_SCROLL_HEIGHT` (64M / 33M ≈ 1.94)
  - Use scaled height for spacer element (stays within 33M pixel browser limit)
  - Multiply scroll positions by scale factor to map to actual row positions
  - Divide content positions by scale factor for correct rendering
  - File: `src/virtualScroll.js:5-141`
- **Technical Details**:
  - Added scale factor calculation in constructor
  - Updated `setupScrolling()` to use scaled spacer height
  - Updated `handleScroll()` to apply scale factor to scroll positions
  - Updated `renderRows()` to position content at scaled coordinates
  - Updated `updateTotalRows()` to recalculate scale factor dynamically
  - Updated `scrollToRow()` to convert row index to scaled position

### Improved

#### Simplified CSV Import Logic
- **Change**: Replaced complex CSV import implementation with DuckDB's recommended simple syntax
- **Old Implementation**:
  ```rust
  CREATE TABLE {} AS SELECT * FROM read_csv_auto('{}', header=true, sample_size=20480, parallel=true)
  ```
- **New Implementation**:
  ```rust
  CREATE TABLE {} AS FROM '{}'
  ```
- **Benefits**:
  - Lets DuckDB handle all auto-detection with optimized defaults
  - Simpler, more maintainable code
  - Follows official DuckDB documentation best practices
  - Reference: https://duckdb.org/docs/stable/data/csv/overview
- **File**: `src-tauri/src/import/mod.rs:74-117`

### Technical Details

#### Files Modified

1. **src-tauri/src/duckdb_core/mod.rs**
   - Added `extract_table_name()` helper function (lines 114-128)
   - Modified `execute_query()` to get accurate total row count (lines 62-70)

2. **src-tauri/src/import/mod.rs**
   - Simplified `import_csv_with_duckdb()` function (lines 74-117)
   - Removed complex read_csv_auto parameters
   - Added better error handling and logging

3. **src/virtualScroll.js**
   - Added scale factor calculation (lines 15-21)
   - Modified `setupScrolling()` for scaled spacer (lines 42-50)
   - Modified `handleScroll()` for scaled positions (lines 79-84)
   - Modified `renderRows()` for scaled content positioning (lines 105-106)
   - Modified `updateTotalRows()` for dynamic scale recalculation (lines 116-124)
   - Modified `scrollToRow()` for scaled scrolling (lines 131-133)

#### Performance Characteristics

- **Small datasets** (<100k rows): Instant loading, no scaling needed
- **Medium datasets** (100k-1M rows): 5-30 seconds import, potential scaling
- **Large datasets** (1M-2M rows): 30-120 seconds import, scaling factor ~1.5-2.0
- **Scale factor example**: 2M rows × 32px = 64M pixels → scale factor 1.94 → spacer height 33M pixels

#### Known Limitations

- DuckDB runs in-memory: Data does not persist across app restarts
- Large file imports (2M+ rows) take 1-2 minutes
- Browser height limitation workaround may have minor rendering artifacts on extremely rapid scrolling

### Build Information

- **Platform**: macOS (aarch64)
- **Tauri Version**: v2
- **Build Output**:
  - macOS App: `src-tauri/target/release/bundle/macos/rats.app`
  - macOS DMG: `src-tauri/target/release/bundle/dmg/rats_0.1.0_aarch64.dmg`
- **Build Command**: `RUSTFLAGS="-L /opt/homebrew/lib" npm run tauri:build`

### Testing

All fixes have been tested with:
- 2 million row CSV dataset
- Full scroll range verification (rows 0 to 2,000,000)
- Import performance validation
- Production build verification
