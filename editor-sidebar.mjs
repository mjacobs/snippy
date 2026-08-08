// Drag-to-resize for the right-hand properties sidebar, with the chosen
// width remembered across sessions. Self-contained: it touches nothing but
// its own two elements and one storage key.

const MIN_WIDTH = 240;
const MAX_WIDTH = 600;
const STORAGE_KEY = 'sidebarWidth';

export function initSidebarResize(storage) {
  const resizeHandle = document.getElementById('sidebar-resize-handle');
  const rightSidebar = document.querySelector('.right-properties');

  if (!rightSidebar) return;

  // Load and apply saved sidebar width. This only needs the sidebar itself,
  // so it still runs even if the resize handle (checked separately below)
  // is missing.
  storage.get([STORAGE_KEY], (result) => {
    if (result && result[STORAGE_KEY]) {
      const savedWidth = parseInt(result[STORAGE_KEY], 10);
      if (savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) {
        rightSidebar.style.width = `${savedWidth}px`;
      }
    }
  });

  if (!resizeHandle) return;

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();

    resizeHandle.classList.add('active');
    document.body.style.cursor = 'col-resize';

    const dragStartX = e.clientX;
    const startWidth = rightSidebar.getBoundingClientRect().width;

    function onMouseMove(moveEvent) {
      const deltaX = moveEvent.clientX - dragStartX;
      // Since the sidebar is on the right, dragging left (negative deltaX) makes it wider.
      let newWidth = startWidth - deltaX;

      // Apply boundary constraints
      if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
      if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

      rightSidebar.style.width = `${newWidth}px`;
    }

    function onMouseUp() {
      resizeHandle.classList.remove('active');
      document.body.style.cursor = '';

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      // Persist the custom sidebar width in local storage
      const currentWidth = rightSidebar.getBoundingClientRect().width;
      storage.set({ [STORAGE_KEY]: currentWidth });
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}
