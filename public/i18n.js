(() => {
  const languages = {
    "zh-CN": "中文",
    en: "English",
    ja: "日本語",
    ko: "한국어",
    "zh-TW": "繁體中文",
  };
  const normalize = (value) => String(value).replace(/\s+/g, " ").trim();
  const translations = window.siteTranslations;
  let locale = "zh-CN";
  try {
    const saved = localStorage.getItem("fastai-language");
    if (Object.hasOwn(languages, saved)) locale = saved;
  } catch {
    // The language selector also works when browser storage is disabled.
  }

  function t(source, values = {}) {
    const key = normalize(source);
    const text = translations[locale]?.[key] ?? source;
    return text.replace(/\{(\w+)\}/g, (token, name) => values[name] ?? token);
  }

  // Keep the source text nodes so switching back never translates a translation.
  // Updating text nodes preserves inline emphasis, SVG icons and event handlers.
  const textEntries = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest("script, style, svg, .language-picker")) continue;
    const source = normalize(node.textContent);
    if (Object.hasOwn(translations.en, source)) {
      textEntries.push({
        node,
        source,
        before: node.textContent.match(/^\s*/)[0],
        after: node.textContent.match(/\s*$/)[0],
      });
    }
  }
  const attributeEntries = [];
  for (const element of document.querySelectorAll("[alt], [aria-label], meta[content]")) {
    if (element.closest(".language-picker")) continue;
    for (const attribute of ["alt", "aria-label", "content"]) {
      const source = element.getAttribute(attribute);
      if (source && Object.hasOwn(translations.en, normalize(source)))
        attributeEntries.push({ element, attribute, source });
    }
  }

  const picker = document.querySelector("#language-picker");
  const trigger = document.querySelector("#language-trigger");
  const menu = document.querySelector("#language-menu");
  const options = [...menu.querySelectorAll("[data-language]")];
  function close(focus = false) {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus();
  }
  function open(focus = false) {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (focus) options.find((option) => option.dataset.language === locale).focus();
  }
  function applyLanguage() {
    document.documentElement.lang = locale;
    document.body.dataset.language = locale;
    for (const { node, source, before, after } of textEntries) {
      if (!node.isConnected) continue;
      const text = t(source);
      const next = node.nextSibling;
      const space = locale === "en" && /\w$/.test(text) &&
        next?.nodeType === Node.ELEMENT_NODE && !["BR", "SVG"].includes(next.tagName);
      node.textContent = before + text + (after || (space ? " " : ""));
    }
    for (const { element, attribute, source } of attributeEntries)
      element.setAttribute(attribute, t(source));
    document.querySelector("#language-current-label").textContent = languages[locale];
    const selected = options.find((option) => option.dataset.language === locale);
    document.querySelector("#language-current-flag").replaceChildren(
      ...[...selected.querySelector(".language-flag").childNodes].map((node) => node.cloneNode(true)),
    );
    document.querySelector("#language-current-flag").classList.toggle("traditional-mark", locale === "zh-TW");
    trigger.setAttribute("aria-label", t("选择语言") + ": " + languages[locale]);
    menu.setAttribute("aria-label", t("选择语言"));
    for (const option of options)
      option.setAttribute("aria-checked", String(option === selected));
  }
  trigger.addEventListener("click", () => menu.hidden ? open() : close());
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(true);
    }
  });
  for (const option of options) {
    option.addEventListener("click", () => {
      locale = option.dataset.language;
      try { localStorage.setItem("fastai-language", locale); } catch { /* Optional persistence. */ }
      applyLanguage();
      window.dispatchEvent(new Event("site:languagechange"));
      close(true);
    });
  }
  menu.addEventListener("keydown", (event) => {
    const index = options.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % options.length;
    if (event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = options.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      options[next].focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) close(true);
  });
  document.addEventListener("click", (event) => {
    if (!picker.contains(event.target)) close();
  });
  picker.addEventListener("focusout", (event) => {
    if (!picker.contains(event.relatedTarget)) close();
  });
  window.siteI18n = { t, get locale() { return locale; } };
  applyLanguage();
})();
