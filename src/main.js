import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { VirtualScroller } from './virtualScroll.js';

// Application state
let currentTable = null;
let originalTable = null; // Track the original table name (before filtering)
let currentData = null;
let currentColumns = null;
let selectedFilePath = null;
let filterRules = [];
let isFiltered = false; // Track if we're viewing filtered data
let originalRowCount = 0; // Track original dataset size

// Infinite scroll state
let currentOffset = 0; // Track loaded row count
let isLoadingMore = false; // Prevent simultaneous loads
let hasMoreData = true; // Track if more data available
let currentTbody = null; // Reference to tbody for appending
let loadedRowCount = 0; // Track how many rows we've actually loaded
let scrollObserver = null; // Intersection Observer for infinite scroll
let sentinelElement = null; // Sentinel element to observe

// Virtual scrolling state
let virtualScrollEnabled = true; // Enable virtual scrolling for large datasets
let rowHeight = 32; // Approximate height of each row in pixels
let visibleRowCount = 50; // Number of rows to render at once
let currentScrollTop = 0; // Current scroll position
let totalRows = 0; // Total number of rows in dataset
let startRowIndex = 0; // Index of first visible row
let virtualScrollContainer = null; // Container for virtual scrolling

// DOM elements
const importBtn = document.getElementById('import-btn');
const resetBtn = document.getElementById('reset-btn');
const sortBtn = document.getElementById('sort-btn');
const filterBtn = document.getElementById('filter-btn');
const statsBtn = document.getElementById('stats-btn');
const saveBtn = document.getElementById('save-btn');
const saveAsBtn = document.getElementById('save-as-btn');
const exportBtn = document.getElementById('export-btn');
const gridContainer = document.getElementById('grid-container');
const statusText = document.getElementById('status-text');
const rowCount = document.getElementById('row-count');

// Import dialog
const importDialog = document.getElementById('import-dialog');
const previewContainer = document.getElementById('preview-container');
const closePreview = document.getElementById('close-preview');
const cancelImport = document.getElementById('cancel-import');
const confirmImport = document.getElementById('confirm-import');

// Sort dialog
const sortDialog = document.getElementById('sort-dialog');
const sortColumn = document.getElementById('sort-column');
const closeSortBtn = document.getElementById('close-sort');
const cancelSort = document.getElementById('cancel-sort');
const confirmSort = document.getElementById('confirm-sort');

// Statistics dialog
const statsDialog = document.getElementById('stats-dialog');
const statsContainer = document.getElementById('stats-container');
const closeStats = document.getElementById('close-stats');
const closeStatsBtn = document.getElementById('close-stats-btn');
const statsDropdown = document.getElementById('stats-dropdown');

// Function dialog (for individual statistics)
const functionDialog = document.getElementById('function-dialog');
const functionDialogTitle = document.getElementById('function-dialog-title');
const functionColumn = document.getElementById('function-column');
const functionColumn2 = document.getElementById('function-column2');
const functionColumn2Group = document.getElementById('function-column2-group');
const functionResult = document.getElementById('function-result');
const functionResultValue = document.getElementById('function-result-value');
const closeFunction = document.getElementById('close-function');
const cancelFunction = document.getElementById('cancel-function');
const calculateFunction = document.getElementById('calculate-function');
let currentFunction = null;

// Export dialog
const exportDialog = document.getElementById('export-dialog');
const exportFormat = document.getElementById('export-format');
const sheetName = document.getElementById('sheet-name');
const includeHeader = document.getElementById('include-header');
const excelOptions = document.getElementById('excel-options');
const closeExport = document.getElementById('close-export');
const cancelExport = document.getElementById('cancel-export');
const confirmExport = document.getElementById('confirm-export');

// Filter dialog
const filterDialog = document.getElementById('filter-dialog');
const filterRulesContainer = document.getElementById('filter-rules-container');
const addFilterRule = document.getElementById('add-filter-rule');
const clearFilters = document.getElementById('clear-filters');
const closeFilter = document.getElementById('close-filter');
const cancelFilter = document.getElementById('cancel-filter');
const applyFilter = document.getElementById('apply-filter');

// Loading overlay
let loadingOverlay = null;
let loadingStatus = null;
let loadingProgress = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupLoadingUI();
  setupProgressListener();
  setupInfiniteScroll();
  // Don't restore from storage - DuckDB is in-memory and won't persist
  // restoreTableFromStorage();
});

