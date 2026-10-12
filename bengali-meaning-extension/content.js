// Select text, then:
//   B                  -> Bengali meaning in a tooltip above the selection
//   Cmd/Ctrl+Shift+A   -> English synonyms, then how the word is used
//   Cmd/Ctrl+Shift+S   -> speak the selected text aloud

(() => {
  // ---- Config -------------------------------------------------------------
  // Which text gets spoken on Cmd/Ctrl+Shift+S:
  //   "original" -> speak the text you selected (English). Reliable everywhere.
  //   "bengali"  -> speak the Bengali translation. Needs a Bengali voice
  //                 installed on your OS, which many systems don't have.
  const SPEAK = "original";
  const SPEAK_LANG = SPEAK === "bengali" ? "bn-BD" : "en-US";
  const MIN_LEN = 1; // ignore empty selections
  const MAX_LEN = 500; // don't translate huge blocks
  const MAX_SYNONYM_WORDS = 4; // synonyms only make sense for a word or short phrase
  // ------------------------------------------------------------------------

  let tip = null;
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

  // `content` is a string or a DOM node. `wide` gives the synonyms panel more room.
  function showTip(content, rect, wide = false) {
    const el = makeTip();
    el.replaceChildren(content);
    el.classList.toggle("bn-wide", wide);
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

  // Asks the background script for a lookup ("TRANSLATE" or "SYNONYMS"), with caching.
  async function ask(type, text) {
    const key = `${type}:${text}`;
    if (cache.has(key)) return cache.get(key);
    const reply = await chrome.runtime.sendMessage({ type, text });
    if (!reply || !reply.ok) throw new Error(reply ? reply.error : "no reply");
    cache.set(key, reply.result);
    return reply.result;
  }

  function currentSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const text = sel.toString().trim();
    if (text.length < MIN_LEN) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return { text, rect };
  }

  function isTyping(e) {
    const t = e.target;
    return (
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    );
  }

  function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text) n.textContent = text;
    return n;
  }

  // Shows "…" right away, then the rendered result of the lookup.
  async function showLookup(sel, type, render, wide) {
    showTip("…", sel.rect, wide);
    try {
      const result = await ask(type, sel.text);
      // Re-read the rect in case layout shifted during the fetch.
      const now = currentSelection();
      showTip(render(result, sel.text), now ? now.rect : sel.rect, wide);
    } catch (err) {
      showTip("Lookup failed.", sel.rect);
      console.error("[Bengali Meaning]", err);
    }
  }

  // ---- Actions ------------------------------------------------------------

  function showMeaning(sel) {
    if (sel.text.length > MAX_LEN) {
      showTip("Selection too long to translate.", sel.rect);
      return;
    }
    showLookup(sel, "TRANSLATE", (bn) => bn, false);
  }

  function renderSynonyms({ synonyms, usage }, word) {
    const box = document.createDocumentFragment();
    box.append(node("div", "bn-word", word));

    box.append(node("div", "bn-label", "Synonyms"));
    box.append(
      node("div", "bn-syn", synonyms.length ? synonyms.join(" · ") : "No synonyms found.")
    );

    if (usage.length) {
      box.append(node("div", "bn-label", "How it's used"));
      for (const u of usage) {
        const sense = node("div", "bn-sense");
        if (u.pos) sense.append(node("span", "bn-pos", u.pos), " ");
        sense.append(u.definition);
        if (u.example) sense.append(node("div", "bn-ex", `“${u.example}”`));
        box.append(sense);
      }
    }
    return box;
  }

  function showSynonyms(sel) {
    if (sel.text.split(/\s+/).length > MAX_SYNONYM_WORDS) {
      showTip("Select a word or short phrase to see synonyms.", sel.rect);
      return;
    }
    showLookup(sel, "SYNONYMS", renderSynonyms, true);
  }

  async function speak(sel) {
    try {
      const text = SPEAK === "bengali" ? await ask("TRANSLATE", sel.text) : sel.text;
      window.speechSynthesis.cancel(); // stop anything already speaking
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEAK_LANG;
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.error("[Bengali Meaning] speech error", err);
    }
  }

  // ---- Keyboard -----------------------------------------------------------

  // e.code (physical key) instead of e.key, so shortcuts still work with a Bangla keyboard layout.
  function actionFor(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod && !e.shiftKey && e.code === "KeyB" && !isTyping(e)) return showMeaning;
    if (mod && e.shiftKey && e.code === "KeyA") return showSynonyms;
    if (mod && e.shiftKey && e.code === "KeyS") return speak;
    return null;
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.repeat || e.altKey) return;
      const action = actionFor(e);
      if (!action) return;
      const sel = currentSelection();
      if (!sel) return; // nothing selected -> leave the key to the page/browser
      e.preventDefault();
      e.stopPropagation();
      action(sel);
    },
    true // capture phase, so we run before the page's own handlers
  );

  // Dismiss the tooltip when the user clicks elsewhere or scrolls away.
  document.addEventListener("mousedown", (e) => {
    if (tip && !tip.contains(e.target)) hideTip();
  });
  window.addEventListener("scroll", hideTip, true);
})();
