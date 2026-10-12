// Service worker: does all network lookups for the content script.
// Content scripts can't call these APIs directly because of CORS, so the fetches live here.

const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const DATAMUSE = "https://api.datamuse.com/words";
const WIKTIONARY = "https://en.wiktionary.org/api/rest_v1/page/definition/";

const MAX_SYNONYMS = 10;
const MAX_SENSES = 3;
const MAX_EXAMPLE_LEN = 220;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---- Bengali meaning (B) ----------------------------------------------------

async function translateToBengali(text) {
  const data = await getJson(
    `${TRANSLATE_ENDPOINT}?client=gtx&sl=auto&tl=bn&dt=t&q=${encodeURIComponent(text)}`
  );
  // data[0] is an array of [translatedSegment, originalSegment, ...] chunks.
  const translated = (data[0] || [])
    .map((seg) => (seg && seg[0]) || "")
    .join("");

  return translated || "(no translation)";
}

// ---- English synonyms + usage (Cmd/Ctrl+Shift+A) ----------------------------

// Wiktionary returns HTML snippets and service workers have no DOMParser, so strip tags by hand.
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(text) {
  return text.length > MAX_EXAMPLE_LEN ? `${text.slice(0, MAX_EXAMPLE_LEN - 1)}…` : text;
}

// Datamuse frequency tag looks like "f:123.45" (occurrences per million words).
function frequency(word) {
  const tag = (word.tags || []).find((t) => t.startsWith("f:"));
  return tag ? parseFloat(tag.slice(2)) : 0;
}

async function fetchSynonyms(term) {
  const q = encodeURIComponent(term);
  let words = [];
  if (!/\s/.test(term)) {
    // Most common synonyms first: easier words are more useful for a learner.
    words = await getJson(`${DATAMUSE}?rel_syn=${q}&max=40&md=f`);
    words.sort((a, b) => frequency(b) - frequency(a));
  }
  // Phrases, and words WordNet has no synonyms for, fall back to "means like".
  if (words.length === 0) words = await getJson(`${DATAMUSE}?ml=${q}&max=12`);
  return words
    .map((w) => w.word)
    .filter((w) => w !== term)
    .slice(0, MAX_SYNONYMS);
}

// Definitions with example sentences, from Wiktionary.
async function fetchWiktionaryUsage(term) {
  const data = await getJson(WIKTIONARY + encodeURIComponent(term.replace(/ /g, "_")));
  const senses = [];
  const seenExamples = new Set();
  for (const entry of data.en || []) {
    for (const d of entry.definitions || []) {
      const definition = stripHtml(d.definition || "");
      if (!definition) continue;
      // Wiktionary sometimes repeats a parent sense's example under its sub-senses.
      const example =
        (d.examples || []).map(stripHtml).find((ex) => ex && !seenExamples.has(ex)) || "";
      seenExamples.add(example);
      senses.push({
        pos: (entry.partOfSpeech || "").toLowerCase(),
        definition,
        example: shorten(example),
      });
    }
  }
  // Prefer senses that come with an example sentence (sort is stable, so order is kept otherwise).
  senses.sort((a, b) => Boolean(b.example) - Boolean(a.example));
  return senses.slice(0, MAX_SENSES);
}

// WordNet definitions from Datamuse: no examples, but covers words Wiktionary misses.
async function fetchDatamuseUsage(term) {
  const [hit] = await getJson(`${DATAMUSE}?sp=${encodeURIComponent(term)}&md=d&max=1`);
  return ((hit && hit.defs) || []).slice(0, MAX_SENSES).map((def) => {
    const [pos, definition] = def.split("\t");
    return { pos, definition: definition.trim(), example: "" };
  });
}

async function fetchUsage(text) {
  // Wiktionary titles are case-sensitive: try "Bengali" as selected, then "bengali".
  for (const term of new Set([text, text.toLowerCase()])) {
    try {
      const senses = await fetchWiktionaryUsage(term);
      if (senses.length) return senses;
    } catch {
      // No Wiktionary page for this spelling; try the next one.
    }
  }
  try {
    return await fetchDatamuseUsage(text.toLowerCase());
  } catch {
    return [];
  }
}

async function lookupSynonyms(text) {
  const term = text.toLowerCase();
  const [synonyms, usage] = await Promise.all([fetchSynonyms(term), fetchUsage(text)]);
  return { synonyms, usage };
}

// ---- Messaging --------------------------------------------------------------

const HANDLERS = {
  TRANSLATE: translateToBengali,
  SYNONYMS: lookupSynonyms,
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = msg && HANDLERS[msg.type];
  if (!handler) return;
  handler(msg.text)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep the message channel open for the async reply
});