function setupLoadingUI() {
  // Create loading overlay
  loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'loading-overlay';
  loadingOverlay.style.display = 'none';
  loadingOverlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div id="loading-status" class="loading-status">Loading...</div>
      <div id="loading-progress" class="loading-progress">0 rows</div>
    </div>
  `;
  document.body.appendChild(loadingOverlay);

  loadingStatus = document.getElementById('loading-status');
  loadingProgress = document.getElementById('loading-progress');
}

let importStartTime = null;
let elapsedTimeTimer = null;

async function setupProgressListener() {
  await listen('import-progress', (event) => {
    const progress = event.payload;

    // Track import start time
    if (progress.status.includes('Starting import')) {
      importStartTime = Date.now();
      startElapsedTimeUpdater();
    }

    // Clear timer when import completes
    if (progress.status.includes('Import complete')) {
      stopElapsedTimeUpdater();
    }

    if (loadingStatus) {
      loadingStatus.textContent = progress.status;
    }
    if (loadingProgress && progress.rows_imported > 0) {
      loadingProgress.textContent = `${progress.rows_imported.toLocaleString()} rows imported`;
    }
  });
}

function startElapsedTimeUpdater() {
  stopElapsedTimeUpdater(); // Clear any existing timer

  elapsedTimeTimer = setInterval(() => {
    if (importStartTime && loadingProgress) {
      const elapsed = Math.floor((Date.now() - importStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = minutes > 0
        ? `${minutes}m ${seconds}s elapsed`
        : `${seconds}s elapsed`;

      // Only update if we're still showing the loading overlay
      if (loadingOverlay && loadingOverlay.style.display !== 'none') {
        loadingProgress.textContent = `${timeStr} - Processing large file...`;
      }
    }
  }, 1000); // Update every second
}

function stopElapsedTimeUpdater() {
  if (elapsedTimeTimer) {
    clearInterval(elapsedTimeTimer);
    elapsedTimeTimer = null;
  }
  importStartTime = null;
}

function showLoading(message = 'Loading...') {
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
    if (loadingStatus) {
      loadingStatus.textContent = message;
    }
    if (loadingProgress) {
      loadingProgress.textContent = '0 rows';
    }
  }
}

function hideLoading() {
  stopElapsedTimeUpdater(); // Stop the timer when hiding loading overlay
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
}

function setupEventListeners() {
  // Import
  importBtn.addEventListener('click', handleImportClick);
  closePreview.addEventListener('click', () => hideModal(importDialog));
  cancelImport.addEventListener('click', () => hideModal(importDialog));
  confirmImport.addEventListener('click', handleConfirmImport);

  // Reset
  resetBtn.addEventListener('click', handleResetClick);

  // Sort
  sortBtn.addEventListener('click', handleSortClick);
  closeSortBtn.addEventListener('click', () => hideModal(sortDialog));
  cancelSort.addEventListener('click', () => hideModal(sortDialog));
  confirmSort.addEventListener('click', handleConfirmSort);

  // Statistics - Dropdown menu
  statsDropdown.addEventListener('click', handleStatsDropdownClick);
  closeStats.addEventListener('click', () => hideModal(statsDialog));
  closeStatsBtn.addEventListener('click', () => hideModal(statsDialog));

  // Function dialog
  closeFunction.addEventListener('click', () => hideModal(functionDialog));
  cancelFunction.addEventListener('click', () => hideModal(functionDialog));
  calculateFunction.addEventListener('click', handleCalculateFunction);

  // Save
  saveBtn.addEventListener('click', handleSaveClick);
  saveAsBtn.addEventListener('click', handleSaveAsClick);

  // Export
  exportBtn.addEventListener('click', handleExportClick);
  exportFormat.addEventListener('change', handleExportFormatChange);
  closeExport.addEventListener('click', () => hideModal(exportDialog));
  cancelExport.addEventListener('click', () => hideModal(exportDialog));
  confirmExport.addEventListener('click', handleConfirmExport);

  // Filter
  filterBtn.addEventListener('click', handleFilterClick);
  addFilterRule.addEventListener('click', handleAddFilterRule);
  clearFilters.addEventListener('click', handleClearFilters);
  closeFilter.addEventListener('click', () => hideModal(filterDialog));
  cancelFilter.addEventListener('click', () => hideModal(filterDialog));
  applyFilter.addEventListener('click', handleApplyFilter);
}

async function handleImportClick() {
  console.log('Import button clicked');
  try {
    console.log('Opening file dialog...');
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'Data Files',
          extensions: ['csv', 'xlsx', 'xls', 'xlsm']
        }
      ]
    });

    console.log('File selected:', selected);

    if (!selected) {
      console.log('No file selected');
      return;
    }

    // The file dialog returns either a string (single file) or an object with path property
    selectedFilePath = typeof selected === 'string' ? selected : selected.path;
    statusText.textContent = 'Loading preview...';

    console.log('Getting preview for:', selectedFilePath);

    // Get preview
    const preview = await invoke('preview_file', {
      filePath: selectedFilePath,
      rows: 10
    });

    console.log('Preview loaded:', preview);

    displayPreview(preview);
    showModal(importDialog);
  } catch (error) {
    console.error('Import error:', error);
    console.error('Error stack:', error.stack);
    alert('Failed to open file: ' + error);
    statusText.textContent = 'Import failed: ' + error;
  }
}

function displayPreview(preview) {
  const info = document.createElement('div');
  info.className = 'preview-info';
  info.innerHTML = `
    <strong>Preview (first 10 rows):</strong><br>
    Total rows: ${preview.total_rows.toLocaleString()}<br>
    Columns: ${preview.columns.length}
  `;

  const table = document.createElement('table');
  table.className = 'data-grid';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  preview.columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  preview.rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  previewContainer.innerHTML = '';
  previewContainer.appendChild(info);
  previewContainer.appendChild(table);
}

async function handleConfirmImport() {
  try {
    hideModal(importDialog);
    showLoading('Starting import...');

    // Clean up previous dataset
    await cleanupPreviousData();

    const result = await invoke('import_file', {
      filePath: selectedFilePath,
      tableName: null
    });

    currentTable = result.table_name;

    // Hide loading overlay immediately after import completes
    // This allows the user to see the status bar updates during loadTableData
    hideLoading();
    statusText.textContent = result.message;

    // Don't save to localStorage - DuckDB is in-memory and won't persist anyway
    // localStorage.setItem('currentTable', currentTable);

    // Load the data (status updates will show in status bar)
    await loadTableData();

    // Enable all data operation buttons
    sortBtn.disabled = false;
    filterBtn.disabled = false;
    statsBtn.disabled = false;
    saveBtn.disabled = false;
    saveAsBtn.disabled = false;
    exportBtn.disabled = false;
  } catch (error) {
    console.error('Import error:', error);
    hideLoading();
    statusText.textContent = 'Import failed';
    alert('Failed to import file: ' + error);
  }
}

async function cleanupPreviousData() {
  console.log('Cleaning up previous data...');

  // Destroy virtual scroller
  if (virtualScrollContainer) {
    virtualScrollContainer.destroy();
    virtualScrollContainer = null;
  }

  // Clear DOM
  if (gridContainer) {
    gridContainer.innerHTML = '';
  }

  // Clear state
  currentData = null;
  currentColumns = null;
  currentTbody = null;
  totalRows = 0;
  loadedRowCount = 0;
  isFiltered = false;
  filterRules = [];
  originalTable = null;

  // Drop old table from DuckDB if exists
  if (currentTable) {
    try {
      console.log(`Dropping old table: ${currentTable}`);
      await invoke('drop_table', { tableName: currentTable });
    } catch (error) {
      console.warn('Could not drop old table:', error);
    }
  }

  console.log('Cleanup complete');
}

async function loadTableData(limit = null) {
  try {
    statusText.textContent = 'Analyzing dataset...';

    // Reset state
    currentOffset = 0;
    loadedRowCount = 0;
    hasMoreData = false;
    isLoadingMore = false;

    // First, get total row count and columns (very fast query)
    const initialResult = await invoke('query_data', {
      tableName: currentTable,
      limit: 1,
      offset: 0
    });

    currentColumns = initialResult.columns;
    totalRows = initialResult.total_rows;

    // Store original row count if not filtered
    if (!isFiltered) {
      originalRowCount = totalRows;
    }

    // Show progress information
    statusText.textContent = `Preparing to display ${totalRows.toLocaleString()} rows...`;
    updateRowCount(totalRows);

    if (virtualScrollEnabled) {
      // Always use virtual scrolling when enabled (handles any dataset size, even 100M+ rows)
      console.log(`Using virtual scrolling for ${totalRows} rows`);
      statusText.textContent = `Loading first rows of ${totalRows.toLocaleString()}...`;
      await loadVirtualScrollData();
      statusText.textContent = `Ready - ${totalRows.toLocaleString()} rows (scroll to load more)`;
    } else {
      // Load all data for small datasets (only when virtual scroll is disabled)
      console.log(`Loading all ${totalRows} rows`);
      statusText.textContent = `Loading ${totalRows.toLocaleString()} rows...`;
      const result = await invoke('query_data', {
        tableName: currentTable,
        limit: limit || 999999999,
        offset: 0
      });
      currentData = result;
      displayData(result);
      statusText.textContent = `Loaded ${currentTable} - ${totalRows.toLocaleString()} rows`;
    }
  } catch (error) {
    console.error('Load error:', error);
    statusText.textContent = 'Failed to load data';

    // Don't show alert for "table does not exist" errors (expected on first launch)
    if (!error.includes('does not exist')) {
      alert('Failed to load data: ' + error);
    }
  }
}

async function restoreTableFromStorage() {
  try {
    const savedTable = localStorage.getItem('currentTable');
    if (!savedTable) {
      console.log('No saved table to restore');
      return;
    }

    console.log('Restoring table from storage:', savedTable);
    currentTable = savedTable;

    // Load the saved table data
    await loadTableData();

    // Enable all data operation buttons
    sortBtn.disabled = false;
    filterBtn.disabled = false;
    statsBtn.disabled = false;
    saveBtn.disabled = false;
    saveAsBtn.disabled = false;
    exportBtn.disabled = false;

    console.log('Table restored successfully');
  } catch (error) {
    console.warn('Table no longer exists, clearing localStorage:', error);
    // Clear invalid saved table silently
    localStorage.removeItem('currentTable');
    currentTable = null;
    statusText.textContent = 'No file loaded';
    // Don't show alert for missing table - it's expected after restart
  }
}

function displayData(data) {
  const table = document.createElement('table');
  table.className = 'data-grid';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // Row number column
  const thRowNum = document.createElement('th');
  thRowNum.className = 'row-number';
  thRowNum.textContent = '#';
  headerRow.appendChild(thRowNum);

  // Data columns
  data.columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    th.title = 'Click to sort by ' + col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  data.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');

    // Row number
    const tdRowNum = document.createElement('td');
    tdRowNum.className = 'row-number';
    tdRowNum.textContent = rowIndex + 1;
    tr.appendChild(tdRowNum);

    // Data cells
    row.forEach(cell => {
      const td = document.createElement('td');
      if (cell === null || cell === undefined) {
        td.textContent = '';
        td.style.color = '#999';
      } else if (typeof cell === 'number') {
        td.textContent = cell.toLocaleString();
        td.style.textAlign = 'right';
      } else {
        td.textContent = String(cell);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // Save tbody reference
  currentTbody = tbody;

  gridContainer.innerHTML = '';
  gridContainer.appendChild(table);
}

function updateRowCount(count) {
  rowCount.textContent = `${count.toLocaleString()} rows`;
}

// ============================================
// Virtual Scrolling Functions
// ============================================

async function loadVirtualScrollData() {
  // Destroy existing scroller
  if (virtualScrollContainer) {
    virtualScrollContainer.destroy();
  }

  // Show temporary loading message in grid
  gridContainer.innerHTML = `
    <div style="padding: 40px; text-align: center; color: #666;">
      <div style="font-size: 18px; margin-bottom: 10px;">⏳ Preparing virtual scroll...</div>
      <div style="font-size: 14px;">Loading first ${Math.min(100, totalRows)} rows of ${totalRows.toLocaleString()}</div>
    </div>
  `;

  // Give the UI a moment to update
  await new Promise(resolve => setTimeout(resolve, 10));

  // Create new virtual scroller
  virtualScrollContainer = new VirtualScroller({
    container: gridContainer,
    rowHeight: 32,
    bufferSize: 50, // Increased buffer for smoother scrolling with large datasets
    totalRows: totalRows,
    onRenderRows: async (startIndex, count) => {
      console.log(`Rendering rows ${startIndex} to ${startIndex + count}`);
      return await renderVirtualRows(startIndex, count);
    }
  });

  console.log(`Virtual scroller initialized for ${totalRows} rows`);
}

async function renderVirtualRows(startIndex, count) {
  try {
    // Fetch rows from backend
    const result = await invoke('query_data', {
      tableName: currentTable,
      limit: count,
      offset: startIndex
    });

    // Build table HTML
    let html = '<table class="data-grid">';

    // Header (only on first render)
    if (startIndex === 0) {
      html += '<thead><tr>';
      html += '<th class="row-number">#</th>';
      currentColumns.forEach(col => {
        html += `<th title="Click to sort by ${col}">${col}</th>`;
      });
      html += '</tr></thead>';
    }

    // Body
    html += '<tbody>';
    result.rows.forEach((row, index) => {
      const rowNum = startIndex + index + 1;
      html += '<tr>';
      html += `<td class="row-number">${rowNum}</td>`;
      row.forEach(cell => {
        if (cell === null || cell === undefined) {
          html += '<td style="color: #999"></td>';
        } else if (typeof cell === 'number') {
          html += `<td style="text-align: right">${cell.toLocaleString()}</td>`;
        } else {
          html += `<td>${String(cell)}</td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    return html;
  } catch (error) {
    console.error('Error rendering virtual rows:', error);
    return '<div class="loading">Error loading rows...</div>';
  }
}

