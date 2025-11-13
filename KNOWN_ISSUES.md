# Known Issues & Solutions

## Issue: Import hangs on large files (2M+ rows)

**Status**: Partially Fixed
**Affects**: CSV files with millions of rows

### What Happens:
- Importing large CSV files (2M+ rows) takes 1-2 minutes
- During this time, the loading overlay shows but app appears frozen
- This is NOT a bug - DuckDB is actually processing the data

### Why:
- DuckDB's `CREATE TABLE AS SELECT * FROM read_csv_auto()` must read every single row
- Even with optimization (sample_size=20480 vs -1), reading 2M rows takes time
- The operation runs in background thread but still takes ~60-120 seconds

### Current Optimizations:
1. ✅ Changed `sample_size` from `-1` (entire file) to `20480` (first 20k rows only)
   - Schema inference is now **10-100x faster**
   - But actual data loading still takes time

2. ✅ Async execution via Tauri
   - Import runs in Tauri's async runtime
   - UI remains responsive during import

3. ✅ Progress events emitted with elapsed time tracking
   - Backend emits "import-progress" events with clear status messages
   - Frontend shows elapsed time (e.g., "45s elapsed - Processing large file...")
   - Timer updates every second so user knows it's working, not frozen
   - Message warns upfront: "Large files may take 1-2 minutes"

### Workaround:
**Just wait!** If importing a 2M row file:
- Expected time: 60-120 seconds
- Loading overlay now shows elapsed time (e.g., "45s elapsed - Processing large file...")
- Timer updates every second so you know it's working
- Don't force quit - let it complete
- The terminal/console will show debug output if you run from command line

### Test Plan:
1. Start with **small file** (10k rows) - should be instant
2. Try **medium file** (100k rows) - should be 5-10 seconds
3. Then try **large file** (1M+ rows) - will take 30-120 seconds

---

## Issue: localStorage Error on Restart

**Status**: FIXED ✅

### What Was Happening:
```
Failed to load data: Query error: Catalog Error: Table with name customers_2000000 does not exist!
```

### Why:
- App saved table name to localStorage
- On restart, tried to restore table from DuckDB
- But DuckDB is **in-memory** - data doesn't survive restarts!

### Fix:
- Disabled localStorage persistence completely
- App starts fresh each time
- No more errors on restart

---

## Recommendations

### For Best Performance:
1. **Use smaller datasets** (<100k rows) for instant loading
2. **For large datasets**, consider:
   - Filtering/sampling data before import
   - Using database mode (future feature)
   - Breaking into multiple smaller files

### Future Improvements Needed:
1. Show actual progress bar with percentage
2. Allow canceling long-running imports
3. Use DuckDB's COPY command instead of read_csv_auto
4. Add persistent database option (SQLite/DuckDB file)
