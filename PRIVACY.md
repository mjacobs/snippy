# Snippy — Privacy Policy

_Last updated: 2026-08-28_

Snippy is a browser screenshot and annotation tool. This policy explains exactly
what happens to your data. The short version: **your screenshots stay on your
own device, and the only times anything is sent off-device are when you
personally click an AI Lens action or Push to Memex.**

## What Snippy stores, and where

Everything Snippy keeps is stored locally in your browser via
`chrome.storage.local`. None of it is transmitted to the developer or to any
Snippy-operated server — there is no Snippy server.

| Data | Where it lives | Sent anywhere? |
|------|----------------|----------------|
| The screenshot you capture | Passed in local storage from the capture page to the editor tab | No (except AI Lens and Push to Memex — see below) |
| Your annotations (arrows, text, blurs, etc.) | Rendered in the editor tab only | No — except that AI Lens and Push to Memex send the annotated image, not the original |
| Editor preferences (e.g. sidebar width) | `chrome.storage.local` | No |
| Your AI Lens API key & settings | `chrome.storage.local` | No — never leaves your browser |
| Your Memex URL & device key | `chrome.storage.local` | Only to your own Memex — the key authenticates each push you trigger |

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

## The other exception: Push to Memex

Push to Memex is **optional** and does nothing until you enter the URL of a
[Memex](https://github.com/mjacobs/memex) instance you run yourself and its
device key.

When — and only when — you click **Push to Memex**, the current image in the
editor is sent **directly from your browser** to that URL, along with the source
page's URL if the capture has one. It goes nowhere else: there is no Snippy
server in the path.

Your device key is stored locally and sent to that one endpoint only, in the
`Authorization` header of a push you triggered, to prove the push is yours. It
goes to no one else and it is never shown back to you after you save it.

Because the key travels with every push, the URL must be **https**. Snippy
refuses a plain-`http` Memex URL unless it is `localhost` or `127.0.0.1`, where
nothing crosses the network.

Snippy asks for permission to reach that host at the moment you save the
setting, and Chrome will show you the prompt. Clearing the setting or pointing
it at a different host hands the old host's permission back to Chrome, and you
can revoke it yourself at any time in Chrome's extension settings.

If you configure neither AI Lens nor Push to Memex, Snippy makes **no external
network requests at all.**

## What Snippy does NOT do

- No analytics, telemetry, tracking pixels, or usage reporting.
- No advertising, and no selling or sharing of data with third parties.
- No accounts, and no collection of personal information by the developer.

## Permissions

- **activeTab** — capture the pixels of the current tab, only when you invoke
  Snippy.
- **scripting** — inject the selection overlay into the current page.
- **storage** — hold the captured image, preferences, and (if you set them up)
  your AI Lens key and Memex credentials locally.
- **clipboardWrite** — copy the annotated image or a saved file's path when
  you ask for it.
- **downloads** — save JPEGs to your own Downloads folder for Save + Path and
  the Quick Snip fallback, look up the saved file's path, and clean up expired
  Snippy-created temp files. (The plain Download button uses a regular browser
  download without this API.)
- **offscreen** — copy the saved file's path to your clipboard in an
  extension-owned page, so the path is never exposed to the web page.
- **nativeMessaging** — talk to the optional local temp-file helper, only if
  you installed it (see above).

Snippy requests one host permission, `https://*.googleapis.com/*`, used
exclusively by the optional AI Lens to send your screenshot directly to
Google's Gemini API or your own Vertex AI endpoint with your own key, only
when you click an AI action. It does not cover unrelated websites, and Snippy
uses it only to make those AI API requests — it cannot read pages you don't
explicitly capture. If you configure neither AI Lens nor Push to Memex, Snippy
makes no network requests at all.

Push to Memex needs to reach whatever host you run Memex on, which can't be
known in advance, so that permission is **optional**: Snippy requests it for
that one origin when you save the setting, and releases it when you clear the
setting or point it at a different host. The manifest declares that the
optional permission may be asked for `https://*/*` plus `http://localhost/*`
and `http://127.0.0.1/*`, but Chrome only ever grants what you approve in the
prompt: the one host you entered. Chrome's permissions have no per-port
granularity, so approving `https://memex.example.com:8443` covers every port
on `memex.example.com` over https — no other host. You can revoke it at any
time in Chrome's extension settings.

## Contact

Questions or concerns: **m@m4tt.xyz**, or open an issue at
<https://github.com/mjacobs/snippy/issues>.
