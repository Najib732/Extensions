# Bengali Meaning on Select

A Chrome extension for learning English while you read. Select any English word or sentence on a web page, then press a key to see its Bengali meaning, find English synonyms with example sentences, or hear it pronounced.

## Shortcuts

Select some text first, then press:

| Shortcut | Windows / Linux | What it does |
|---|---|---|
| `B` | `B` | Shows the **Bengali meaning** in a tooltip above the selection |
| `Cmd + Shift + A` | `Ctrl + Shift + A` | Shows **English synonyms**, then 1–3 meanings with **example sentences** |
| `Cmd + Shift + S` | `Ctrl + Shift + S` | **Reads the selected text aloud** |

- Nothing happens until you press a key. Selecting text alone does not show anything.
- `B` is ignored while you're typing in a text box or editor, so you can still type the letter normally.
- If no text is selected, the shortcuts do nothing and the key works as usual.
- The shortcuts also work when your keyboard is switched to Bangla.
- Click anywhere or scroll to close the tooltip.

## How it works

```
  web page                          background.js                       free APIs
┌─────────────┐  select + key    ┌──────────────────┐   fetch     ┌───────────────────────┐
│ content.js  │ ───────────────▶ │  service worker  │ ──────────▶ │ Google Translate      │
│  (tooltip)  │ ◀─────────────── │                  │ ◀────────── │ Datamuse, Wiktionary  │
└─────────────┘   result         └──────────────────┘   JSON      └───────────────────────┘
```

- **`content.js`** runs on every page. It listens for the shortcuts, reads the selected text and shows the result in a tooltip. Results are cached, so selecting the same text again is instant.
- **`background.js`** is the service worker that calls the APIs. Pages can't call these APIs directly because of browser CORS rules, so the content script sends a message to the background script and gets the answer back.
- **`styles.css`** styles the tooltip.
- **`manifest.json`** is the extension setup (Manifest V3) and lists the websites the extension may call.

## APIs used

All of these are free and need no API key or account.

| Feature | API | What it gives us |
|---|---|---|
| Bengali meaning | [Google Translate](https://translate.googleapis.com) (`translate_a/single`, unofficial endpoint) | The Bengali translation of the selected text |
| Synonyms | [Datamuse](https://www.datamuse.com/api/) (`rel_syn`, or `ml` for phrases) | Synonyms, sorted so the most common words come first |
| Meanings + examples | [Wiktionary REST API](https://en.wiktionary.org/api/rest_v1/) (`page/definition`) | Definitions and real example sentences |
| Meanings (backup) | Datamuse (`md=d`) | Definitions, used only when Wiktionary has no entry (no examples) |
| Pronunciation | Browser's built-in [Speech Synthesis](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis) | Text-to-speech, works offline, no API call |

> **Note:** the Google Translate endpoint is unofficial and free. Google could change or rate-limit it at any time.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `bengali-meaning-extension` folder.
4. Refresh any tabs that were already open.

After editing the code, click the **reload ↻** button on the extension card, then refresh the page.

## Settings

At the top of `content.js`:

| Setting | Default | Meaning |
|---|---|---|
| `SPEAK` | `"original"` | `"original"` reads the English text; `"bengali"` reads the Bengali translation (needs a Bengali voice installed on your computer) |
| `MAX_LEN` | `500` | Longest selection (in characters) that will be translated |
| `MAX_SYNONYM_WORDS` | `4` | Longest selection (in words) that synonyms are looked up for |

## Known issues

- On Mac, Chrome also uses `Cmd + Shift + A` for **Search tabs**. If tab search opens instead of the synonyms, the shortcut needs to be changed in `content.js` (see `actionFor`).
- Shortcuts don't work on Chrome's own pages (`chrome://…`) or the Chrome Web Store, because extensions aren't allowed to run there.
