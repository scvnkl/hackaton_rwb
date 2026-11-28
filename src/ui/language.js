// Translate only the rendered interface. Model identifiers, input values and imported data
// retain their original values, including while a running shift changes language.
(() => {
  const selector = document.getElementById("uiLanguage");
  const storageKey = "wb-sim.language";
  let language = navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "ru" || saved === "en") language = saved;
  } catch { /* Storage may be unavailable for local HTML files. */ }

  const attributes = ["title", "aria-label", "placeholder", "alt", "label"];
  const originals = new WeakMap();
  const escape = key => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alternatives = Object.keys(englishPhrases).sort((a, b) => b.length - a.length).map(escape);
  const pattern = new RegExp("(?<![А-Яа-яЁё])(?:" + alternatives.join("|") + ")(?![А-Яа-яЁё])", "gu");

  function localize(node, key) {
    const isText = key === "text";
    const value = isText ? node.data : node.getAttribute(key);
    if (!value) return;
    let entries = originals.get(node);
    const prior = entries?.get(key);
    const source = prior && value === prior.rendered ? prior.source : value;
    if (language === "ru" && !prior) return;
    const rendered = language === "en" ? source.replace(pattern, term => englishPhrases[term]) : source;
    if (rendered !== value) {
      if (isText) node.data = rendered;
      else node.setAttribute(key, rendered);
    }
    if (language === "en" && source !== rendered) {
      if (!entries) originals.set(node, entries = new Map());
      entries.set(key, {source, rendered});
    } else entries?.delete(key);
  }

  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      localize(node, "text");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches("script,style,template,[translate=no]")) return;
    for (const key of attributes) if (node.hasAttribute(key)) localize(node, key);
    for (const child of node.childNodes) visit(child);
  }

  function render() {
    document.documentElement.lang = language;
    selector.value = language;
    visit(document.querySelector("title"));
    visit(document.body);
  }

  selector.addEventListener("change", () => {
    language = selector.value;
    try { localStorage.setItem(storageKey, language); } catch {}
    render();
  });
  render();
  // Panels, Leaflet popups and reports are built on demand. Observe only text and
  // display attributes, never map positions or the shift's frequently updated styles.
  new MutationObserver(records => {
    if (language !== "en") return;
    for (const record of records) {
      if (!record.target.isConnected) continue;
      const parent = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
      if (parent.closest("script,style,[translate=no]")) continue;
      if (record.type === "attributes") localize(record.target, record.attributeName);
      else if (record.type === "characterData") visit(record.target);
      else for (const child of record.addedNodes) if (child.isConnected) visit(child);
    }
  }).observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes});
})();
