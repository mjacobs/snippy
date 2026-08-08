// The AI Lens side panel: provider setup (Gemini AI Studio or Vertex AI),
// credential storage, and running a prompt against the current canvas.
// Request/response shaping is in ai-lens-api.mjs; this module is the DOM and
// chrome.storage half of it.

import {
  analyzingLabel,
  buildGeminiEndpoint,
  buildGeminiPayload,
  extractErrorMessage,
  extractResponseText,
  promptForPresetAction,
  providerLabel
} from './ai-lens-api.mjs';

const CONFIG_KEYS = [
  'geminiProvider',
  'geminiApiKey',
  'geminiProjectId',
  'geminiRegion',
  'geminiModelId'
];

export function createAiLens({ canvas, state, showToast, commitActiveText }) {
  const toolAiLens = document.getElementById('tool-ai-lens');
  const aiLockedState = document.getElementById('ai-locked-state');
  const btnUnlockAi = document.getElementById('btn-unlock-ai');
  const btnCloseSetup = document.getElementById('btn-close-setup');
  const aiSetupContainer = document.getElementById('ai-setup-container');
  const aiActiveContainer = document.getElementById('ai-active-container');
  const aiKeyInput = document.getElementById('ai-key-input');
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnResetKey = document.getElementById('btn-reset-key');
  const aiPromptInput = document.getElementById('ai-prompt-input');
  const btnAiSend = document.getElementById('btn-ai-send');
  const aiOutputCard = document.getElementById('ai-output-card');
  const aiOutputText = document.getElementById('ai-output-text');
  const btnAiCopy = document.getElementById('btn-ai-copy');
  const aiActionButtons = document.querySelectorAll('.ai-action-btn');
  const aiProviderSelect = document.getElementById('ai-provider-select');
  const containerApiKey = document.getElementById('container-api-key');
  const containerProjectId = document.getElementById('container-project-id');
  const containerRegion = document.getElementById('container-region');
  const aiProjectInput = document.getElementById('ai-project-input');
  const aiRegionInput = document.getElementById('ai-region-input');
  const aiKeyLink = document.getElementById('ai-key-link');
  const aiModelInput = document.getElementById('ai-model-input');

  let geminiProvider = 'aistudio'; // aistudio or vertex
  let geminiApiKey = '';
  let geminiProjectId = '';
  let geminiRegion = 'us-central1';
  let geminiModelId = 'gemini-2.5-flash';

  // Toggle setup fields based on provider choice
  aiProviderSelect.addEventListener('change', () => {
    const provider = aiProviderSelect.value;
    updateProviderInputs(provider);
  });

  function updateProviderInputs(provider) {
    if (provider === 'aistudio') {
      containerApiKey.classList.remove('hidden');
      containerProjectId.classList.add('hidden');
      containerRegion.classList.add('hidden');
      aiKeyLink.classList.remove('hidden');
      aiKeyLink.href = 'https://aistudio.google.com/';
      aiKeyLink.textContent = 'Get a free API Key →';
      document.getElementById('label-api-key').textContent = 'Gemini API Key';
      aiKeyInput.placeholder = 'Paste Gemini API Key...';
    } else {
      containerApiKey.classList.remove('hidden');
      containerProjectId.classList.remove('hidden');
      containerRegion.classList.remove('hidden');
      aiKeyLink.classList.add('hidden');
      document.getElementById('label-api-key').textContent = 'GCP API Key / OAuth Token';
      aiKeyInput.placeholder = 'Paste GCP Key or Access Token...';
    }
  }

  // Initial Key & Configuration Check
  async function initAiLens() {
    try {
      const stored = await chrome.storage.local.get(CONFIG_KEYS);

      if (stored && stored.geminiApiKey) {
        geminiProvider = stored.geminiProvider || 'aistudio';
        geminiApiKey = stored.geminiApiKey;
        geminiProjectId = stored.geminiProjectId || '';
        geminiRegion = stored.geminiRegion || 'us-central1';
        geminiModelId = stored.geminiModelId || 'gemini-2.5-flash';

        showAiActivePanel();
      } else {
        showAiSetupPanel();
      }
    } catch (err) {
      console.error('Failed to load AI config:', err);
      showAiSetupPanel();
    }
  }

  function showAiSetupPanel() {
    if (aiLockedState) aiLockedState.classList.remove('hidden');
    aiSetupContainer.classList.add('hidden');
    aiActiveContainer.classList.add('hidden');

    // Set field values
    aiProviderSelect.value = geminiProvider;
    aiKeyInput.value = geminiApiKey;
    aiProjectInput.value = geminiProjectId;
    aiRegionInput.value = geminiRegion;
    aiModelInput.value = geminiModelId;
    updateProviderInputs(geminiProvider);

    if (toolAiLens) {
      toolAiLens.classList.remove('has-creds');
      toolAiLens.classList.remove('provider-vertex');
    }
  }

  function showAiActivePanel() {
    if (aiLockedState) aiLockedState.classList.add('hidden');
    aiSetupContainer.classList.add('hidden');
    aiActiveContainer.classList.remove('hidden');

    // Nice status indicator update text
    const statusText = document.querySelector('.ai-status-text');
    if (geminiProvider === 'vertex') {
      statusText.textContent = `Vertex: ${geminiModelId} (${geminiRegion})`;
      statusText.style.color = '#a5b4fc'; // Light blue color for Vertex
      document.querySelector('.ai-status-indicator').style.backgroundColor = '#6366f1';
      document.querySelector('.ai-status-indicator').style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.6)';
    } else {
      statusText.textContent = `AI Studio: ${geminiModelId}`;
      statusText.style.color = '#a7f3d0'; // Green color for AI Studio
      document.querySelector('.ai-status-indicator').style.backgroundColor = 'var(--success)';
      document.querySelector('.ai-status-indicator').style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.6)';
    }

    aiKeyInput.value = ''; // Clear secret from memory input field

    if (toolAiLens) {
      toolAiLens.classList.add('has-creds');
      toolAiLens.classList.toggle('provider-vertex', geminiProvider === 'vertex');
    }
  }

  // Toggle active setup entry form
  if (btnUnlockAi) {
    btnUnlockAi.addEventListener('click', () => {
      if (aiLockedState) aiLockedState.classList.add('hidden');
      aiSetupContainer.classList.remove('hidden');
    });
  }

  if (btnCloseSetup) {
    btnCloseSetup.addEventListener('click', () => {
      aiSetupContainer.classList.add('hidden');
      if (aiLockedState) aiLockedState.classList.remove('hidden');
    });
  }

  // Save Configuration
  btnSaveKey.addEventListener('click', async () => {
    const provider = aiProviderSelect.value;
    const key = aiKeyInput.value.trim();
    const projectId = aiProjectInput.value.trim();
    const region = aiRegionInput.value.trim() || 'us-central1';
    const modelId = aiModelInput.value.trim() || 'gemini-2.5-flash';

    if (!key) {
      showToast('Please provide an API Key or Token.');
      return;
    }

    if (provider === 'vertex' && !projectId) {
      showToast('Please enter a Google Cloud Project ID.');
      return;
    }

    try {
      const config = {
        geminiProvider: provider,
        geminiApiKey: key,
        geminiProjectId: projectId,
        geminiRegion: region,
        geminiModelId: modelId
      };

      await chrome.storage.local.set(config);

      geminiProvider = provider;
      geminiApiKey = key;
      geminiProjectId = projectId;
      geminiRegion = region;
      geminiModelId = modelId;

      showAiActivePanel();
      showToast(`${providerLabel(provider)} config saved!`);
    } catch (err) {
      console.error('Failed to save AI config:', err);
      showToast('Error saving configuration.');
    }
  });

  // Reset Configuration
  btnResetKey.addEventListener('click', async () => {
    try {
      await chrome.storage.local.remove(CONFIG_KEYS);
      geminiApiKey = '';
      geminiProjectId = '';
      geminiModelId = 'gemini-2.5-flash';
      showAiSetupPanel();

      // Auto-reveal the edit form immediately for editing
      if (aiLockedState) aiLockedState.classList.add('hidden');
      aiSetupContainer.classList.remove('hidden');

      aiOutputCard.classList.add('hidden');
      aiOutputText.textContent = '';
      showToast('Configuration cleared.');
    } catch (err) {
      console.error('Failed to clear config:', err);
    }
  });

  // Call Gemini/Vertex API
  async function queryGemini(promptText) {
    if (!geminiApiKey) {
      showToast('Configuration is missing. Authenticate in Settings.');
      return;
    }

    if (state.activeTextarea) commitActiveText();

    // Show loading indicator
    aiOutputCard.classList.remove('hidden');
    aiOutputText.innerHTML = `
      <div class="ai-loading-indicator">
        <span class="ai-spinner"></span>
        <span>Analyzing with ${analyzingLabel(geminiProvider)}...</span>
      </div>
    `;

    try {
      // Get current JPEG base64 from canvas
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const base64Data = dataUrl.split(',')[1];

      const { url, headers } = buildGeminiEndpoint({
        provider: geminiProvider,
        apiKey: geminiApiKey,
        projectId: geminiProjectId,
        region: geminiRegion,
        modelId: geminiModelId
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(buildGeminiPayload(promptText, base64Data))
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errorData, response.status));
      }

      const responseData = await response.json();
      const textResponse = extractResponseText(responseData);

      if (textResponse) {
        aiOutputText.textContent = textResponse;
        btnAiCopy.disabled = false;
      } else {
        throw new Error('Received an empty response from AI.');
      }

    } catch (err) {
      console.error('AI query failed:', err);
      aiOutputText.innerHTML = `
        <div style="color: #f87171; padding: 4px 0;">
          <strong>Analysis Failed</strong><br>
          <span style="font-size: 11px; opacity: 0.85; line-height: 1.4; display: block; margin-top: 4px;">${err.message || 'Make sure your API key/project config is correct.'}</span>
        </div>
      `;
      btnAiCopy.disabled = true;
    }
  }

  // Bind presets action clicks
  aiActionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const promptText = promptForPresetAction(btn.dataset.action);
      if (promptText) {
        queryGemini(promptText);
      }
    });
  });

  // Bind custom send action
  btnAiSend.addEventListener('click', () => {
    const customPrompt = aiPromptInput.value.trim();
    if (!customPrompt) return;

    queryGemini(customPrompt);
    aiPromptInput.value = ''; // Reset input field
  });

  // Custom send on Enter
  aiPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      btnAiSend.click();
    }
  });

  // Copy AI output to clipboard
  btnAiCopy.addEventListener('click', () => {
    const textToCopy = aiOutputText.textContent;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        showToast('AI response copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy AI text:', err);
        showToast('Clipboard copy blocked.');
      });
  });

  initAiLens();
}