//============================================
// Infinite Scroll Functions
// ============================================

function setupInfiniteScroll() {
  // Infinite scroll disabled - loading all data at once
  console.log('Infinite scroll disabled - all data loaded at once');

  // Disconnect any existing observer
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
}

function observeSentinel() {
  // Create or update sentinel element
  if (!sentinelElement) {
    sentinelElement = document.createElement('div');
    sentinelElement.id = 'scroll-sentinel';
    sentinelElement.style.height = '1px';
    sentinelElement.style.width = '100%';
  }

  // Remove old sentinel if it exists
  const oldSentinel = document.getElementById('scroll-sentinel');
  if (oldSentinel && oldSentinel !== sentinelElement) {
    oldSentinel.remove();
  }

  // Append sentinel after tbody
  if (currentTbody && currentTbody.parentElement) {
    const table = currentTbody.parentElement;
    if (table.parentElement) {
      table.parentElement.appendChild(sentinelElement);

      // Start observing
      if (scrollObserver) {
        scrollObserver.observe(sentinelElement);
        console.log('Now observing sentinel element');
      }
    }
  }
}

async function loadMoreData() {
  if (isLoadingMore || !hasMoreData) return;

  try {
    isLoadingMore = true;
    console.log(`Loading more data from offset ${currentOffset}...`);

    // Show loading indicator
    showLoadingIndicator();

    const result = await invoke('query_data', {
      tableName: currentTable,
      limit: 10000,
      offset: currentOffset
    });

    // Append new rows
    appendRows(result.rows);

    // Update state
    loadedRowCount += result.rows.length;
    currentOffset = loadedRowCount;
    hasMoreData = loadedRowCount < originalRowCount;

    console.log(`Loaded ${result.rows.length} more rows. Total: ${loadedRowCount}/${originalRowCount}`);

    hideLoadingIndicator();
    isLoadingMore = false;
  } catch (error) {
    console.error('Load more error:', error);
    hideLoadingIndicator();
    isLoadingMore = false;
  }
}

