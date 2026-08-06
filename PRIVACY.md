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

### Temporary screenshot files (Quick Snip / Save + Path)

The Quick Snip shortcut and the editor's Save + Path button write the
screenshot to a file on your own disk so you can paste its path elsewhere:

- The editor's **Save + Path** button writes to `Downloads/snippy.tmp/`. If
  Chrome's "Ask where to save each file before downloading" setting is on,
  Chrome shows a save dialog with that location preselected — a file you
  redirect somewhere else is yours and is **not** cleaned up by Snippy.
- **Quick Snip** writes to `Downloads/snippy.tmp/` too, unless the optional
  native helper is installed, in which case it writes to a per-user temp
  directory (`$XDG_RUNTIME_DIR/snippy`, or `/tmp/snippy-<uid>` as a fallback).
- Cleanup, per location: files under `Downloads/snippy.tmp/` are removed by
  Snippy ~24 hours after creation, at the next quick snip or browser startup.
  Native-helper files are removed ~24 hours after creation at the next
  helper-backed quick snip; `$XDG_RUNTIME_DIR` is additionally cleared by the
  OS on logout, while `/tmp` cleanup depends on your OS's policy. To remove
  all residual files yourself, delete both directories.

These files never leave your device. **Uninstalling the extension does not
immediately delete files already written to disk** — remove the folders above
yourself if you want them gone sooner.

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
- **clipboardWrite** — copy the annotated image or a saved file's path when
  you ask for it.
- **downloads** — save JPEGs (Download, Save + Path, Quick Snip fallback) to
  your own Downloads folder.
- **offscreen** — copy the saved file's path to your clipboard in an
  extension-owned page, so the path is never exposed to the web page.
- **nativeMessaging** — talk to the optional local temp-file helper, only if
  you installed it (see above).

Snippy requests no host permissions and cannot read pages you don't explicitly
capture.

## Contact

Questions or concerns: **m@m4tt.xyz**, or open an issue at
<https://github.com/mjacobs/snippy/issues>.
