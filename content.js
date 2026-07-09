// Snippy Content Script for selection overlay

(function() {
  // Prevent duplicate declaration errors if injected multiple times
  if (window.snippyInjected) {
    return;
  }
  window.snippyInjected = true;

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ status: 'pong' });
      return true;
    }
    
    if (message.action === 'start_selection') {
      initiateSelection(message.dataUrl);
      sendResponse({ status: 'started' });
      return true;
    }
  });

  let overlayContainer = null;
  let canvas = null;
  let ctx = null;
  let bgImage = null;
  let originalOverflow = '';
  let cleanupTimeoutId = null;
  let pendingContainerToRemove = null;
  let currentSessionId = 0;
  
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  function initiateSelection(dataUrl) {
    // If an overlay already exists, clean it up first
    cleanup();

    // Increment session ID to identify this specific loading attempt
    currentSessionId++;
    const sessionId = currentSessionId;

    // Prevent body scrolling
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Load background image first
    bgImage = new Image();
    const loadingImage = bgImage;
    loadingImage.onload = () => {
      if (sessionId !== currentSessionId) return;
      createOverlayElements();
      drawInitialState();
    };
    loadingImage.src = dataUrl;
  }

  function createOverlayElements() {
    // Create elements
    overlayContainer = document.createElement('div');
    overlayContainer.className = 'snippy-overlay-container';

    canvas = document.createElement('canvas');
    canvas.className = 'snippy-canvas';
    overlayContainer.appendChild(canvas);

    // Instruction banner
    const banner = document.createElement('div');
    banner.className = 'snippy-banner';
    banner.innerHTML = `
      <span class="snippy-banner-icon"></span>
      <span class="snippy-banner-text">Drag to select area</span>
      <span class="snippy-banner-shortcut">ESC to cancel</span>
    `;
    overlayContainer.appendChild(banner);

    // Append to body
    document.body.appendChild(overlayContainer);

    // Setup canvas dimension with devicePixelRatio for high-DPI displays (Retina)
    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    // Set transition delay and show
    requestAnimationFrame(() => {
      overlayContainer.classList.add('active');
      banner.classList.add('show');
    });

    // Attach event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
  }

  function drawInitialState() {
    if (!ctx || !bgImage) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Clear and draw captured screenshot full screen
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bgImage, 0, 0, width, height);

    // Draw dark semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, width, height);
  }

  function drawSelection() {
    if (!ctx || !bgImage) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Redraw screen & dark overlay
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bgImage, 0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, width, height);

    // Calculate dimensions of selection box
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    const ratio = window.devicePixelRatio || 1;

    if (w > 0 && h > 0) {
      // Cut out: Draw the un-dimmed screenshot inside the selection
      ctx.drawImage(bgImage, x * ratio, y * ratio, w * ratio, h * ratio, x, y, w, h);

      // Draw dashed stroke
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]); // Reset dashed lines

      // Draw secondary solid border for crisp visibility on light/dark backgrounds
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);

      // Size dimension label badge
      const labelText = `${Math.round(w)} × ${Math.round(h)} px`;
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      
      // Position label below the box, or inside if near viewport bottom
      let labelY = y + h + 8;
      if (labelY + 22 > height) {
        labelY = y - 26;
        if (labelY < 4) labelY = y + 8; // Fallback to inner top
      }
      let labelX = x + w / 2 - textWidth / 2 - 8;
      if (labelX < 8) labelX = 8;
      if (labelX + textWidth + 16 > width) labelX = width - textWidth - 24;

      // Draw background label badge
      ctx.fillStyle = 'rgba(24, 24, 27, 0.9)';
      ctx.beginPath();
      // Draw rounded rect
      const rx = labelX;
      const ry = labelY;
      const rw = textWidth + 16;
      const rh = 20;
      const radius = 6;
      ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, radius) : ctx.rect(rx, ry, rw, rh);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, labelX + 8, labelY + 10);
    }
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return; // Only trigger for left clicks
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    currentX = e.clientX;
    currentY = e.clientY;
    drawSelection();
  }

  function handleMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    // Minimal selection threshold (10px) to prevent accidental clicks
    if (w > 10 && h > 10) {
      cropAndSubmit();
    } else {
      drawInitialState(); // Reset if clicked instead of dragged
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  function cropAndSubmit() {
    if (!bgImage) return;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    const ratio = window.devicePixelRatio || 1;
    
    // Create an offscreen canvas in physical dimensions to crop with maximum clarity
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w * ratio;
    cropCanvas.height = h * ratio;

    const cropCtx = cropCanvas.getContext('2d');
    
    // Source rect from original raw resolution image (which has ratio baked in if taken with captureVisibleTab)
    // Note: captureVisibleTab is captures at window size * devicePixelRatio.
    // Thus, the bgImage natural size is window.innerWidth * ratio.
    cropCtx.drawImage(
      bgImage, 
      x * ratio, y * ratio, w * ratio, h * ratio, // source rect
      0, 0, w * ratio, h * ratio                  // dest rect
    );

    const croppedDataUrl = cropCanvas.toDataURL('image/png');

    // Clean up interface before navigating away
    cleanup();

    // Send the cropped image URL to background script
    chrome.runtime.sendMessage({
      action: 'capture_completed',
      dataUrl: croppedDataUrl
    });
  }

  function cleanup() {
    // Invalidate any active or pending selection sessions
    currentSessionId++;

    // Restore scrolling
    if (originalOverflow !== undefined) {
      document.body.style.overflow = originalOverflow;
    }

    // Remove event listeners
    if (canvas) {
      canvas.removeEventListener('mousedown', handleMouseDown);
    }
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('keydown', handleKeyDown);

    // If there is a pending fade-out, cancel it and remove the container immediately
    if (cleanupTimeoutId) {
      clearTimeout(cleanupTimeoutId);
      cleanupTimeoutId = null;
      if (pendingContainerToRemove && pendingContainerToRemove.parentNode) {
        pendingContainerToRemove.parentNode.removeChild(pendingContainerToRemove);
      }
      pendingContainerToRemove = null;
    }

    // Remove elements from DOM
    if (overlayContainer) {
      pendingContainerToRemove = overlayContainer;
      pendingContainerToRemove.classList.remove('active');
      
      // Null out current session globals immediately, so they cannot be closed over
      // and mutated or deleted by an old timer when a new session starts.
      overlayContainer = null;
      canvas = null;
      ctx = null;
      bgImage = null;

      cleanupTimeoutId = setTimeout(() => {
        cleanupTimeoutId = null;
        if (pendingContainerToRemove && pendingContainerToRemove.parentNode) {
          pendingContainerToRemove.parentNode.removeChild(pendingContainerToRemove);
        }
        pendingContainerToRemove = null;
      }, 200); // Wait for transition fade out
    }
  }

  // Self-announcement for background.js checking
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({ status: 'pong' });
      return true;
    }
  });

})();