function appendRows(rows) {
  if (!currentTbody) return;

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');

    // Row number (continue from current count)
    const tdRowNum = document.createElement('td');
    tdRowNum.className = 'row-number';
    tdRowNum.textContent = loadedRowCount + index + 1;
    tr.appendChild(tdRowNum);

    // Data cells
    row.forEach(cell => {
      const td = document.createElement('td');
      if (cell === null || cell === undefined) {
        td.textContent = '';
        td.style.color = '#999';
      } else if (typeof cell === 'number') {
        td.textContent = cell.toLocaleString();
        td.style.textAlign = 'right';
      } else {
        td.textContent = String(cell);
      }
      tr.appendChild(td);
    });
    currentTbody.appendChild(tr);
  });
}

let loadingIndicator = null;

function showLoadingIndicator() {
  if (!loadingIndicator) {
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'infinite-scroll-loading';
    loadingIndicator.innerHTML = `
      <div class="loading-spinner-small"></div>
      <span>Loading more rows...</span>
    `;
  }

  // Append to grid container
  if (!gridContainer.contains(loadingIndicator)) {
    gridContainer.appendChild(loadingIndicator);
  }
  loadingIndicator.style.display = 'flex';
}

function hideLoadingIndicator() {
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
}

function handleSortClick() {
  if (!currentColumns || currentColumns.length === 0) return;

  // Populate sort column dropdown
  sortColumn.innerHTML = '<option value="">Select column...</option>';
  currentColumns.forEach(col => {
    const option = document.createElement('option');
    option.value = col;
    option.textContent = col;
    sortColumn.appendChild(option);
  });

  showModal(sortDialog);
}

