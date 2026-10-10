/**
 * Frame-side runtime injected into every theme document (before theme JS). Plain ES2017, no deps.
 *
 * - data-vm-* hooks (click + Enter/Space) → BridgeMessage to the parent (targetOrigin "*": the frame has an
 *   opaque origin and the messages carry no secrets; the host validates event.source + payload)
 * - window.VeroMenu API (frozen, non-writable)
 * - blocks navigation away from the menu (links other than #fragments, form submits)
 * - reports document height (vm:ready), receives vm:cart from the parent (event.source === parent only)
 * - auto-labels AI images ("KI-generiertes Symbolbild") the theme did not label itself
 */
export const BRIDGE_SCRIPT = String.raw`(function () {
  "use strict";
  var P = window.parent;
  var D = {};
  try { D = JSON.parse(document.getElementById("vm-data").textContent || "{}"); } catch (e) {}
  var root = document.documentElement;
  function post(m) { try { if (P && P !== window) P.postMessage(m, "*"); } catch (e) {} }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 100) : v == null ? "" : String(v).slice(0, max || 100); }

  var cart = { count: 0, totalFormatted: "" };
  var listeners = [];
  var api = Object.freeze({
    version: 1,
    mode: str(D.mode, 10),
    locale: str(D.locale, 10),
    openItem: function (id) { if (id) post({ type: "vm:openItem", itemId: str(id) }); },
    addToCart: function (id, variantId, quantity) {
      if (!id) return;
      var q = typeof quantity === "number" && quantity > 0 ? Math.min(99, Math.round(quantity)) : 1;
      post({ type: "vm:addToCart", itemId: str(id), variantId: variantId ? str(variantId) : null, quantity: q });
    },
    setLanguage: function (code) { if (code) post({ type: "vm:setLanguage", code: str(code, 10) }); },
    openCart: function () { post({ type: "vm:openCart" }); },
    openInfo: function () { post({ type: "vm:openInfo" }); },
    track: function (event, id) { if ((event === "item_view" || event === "category_view") && id) post({ type: "vm:track", event: event, id: str(id) }); },
    getCart: function () { return { count: cart.count, totalFormatted: cart.totalFormatted }; },
    onCart: function (fn) { if (typeof fn === "function") listeners.push(fn); }
  });
  try { Object.defineProperty(window, "VeroMenu", { value: api, writable: false, configurable: false, enumerable: true }); } catch (e) {}

  var HOOKS = "[data-vm-add],[data-vm-item],[data-vm-lang],[data-vm-cart],[data-vm-info]";
  function activate(el) {
    var d = el.dataset;
    if (el.hasAttribute("data-vm-add")) {
      api.addToCart(d.vmAdd, d.vmVariant || null, 1);
      el.setAttribute("data-vm-added", "");
      setTimeout(function () { el.removeAttribute("data-vm-added"); }, 900);
    } else if (el.hasAttribute("data-vm-item")) api.openItem(d.vmItem);
    else if (el.hasAttribute("data-vm-lang")) api.setLanguage(d.vmLang);
    else if (el.hasAttribute("data-vm-cart")) api.openCart();
    else if (el.hasAttribute("data-vm-info")) api.openInfo();
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest(HOOKS);
    if (el) { e.preventDefault(); activate(el); return; }
    var a = t.closest("a[href]");
    if (a && (a.getAttribute("href") || "").charAt(0) !== "#") e.preventDefault();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = e.target;
    if (!t || !t.matches || !t.matches(HOOKS)) return;
    var tag = t.tagName;
    if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (tag === "A" && e.key === "Enter")) return; // native activation → click
    e.preventDefault();
    activate(t);
  });
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  // keyboard access for hooks on non-interactive elements
  function a11y(scope) {
    var list = (scope.querySelectorAll ? scope.querySelectorAll(HOOKS) : []);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) continue;
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
    }
  }

  // AI image labels (legal requirement): theme labels via an element with [data-vm-ai-label] near the image
  var AI = {};
  (D.ai || []).forEach(function (u) { AI[u] = 1; });
  function isAi(img) {
    if (img.hasAttribute("data-vm-ai")) return true;
    var s = img.getAttribute("src") || "";
    return !!(AI[s] || AI[img.currentSrc || ""] || AI[img.src || ""]);
  }
  function labelAi(scope) {
    var imgs = scope.querySelectorAll ? scope.querySelectorAll("img") : [];
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.hasAttribute("data-vm-ai-checked") || !isAi(img)) continue;
      img.setAttribute("data-vm-ai-checked", "");
      var box = img.closest("[data-vm-item]") || img.parentElement;
      if (!box || box.querySelector("[data-vm-ai-label]")) continue;
      var parent = img.parentElement;
      if (!parent) continue;
      try { if (getComputedStyle(parent).position === "static") parent.style.position = "relative"; } catch (e) {}
      var label = document.createElement("span");
      label.className = "vm-ai-label";
      label.setAttribute("data-vm-ai-label", "auto");
      // Small, unobtrusive badge; the full disclosure is the tooltip/aria-label and the host info sheet.
      label.textContent = "\u2726 " + str(D.aiBadge || "KI", 8);
      label.setAttribute("title", str(D.aiLabel || "KI-generiertes Symbolbild", 80));
      label.setAttribute("aria-label", str(D.aiLabel || "KI-generiertes Symbolbild", 80));
      label.setAttribute("style", "position:absolute!important;inset-inline-start:4px!important;bottom:4px!important;display:inline-block!important;visibility:visible!important;opacity:1!important;z-index:2147483647!important;padding:1px 4px!important;border-radius:3px!important;background:rgba(0,0,0,.5)!important;color:#fff!important;font:600 9px/1.2 system-ui,sans-serif!important;letter-spacing:.02em!important;text-transform:none!important;pointer-events:none!important;transform:none!important;clip:auto!important;clip-path:none!important;width:auto!important;max-width:none!important");
      img.insertAdjacentElement("afterend", label);
    }
  }

  // cart updates from the host
  var spacer = document.getElementById("vm-host-spacer");
  function setText(sel, v) { var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) l[i].textContent = v; }
  window.addEventListener("message", function (e) {
    if (e.source !== P || !e.data || typeof e.data !== "object") return;
    var m = e.data;
    if (m.type !== "vm:cart") return;
    acked = true;
    var count = Math.max(0, Math.min(999, Number(m.count) || 0));
    cart = { count: count, totalFormatted: str(m.totalFormatted, 40) };
    root.setAttribute("data-cart-count", String(count));
    setText("[data-vm-cart-count]", String(count));
    setText("[data-vm-cart-total]", cart.totalFormatted);
    if (spacer) spacer.style.height = Math.max(0, Math.min(200, Number(m.insetBottom) || 0)) + "px";
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](api.getCart()); } catch (err) {} }
    try { window.dispatchEvent(new CustomEvent("vm:cart", { detail: api.getCart() })); } catch (err) {}
  });

  // height reporting (studio previews / auto-height embeds)
  var lastH = 0, timer = 0, acked = false;
  function report() {
    timer = 0;
    var h = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    if (Math.abs(h - lastH) < 2) return;
    lastH = h;
    post({ type: "vm:ready", height: h });
  }
  function schedule() { if (!timer) timer = setTimeout(report, 150); }

  // ---------------------------------------------------------------- category navigation (scrollspy)
  // Engine-provided so every theme (incl. AI-written ones) gets a sticky bar that follows the menu:
  // active link → aria-current="true" + data-vm-active, bar scrolls horizontally to it, smooth jump on click.
  // Theme opt-outs: data-vm-catnav="static" (not sticky), data-vm-catnav="off" (no behaviour at all).
  function setupCatnav() {
    function targetOf(a) {
      var h = a.getAttribute("href") || "";
      if (h.length < 2 || h.charAt(0) !== "#") return null;
      try { return document.getElementById(decodeURIComponent(h.slice(1))); } catch (e) { return null; }
    }
    function collect(el) {
      var out = [], ls = el.querySelectorAll("a[href^='#']");
      for (var i = 0; i < ls.length; i++) { var t = targetOf(ls[i]); if (t && t !== el && !el.contains(t)) out.push({ a: ls[i], t: t }); }
      return out;
    }
    var nav = document.querySelector("[data-vm-catnav]");
    var pairs = nav ? collect(nav) : [];
    if (!nav) {
      var cands = document.querySelectorAll("[data-catnav], nav, [role='navigation']");
      for (var c = 0; c < cands.length; c++) { var p = collect(cands[c]); if (p.length >= 2) { nav = cands[c]; pairs = p; break; } }
    }
    if (!nav || pairs.length < 2 || nav.getAttribute("data-vm-catnav") === "off") return;
    nav.setAttribute("data-vm-catnav-active", "");

    // sticky self-heal
    try {
      if (nav.getAttribute("data-vm-catnav") !== "static") {
        var cs = getComputedStyle(nav);
        if (cs.position === "static" || cs.position === "relative") {
          nav.style.position = "sticky";
          if (cs.top === "auto") nav.style.top = "0px";
          if (cs.zIndex === "auto") nav.style.zIndex = "30";
        }
        // overflow:hidden on an ancestor silently disables sticky → clip keeps the look without breaking it
        for (var an = nav.parentElement; an && an !== document.body && an !== document.documentElement; an = an.parentElement) {
          var acs = getComputedStyle(an);
          if (acs.overflowX === "hidden" || acs.overflowY === "hidden") an.style.overflow = "clip";
        }
      }
    } catch (e) {}

    function navH() { var r = nav.getBoundingClientRect(); return getComputedStyle(nav).position === "sticky" || getComputedStyle(nav).position === "fixed" ? r.height : 0; }
    function scrollerOf(a) {
      for (var el = a.parentElement; el; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 2) { var o = getComputedStyle(el).overflowX; if (o === "auto" || o === "scroll") return el; }
        if (el === nav) break;
      }
      return null;
    }
    var seen = {}, current = -1, ticking = false;
    function setActive(i, fromClick) {
      if (i === current) return;
      current = i;
      for (var k = 0; k < pairs.length; k++) {
        if (k === i) { pairs[k].a.setAttribute("aria-current", "true"); pairs[k].a.setAttribute("data-vm-active", ""); }
        else { pairs[k].a.removeAttribute("aria-current"); pairs[k].a.removeAttribute("data-vm-active"); }
      }
      var a = pairs[i].a, sc = scrollerOf(a);
      if (sc) {
        var ar = a.getBoundingClientRect(), sr = sc.getBoundingClientRect();
        var delta = ar.left + ar.width / 2 - (sr.left + sr.width / 2);
        try { sc.scrollBy({ left: delta, behavior: fromClick ? "auto" : "smooth" }); } catch (e) { sc.scrollLeft += delta; }
      }
      var id = pairs[i].t.getAttribute("data-category") || pairs[i].t.id.replace(/^c-/, "");
      if (id && !seen[id]) { seen[id] = 1; api.track("category_view", id); }
    }
    function compute() {
      ticking = false;
      var line = navH() + Math.min(120, window.innerHeight * 0.25), idx = 0;
      for (var k = 0; k < pairs.length; k++) if (pairs[k].t.getBoundingClientRect().top <= line) idx = k;
      // at the very bottom the last section wins even if it is short
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) idx = pairs.length - 1;
      setActive(idx, false);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(compute); } }
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true }); // themes with an inner scroller
    window.addEventListener("resize", onScroll);
    nav.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href^='#']") : null;
      if (!a) return;
      for (var k = 0; k < pairs.length; k++) if (pairs[k].a === a) {
        e.preventDefault();
        e.stopPropagation();
        var t = pairs[k].t;
        t.style.scrollMarginTop = Math.ceil(navH() + 8) + "px";
        var reduce = false;
        try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (err) {}
        try { t.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }); } catch (err) { t.scrollIntoView(); }
        setActive(k, true);
        return;
      }
    }, true);
    compute();
    // layout settles after fonts/images → recompute once more
    window.addEventListener("load", onScroll);
    setTimeout(onScroll, 600);
  }

  function init() {
    a11y(document);
    try { setupCatnav(); } catch (e) {}
    labelAi(document);
    report();
    if (lastH === 0) post({ type: "vm:ready", height: 0 });
    // the host may still be hydrating → repeat vm:ready until it answers with vm:cart (max ~10 s)
    var tries = 0;
    var again = setInterval(function () {
      if (acked || ++tries > 40) { clearInterval(again); return; }
      post({ type: "vm:ready", height: lastH });
    }, 250);
    try { new ResizeObserver(schedule).observe(document.documentElement); } catch (e) { window.addEventListener("resize", schedule); }
    try {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var nodes = records[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) if (nodes[j].nodeType === 1) { a11y(nodes[j]); labelAi(nodes[j].parentNode || nodes[j]); }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    window.addEventListener("load", function () { labelAi(document); schedule(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();`;

/** Minimal base styles (before theme CSS, low specificity via :where). */
export const BASE_CSS = `:where(html){-webkit-text-size-adjust:100%;text-size-adjust:100%}
:where(body){margin:0}
:where([data-vm-item],[data-vm-add],[data-vm-cart],[data-vm-info],[data-vm-lang]){cursor:pointer}
:where(:focus-visible){outline:2px solid currentColor;outline-offset:2px}
:where(img){max-width:100%}
#vm-host-spacer{display:block;height:0;pointer-events:none}
:where([data-vm-catnav]:not([data-vm-catnav=static]):not([data-vm-catnav=off])){position:sticky;top:0;z-index:30}
:where([data-vm-catnav-active] [aria-current=true]){font-weight:700}`;
