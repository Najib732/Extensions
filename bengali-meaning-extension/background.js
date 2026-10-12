// Service worker: fetches translations from Google's free (unofficial) endpoint.
// Content scripts can't call it directly because of CORS, so the fetch lives here.

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateToBengali(text) {
  const url =
    `${ENDPOINT}?client=gtx&sl=auto&tl=bn&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  // data[0] is an array of [translatedSegment, originalSegment, ...] chunks.
  const translated = (data[0] || [])
    .map((seg) => (seg && seg[0]) || "")
    .join("");

  return translated || "(no translation)";
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "TRANSLATE") {
    translateToBengali(msg.text)
      .then((bn) => sendResponse({ ok: true, bn }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async reply
  }
});
