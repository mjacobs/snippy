// Snippy Image Editor

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const canvas = document.getElementById('editor-canvas');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const imgDimensions = document.getElementById('image-dimensions');
  
  // Action buttons
  const btnUndo = document.getElementById('btn-undo');
  const btnClear = document.getElementById('btn-clear');
  const btnCopy = document.getElementById('btn-copy');
  const btnSave = document.getElementById('btn-save');
  
  // Tool buttons
  const toolButtons = document.querySelectorAll('.tool-btn');
  
  // Property panels
  const propColor = document.getElementById('prop-color');
  const propStroke = document.getElementById('prop-stroke');
  const propFill = document.getElementById('prop-fill');
  const propFont = document.getElementById('prop-font');
  
  // Property controls
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const strokeButtons = document.querySelectorAll('.stroke-btn');
  const fillCheckbox = document.getElementById('fill-checkbox');
  const fontSizeButtons = document.querySelectorAll('.font-size-btn');
  
  // Toast
  const toast = document.getElementById('toast');
  const toastMessage = toast.querySelector('.toast-message');

  // Canvas context
  const ctx = canvas.getContext('2d');
  
  // Editor State
  let bgImage = null;
  let shapes = [];
  let clearedShapesBackup = null; // Backup to undo a Clear action
  
  let activeTool = 'select'; // select, pen, arrow, rect, highlighter, blur, text
  let activeColor = '#ff3b30'; // Red default
  let activeLineWidth = 3; // Thin
  let activeFontSize = 24; // Medium
  let activeFill = false;
  
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let currentShape = null;
  let activeTextarea = null;

  // 1. Load active screenshot from storage
  try {
    const data = await chrome.storage.local.get('activeScreenshot');
    if (data && data.activeScreenshot) {
      bgImage = new Image();
      bgImage.onload = () => {
        setupCanvas();
      };
      bgImage.src = data.activeScreenshot;
    } else {
      showToast('No screenshot found. Draw a crop box on a webpage first!');
    }
  } catch (err) {
    console.error('Failed to load active screenshot:', err);
    showToast('Error loading screenshot.');
  }

  // Set up Canvas dimensions
  function setupCanvas() {
    if (!bgImage) return;
    
    // Set backing resolution to match the image exactly
    canvas.width = bgImage.naturalWidth;
    canvas.height = bgImage.naturalHeight;
    
    // Update header info tag
    imgDimensions.textContent = `${bgImage.naturalWidth} × ${bgImage.naturalHeight} px`;
    
    // Render initial view
    drawEverything();
  }

  // Draw background image and all shapes
  function drawEverything() {
    if (!ctx || !bgImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background screenshot
    ctx.drawImage(bgImage, 0, 0);

    // Draw all shapes in history
    for (const shape of shapes) {
      drawShape(shape);
    }
  }

  // Helper to draw a single shape
  function drawShape(shape) {
    ctx.save();
    
    if (shape.type === 'pen') {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
    } 
    else if (shape.type === 'highlighter') {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 18; // Fixed thick highlighter brush
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.45; // Transparent overlay
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
    } 
    else if (shape.type === 'rect') {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
      ctx.lineJoin = 'round';
      
      const rx = Math.min(shape.x1, shape.x2);
      const ry = Math.min(shape.y1, shape.y2);
      const rw = Math.abs(shape.x2 - shape.x1);
      const rh = Math.abs(shape.y2 - shape.y1);
      
      if (shape.isFilled) {
        ctx.globalAlpha = 0.4; // Semi-transparent fills look ultra-premium
        ctx.fillRect(rx, ry, rw, rh);
        ctx.globalAlpha = 1.0;
        ctx.strokeRect(rx, ry, rw, rh);
      } else {
        ctx.strokeRect(rx, ry, rw, rh);
      }
    } 
    else if (shape.type === 'arrow') {
      drawArrow(shape.x1, shape.y1, shape.x2, shape.y2, shape.color, shape.lineWidth);
    } 
    else if (shape.type === 'blur') {
      const bx = Math.min(shape.x1, shape.x2);
      const by = Math.min(shape.y1, shape.y2);
      const bw = Math.abs(shape.x2 - shape.x1);
      const bh = Math.abs(shape.y2 - shape.y1);
      
      if (bw > 2 && bh > 2) {
        // Draw pixelated background region
        const pixelSize = 10;
        const sw = Math.ceil(bw / pixelSize);
        const sh = Math.ceil(bh / pixelSize);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw slice of original screenshot
        tempCtx.drawImage(bgImage, bx, by, bw, bh, 0, 0, sw, sh);
        
        // Scale it up blocky
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, sw, sh, bx, by, bw, bh);
        ctx.imageSmoothingEnabled = true;
        
        // Nice subtle border around blurred area
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      }
    } 
    else if (shape.type === 'text') {
      ctx.fillStyle = shape.color;
      ctx.font = `bold ${shape.fontSize}px 'Inter', -apple-system, sans-serif`;
      ctx.textBaseline = 'top';
      
      const lines = shape.text.split('\n');
      let textY = shape.y1;
      
      for (const line of lines) {
        // Drop shadow for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(line, shape.x1 + 1.5, textY + 1.5);
        
        ctx.fillStyle = shape.color;
        ctx.fillText(line, shape.x1, textY);
        textY += shape.fontSize * 1.25;
      }
    }
    
    ctx.restore();
  }

  // Draw a crisp arrow with calculated directional headers
  function drawArrow(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw main arrow line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Directional trigonometry for arrow-head sides
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = Math.max(12, width * 3.5); // Proportional arrowhead size

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6), 
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6), 
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  // Convert client viewport mouse position to canvas resolution backing-store coords
  function getBackingCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  // Convert canvas resolution backing-store coords back to client display scale coords
  function getClientCoords(backingX, backingY) {
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + backingX * (rect.width / canvas.width);
    const y = rect.top + backingY * (rect.height / canvas.height);
    return { x, y };
  }

  // ==========================================
  // Mouse Event Handlers on Canvas
  // ==========================================
  
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    if (!bgImage) return;

    // Close any active textarea first if user clicked elsewhere
    if (activeTextarea) {
      commitActiveText();
      return;
    }

    if (activeTool === 'select') {
      return; // Do nothing for select tool in simple version
    }

    const coords = getBackingCoords(e.clientX, e.clientY);
    startX = coords.x;
    startY = coords.y;
    currentX = coords.x;
    currentY = coords.y;

    if (activeTool === 'text') {
      createTextarea(e.clientX, e.clientY, coords.x, coords.y);
      return;
    }

    isDrawing = true;

    // Initialize shapes
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      currentShape = {
        type: activeTool,
        color: activeColor,
        lineWidth: activeLineWidth,
        points: [{ x: startX, y: startY }]
      };
    } 
    else if (activeTool === 'rect') {
      currentShape = {
        type: 'rect',
        color: activeColor,
        lineWidth: activeLineWidth,
        x1: startX,
        y1: startY,
        x2: startX,
        y2: startY,
        isFilled: activeFill
      };
    } 
    else if (activeTool === 'arrow') {
      currentShape = {
        type: 'arrow',
        color: activeColor,
        lineWidth: activeLineWidth,
        x1: startX,
        y1: startY,
        x2: startX,
        y2: startY
      };
    } 
    else if (activeTool === 'blur') {
      currentShape = {
        type: 'blur',
        x1: startX,
        y1: startY,
        x2: startX,
        y2: startY
      };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDrawing || !currentShape) return;

    const coords = getBackingCoords(e.clientX, e.clientY);
    currentX = coords.x;
    currentY = coords.y;

    if (currentShape.type === 'pen' || currentShape.type === 'highlighter') {
      currentShape.points.push({ x: currentX, y: currentY });
    } else {
      currentShape.x2 = currentX;
      currentShape.y2 = currentY;
    }

    // Live preview
    drawEverything();
    drawShape(currentShape);
  });

  window.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    if (!currentShape) return;

    const coords = getBackingCoords(e.clientX, e.clientY);
    currentX = coords.x;
    currentY = coords.y;

    if (currentShape.type === 'pen' || currentShape.type === 'highlighter') {
      currentShape.points.push({ x: currentX, y: currentY });
    } else {
      currentShape.x2 = currentX;
      currentShape.y2 = currentY;
    }

    // Verify size / validity threshold to discard click mistakes
    let isValid = false;
    if (currentShape.type === 'pen' || currentShape.type === 'highlighter') {
      isValid = currentShape.points.length > 2;
    } else {
      const distance = Math.sqrt(
        Math.pow(currentShape.x2 - currentShape.x1, 2) + 
        Math.pow(currentShape.y2 - currentShape.y1, 2)
      );
      isValid = distance > 4; // At least 4px dragging vector
    }

    if (isValid) {
      shapes.push(currentShape);
      clearedShapesBackup = null; // Discard clear backup once a new shape is drawn
      updateUndoButton();
    }

    currentShape = null;
    drawEverything();
  });

  // ==========================================
  // In-place Text Editing Layer
  // ==========================================

  function createTextarea(clientX, clientY, backingX, backingY) {
    if (activeTextarea) return;

    // Create standard textarea
    const ta = document.createElement('textarea');
    ta.className = 'canvas-text-input';
    
    // Position text area beautifully on top of wrapper
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const relativeX = clientX - wrapperRect.left;
    const relativeY = clientY - wrapperRect.top;

    ta.style.left = `${relativeX}px`;
    ta.style.top = `${relativeY}px`;
    ta.style.color = activeColor;
    
    // Match display size scale
    const displayFontScale = activeFontSize * (wrapperRect.width / canvas.width);
    ta.style.fontSize = `${displayFontScale}px`;
    ta.style.height = `${displayFontScale * 1.5}px`;

    canvasWrapper.appendChild(ta);
    ta.focus();

    activeTextarea = {
      element: ta,
      backingX: backingX,
      backingY: backingY
    };

    // Auto-expand typing height
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    });

    // Special shortcuts for committing or canceling text
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitActiveText();
      } else if (e.key === 'Escape') {
        cancelActiveText();
      }
    });
  }

  function commitActiveText() {
    if (!activeTextarea) return;

    const value = activeTextarea.element.value.trim();
    if (value) {
      shapes.push({
        type: 'text',
        color: activeColor,
        fontSize: activeFontSize,
        text: value,
        x1: activeTextarea.backingX,
        y1: activeTextarea.backingY
      });
      clearedShapesBackup = null;
      updateUndoButton();
    }

    cleanupTextarea();
    drawEverything();
  }

  function cancelActiveText() {
    cleanupTextarea();
    drawEverything();
  }

  function cleanupTextarea() {
    if (activeTextarea) {
      if (activeTextarea.element.parentNode) {
        activeTextarea.element.parentNode.removeChild(activeTextarea.element);
      }
      activeTextarea = null;
    }
  }

  // ==========================================
  // Tool & Property Selection Actions
  // ==========================================

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Commit pending text first if changing tools
      if (activeTextarea) {
        commitActiveText();
      }

      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      activeTool = btn.dataset.tool;
      updatePropertyPanelsVisibility();
    });
  });

  // Dynamic UI feedback based on the chosen tool
  function updatePropertyPanelsVisibility() {
    // Hidden controls by default
    propColor.classList.remove('hidden');
    propStroke.classList.remove('hidden');
    propFill.classList.add('hidden');
    propFont.classList.add('hidden');

    if (activeTool === 'select') {
      propColor.classList.add('hidden');
      propStroke.classList.add('hidden');
    } 
    else if (activeTool === 'blur') {
      propColor.classList.add('hidden');
      propStroke.classList.add('hidden');
    } 
    else if (activeTool === 'rect') {
      propFill.classList.remove('hidden');
    } 
    else if (activeTool === 'highlighter') {
      propStroke.classList.add('hidden'); // highlighter is fixed width
    } 
    else if (activeTool === 'text') {
      propStroke.classList.add('hidden');
      propFont.classList.remove('hidden');
    }
  }

  // Color selection swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      activeColor = swatch.dataset.color;
      
      // Real-time update to active editing text
      if (activeTextarea) {
        activeTextarea.element.style.color = activeColor;
      }
    });
  });

  // Stroke line width options
  strokeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      strokeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLineWidth = parseInt(btn.dataset.width, 10);
    });
  });

  // Font size options
  fontSizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      fontSizeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFontSize = parseInt(btn.dataset.size, 10);

      // Real-time update to active editing text display scale
      if (activeTextarea) {
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        const displayFontScale = activeFontSize * (wrapperRect.width / canvas.width);
        activeTextarea.element.style.fontSize = `${displayFontScale}px`;
      }
    });
  });

  // Toggle solid fills
  fillCheckbox.addEventListener('change', (e) => {
    activeFill = e.target.checked;
  });

  // ==========================================
  // Action Buttons: Undo, Clear, Save, Copy
  // ==========================================

  function updateUndoButton() {
    btnUndo.disabled = (shapes.length === 0 && clearedShapesBackup === null);
  }

  // Undo last action (or restore after a complete clear)
  btnUndo.addEventListener('click', () => {
    if (activeTextarea) {
      cancelActiveText();
      return;
    }

    if (shapes.length === 0 && clearedShapesBackup !== null) {
      // Undo a Clear action: Restore all backup shapes
      shapes = [...clearedShapesBackup];
      clearedShapesBackup = null;
      showToast('All annotations restored!');
    } else if (shapes.length > 0) {
      // Normal Undo: Remove last drawn shape
      shapes.pop();
    }

    updateUndoButton();
    drawEverything();
  });

  // Clear all annotations instantly
  btnClear.addEventListener('click', () => {
    if (shapes.length === 0) return;
    
    // Backup for immediate Undo rescue
    clearedShapesBackup = [...shapes];
    shapes = [];
    
    updateUndoButton();
    drawEverything();
    showToast('Annotations cleared. Press Undo to restore.');
  });

  // Copy to Clipboard (Modern Async API)
  btnCopy.addEventListener('click', () => {
    if (activeTextarea) commitActiveText();
    
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('Failed to copy. Draw a selection first!');
        return;
      }
      
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item]);
        showToast('Annotated image copied to clipboard!');
      } catch (err) {
        console.error('Clipboard write failed:', err);
        showToast('Deselect browser permissions blocked clipboard copy.');
      }
    }, 'image/png');
  });

  // Download JPEG format
  btnSave.addEventListener('click', () => {
    if (activeTextarea) commitActiveText();
    if (!canvas.width || !canvas.height) return;

    // Create an offscreen canvas to paint solid white backdrop under JPEG to preserve transparency clean
    const downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = canvas.width;
    downloadCanvas.height = canvas.height;
    
    const downloadCtx = downloadCanvas.getContext('2d');
    
    // Fill pure white backdrop
    downloadCtx.fillStyle = '#ffffff';
    downloadCtx.fillRect(0, 0, downloadCanvas.width, downloadCanvas.height);
    
    // Composite edited canvas image
    downloadCtx.drawImage(canvas, 0, 0);

    try {
      const jpegUrl = downloadCanvas.toDataURL('image/jpeg', 0.95); // High quality compression
      const link = document.createElement('a');
      link.download = `snippy_${Date.now()}.jpg`;
      link.href = jpegUrl;
      link.click();
      showToast('JPEG saved successfully!');
    } catch (err) {
      console.error('JPEG download failed:', err);
      showToast('Failed to export JPEG.');
    }
  });

  // ==========================================
  // Helper Utility: Elegant Toast Notification
  // ==========================================
  
  let toastTimeout = null;
  function showToast(message) {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // ==========================================
  // Keyboard Shortcuts
  // ==========================================
  
  window.addEventListener('keydown', (e) => {
    // If typing in textarea, don't trigger shortcuts
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      btnUndo.click();
    } 
    else if (ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      btnCopy.click();
    } 
    else if (ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      btnSave.click();
    } 
    else if (e.key === 'Escape') {
      // Clear active tool to select mode
      toolButtons[0].click(); // Click standard select tool
    }
  });

});
