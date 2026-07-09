# Chrome Web Store Listing — Snippy

> Last Updated: 2026-07-09

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
Snippy runs entirely locally. Your captures and annotations are stored securely inside your browser's private extension sandbox (chrome.storage) and are never sent off-device, compiled, or shared with third parties.

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

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/your-username/snippy/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**
Snippy Dev

**Contact Email**
support@snippytool.dev

**Support URL / Email**
https://github.com/your-username/snippy/issues

**Homepage URL**
https://github.com/your-username/snippy

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-07-09 | Initial deployment release including overlay canvas selection, vector editing suite, Undo states, and JPEG download/copy actions. | Draft |

## Review Notes

### Known Issues / Limitations
- Cannot capture Chrome system directories (e.g. `chrome://` settings, the Chrome Web Store) due to standard Manifest security blocks.
