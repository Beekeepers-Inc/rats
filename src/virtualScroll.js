// Virtual Scrolling Implementation for Large Datasets
// Handles efficient rendering of millions of rows
// Uses scaling factor to overcome browser's ~33.5M pixel height limit

export class VirtualScroller {
  constructor(options) {
    this.container = options.container;
    this.rowHeight = options.rowHeight || 32;
    this.bufferSize = options.bufferSize || 10; // Extra rows to render above/below viewport
    this.onRenderRows = options.onRenderRows; // Callback to render rows
    this.totalRows = options.totalRows || 0;

    // Browser max height is ~33,554,432px (2^25)
    // Calculate scale factor to keep spacer height under this limit
    const MAX_SCROLL_HEIGHT = 33000000; // Safe limit
    const fullHeight = this.totalRows * this.rowHeight;
    this.scaleFactor = fullHeight > MAX_SCROLL_HEIGHT
      ? fullHeight / MAX_SCROLL_HEIGHT
      : 1;

    console.log(`Virtual scroller: ${this.totalRows} rows, scale factor: ${this.scaleFactor.toFixed(2)}`);

    this.scrollTop = 0;
    this.viewportHeight = 0;
    this.startIndex = 0;
    this.endIndex = 0;

    this.setupScrolling();
  }

  setupScrolling() {
    // Create virtual scroll structure
    this.viewport = document.createElement('div');
    this.viewport.style.cssText = `
      overflow: auto;
      height: 100%;
      width: 100%;
      position: relative;
    `;

    // Use scaled height to stay within browser limits
    const scaledHeight = (this.totalRows * this.rowHeight) / this.scaleFactor;
    this.spacer = document.createElement('div');
    this.spacer.style.cssText = `
      height: ${scaledHeight}px;
      width: 1px;
      position: absolute;
      top: 0;
      left: 0;
    `;

    this.content = document.createElement('div');
    this.content.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
    `;

    this.viewport.appendChild(this.spacer);
    this.viewport.appendChild(this.content);

    // Add scroll listener
    this.viewport.addEventListener('scroll', () => this.handleScroll());

    // Mount to container
    this.container.innerHTML = '';
    this.container.appendChild(this.viewport);

    // Initial render
    this.viewportHeight = this.viewport.clientHeight;
    this.handleScroll();
  }

  handleScroll() {
    this.scrollTop = this.viewport.scrollTop;

    // Apply scale factor to calculate actual row position
    const actualScrollTop = this.scrollTop * this.scaleFactor;
    const actualViewportHeight = this.viewportHeight * this.scaleFactor;

    // Calculate visible range based on scaled positions
    const visibleStart = Math.floor(actualScrollTop / this.rowHeight);
    const visibleEnd = Math.ceil((actualScrollTop + actualViewportHeight) / this.rowHeight);

    // Add buffer
    this.startIndex = Math.max(0, visibleStart - this.bufferSize);
    this.endIndex = Math.min(this.totalRows, visibleEnd + this.bufferSize);

    // Request render
    if (this.onRenderRows) {
      this.renderRows();
    }
  }

  async renderRows() {
    const rowCount = this.endIndex - this.startIndex;

    if (rowCount <= 0) return;

    // Get rows from callback
    const rows = await this.onRenderRows(this.startIndex, rowCount);

    // Position content (scaled position)
    const scaledPosition = (this.startIndex * this.rowHeight) / this.scaleFactor;
    this.content.style.transform = `translateY(${scaledPosition}px)`;

    // Update content
    this.content.innerHTML = rows;
  }

  updateTotalRows(count) {
    this.totalRows = count;

    // Recalculate scale factor
    const MAX_SCROLL_HEIGHT = 33000000;
    const fullHeight = this.totalRows * this.rowHeight;
    this.scaleFactor = fullHeight > MAX_SCROLL_HEIGHT
      ? fullHeight / MAX_SCROLL_HEIGHT
      : 1;

    // Update spacer with scaled height
    const scaledHeight = fullHeight / this.scaleFactor;
    this.spacer.style.height = `${scaledHeight}px`;

    this.handleScroll();
  }

  scrollToRow(index) {
    // Convert row index to scaled scroll position
    const actualPosition = index * this.rowHeight;
    const scaledPosition = actualPosition / this.scaleFactor;
    this.viewport.scrollTop = scaledPosition;
  }

  destroy() {
    if (this.viewport && this.viewport.parentNode) {
      this.viewport.removeEventListener('scroll', this.handleScroll);
      this.viewport.parentNode.removeChild(this.viewport);
    }
  }
}
