// Shows the Bengali meaning of selected text in a tooltip above the selection,
// and speaks the selected text aloud on Cmd/Ctrl+S.

(() => {
  // ---- Config -------------------------------------------------------------
  // Which text gets spoken on Cmd/Ctrl+S:
  //   "original" -> speak the text you selected (English). Reliable everywhere.
  //   "bengali"  -> speak the Bengali translation. Needs a Bengali voice
  //                 installed on your OS, which many systems don't have.
  const SPEAK = "original";
  const SPEAK_LANG = SPEAK === "bengali" ? "bn-BD" : "en-US";
  const MIN_LEN = 1; // ignore empty selections
  const MAX_LEN = 500; // don't translate huge blocks
  // ------------------------------------------------------------------------

  let tip = null;
  let lastText = ""; // the current selection's original text
  let lastBn = ""; // its Bengali translation
  const cache = new Map();

  function makeTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "__bn_meaning_tip__";
    document.documentElement.appendChild(tip);
    return tip;
  }

  function hideTip() {
    if (tip) tip.style.display = "none";
  }

  function showTip(text, rect) {
    const el = makeTip();
    el.textContent = text;
    el.style.display = "block";

    // Position above the selection, clamped to the viewport.
    const pad = 8;
    const top = rect.top - el.offsetHeight - pad;
    let left = rect.left;
    const maxLeft = window.innerWidth - el.offsetWidth - pad;
    if (left > maxLeft) left = Math.max(pad, maxLeft);
    if (left < pad) left = pad;

    el.style.left = `${left}px`;
    el.style.top = `${top < pad ? rect.bottom + pad : top}px`; // flip below if no room
  }

  async function translate(text) {
    if (cache.has(text)) return cache.get(text);
    const reply = await chrome.runtime.sendMessage({ type: "TRANSLATE", text });
    if (!reply || !reply.ok) throw new Error(reply ? reply.error : "no reply");
    cache.set(text, reply.bn);
    return reply.bn;
  }

  function currentSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const text = sel.toString().trim();
    if (text.length < MIN_LEN) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return { text, rect };
  }

  async function onSelect() {
    const current = currentSelection();
    if (!current) {
      lastText = "";
      lastBn = "";
      hideTip();
      return;
    }

    lastText = current.text;
    if (current.text.length > MAX_LEN) {
      showTip("Selection too long to translate.", current.rect);
      return;
    }

    showTip("…", current.rect); // instant feedback while fetching
    try {
      const bn = await translate(current.text);
      lastBn = bn;
      // Re-read the rect in case layout shifted during the fetch.
      const now = currentSelection();
      showTip(bn, now ? now.rect : current.rect);
    } catch (err) {
      showTip("Translation failed.", current.rect);
      console.error("[Bengali Meaning]", err);
    }
  }

  function speak() {
    const textToSpeak = SPEAK === "bengali" ? lastBn : lastText;
    if (!textToSpeak) return;
    try {
      window.speechSynthesis.cancel(); // stop anything already speaking
      const u = new SpeechSynthesisUtterance(textToSpeak);
      u.lang = SPEAK_LANG;
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.error("[Bengali Meaning] speech error", err);
    }
  }

  // Selection via mouse (and keyboard selection too).
  document.addEventListener("mouseup", () => setTimeout(onSelect, 0));

  // Cmd/Ctrl+S -> pronounce. Block the browser's Save Page dialog.
  document.addEventListener(
    "keydown",
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        if (!lastText) return; // nothing selected -> let Save work normally
        e.preventDefault();
        e.stopPropagation();
        speak();
      }
    },
    true // capture phase, so we run before the page's own handlers
  );

  // Dismiss the tooltip when the selection is cleared or the user scrolls away.
  document.addEventListener("mousedown", (e) => {
    if (tip && !tip.contains(e.target)) hideTip();
  });
  window.addEventListener("scroll", hideTip, true);
})();