async function handleConfirmSort() {
  const column = sortColumn.value;
  if (!column) {
    alert('Please select a column to sort by');
    return;
  }

  const direction = document.querySelector('input[name="sort-direction"]:checked').value;
  const ascending = direction === 'asc';

  try {
    hideModal(sortDialog);
    showLoading('Sorting data...');

    await invoke('reorder_rows', {
      tableName: currentTable,
      sortColumns: [
        {
          column: column,
          ascending: ascending
        }
      ]
    });

    // Reload data
    showLoading('Reloading sorted data...');
    await loadTableData();
    statusText.textContent = `Sorted by ${column} (${ascending ? 'ascending' : 'descending'})`;

    hideLoading();
  } catch (error) {
    console.error('Sort error:', error);
    hideLoading();
    statusText.textContent = 'Sort failed';
    alert('Failed to sort data: ' + error);
  }
}

function showModal(modal) {
  modal.classList.add('show');
}

function hideModal(modal) {
  modal.classList.remove('show');
}

// ============================================
// Statistics Functions
// ============================================

function handleStatsDropdownClick(e) {
  e.preventDefault();
  const target = e.target.closest('a');
  if (!target) return;

  const action = target.dataset.action;

  if (action === 'all-stats') {
    handleAllStatistics();
  } else if (action === 'correlation') {
    handleFunctionSelect('correlation', 'CORRELATION');
  } else {
    handleFunctionSelect(action, action.toUpperCase());
  }
}

