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
      label.textContent = str(D.aiLabel || "KI-generiertes Symbolbild", 60);
      label.setAttribute("style", "position:absolute!important;inset-inline-start:6px!important;bottom:6px!important;display:block!important;visibility:visible!important;opacity:1!important;z-index:2147483647!important;max-width:calc(100% - 12px)!important;padding:2px 6px!important;border-radius:4px!important;background:rgba(0,0,0,.65)!important;color:#fff!important;font:500 10px/1.3 system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;pointer-events:none!important;transform:none!important;clip:auto!important;clip-path:none!important");
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

  function init() {
    a11y(document);
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
#vm-host-spacer{display:block;height:0;pointer-events:none}`;
