// Snippy background service worker

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  
  // Guard against restricted pages
  if (tab.url && (
    tab.url.startsWith('chrome://') || 
    tab.url.startsWith('chrome-extension://') || 
    tab.url.startsWith('https://chrome.google.com/webstore') ||
    tab.url.startsWith('view-source:')
  )) {
    console.warn("Snippy cannot be run on Chrome internal or store pages.");
    // Programmatic feedback is nice, but alert() is not available in SW.
    // We can show a badge text update or try injecting a fallback if allowed,
    // but on these pages, injection is strictly forbidden anyway.
    return;
  }

  try {
    // 1. Capture the visible area of the active tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    
    // 2. Check if the content script is already injected
    let injected = false;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      if (response && response.status === 'pong') {
        injected = true;
      }
    } catch (e) {
      // Message failed, content script is not injected yet
    }

    // 3. Inject if not already present
    if (!injected) {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }

    // 4. Send message to start the selection overlay
    await chrome.tabs.sendMessage(tab.id, {
      action: 'start_selection',
      dataUrl: dataUrl
    });
    
  } catch (err) {
    console.error('Snippy background capture failed:', err);
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture_completed') {
    (async () => {
      try {
        // Store the cropped image in local storage
        await chrome.storage.local.set({ 
          activeScreenshot: message.dataUrl,
          screenshotTimestamp: Date.now()
        });
        
        // Open the editor in a new tab
        await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
        
        sendResponse({ status: 'success' });
      } catch (err) {
        console.error('Failed to store screenshot or open editor:', err);
        sendResponse({ status: 'error', error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