async function handleAllStatistics() {
  if (!currentTable) return;

  try {
    showLoading('Calculating statistics...');

    const stats = await invoke('get_table_statistics', {
      tableName: currentTable
    });

    displayStatistics(stats);
    showModal(statsDialog);
    hideLoading();
  } catch (error) {
    console.error('Statistics error:', error);
    hideLoading();
    alert('Failed to calculate statistics: ' + error);
  }
}

function handleFunctionSelect(funcType, displayName) {
  if (!currentTable || !currentColumns) return;

  currentFunction = funcType;
  functionDialogTitle.textContent = `Calculate ${displayName}`;

  // Reset UI
  functionResult.style.display = 'none';
  functionResultValue.textContent = '';

  // Populate column dropdown
  functionColumn.innerHTML = '<option value="">Select column...</option>';
  currentColumns.forEach(col => {
    const option = document.createElement('option');
    option.value = col;
    option.textContent = col;
    functionColumn.appendChild(option);
  });

  // Show/hide second column for correlation
  if (funcType === 'correlation') {
    functionColumn2Group.style.display = 'block';
    functionColumn2.innerHTML = '<option value="">Select column...</option>';
    currentColumns.forEach(col => {
      const option = document.createElement('option');
      option.value = col;
      option.textContent = col;
      functionColumn2.appendChild(option);
    });
  } else {
    functionColumn2Group.style.display = 'none';
  }

  showModal(functionDialog);
}

async function handleCalculateFunction() {
  const column = functionColumn.value;
  if (!column) {
    alert('Please select a column');
    return;
  }

  // Validate second column for correlation
  if (currentFunction === 'correlation') {
    const column2 = functionColumn2.value;
    if (!column2) {
      alert('Please select a second column for correlation');
      return;
    }
  }

  try {
    showLoading('Calculating...');

    let result;

    if (currentFunction === 'correlation') {
      const column2 = functionColumn2.value;
      result = await invoke('calculate_correlation', {
        tableName: currentTable,
        columnX: column,
        columnY: column2
      });
      functionResultValue.textContent = result.toFixed(4);
    } else {
      // Use aggregate_column for SUM, AVG, COUNT, MIN, MAX
      result = await invoke('aggregate_column', {
        tableName: currentTable,
        columnName: column,
        function: currentFunction.toUpperCase()
      });

      // Format the result
      if (typeof result.result === 'number') {
        functionResultValue.textContent = result.result.toLocaleString();
      } else {
        functionResultValue.textContent = JSON.stringify(result.result);
      }
    }

    functionResult.style.display = 'block';
    hideLoading();
  } catch (error) {
    console.error('Function calculation error:', error);
    hideLoading();
    alert('Failed to calculate: ' + error);
  }
}

function displayStatistics(stats) {
  const summary = `
    <div class="stats-summary">
      <div class="stat-card">
        <h3>Total Rows</h3>
        <div class="stat-value">${stats.total_rows.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <h3>Total Columns</h3>
        <div class="stat-value">${stats.total_columns}</div>
      </div>
    </div>
    <h3>Column Statistics</h3>
    <div style="overflow-x: auto;">
      <table class="stats-table">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th>Count</th>
            <th>Null</th>
            <th>Distinct</th>
            <th>Min</th>
            <th>Max</th>
            <th>Mean</th>
            <th>Median</th>
            <th>Std Dev</th>
            <th>Q25</th>
            <th>Q75</th>
          </tr>
        </thead>
        <tbody>
          ${stats.column_stats.map(col => `
            <tr>
              <td><strong>${col.column_name}</strong></td>
              <td>${col.data_type}</td>
              <td class="numeric">${col.count.toLocaleString()}</td>
              <td class="numeric">${col.null_count.toLocaleString()}</td>
              <td class="numeric">${col.distinct_count.toLocaleString()}</td>
              <td>${formatValue(col.min)}</td>
              <td>${formatValue(col.max)}</td>
              <td class="numeric">${formatNumber(col.mean)}</td>
              <td class="numeric">${formatNumber(col.median)}</td>
              <td class="numeric">${formatNumber(col.std_dev)}</td>
              <td class="numeric">${formatNumber(col.q25)}</td>
              <td class="numeric">${formatNumber(col.q75)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  statsContainer.innerHTML = summary;
}

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  if (typeof num === 'number') {
    return num.toFixed(2);
  }
  return String(num);
}

