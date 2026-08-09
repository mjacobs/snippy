# Chrome Web Store Listing — Snippy

> Last Updated: 2026-08-08

## Store Listing

**Extension Name** Snippy

**Short Description** A fast, open-source, ad-free screenshot tool. Select any
area, edit with arrows, shapes, text, or blurs, and save as JPEG.

**Detailed Description** Snippy is a lightweight, blazing fast tool for
capturing, annotating, and saving screenshots directly within your browser. It
is fully open source and completely non-commercial: no ads, no accounts, no paid
tiers, and no data collection — just a screenshot tool.

Key Features:

- Free & Open Source: MIT-licensed with the complete source on GitHub
  (github.com/mjacobs/snippy). No ads, no upsells, nothing to buy.
- Instant Activation: Click the extension icon or press Ctrl+Shift+S
  (Cmd+Shift+S on Mac) to start selecting.
- Smooth Selection: The live viewport freezes in time, letting you drag and
  select any custom area precisely with real-time dimensions feedback.
- Modern Editing Canvas: The captured selection instantly opens in a clean,
  glassmorphic editing tab.
- Comprehensive Annotation Set: Mark up your crops with freehand pens,
  custom-thickness rectangles, high-contrast text layers, and directional
  arrows.
- Dynamic Highlighting & Blurring: Apply neon yellow highlighters to accent
  elements, or instantly pixelate/blur sensitive credentials and private data.
- AI-Powered Lens (Optional): Connect a personal Google Gemini API key to unlock
  state-of-the-art vision capabilities—including accurate text extraction (OCR),
  detailed code explanations, contextual translation, tabular data extraction,
  and freeform chat about your captures.
- High-Performance Exports: Copy the finished result directly to your clipboard
  to paste in messaging apps, or download as a high-fidelity white-compensated
  JPEG image.

How to Use Snippy:

1. Navigate to the webpage you wish to capture.
2. Click the Snippy icon in your toolbar, or press the Ctrl+Shift+S shortcut.
3. Left-click and drag across the screen to define your crop area, then release.
4. Your crop opens in the Snippy Editor. Annotate or edit to your liking!
5. Click "Copy Image" to copy directly to your clipboard, or click "Download
   JPEG" to save the file locally.

Privacy & Permissions: Snippy's capture and editing run entirely on your device.
Your screenshots and annotations live only in your browser's private extension
storage (chrome.storage.local) and are never sent to Snippy's developer or any
Snippy server.

The optional AI Lens is the single exception, and only when you choose to use
it: the moment you click an AI action (Read Text, Explain, Translate, Format, or
a custom prompt), the current image is sent directly from your browser to
Google's Gemini API — or to your own Google Cloud Vertex AI endpoint — using the
API key you supply, so Google can analyze it. Snippy never proxies this through
its own servers, and your API key never leaves your local browser storage. If
you never configure AI Lens, Snippy makes no external network requests at all.

**Category** Productivity

**Single Purpose** Enables users to quickly select custom browser regions,
annotate them in the built-in editor, and export as JPEG.

**Primary Language** English

## Graphics & Assets

| Asset            | Dimensions  | Status   | Filename                          |
| ---------------- | ----------- | -------- | --------------------------------- |
| Store Icon       | 128×128 PNG | ✅ Ready | icons/icon-128.png                |
| Screenshot 1     | 1280×800    | ✅ Ready | store-assets/screenshot-1.png     |
| Screenshot 2     | 1280×800    | ✅ Ready | store-assets/screenshot-2.png     |
| Small Promo Tile | 440×280     | ✅ Ready | store-assets/promo-tile-small.png |

### Screenshot Notes

- **Screenshot 1:** Active selection with the semi-transparent black overlay,
  white-dashed crop border, live `1028 × 353 px` size badge, and the instruction
  pill at top center.
- **Screenshot 2:** The glassmorphic Snippy Editor holding an annotated crop —
  red arrow, red text caption, red rectangle, and a pixelated blur redacting an
  API key — with the Color / My Colors / Line Weight panel showing.

Both screenshots are genuine renders of the shipping extension (v1.1.2; the
editor is visually unchanged since), captured
by loading the unpacked extension into Chromium at a 1280×800 viewport and
driving the real capture and editor flows. The page being captured is a
purpose-built fictional analytics dashboard ("Meridian"), so the listing carries
no third-party branding and no personal data. The API key in the shot is a
made-up string, present so the blur tool has something to redact.

## Permissions Justification

