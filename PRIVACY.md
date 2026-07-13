# Snippy — Privacy Policy

_Last updated: 2026-07-12_

Snippy is a browser screenshot and annotation tool. This policy explains exactly
what happens to your data. The short version: **your screenshots stay on your
own device, and the only time anything is sent off-device is when you personally
click an AI Lens action.**

## What Snippy stores, and where

Everything Snippy keeps is stored locally in your browser via
`chrome.storage.local`. None of it is transmitted to the developer or to any
Snippy-operated server — there is no Snippy server.

| Data | Where it lives | Sent anywhere? |
|------|----------------|----------------|
| The screenshot you capture | Passed in local storage from the capture page to the editor tab | No (except AI Lens — see below) |
| Your annotations (arrows, text, blurs, etc.) | Rendered in the editor tab only | No |
| Editor preferences (e.g. sidebar width) | `chrome.storage.local` | No |
| Your AI Lens API key & settings | `chrome.storage.local` | No — never leaves your browser |

Uninstalling Snippy removes this local data.

## The one exception: AI Lens

AI Lens is **optional** and does nothing until you supply your own Google API
credentials and click one of its actions (Read Text, Explain, Translate, Format,
or a custom prompt).

When — and only when — you click an AI Lens action:

- The **current image in the editor** is sent **directly from your browser** to
  the AI provider you configured:
  - **Google AI Studio (Gemini API)** — `generativelanguage.googleapis.com`, or
  - **Google Cloud Vertex AI** — your project's `*-aiplatform.googleapis.com`
    endpoint.
- The request is authenticated with **your own** API key or access token.
- Snippy does **not** proxy, copy, log, or retain the image or the response on
  any server. The round trip is strictly browser → Google → browser.

Your use of Google's APIs is governed by Google's terms and privacy policy:

- <https://policies.google.com/privacy>
- <https://ai.google.dev/gemini-api/terms> (AI Studio)
- <https://cloud.google.com/terms> (Vertex AI)

If you never configure AI Lens, Snippy makes **no external network requests at
all.**

## What Snippy does NOT do

- No analytics, telemetry, tracking pixels, or usage reporting.
- No advertising, and no selling or sharing of data with third parties.
- No accounts, and no collection of personal information by the developer.

## Permissions

- **activeTab** — capture the pixels of the current tab, only when you invoke
  Snippy.
- **scripting** — inject the selection overlay into the current page.
- **storage** — hold the captured image, preferences, and (if you set one up)
  your AI Lens key locally.

Snippy requests no host permissions and cannot read pages you don't explicitly
capture.

## Contact

Questions or concerns: **m@m4tt.xyz**, or open an issue at
<https://github.com/mjacobs/snippy/issues>.