// ============================================
// Save/Save As Functions
// ============================================

async function handleSaveClick() {
  if (!currentTable || !selectedFilePath) {
    alert('No file loaded to save');
    return;
  }

  try {
    showLoading('Saving changes...');

    // Determine format based on file extension
    const extension = selectedFilePath.split('.').pop().toLowerCase();
    let result;

    if (extension === 'xlsx' || extension === 'xls' || extension === 'xlsm') {
      // Save as Excel
      result = await invoke('export_to_excel', {
        tableName: currentTable,
        filePath: selectedFilePath,
        sheetName: 'Data'
      });
    } else {
      // Save as CSV
      result = await invoke('export_to_csv', {
        tableName: currentTable,
        filePath: selectedFilePath,
        includeHeader: true
      });
    }

    hideLoading();
    statusText.textContent = `Saved ${result.rows_exported.toLocaleString()} rows to ${result.file_path}`;
    alert(`File saved successfully!\n${result.rows_exported.toLocaleString()} rows saved`);
  } catch (error) {
    console.error('Save error:', error);
    hideLoading();
    alert('Failed to save file: ' + error);
  }
}

async function handleSaveAsClick() {
  if (!currentTable) {
    alert('No data loaded to save');
    return;
  }

  try {
    // Open save dialog
    const filePath = await save({
      defaultPath: `${currentTable}.csv`,
      filters: [
        {
          name: 'CSV Files',
          extensions: ['csv']
        },
        {
          name: 'Excel Files',
          extensions: ['xlsx']
        }
      ]
    });

    if (!filePath) return; // User cancelled

    showLoading('Saving as new file...');

    // Determine format based on file extension
    const extension = filePath.split('.').pop().toLowerCase();
    let result;

    if (extension === 'xlsx' || extension === 'xls' || extension === 'xlsm') {
      // Save as Excel
      result = await invoke('export_to_excel', {
        tableName: currentTable,
        filePath: filePath,
        sheetName: 'Data'
      });
    } else {
      // Save as CSV
      result = await invoke('export_to_csv', {
        tableName: currentTable,
        filePath: filePath,
        includeHeader: true
      });
    }

    // Update the selected file path to the new location
    selectedFilePath = filePath;

    hideLoading();
    statusText.textContent = `Saved as: ${result.file_path}`;
    alert(`File saved successfully!\n${result.rows_exported.toLocaleString()} rows saved to ${result.file_path}`);
  } catch (error) {
    console.error('Save As error:', error);
    hideLoading();
    alert('Failed to save file: ' + error);
  }
}

// ============================================
// Export Functions
// ============================================

function handleExportClick() {
  if (!currentTable) return;
  showModal(exportDialog);
}

function handleExportFormatChange() {
  const isExcel = exportFormat.value === 'excel';
  excelOptions.style.display = isExcel ? 'block' : 'none';
}

async function handleConfirmExport() {
  const format = exportFormat.value;
  const includeHeaders = includeHeader.checked;

  try {
    // Open save dialog
    const filePath = await save({
      defaultPath: `${currentTable}.${format === 'excel' ? 'xlsx' : 'csv'}`,
      filters: [{
        name: format === 'excel' ? 'Excel Files' : 'CSV Files',
        extensions: [format === 'excel' ? 'xlsx' : 'csv']
      }]
    });

    if (!filePath) return; // User cancelled

    hideModal(exportDialog);
    showLoading('Exporting data...');

    let result;
    if (format === 'excel') {
      result = await invoke('export_to_excel', {
        tableName: currentTable,
        filePath: filePath,
        sheetName: sheetName.value || 'Data'
      });
    } else {
      result = await invoke('export_to_csv', {
        tableName: currentTable,
        filePath: filePath,
        includeHeader: includeHeaders
      });
    }

    hideLoading();
    statusText.textContent = result.message;
    alert(`Export successful!\n${result.rows_exported.toLocaleString()} rows exported to ${result.file_path}`);
  } catch (error) {
    console.error('Export error:', error);
    hideLoading();
    alert('Failed to export data: ' + error);
  }
}

// ============================================
// Filter Functions
// ============================================

function handleFilterClick() {
  if (!currentTable || !currentColumns) return;

  // Initialize with one empty filter rule
  filterRules = [];
  renderFilterRules();
  showModal(filterDialog);
}

