// AI Lens request/response shaping for Gemini (AI Studio) and Vertex AI.
// Pure: no DOM, no fetch — the caller performs the request.

export const AI_PRESET_PROMPTS = {
  ocr: "Perform highly accurate OCR on this image. Extract and return ALL text found in the image. Maintain the exact layout, columns, paragraphs, and list structures as closely as possible. Do NOT include any conversational introduction, summary, or commentary — return ONLY the raw extracted text.",
  explain: "Analyze this screenshot. If it contains a code block, explain what the code does and suggest any micro-improvements. If it is a diagram, chart, user interface, or image, explain its architecture, meaning, and key visual elements concisely.",
  translate: "Analyze this screenshot. Identify any non-English text present, translate it into natural, flowing English, and print the translation clearly. If the text is already in English, provide a clean, proofread transcript with improvements.",
  table: "Locate any tabular grids, lists, pricing plans, or formatted data structures in this image. Parse the row-and-column data and format it into a clean, well-aligned GitHub Markdown table. Do not add intro/outro comments."
};

export function promptForPresetAction(action) {
  return AI_PRESET_PROMPTS[action] || '';
}

export function providerLabel(provider) {
  return provider === 'vertex' ? 'Vertex AI' : 'AI Studio';
}

// The label used inside the "Analyzing with ..." spinner, which says
// "Gemini AI" rather than "AI Studio" for the default provider.
export function analyzingLabel(provider) {
  return provider === 'vertex' ? 'Vertex AI' : 'Gemini AI';
}

// Gemini's common request schema. `role` is mandatory on Vertex.
export function buildGeminiPayload(promptText, base64Data) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          }
        ]
      }
    ]
  };
}

// Endpoint + auth headers for a provider config. Returns {url, headers}.
export function buildGeminiEndpoint(config) {
  const { provider, apiKey, projectId, region, modelId } = config;
  const headers = { 'Content-Type': 'application/json' };

  if (provider === 'aistudio') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      headers
    };
  }

  // Vertex AI support: check whether the token is OAuth or an API key.
  // GCP OAuth access tokens always start with 'ya29.'; standard API keys
  // (AIza...) and Agent Builder keys (AQ...) are passed as ?key=.
  const isOAuthToken = apiKey.startsWith('ya29.');

  // The 'global' location uses the bare aiplatform host —
  // 'global-aiplatform...' is not a real endpoint; regional locations use a
  // region prefix.
  const vertexHost = region === 'global'
    ? 'aiplatform.googleapis.com'
    : `${region}-aiplatform.googleapis.com`;
  let url = `https://${vertexHost}/v1/projects/${projectId}/locations/${region}/publishers/google/models/${modelId}:generateContent`;
  if (isOAuthToken) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    url += `?key=${apiKey}`;
  }
  return { url, headers };
}

// Pull the generated text out of a successful response, or undefined.
export function extractResponseText(responseData) {
  const part = responseData?.candidates?.[0]?.content?.parts?.[0];
  return part?.text;
}

// Both error shapes the two APIs return, falling back to the status code.
export function extractErrorMessage(errorData, status) {
  return errorData?.error?.message ||
    errorData?.[0]?.error?.message ||
    `HTTP Error ${status}`;
}
