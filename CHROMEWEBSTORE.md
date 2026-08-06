# Chrome Web Store Listing — Snippy

> Last Updated: 2026-08-06

## Store Listing

**Extension Name**
Snippy

**Short Description**
A beautiful, fast, and easy screenshot tool. Select any area, edit with arrows, shapes, text, or blurs, and save as JPEG.

**Detailed Description**
Snippy is a lightweight and blazing fast tool for capturing, annotating, and saving screenshots directly within your browser. With single-click activation and fluid UI, Snippy streamlines your visual workflow.

Key Features:
- Instant Activation: Click the extension icon or press Ctrl+Shift+S (Cmd+Shift+S on Mac) to start selecting.
- Smooth Selection: The live viewport freezes in time, letting you drag and select any custom area precisely with real-time dimensions feedback.
- Modern Editing Canvas: The captured selection instantly opens in an elegant, glassmorphic editing tab.
- Comprehensive Annotation Set: Mark up your crops with freehand pens, custom-thickness rectangles, high-contrast text layers, and directional arrows.
- Dynamic Highlighting & Blurring: Apply neon yellow highlighters to accent elements, or instantly pixelate/blur sensitive credentials and private data.
- AI-Powered Lens (Optional): Connect a personal Google Gemini API key to unlock state-of-the-art vision capabilities—including accurate text extraction (OCR), detailed code explanations, contextual translation, tabular data extraction, and freeform chat about your captures.
- High-Performance Exports: Copy the finished result directly to your clipboard to paste in messaging apps, or download as a high-fidelity white-compensated JPEG image.

How to Use Snippy:
1. Navigate to the webpage you wish to capture.
2. Click the Snippy icon in your toolbar, or press the Ctrl+Shift+S shortcut.
3. Left-click and drag across the screen to define your crop area, then release.
4. Your crop opens in the Snippy Editor. Annotate or edit to your liking!
5. Click "Copy Image" to copy directly to your clipboard, or click "Download JPEG" to save the file locally.

Privacy & Permissions:
Snippy's capture and editing run entirely on your device. Your screenshots and annotations live only in your browser's private extension storage (chrome.storage.local) and are never sent to Snippy's developer or any Snippy server.

The optional AI Lens is the single exception, and only when you choose to use it: the moment you click an AI action (Read Text, Explain, Translate, Format, or a custom prompt), the current image is sent directly from your browser to Google's Gemini API — or to your own Google Cloud Vertex AI endpoint — using the API key you supply, so Google can analyze it. Snippy never proxies this through its own servers, and your API key never leaves your local browser storage. If you never configure AI Lens, Snippy makes no external network requests at all.

**Category**
Productivity

**Single Purpose**
Enables users to quickly select custom browser regions, annotate them on an elegant workspace, and export as JPEG.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | icons/icon-128.png |
| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile | 440×280 | ⬜ Not created | |

### Screenshot Notes
- **Screenshot 1:** Show active selection on a popular site with the semi-transparent black overlay and white-dashed crop border, with the instruction pill showing at the top center.
- **Screenshot 2:** Show the glassmorphic Snippy Editor containing an annotated crop with neon lines, text, arrows, and redactive blur in active use.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | Required to capture the visible viewport pixels of the current active webpage upon user action. Grants secure temporary host permission without broad invasive scanning. |
| `scripting` | permissions | Required to programmatically insert the crop overlay interface (CSS/JS) into the webpage viewport. |
| `storage` | permissions | Required to pass the cropped screenshot data securely from the temporary page capture content script to the editor tab. |

## Privacy & Data Use

### Data Collection

**Does the developer collect user data?** No — Snippy's developer receives and stores nothing. Captures, annotations, and API keys stay in the user's local `chrome.storage.local`.

**Does the extension transmit user data to a third party?** Yes, conditionally. When the user invokes the optional **AI Lens**, the current screenshot is sent from the user's browser directly to Google (Gemini API or the user's own Vertex AI endpoint), using the user's own API key. This is disclosed to the user in the listing and in `PRIVACY.md`.

> **Store "Data Use" form guidance:** On the Chrome Web Store data-disclosure form, declare that the extension handles **"Website content"** (the screenshot image), that it is **transmitted** (to Google's AI API) only for the AI Lens feature at the user's request, and that it is **not** collected by the developer. Do not certify "does not transmit user data" — that would be inaccurate while AI Lens ships.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used or transferred for purposes unrelated to the extension's single purpose
- [x] Data is NOT used or transferred to determine creditworthiness or for lending purposes
- [x] The only third-party transmission is the AI Lens screenshot → Google, performed on-device with the user's own key, at the user's explicit request

## Privacy Policy

**Privacy Policy URL**
https://github.com/mjacobs/snippy/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**
Matthew Jacobs

**Contact Email**
m@m4tt.xyz

**Support URL / Email**
https://github.com/mjacobs/snippy/issues

**Homepage URL**
https://github.com/mjacobs/snippy

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1.1 | 2026-08-06 | Resize selected text boxes to control line wrapping, with live reflow, Undo/Redo, and width preservation across editing and font-size changes. See CHANGELOG.md. | Draft |
| 1.1.0 | 2026-08-06 | Shape editing (restyle + reshape handles), inline text editing from any tool, My Colors saved palette, redo, full-viewport capture shortcut, new fonts, opt-in text shadow (off by default), Quick Snip concurrency fixes. See CHANGELOG.md. | Draft |
| 1.0.0 | 2026-07-09 | Initial deployment release including overlay canvas selection, vector editing suite, Undo states, and JPEG download/copy actions. | Draft |

## Review Notes

### Known Issues / Limitations
- Cannot capture Chrome system directories (e.g. `chrome://` settings, the Chrome Web Store) due to standard Manifest security blocks.