function handleAddFilterRule() {
  const rule = {
    column: currentColumns[0] || '',
    operator: '=',
    value: ''
  };
  filterRules.push(rule);
  renderFilterRules();
}

function handleClearFilters() {
  filterRules = [];
  renderFilterRules();
}

function renderFilterRules() {
  if (filterRules.length === 0) {
    filterRulesContainer.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No filter rules. Click "Add Filter Rule" to get started.</p>';
    return;
  }

  filterRulesContainer.innerHTML = filterRules.map((rule, index) => `
    <div class="filter-rule" data-index="${index}">
      <select class="form-control filter-column" data-index="${index}">
        ${currentColumns.map(col => `
          <option value="${col}" ${rule.column === col ? 'selected' : ''}>${col}</option>
        `).join('')}
      </select>

      <select class="form-control filter-operator" data-index="${index}">
        <option value="=" ${rule.operator === '=' ? 'selected' : ''}>=</option>
        <option value="!=" ${rule.operator === '!=' ? 'selected' : ''}>!=</option>
        <option value=">" ${rule.operator === '>' ? 'selected' : ''}>&gt;</option>
        <option value="<" ${rule.operator === '<' ? 'selected' : ''}>&lt;</option>
        <option value=">=" ${rule.operator === '>=' ? 'selected' : ''}>&gt;=</option>
        <option value="<=" ${rule.operator === '<=' ? 'selected' : ''}>&lt;=</option>
        <option value="LIKE" ${rule.operator === 'LIKE' ? 'selected' : ''}>LIKE</option>
      </select>

      <input type="text" class="form-control filter-value" data-index="${index}"
             value="${rule.value}" placeholder="Value" />

      <button class="btn filter-rule-remove" data-index="${index}">Remove</button>
    </div>
  `).join('');

  // Add event listeners
  document.querySelectorAll('.filter-column').forEach(el => {
    el.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      filterRules[index].column = e.target.value;
    });
  });

  document.querySelectorAll('.filter-operator').forEach(el => {
    el.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      filterRules[index].operator = e.target.value;
    });
  });

  document.querySelectorAll('.filter-value').forEach(el => {
    el.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      filterRules[index].value = e.target.value;
    });
  });

  document.querySelectorAll('.filter-rule-remove').forEach(el => {
    el.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      filterRules.splice(index, 1);
      renderFilterRules();
    });
  });
}

async function handleApplyFilter() {
  if (filterRules.length === 0) {
    alert('Please add at least one filter rule');
    return;
  }

  // Validate all rules have values
  const invalidRule = filterRules.find(rule => !rule.value.trim());
  if (invalidRule) {
    alert('All filter rules must have a value');
    return;
  }

  try {
    hideModal(filterDialog);
    showLoading('Applying filters...');

    // Store original table if not already stored
    if (!originalTable) {
      originalTable = currentTable;
    }

    // Convert filter rules to backend format
    const conditions = filterRules.map(rule => ({
      column: rule.column,
      operator: rule.operator,
      value: parseFilterValue(rule.value)
    }));

    // Create filtered view
    const filteredViewName = `${originalTable}_filtered`;
    await invoke('create_filtered_view', {
      sourceTable: originalTable,
      viewName: filteredViewName,
      conditions: conditions
    });

    // Switch to filtered view
    currentTable = filteredViewName;
    isFiltered = true;
    resetBtn.disabled = false;

    // Reload data with virtual scrolling
    await loadTableData();

    statusText.textContent = `Filtered: ${totalRows.toLocaleString()} of ${originalRowCount.toLocaleString()} rows (${filterRules.length} filter(s))`;

    hideLoading();
  } catch (error) {
    console.error('Filter error:', error);
    hideLoading();
    alert('Failed to apply filters: ' + error);
  }
}

function parseFilterValue(value) {
  // Try to parse as number
  const num = parseFloat(value);
  if (!isNaN(num) && value.trim() === num.toString()) {
    return num;
  }

  // Try to parse as boolean
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // Return as string
  return value;
}

// ============================================
// Reset/Back Functionality
// ============================================

async function handleResetClick() {
  if (!currentTable) return;

  try {
    showLoading('Resetting to original dataset...');

    // Clear filter state
    isFiltered = false;
    filterRules = [];

    // Restore original table
    if (originalTable) {
      currentTable = originalTable;
      originalTable = null; // Reset for next filter operation
    }

    // Reload original data
    await loadTableData();

    // Disable reset button
    resetBtn.disabled = true;

    statusText.textContent = `Showing original dataset: ${originalRowCount.toLocaleString()} rows`;
    hideLoading();
  } catch (error) {
    console.error('Reset error:', error);
    hideLoading();
    alert('Failed to reset data: ' + error);
  }
}