| Permission  | Type        | Justification                                                                                                                                                            |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `activeTab` | permissions | Required to capture the visible viewport pixels of the current active webpage upon user action. Grants secure temporary host permission without broad invasive scanning. |
| `scripting` | permissions | Required to programmatically insert the crop overlay interface (CSS/JS) into the webpage viewport.                                                                       |
| `storage`   | permissions | Required to pass the cropped screenshot data securely from the temporary page capture content script to the editor tab.                                                  |
| `clipboardWrite` | permissions | Powers the user-initiated "Copy Image" action (writes the annotated screenshot to the clipboard) and Quick Snip's path handoff (copies the saved file's location for pasting into a terminal). Writes only on explicit user action; nothing is read from the clipboard. |
| `downloads` | permissions | Powers the user-initiated Save + Path action (saves the JPEG, then looks up the completed download's path to copy it to the clipboard), the fallback save path for Quick Snip captures (Downloads/snippy.tmp), and cleanup of expired Snippy-created temp files in that folder. The plain "Download JPEG" button uses a standard anchor download without this API. Only files Snippy itself created are ever touched. |
| `nativeMessaging` | permissions | Used only by the optional Quick Snip helper: if the user installed the local companion (from the GitHub repo), captures are handed to it for silent saves to a per-user temp directory. Without it, the extension falls back to the downloads API. No other native communication. |
| `offscreen` | permissions | An offscreen document (CLIPBOARD reason) lets the service worker write the saved screenshot's file path to the clipboard without routing it through page content scripts, so page scripts never see local filesystem paths. It performs no other work. |
| `https://*.googleapis.com/*` | host_permissions | Used exclusively by the optional, user-configured AI Lens: screenshots go directly to Google's Gemini API (generativelanguage.googleapis.com) or the user's own Vertex AI endpoint (region-specific `*-aiplatform` hosts — hence the wildcard) with the user's own API key. If AI Lens is never configured, the extension makes no network requests at all. |

**Remote code:** answer **No**. All JS and fonts ship inside the package; there
is no `eval`, no remote `<script>`, no Wasm. AI Lens transmits image data to an
API and renders the text response — data transmission (disclosed under Data
Use), not remote code execution.

## Privacy & Data Use

### Data Collection

**Does the developer collect user data?** No — Snippy's developer receives and
stores nothing. Captures, annotations, and API keys stay in the user's local
`chrome.storage.local`.

**Does the extension transmit user data to a third party?** Yes, conditionally.
When the user invokes the optional **AI Lens**, the current screenshot is sent
from the user's browser directly to Google (Gemini API or the user's own Vertex
AI endpoint), using the user's own API key. This is disclosed to the user in the
listing and in `PRIVACY.md`.

> **Store "Data Use" form guidance:** On the Chrome Web Store data-disclosure
> form, declare that the extension handles **"Website content"** (the screenshot
> image), that it is **transmitted** (to Google's AI API) only for the AI Lens
> feature at the user's request, and that it is **not** collected by the
> developer. Do not certify "does not transmit user data" — that would be
> inaccurate while AI Lens ships.

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used or transferred for purposes unrelated to the extension's
      single purpose
- [x] Data is NOT used or transferred to determine creditworthiness or for
      lending purposes
- [x] The only third-party transmission is the AI Lens screenshot → Google,
      performed on-device with the user's own key, at the user's explicit
      request

## Privacy Policy

**Privacy Policy URL** <https://github.com/mjacobs/snippy/blob/main/PRIVACY.md>

## Distribution

**Visibility**: Public **Regions**: All regions **Pricing**: Free

## Developer Info

**Publisher Name** Matthew Jacobs

**Contact Email** <m@m4tt.xyz>

**Support URL / Email** <https://github.com/mjacobs/snippy/issues>

**Homepage URL** <https://github.com/mjacobs/snippy>

## Version History

| Version | Date       | Changes                                                                                                                                                                                                                                      | Status |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1.4   | 2026-08-08 | Store submission build: corrected PRIVACY.md permission disclosures (googleapis host permission, downloads scope). No functional changes. See CHANGELOG.md.                                                                                   | Submitted |
| 1.1.3   | 2026-08-08 | Editor internals modularized (no behavior change), open-source/ad-free messaging, new listing assets and icons, minor sidebar fix. Submission withdrawn before review; superseded by 1.1.4. See CHANGELOG.md.                                | Withdrawn |
| 1.1.2   | 2026-08-07 | Bug fixes: per-capture storage records so concurrent captures don't overwrite each other, text-wrap/textarea/highlighter corrections, module service worker. See CHANGELOG.md.                                                               | Draft  |
| 1.1.1   | 2026-08-06 | Resize selected text boxes to control line wrapping, with live reflow, Undo/Redo, and width preservation across editing and font-size changes. See CHANGELOG.md.                                                                             | Draft  |
| 1.1.0   | 2026-08-06 | Shape editing (restyle + reshape handles), inline text editing from any tool, My Colors saved palette, redo, full-viewport capture shortcut, new fonts, opt-in text shadow (off by default), Quick Snip concurrency fixes. See CHANGELOG.md. | Draft  |
| 1.0.0   | 2026-07-09 | Initial deployment release including overlay canvas selection, vector editing suite, Undo states, and JPEG download/copy actions.                                                                                                            | Draft  |

## Review Notes

### Known Issues / Limitations

- Cannot capture Chrome system directories (e.g. `chrome://` settings, the
  Chrome Web Store) due to standard Manifest security blocks.
