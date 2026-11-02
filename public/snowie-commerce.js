/*!
 * Snowie Commerce — universal storefront agent runtime.
 *
 * Runs on the merchant's page and gives the agent eyes and hands:
 *
 *   USER INTENT -> Task Planner (server)
 *                     |
 *               Page Understanding  ->  DOM + Accessibility tree + Vision
 *                     |
 *               Semantic UI Map     ->  sent to the planner
 *                     |
 *               Action Selector     ->  click / type / scroll / navigate
 *                     |
 *               Page changed?       ->  re-analyse and repeat
 *
 * Three execution tiers, best first:
 *   protocol  the server answers from the storefront's own commerce protocol
 *   page      a known fast path in this browser (Shopify/Woo cart endpoints)
 *   ui        drive whatever is on screen by role and accessible name
 *
 * The UI tier needs nothing from the storefront, so the agent keeps working on
 * custom themes, headless builds and non-Shopify sites.
 *
 * Embed:
 *   <script src="https://.../snowie-commerce.js"
 *           data-schema="<tenant schema>"
 *           data-agent-id="<agent code>"
 *           data-base-url="https://app.snowie.ai"></script>
 */
(function () {
  "use strict";

  if (window.__snowieCommerce) return;

  // ─── Config ────────────────────────────────────────────────────────────────
  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      return all[all.length - 1];
    })();

  var attr = function (name, fallback) {
    var value = script && script.getAttribute(name);
    return value == null || value === "" ? fallback : value;
  };

  var SCHEMA = attr("data-schema", "");
  var AGENT = attr("data-agent-id", attr("data-widget-id", ""));
  var BASE = String(attr("data-base-url", "https://app.snowie.ai")).replace(/\/+$/, "");
  var POLL_MS = Math.max(parseInt(attr("data-poll-interval", "500"), 10) || 500, 400);
  var DEBUG = attr("data-debug", "") === "true";

  var MAX_ELEMENTS = 150;
  var MAX_TEXT = 120;

  function log() {
    if (!DEBUG) return;
    try {
      console.log.apply(console, ["[snowie-commerce]"].concat([].slice.call(arguments)));
    } catch (e) {}
  }

  var state = {
    token: null,
    sessionId: null,
    capabilities: [],
    actions: [],
    protocol: null,
    autonomy: "assist",
    polling: false,
    stopped: false,
    backoff: 0,
    roomName: "",
    callId: "",
  };

  // ─── Session id (shared with snowie-tracker.js) ────────────────────────────
  function sessionId() {
    if (state.sessionId) return state.sessionId;
    var key = "snowie_session_id";
    var existing = null;
    try {
      existing = localStorage.getItem(key);
    } catch (e) {}
    if (!existing) {
      existing =
        "sn_" +
        (window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36));
      try {
        localStorage.setItem(key, existing);
      } catch (e) {}
    }
    state.sessionId = existing;
    return existing;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE UNDERSTANDING
  // ═══════════════════════════════════════════════════════════════════════════

  var INTERACTIVE = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    "[role=button]", "[role=link]", "[role=tab]", "[role=checkbox]", "[role=radio]",
    "[role=menuitem]", "[role=option]", "[role=combobox]", "[role=switch]",
    "[onclick]", "[data-action]", "[contenteditable=true]", "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    var style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.visibility === "hidden" || style.display === "none") return false;

    // Opacity and aria-hidden both hide descendants, but neither is reported on
    // the descendant itself, so walk up. Stop at the shadow-root host boundary.
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 40) {
      if (node.getAttribute && node.getAttribute("aria-hidden") === "true") return false;
      if (node.hasAttribute && node.hasAttribute("inert")) return false;
      var nodeStyle = node === el ? style : window.getComputedStyle(node);
      if (nodeStyle && parseFloat(nodeStyle.opacity) < 0.05) return false;
      node = node.parentNode;
      if (node && node.nodeType === 11) node = node.host; // cross shadow boundary
      depth += 1;
    }
    return true;
  }

  function isDisabled(el) {
    if (!el) return true;
    if (el.disabled) return true;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return true;
    return !!(el.closest && el.closest("fieldset[disabled]"));
  }

  function inViewport(el) {
    var rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < (window.innerHeight || 0) &&
           rect.right > 0 && rect.left < (window.innerWidth || 0);
  }

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  }

  /** Accessible name, following the order assistive tech uses. */
  function accessibleName(el) {
    var byLabel = el.getAttribute && el.getAttribute("aria-label");
    if (byLabel) return clean(byLabel);

    var labelledBy = el.getAttribute && el.getAttribute("aria-labelledby");
    if (labelledBy) {
      var parts = labelledBy.split(/\s+/).map(function (id) {
        var node = document.getElementById(id);
        return node ? node.textContent : "";
      });
      var joined = clean(parts.join(" "));
      if (joined) return joined;
    }

    if (el.labels && el.labels.length) {
      var fromLabel = clean(el.labels[0].textContent);
      if (fromLabel) return fromLabel;
    }

    var tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      var placeholder = el.getAttribute("placeholder");
      if (placeholder) return clean(placeholder);
      if (el.type === "submit" || el.type === "button") return clean(el.value);
      var name = el.getAttribute("name");
      if (name) return clean(name);
    }

    if (tag === "img") return clean(el.getAttribute("alt"));

    var text = clean(el.innerText || el.textContent);
    if (text) return text;

    var title = el.getAttribute && el.getAttribute("title");
    if (title) return clean(title);

    var img = el.querySelector && el.querySelector("img[alt]");
    if (img) return clean(img.getAttribute("alt"));

    return "";
  }

  var IMPLICIT_ROLE = {
    a: "link", button: "button", select: "combobox", textarea: "textbox",
    summary: "button", form: "form", nav: "navigation", main: "main",
  };

  function role(el) {
    var explicit = el.getAttribute && el.getAttribute("role");
    if (explicit) return explicit;
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "input") {
      var type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button" || type === "reset") return "button";
      if (type === "number") return "spinbutton";
      return "textbox";
    }
    if (tag === "a") return el.hasAttribute("href") ? "link" : "generic";
    return IMPLICIT_ROLE[tag] || "generic";
  }

  /** Stable-ish selector, preferring things that survive a re-render. */
  function selectorFor(el) {
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return "#" + el.id;

    var stable = ["data-testid", "data-test", "data-cy", "data-action", "name"];
    for (var i = 0; i < stable.length; i++) {
      var value = el.getAttribute && el.getAttribute(stable[i]);
      if (value) {
        var candidate = el.tagName.toLowerCase() + "[" + stable[i] + '="' +
                        String(value).replace(/"/g, '\\"') + '"]';
        try {
          if (document.querySelectorAll(candidate).length === 1) return candidate;
        } catch (e) {}
      }
    }

    var path = [];
    var node = el;
    while (node && node.nodeType === 1 && path.length < 6) {
      var part = node.tagName.toLowerCase();
      var parent = node.parentNode;
      if (!parent || parent.nodeType !== 1) {
        path.unshift(part);
        break;
      }
      var siblings = [].filter.call(parent.children, function (child) {
        return child.tagName === node.tagName;
      });
      if (siblings.length > 1) {
        part += ":nth-of-type(" + ([].indexOf.call(siblings, node) + 1) + ")";
      }
      path.unshift(part);
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        path.unshift("#" + node.id);
        break;
      }
      node = parent;
    }
    return path.join(" > ");
  }

  /** Walk light DOM and open shadow roots — modern themes use web components. */
  function collectInteractive(root, out, depth) {
    if (!root || out.length >= MAX_ELEMENTS || depth > 5) return;
    var nodes;
    try {
      nodes = root.querySelectorAll(INTERACTIVE);
    } catch (e) {
      return;
    }
    for (var i = 0; i < nodes.length && out.length < MAX_ELEMENTS; i++) {
      if (visible(nodes[i])) out.push(nodes[i]);
    }
    var all;
    try {
      all = root.querySelectorAll("*");
    } catch (e) {
      return;
    }
    for (var j = 0; j < all.length && out.length < MAX_ELEMENTS; j++) {
      if (all[j].shadowRoot) collectInteractive(all[j].shadowRoot, out, depth + 1);
    }
  }

  var elementRegistry = {};

  /** Short stable hash so a ref identifies an element, not a position. */
  function hashRef(parts) {
    var text = parts.join("|");
    var hash = 5381;
    for (var i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    }
    return "r" + hash.toString(36);
  }

  /** The Semantic UI Map the planner reasons over. */
  function buildUIMap() {
    elementRegistry = {};
    var found = [];
    collectInteractive(document, found, 0);

    var elements = [];
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      var name = accessibleName(el);
      var elRole = role(el);
      if (!name && elRole === "generic") continue;

      var selector = selectorFor(el);
      var ref = hashRef([elRole, name, selector]);
      // Identical role+name+selector can legitimately repeat; keep refs unique
      // without making them positional for everything else.
      if (elementRegistry[ref] && elementRegistry[ref] !== el) {
        var seq = 2;
        while (elementRegistry[ref + "_" + seq]) seq += 1;
        ref = ref + "_" + seq;
      }
      elementRegistry[ref] = el;

      var rect = el.getBoundingClientRect();
      var entry = {
        ref: ref,
        role: elRole,
        name: name,
        selector: selector,
        in_view: inViewport(el),
      };
      if (isDisabled(el)) entry.disabled = true;
      if (el.tagName === "A" && el.href) entry.href = el.href;
      if (el.value != null && String(el.value) && elRole === "textbox") {
        entry.value = clean(el.value);
      }
      if (el.checked != null && (elRole === "checkbox" || elRole === "radio")) {
        entry.checked = !!el.checked;
      }
      if (el.tagName === "SELECT") {
        entry.options = [].slice.call(el.options, 0, 30).map(function (option) {
          return { value: option.value, label: clean(option.text),
                   selected: !!option.selected };
        });
      }
      entry.y = Math.round(rect.top + window.scrollY);
      elements.push(entry);
    }

    return {
      url: location.href,
      title: clean(document.title),
      page_type: pageType(),
      headings: [].slice
        .call(document.querySelectorAll("h1, h2"), 0, 8)
        .filter(visible)
        .map(function (h) { return clean(h.textContent); })
        .filter(Boolean),
      elements: elements,
      scroll: {
        y: Math.round(window.scrollY),
        height: Math.round(document.documentElement.scrollHeight),
        viewport: Math.round(window.innerHeight),
      },
      captured_at: new Date().toISOString(),
    };
  }

  function pageType() {
    var path = location.pathname.toLowerCase();
    if (/\/products\//.test(path)) return "product";
    if (/\/collections\//.test(path)) return "collection";
    if (/\/cart/.test(path)) return "cart";
    if (/\/checkout/.test(path)) return "checkout";
    if (/\/search/.test(path)) return "search";
    if (path === "/" || path === "") return "home";
    return "other";
  }

  // ─── Platform detection + live context ─────────────────────────────────────

  function platform() {
    if (window.Shopify || document.querySelector("script[src*='cdn.shopify.com']")) {
      return "shopify";
    }
    if (window.wc_add_to_cart_params || document.body.className.indexOf("woocommerce") >= 0) {
      return "woocommerce";
    }
    return "generic";
  }

  function shopifyRoot() {
    try {
      return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
    } catch (e) {
      return "/";
    }
  }

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }

  /** What the shopper is looking at right now, for "this one" / "my cart". */
  function pageContext() {
    var context = {
      url: location.href,
      path: location.pathname,
      title: clean(document.title),
      page_type: pageType(),
      platform: platform(),
      referrer: document.referrer || "",
    };

    var meta = function (property) {
      var node = document.querySelector('meta[property="' + property + '"]');
      return node ? node.getAttribute("content") : null;
    };
    var ogTitle = meta("og:title");
    if (ogTitle) context.og_title = clean(ogTitle);

    if (context.page_type === "product") {
      var handle = location.pathname.split("/products/")[1];
      if (handle) context.product_handle = handle.split(/[?#]/)[0];
      var selected = new URLSearchParams(location.search).get("variant");
      if (!selected) {
        var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
        if (input && input.value) selected = input.value;
      }
      if (selected) context.variant_id = String(selected);
      var price = meta("og:price:amount");
      if (price) context.price = price;
    }
    if (context.page_type === "collection") {
      var collection = location.pathname.split("/collections/")[1];
      if (collection) context.collection_handle = collection.split(/[?#]/)[0];
    }
    if (context.page_type === "search") {
      context.search_query = new URLSearchParams(location.search).get("q") || "";
    }
    return context;
  }

  /** Enrich context with the live cart, best effort. */
  function withCart(context) {
    if (platform() !== "shopify") return Promise.resolve(context);
    return fetchJSON(shopifyRoot() + "cart.js", { credentials: "same-origin" })
      .then(function (cart) {
        context.cart = {
          count: cart.item_count,
          total: cart.total_price,
          currency: cart.currency,
          items: (cart.items || []).slice(0, 25).map(function (item) {
            return {
              variant_id: String(item.variant_id),
              product_id: String(item.product_id),
              title: item.title,
              quantity: item.quantity,
              line_price: item.line_price,
              url: item.url,
            };
          }),
        };
        return context;
      })
      .catch(function () {
        return context;
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION SELECTOR — execution
  // ═══════════════════════════════════════════════════════════════════════════

  /** Resolve a target from a ref, a selector, or a role+name description. */
  function resolveTarget(payload) {
    if (payload.ref && elementRegistry[payload.ref]) {
      var registered = elementRegistry[payload.ref];
      if (document.contains(registered)) return registered;
    }
    if (payload.selector) {
      try {
        var bySelector = document.querySelector(payload.selector);
        if (bySelector) return bySelector;
      } catch (e) {}
    }
    if (payload.name) {
      var wanted = String(payload.name).toLowerCase();
      var candidates = [];
      collectInteractive(document, candidates, 0);
      var exact = [];
      var partial = [];
      for (var i = 0; i < candidates.length; i++) {
        if (payload.role && role(candidates[i]) !== payload.role) continue;
        var name = accessibleName(candidates[i]).toLowerCase();
        if (!name) continue;
        if (name === wanted) exact.push(candidates[i]);
        else if (name.indexOf(wanted) >= 0) partial.push(candidates[i]);
      }
      // Several controls can share a name (sticky bars, mobile duplicates).
      // Prefer one the shopper can actually use: enabled, then on screen.
      return best(exact) || best(partial);
    }
    return null;
  }

  function best(candidates) {
    if (!candidates.length) return null;
    var usable = candidates.filter(function (el) { return !isDisabled(el); });
    var pool = usable.length ? usable : candidates;
    var onScreen = pool.filter(inViewport);
    return (onScreen.length ? onScreen : pool)[0];
  }

  function scrollIntoView(el) {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      el.scrollIntoView();
    }
  }

  /** Full pointer sequence so framework handlers (React/Vue/Alpine) fire. */
  function realClick(el) {
    var rect = el.getBoundingClientRect();
    var init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    try { el.dispatchEvent(new PointerEvent("pointerdown", init)); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mousedown", init));
    try { el.focus({ preventScroll: true }); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent("pointerup", init)); } catch (e) {}
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.dispatchEvent(new MouseEvent("click", init));
  }

  /** Set a value the way a user would, bypassing React's value tracker. */
  function realType(el, text) {
    var prototype = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(prototype, "value");
    try { el.focus({ preventScroll: true }); } catch (e) {}
    if (setter && setter.set) {
      setter.set.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function sameOrigin(url) {
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  /**
   * Product URLs from Shopify's catalog are often on the myshopify.com host
   * while the shopper is on a custom domain, or they omit the locale prefix
   * (/en/, /fr-ca/). Keep store paths and rebase them onto this visit.
   */
  function storePath(url) {
    if (!url) return "";
    try {
      var parsed = new URL(url, location.href);
      var path = parsed.pathname || "/";
      var onThisShop = parsed.origin === location.origin;
      var storeish = /^(\/[a-z]{2}(?:-[a-zA-Z]{2})?)?\/(products|collections|cart|checkout|search|pages|account)(\/|$)/i.test(path);
      if (!onThisShop && !storeish) return "";
      var root = shopifyRoot();
      if (!onThisShop && root && root !== "/" && path.indexOf(root) !== 0) {
        path = root.replace(/\/$/, "") + path;
      }
      return path + parsed.search + parsed.hash;
    } catch (e) {
      return "";
    }
  }

  /** Same store path, ignoring a trailing slash. Used to drop a repeat navigation. */
  function pathKey(href) {
    try {
      var parsed = new URL(href, location.href);
      var path = (parsed.pathname || "/").replace(/\/+$/, "") || "/";
      return parsed.origin + path + parsed.search;
    } catch (e) {
      return "";
    }
  }

  /**
   * Leave the page once. A second request for the page the shopper is already
   * on does not load it again: the voice model often sends Home or a product
   * two or three times before the first load finishes.
   * Returns true when a load is pending, "already" when this page is enough,
   * or false when the URL is not a store path.
   */
  var pendingLeave = "";

  function navigate(url) {
    var path = storePath(url);
    if (!path) {
      log("blocked navigation", url);
      return false;
    }
    var href = new URL(path, location.href).href;
    if (pathKey(href) === pathKey(location.href)) {
      log("already on", href);
      return "already";
    }
    pendingLeave = href;
    return true;
  }

  /** Section ids this theme will actually redraw: Horizon's cart component, Dawn's bubble and drawer. */
  function cartSectionIds() {
    var ids = [];
    function add(id) {
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    document.querySelectorAll("cart-items-component, cart-drawer-component").forEach(function (el) {
      add(el.getAttribute("data-section-id"));
    });
    add("cart-drawer-section");
    document.querySelectorAll("[id^='shopify-section-']").forEach(function (el) {
      var id = el.id.replace(/^shopify-section-/, "");
      if (/cart-icon-bubble|cart-drawer|cart-notification/i.test(id)) add(id);
    });
    ["cart-icon-bubble", "cart-drawer", "cart-notification"].forEach(add);
    document.querySelectorAll("cart-drawer, cart-notification, cart-items").forEach(function (el) {
      if (typeof el.getSectionsToRender !== "function") return;
      try {
        el.getSectionsToRender().forEach(function (section) {
          if (section && section.id) add(section.id);
        });
      } catch (e) {}
    });
    return ids;
  }

  function applySectionHtml(id, html) {
    if (!html || typeof html !== "string") return;
    var parsed = new DOMParser().parseFromString(html, "text/html");
    var currentSection = document.getElementById("shopify-section-" + id);
    var nextSection = parsed.getElementById("shopify-section-" + id);
    if (currentSection && nextSection) {
      currentSection.replaceWith(nextSection);
      return;
    }
    var current = document.getElementById(id);
    var next = parsed.getElementById(id);
    if (current && next) current.innerHTML = next.innerHTML;
  }

  function paintCartCount(count) {
    var text = String(count == null ? 0 : count);
    document.querySelectorAll(
      ".cart-count-bubble span, [data-cart-count], .cart-count, #cart-count, .cart-item-count, .header__cart-count"
    ).forEach(function (el) {
      if (!el.children.length) el.textContent = text;
    });
    document.querySelectorAll("cart-icon").forEach(function (icon) {
      if (typeof icon.renderCartBubble !== "function") return;
      try { icon.renderCartBubble(Number(text)); } catch (e) {}
    });
  }

  /**
   * Horizon redraws the bag and the drawer only for shopify:cart:lines-update,
   * and only after event.promise resolves with the new quantity. Older themes
   * listen for cart:refresh / cart:updated. Dawn swaps section HTML.
   */
  function publishCartChange(cart, action, sections) {
    var count = cart && cart.item_count != null ? cart.item_count : 0;
    var detail = {
      itemCount: count,
      didError: false,
      source: "product-form-component",
      items: (cart && cart.items) || [],
      sections: sections || {},
    };
    ["shopify:cart:lines-update", "cart:lines-update"].forEach(function (name) {
      var lines = new CustomEvent(name, { bubbles: true });
      lines.action = action || "update";
      lines.promise = Promise.resolve({
        cart: { totalQuantity: count, item_count: count, items: detail.items },
        detail: detail,
      });
      document.dispatchEvent(lines);
    });

    document.dispatchEvent(new CustomEvent("cart:update", {
      bubbles: true,
      detail: { resource: cart, data: detail },
    }));
    ["cart:refresh", "cart:updated", "cart:change", "theme:cart:change"].forEach(function (name) {
      document.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { cart: cart } }));
    });
    paintCartCount(count);

    document.querySelectorAll("cart-drawer, cart-notification").forEach(function (el) {
      if (typeof el.renderContents !== "function") return;
      try { el.renderContents({ sections: sections || {}, id: cart && cart.items && cart.items[0] && cart.items[0].variant_id }); } catch (e) {}
    });
  }

  function sectionHasDrawer(html) {
    return typeof html === "string" && html.indexOf("cart-drawer__inner") >= 0;
  }

  function drawerRoot() {
    return document.querySelector("#cart-drawer, cart-drawer-component, cart-drawer, #CartDrawer");
  }

  function cartLineTitle(item) {
    return String((item && (item.product_title || item.title)) || "").trim();
  }

  function themeCartRows(root) {
    if (!root) return [];
    return Array.prototype.filter.call(
      root.querySelectorAll(".cart-items__table-row, tr[id^='CartItem-'], .cart-item"),
      function (row) { return !row.closest("[data-snowie-cart-lines]"); }
    );
  }

  function removeFallbackLines(root) {
    if (!root) return;
    root.querySelectorAll("[data-snowie-cart-lines]").forEach(function (el) { el.remove(); });
  }

  function cartTitlesVisible(cart, root) {
    if (themeCartRows(root).length) return true;
    var text = ((root && root.textContent) || "").toLowerCase();
    var items = (cart && cart.items) || [];
    if (!items.length) return true;
    return items.every(function (item) {
      var title = cartLineTitle(item).toLowerCase();
      if (title.length < 3) return true;
      return text.indexOf(title.slice(0, Math.min(18, title.length))) >= 0;
    });
  }

  /** Horizon marks the open drawer as skip-node-update, so a section swap leaves the product rows out. */
  function applyDrawerFromSections(sections) {
    var swapped = false;
    Object.keys(sections || {}).forEach(function (id) {
      var html = sections[id];
      if (!sectionHasDrawer(html)) return;
      var parsed = new DOMParser().parseFromString(html, "text/html");
      var nextInner = parsed.querySelector(".cart-drawer__inner");
      var liveInner = document.querySelector(".cart-drawer__inner");
      if (nextInner && liveInner) {
        liveInner.className = nextInner.className;
        liveInner.innerHTML = nextInner.innerHTML;
        swapped = true;
      }
    });
    return swapped;
  }

  function paintFallbackLines(cart) {
    var root = drawerRoot();
    if (!root || !cart || !cart.items || !cart.items.length) return;
    var host =
      root.querySelector(".cart-drawer__items") ||
      root.querySelector(".cart-drawer__content") ||
      root.querySelector("#CartDrawer-CartItems") ||
      root.querySelector("cart-items-component") ||
      root;
    var previous = host.querySelector("[data-snowie-cart-lines]");
    if (previous) previous.remove();
    var list = document.createElement("div");
    list.setAttribute("data-snowie-cart-lines", "true");
    list.style.cssText = "display:flex;flex-direction:column;width:100%;background:#fff;color:#111;";
    cart.items.forEach(function (item) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid #eee;";
      if (item.image) {
        var img = document.createElement("img");
        img.src = item.image;
        img.alt = "";
        img.style.cssText = "width:72px;height:72px;object-fit:cover;border-radius:8px;flex:0 0 auto;";
        row.appendChild(img);
      }
      var info = document.createElement("div");
      var name = document.createElement("div");
      name.textContent = cartLineTitle(item);
      name.style.cssText = "font-weight:600;font-size:14px;line-height:1.3;";
      var meta = document.createElement("div");
      var price = "";
      if (item.final_line_price != null && cart.currency) {
        try {
          price = new Intl.NumberFormat(undefined, { style: "currency", currency: cart.currency }).format(item.final_line_price / 100);
        } catch (e) {
          price = "";
        }
      }
      meta.textContent = "Qty " + item.quantity + (price ? " · " + price : "");
      meta.style.cssText = "font-size:13px;color:#444;margin-top:4px;";
      info.appendChild(name);
      info.appendChild(meta);
      row.appendChild(info);
      list.appendChild(row);
    });
    host.prepend(list);
    root.querySelectorAll(".cart-drawer--empty").forEach(function (el) {
      el.classList.remove("cart-drawer--empty");
    });
    var emptyNote = root.querySelector("[data-cart-drawer-empty]");
    if (emptyNote) emptyNote.remove();
  }

  function showCartItemArea() {
    document.querySelectorAll(".cart-drawer__items, .cart-drawer__content").forEach(function (el) {
      el.style.overflow = "auto";
      el.style.minHeight = "140px";
      el.style.flex = "1 1 auto";
    });
  }

  function cartDrawerIsOpen() {
    var dialog = document.querySelector("#cart-drawer dialog, .theme-drawer__dialog");
    if (dialog && dialog.open) return true;
    var theme = document.querySelector("theme-drawer#cart-drawer");
    if (theme && theme.hasAttribute("open")) return true;
    var button = resolveTarget({ role: "button", name: "cart" });
    return !!(button && button.getAttribute("aria-expanded") === "true");
  }

  function openCartDrawer() {
    var themeDrawer = document.querySelector("theme-drawer#cart-drawer, #cart-drawer");
    if (themeDrawer && typeof themeDrawer.open === "function") {
      try { themeDrawer.open(); } catch (e) {}
    }
    if (cartDrawerIsOpen()) return true;
    var dialog = document.querySelector("#cart-drawer dialog, .theme-drawer__dialog");
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      try { dialog.showModal(); } catch (e) {}
    }
    if (cartDrawerIsOpen()) return true;
    var button = resolveTarget({ role: "button", name: "cart" }) ||
      document.querySelector("[aria-controls='CartDrawer']");
    if (button && button.tagName !== "A") realClick(button);
    return cartDrawerIsOpen();
  }

  function revealCartContents(cart, sections, action) {
    applyDrawerFromSections(sections);
    var root = drawerRoot();
    if (root && themeCartRows(root).length) removeFallbackLines(root);
    else if (cart && cart.item_count > 0 && root && !cartTitlesVisible(cart, root)) {
      paintFallbackLines(cart);
      showCartItemArea();
    }
    if (action === "add" && cart && cart.item_count > 0) {
      openCartDrawer();
      requestAnimationFrame(function () {
        var again = drawerRoot();
        if (!again) return;
        if (themeCartRows(again).length) removeFallbackLines(again);
        else if (cart.item_count > 0 && !cartTitlesVisible(cart, again)) {
          paintFallbackLines(cart);
          showCartItemArea();
        }
      });
    }
  }

  /** Tell every common Online Store theme that the cart changed. */
  function refreshShopifyCart(action, knownSections) {
    return fetchJSON(shopifyRoot() + "cart.js", { credentials: "same-origin" })
      .then(function (cart) {
        var ids = cartSectionIds();
        var have = knownSections || {};
        var missing = ids.filter(function (id) { return !have[id]; });
        var load = missing.length
          ? fetch(shopifyRoot() + "?sections=" + encodeURIComponent(missing.join(",")), {
              credentials: "same-origin",
            }).then(function (response) { return response.ok ? response.json() : {}; }).catch(function () { return {}; })
          : Promise.resolve({});
        return load.then(function (fetched) {
          var sections = {};
          Object.keys(fetched || {}).forEach(function (id) { if (fetched[id]) sections[id] = fetched[id]; });
          Object.keys(have).forEach(function (id) { if (have[id]) sections[id] = have[id]; });
          Object.keys(sections).forEach(function (id) {
            if (sectionHasDrawer(sections[id])) return;
            applySectionHtml(id, sections[id]);
          });
          publishCartChange(cart, action || "update", sections);
          revealCartContents(cart, sections, action || "update");
          return cart;
        });
      })
      .catch(function () {});
  }

  // ─── Commerce fast paths (PAGE tier) ───────────────────────────────────────

  function cartRequest(path, body) {
    return fetch(shopifyRoot() + path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) {
          var error = new Error(payload.description || payload.message || ("HTTP " + response.status));
          error.status = response.status;
          throw error;
        }
        return payload;
      });
    });
  }

  function shopifyAddToCart(variantId, quantity) {
    var id = numericVariant(variantId);
    var qty = quantity || 1;
    var numericId = /^\d+$/.test(String(id)) ? Number(id) : id;
    var sections = cartSectionIds().join(",");
    var withSections = function (body) {
      if (sections) {
        body.sections = sections;
        body.sections_url = location.pathname;
      }
      return body;
    };
    return cartRequest("cart/add.js", withSections({ items: [{ id: numericId, quantity: qty }] }))
      .catch(function (error) {
        if (error.status === 422) throw error;
        return cartRequest("cart/add.js", withSections({ id: numericId, quantity: qty }));
      })
      .then(function (result) {
        return refreshShopifyCart("add", result && result.sections).then(function () { return result; });
      });
  }

  function shopifyUpdateCart(variantId, quantity) {
    var sections = cartSectionIds().join(",");
    var body = {
      id: String(numericVariant(variantId)),
      quantity: quantity,
    };
    if (sections) {
      body.sections = sections;
      body.sections_url = location.pathname;
    }
    return cartRequest("cart/change.js", body).then(function (result) {
      return refreshShopifyCart("update", result && result.sections).then(function () { return result; });
    });
  }

  function shopifyClearCart() {
    var sections = cartSectionIds().join(",");
    var body = {};
    if (sections) {
      body.sections = sections;
      body.sections_url = location.pathname;
    }
    return cartRequest("cart/clear.js", body).then(function (result) {
      return refreshShopifyCart("update", result && result.sections).then(function () {
        return { cleared: true };
      });
    });
  }

  function cartLineMatches(item, query) {
    var needle = String(query || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!needle) return false;
    var hay = [item.product_title, item.title, item.variant_title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (hay.indexOf(needle) >= 0) return true;
    var words = needle.split(" ").filter(function (word) { return word.length > 2; });
    return words.length > 0 && words.every(function (word) { return hay.indexOf(word) >= 0; });
  }

  function shopifyChangeMatching(query, quantity) {
    return fetchJSON(shopifyRoot() + "cart.js", { credentials: "same-origin" }).then(function (cart) {
      var matched = ((cart && cart.items) || []).filter(function (item) {
        return cartLineMatches(item, query);
      });
      if (!matched.length) throw new Error("That item is not in the cart");
      var chain = Promise.resolve();
      matched.forEach(function (item) {
        chain = chain.then(function () {
          return shopifyUpdateCart(item.variant_id, quantity);
        });
      });
      return chain.then(function () {
        return {
          updated: matched.length,
          quantity: quantity,
          titles: matched.map(function (item) { return item.product_title || item.title; }),
        };
      });
    });
  }

  /** Last resort when no cart API exists: find and press the button. */
  /** Set the quantity field a theme exposes, so "add two" means two. */
  function setQuantityField(scope, quantity) {
    if (!quantity || quantity < 2) return false;
    var root = scope || document;
    var field =
      root.querySelector('input[name="quantity"]') ||
      root.querySelector('input[name*="quantity" i]') ||
      document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
    if (!field) return false;
    realType(field, String(quantity));
    return true;
  }

  /**
   * Last resort when the cart API is unavailable. Submits the product form over
   * fetch where possible: clicking a submit button would navigate the shopper
   * away from the page and tear the widget down mid-conversation.
   */
  function clickAddToCartButton(quantity) {
    var form = document.querySelector('form[action*="/cart/add"]');
    if (form) {
      setQuantityField(form, quantity);
      var data = new FormData(form);
      if (quantity && quantity > 1) data.set("quantity", String(quantity));
      return fetch(shopifyRoot() + "cart/add.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        body: data,
      })
        .then(function (response) {
          if (!response.ok) throw new Error("form add failed: " + response.status);
          return refreshShopifyCart("add").then(function () {
            return { added: true, via: "form", quantity: quantity || 1 };
          });
        })
        .catch(function () {
          return pressAddButton(quantity);
        });
    }
    return pressAddButton(quantity);
  }

  function pressAddButton(quantity) {
    var target =
      resolveTarget({ role: "button", name: "add to cart" }) ||
      resolveTarget({ role: "button", name: "add to bag" }) ||
      document.querySelector('form[action*="/cart/add"] [type="submit"]') ||
      document.querySelector("[name=add]");
    if (!target) throw new Error("No add-to-cart control found on this page");
    if (isDisabled(target)) throw new Error("The add-to-cart control is disabled");
    setQuantityField(target.form || target.closest("form"), quantity);
    scrollIntoView(target);
    realClick(target);
    return { clicked: true, via: "button", quantity: quantity || 1 };
  }

  function currentVariantId() {
    var fromUrl = new URLSearchParams(location.search).get("variant");
    if (fromUrl) return fromUrl;
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    return input && input.value ? input.value : null;
  }

  // The agent sends catalog ids. The page can only show, open, or add a product
  // once those ids are turned into a title, url, and variant. Looking them up
  // here means a queued action still works before the backend has rewritten it.
  var catalogPromise = null;

  function requestedIds(payload) {
    var ids = payload.product_ids || [];
    if (typeof ids === "string") ids = [ids];
    if (payload.product_id) ids = [payload.product_id].concat(ids);
    var variant = payload.variant_id;
    // A Product gid is not a cart variant. Treat it as a product to look up.
    if (variant && /\/Product\//.test(String(variant)) && !/\/ProductVariant\//.test(String(variant))) {
      ids = [variant].concat(ids);
    }
    var seen = {};
    return ids.filter(function (id) {
      var key = String(id);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    function page(n, acc) {
      return fetch(shopifyRoot() + "products.json?limit=250&page=" + n, {
        credentials: "same-origin",
      })
        .then(function (response) { return response.ok ? response.json() : { products: [] }; })
        .then(function (body) {
          var batch = body.products || [];
          acc = acc.concat(batch);
          if (batch.length < 250 || n >= 4) return acc;
          return page(n + 1, acc);
        });
    }
    catalogPromise = page(1, []).catch(function (error) {
      catalogPromise = null;
      throw error;
    });
    return catalogPromise;
  }

  function cardFromShopify(product) {
    var variants = product.variants || [];
    var variant = null;
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].available) { variant = variants[i]; break; }
    }
    if (!variant) variant = variants[0] || {};
    var image = "";
    if (product.images && product.images[0]) {
      image = product.images[0].src || product.images[0];
    }
    var currency = (window.Shopify && Shopify.currency && Shopify.currency.active) || "USD";
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      url: shopifyRoot() + "products/" + product.handle,
      image: typeof image === "string" ? image : "",
      price: variant.price == null ? null : { amount: Number(variant.price), currency: currency },
      available: variant.available !== false,
      default_variant_id: variant.id,
    };
  }

  function matchProduct(catalog, id) {
    var numeric = numericVariant(id);
    var text = String(id);
    for (var i = 0; i < catalog.length; i++) {
      var product = catalog[i];
      if (String(product.id) === String(numeric) || String(product.id) === text) return product;
      if (product.handle && product.handle === text) return product;
      if (product.title && product.title.toLowerCase() === text.toLowerCase()) return product;
      var variants = product.variants || [];
      for (var v = 0; v < variants.length; v++) {
        if (String(variants[v].id) === String(numeric)) return product;
      }
    }
    return null;
  }

  function resolveCards(payload) {
    if (payload.products && payload.products.length) return Promise.resolve(payload.products);
    var ids = requestedIds(payload);
    if (!ids.length || platform() !== "shopify") return Promise.resolve([]);
    return loadCatalog().then(function (catalog) {
      var cards = [];
      ids.forEach(function (id) {
        var product = matchProduct(catalog, id);
        if (product) cards.push(cardFromShopify(product));
      });
      return cards;
    });
  }

  // ─── Action dispatch ───────────────────────────────────────────────────────

  var handlers = {
    // — UI tier primitives ---------------------------------------------------
    click: function (payload) {
      var target = resolveTarget(payload);
      if (!target) {
        throw new Error("Could not find: " +
          (payload.name || payload.ref || payload.selector || "element"));
      }
      if (isDisabled(target)) {
        throw new Error("'" + (accessibleName(target) || payload.name) +
                        "' is disabled and cannot be used");
      }
      var label = accessibleName(target) || payload.name || "";
      var anchor = target.closest ? target.closest("a[href]") : null;
      if (anchor && anchor.getAttribute("href") && anchor.getAttribute("href").charAt(0) !== "#") {
        var moved = navigate(anchor.href);
        if (moved === "already") return { clicked: label, already: true };
        if (moved) return { clicked: label };
      }
      scrollIntoView(target);
      realClick(target);
      return { clicked: label };
    },

    type: function (payload) {
      var target = resolveTarget(payload);
      if (!target) {
        throw new Error("Could not find input: " +
          (payload.name || payload.ref || payload.selector || "field"));
      }
      if (isDisabled(target)) {
        throw new Error("That field is disabled and cannot be edited");
      }
      scrollIntoView(target);
      realType(target, payload.text == null ? "" : String(payload.text));
      if (payload.submit) {
        var form = target.form || target.closest("form");
        target.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, bubbles: true,
        }));
        if (form && typeof form.requestSubmit === "function") form.requestSubmit();
        else if (form) form.submit();
      }
      return { typed: true };
    },

    select: function (payload) {
      var target = resolveTarget(payload);
      if (!target || target.tagName !== "SELECT") throw new Error("No select found");
      target.value = payload.value;
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return { selected: payload.value };
    },

    scroll_view: function (payload) {
      if (payload.ref || payload.selector || payload.name) {
        var target = resolveTarget(payload);
        if (target) {
          scrollIntoView(target);
          return { scrolled: "element" };
        }
      }
      var amount = payload.amount || Math.round(window.innerHeight * 0.8);
      window.scrollBy({
        top: payload.direction === "up" ? -amount : amount,
        behavior: "smooth",
      });
      return { scrolled: payload.direction || "down" };
    },

    navigate_ui: function (payload) {
      // Runs a pre-resolved plan. Never report success for an empty plan --
      // telling the agent an action worked when nothing happened is worse
      // than failing, because it cannot then recover.
      var steps = payload.steps || [];
      if (!steps.length) {
        throw new Error(
          "navigate_ui received no steps. Call describe_page, then " +
          "click_element or type_text with a ref from it.");
      }
      var done = [];
      for (var i = 0; i < steps.length; i++) {
        var step = steps[i];
        var handler = handlers[step.action];
        if (!handler) throw new Error("Unknown step: " + step.action);
        done.push(handler(step.payload || step));
      }
      return { steps: done.length };
    },

    // — Agent-facing UI tier -------------------------------------------------
    describe_page: function () {
      var map = buildUIMap();
      return {
        url: map.url,
        title: map.title,
        page_type: map.page_type,
        headings: map.headings,
        elements: map.elements.map(function (e) {
          var out = { ref: e.ref, role: e.role, name: e.name };
          if (e.disabled) out.disabled = true;
          if (e.in_view) out.in_view = true;
          return out;
        }),
      };
    },

    click_element: function (payload) {
      return handlers.click(payload);
    },

    type_text: function (payload) {
      return handlers.type(payload);
    },

    highlight: function (payload) {
      var target = resolveTarget(payload);
      if (!target) throw new Error("Nothing to highlight");
      scrollIntoView(target);
      var previousOutline = target.style.outline;
      var previousOffset = target.style.outlineOffset;
      target.style.outline = "3px solid " + (payload.color || "#6366f1");
      target.style.outlineOffset = "2px";
      setTimeout(function () {
        target.style.outline = previousOutline;
        target.style.outlineOffset = previousOffset;
      }, 2600);
      return { highlighted: true };
    },

    // — Commerce (PAGE tier, falls back to UI tier) --------------------------
    add_to_cart: function (payload) {
      var quantity = payload.quantity == null ? 1 : Number(payload.quantity);
      var askedForProduct = requestedIds(payload).length > 0;
      var variant = payload.variant_id && !/\/Product\//.test(String(payload.variant_id))
        ? numericVariant(payload.variant_id)
        : null;
      if (!variant && !askedForProduct) variant = numericVariant(currentVariantId());
      if (askedForProduct && !variant) {
        return resolveCards(payload).then(function (products) {
          var resolved = products[0] && numericVariant(products[0].default_variant_id);
          if (!resolved) throw new Error("That product is not in the catalog");
          return shopifyAddToCart(resolved, quantity);
        });
      }
      if (platform() === "shopify" && variant) {
        return shopifyAddToCart(variant, quantity).catch(function () {
          if (askedForProduct) throw new Error("Could not add that product to the cart");
          return clickAddToCartButton(quantity);
        });
      }
      return clickAddToCartButton(quantity);
    },

    update_cart: function (payload) {
      if (platform() !== "shopify") {
        throw new Error("Cart updates are not available on this page");
      }
      var clear = payload.clear === true || payload.clear === "true" || payload.clear === 1 || payload.clear === "1";
      var title = payload.product_title || payload.title || payload.query || payload.name || "";
      var hasQuantity = payload.quantity != null && payload.quantity !== "";
      var quantity = hasQuantity ? Number(payload.quantity) : 0;
      var variant = numericVariant(payload.variant_id);
      if (clear || (!variant && !title && quantity === 0)) return shopifyClearCart();
      if (variant) return shopifyUpdateCart(variant, quantity);
      return shopifyChangeMatching(title, quantity);
    },

    open_cart: function () {
      if (navigate(shopifyRoot() + "cart")) return { opened: "cart" };
      if (openCartDrawer()) return { opened: "drawer" };
      throw new Error("No cart link found");
    },

    checkout: function () {
      if (platform() === "shopify" && navigate(shopifyRoot() + "checkout")) {
        return { opened: "checkout" };
      }
      var button = resolveTarget({ name: "checkout" });
      if (!button) throw new Error("No checkout control found");
      realClick(button);
      return { opened: "checkout" };
    },

    open_product: function (payload) {
      var url = payload.url;
      if (!url && payload.handle) url = shopifyRoot() + "products/" + payload.handle;
      if (url) {
        var moved = navigate(url);
        if (!moved) throw new Error("Could not open product");
        return { opened: url, already: moved === "already" };
      }
      return resolveCards(payload).then(function (products) {
        var product = products[0];
        if (!product || !product.url) throw new Error("Could not open product");
        var moved = navigate(product.url);
        if (!moved) throw new Error("Could not open product");
        return { opened: product.url, already: moved === "already" };
      });
    },

    show_products: function (payload) {
      return resolveCards(payload).then(function (products) {
        if (requestedIds(payload).length && !products.length) {
          throw new Error("No catalog products matched those ids");
        }
        renderProducts(products, payload.title || "Recommended for you");
        return { shown: products.length };
      });
    },

    compare_products: function (payload) {
      return resolveCards(payload).then(function (products) {
        if (requestedIds(payload).length && !products.length) {
          throw new Error("No catalog products matched those ids");
        }
        renderProducts(products, payload.title || "Compare", true);
        return { compared: products.length };
      });
    },

    close_overlay: function () {
      removeOverlay();
      return { closed: true };
    },

    get_storefront_context: function () {
      return withCart(pageContext());
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Product overlay
  // ═══════════════════════════════════════════════════════════════════════════

  var OVERLAY_ID = "snowie-commerce-overlay";

  function removeOverlay() {
    var existing = document.getElementById(OVERLAY_ID);
    if (!existing) return;
    if (existing._snowiePlace) window.removeEventListener("resize", existing._snowiePlace);
    existing.remove();
  }

  function formatPrice(price) {
    if (!price) return "";
    if (typeof price === "string") return price;
    if (typeof price === "number") return price.toFixed(2);
    if (price.amount == null) return "";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: price.currency || "USD",
      }).format(price.amount);
    } catch (e) {
      return price.amount + " " + (price.currency || "");
    }
  }

  function placeOverlay(host) {
    var widget = document.querySelector(".widget-container");
    var rect = widget && widget.getBoundingClientRect();
    var margin = 16;
    var gap = 12;
    var open = rect && rect.width > 80 && rect.height > 80;
    if (open && rect.left - margin - gap >= 260) {
      host.style.left = "auto";
      host.style.right = (window.innerWidth - rect.left + gap) + "px";
      host.style.top = "auto";
      host.style.bottom = Math.max(margin, window.innerHeight - rect.bottom) + "px";
      host.style.width = Math.min(360, rect.left - margin - gap) + "px";
      host.style.maxHeight = Math.max(220, Math.min(rect.height, window.innerHeight - margin * 2)) + "px";
      return;
    }
    host.style.left = margin + "px";
    host.style.right = "auto";
    host.style.top = margin + "px";
    host.style.bottom = "auto";
    host.style.width = "min(360px, calc(100vw - 32px))";
    host.style.maxHeight = "min(46vh, 420px)";
  }

  function renderProducts(products, title, compare) {
    removeOverlay();
    if (!products.length) return;

    var host = document.createElement("div");
    host.id = OVERLAY_ID;
    host.style.cssText =
      "position:fixed;z-index:2147483000;background:#fff;color:#111;border-radius:16px;" +
      "box-shadow:0 12px 48px rgba(0,0,0,.22);overflow:hidden;display:flex;flex-direction:column;" +
      "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;";
    placeOverlay(host);
    if (!host._snowiePlace) {
      host._snowiePlace = function () {
        if (document.getElementById(OVERLAY_ID) === host) placeOverlay(host);
      };
      window.addEventListener("resize", host._snowiePlace);
    }

    var header = document.createElement("div");
    header.style.cssText =
      "padding:14px 16px;font-weight:600;font-size:15px;border-bottom:1px solid #eee;" +
      "display:flex;justify-content:space-between;align-items:center;flex:0 0 auto;";
    var heading = document.createElement("span");
    heading.textContent = title;
    var close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.style.cssText =
      "background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:#666;";
    close.addEventListener("click", removeOverlay);
    header.appendChild(heading);
    header.appendChild(close);

    var list = document.createElement("div");
    list.style.cssText =
      "overflow-y:auto;flex:1 1 auto;" +
      (compare ? "display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;" : "");

    products.slice(0, compare ? 4 : 12).forEach(function (product) {
      list.appendChild(productCard(product, compare));
    });

    host.appendChild(header);
    host.appendChild(list);
    document.body.appendChild(host);
  }

  function productCard(product, compare) {
    var card = document.createElement("div");
    card.style.cssText = compare
      ? "border:1px solid #eee;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;background:#fff;min-width:0;"
      : "display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid #f1f1f1;align-items:flex-start;background:#fff;min-width:0;";

    if (product.image) {
      var image = document.createElement("img");
      image.src = product.image;
      image.alt = product.title || "";
      image.loading = "lazy";
      image.style.cssText = compare
        ? "width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;"
        : "width:56px;height:56px;object-fit:cover;border-radius:8px;flex:0 0 auto;";
      card.appendChild(image);
    }

    var body = document.createElement("div");
    body.style.cssText = "min-width:0;flex:1 1 auto;";

    var name = document.createElement("div");
    name.textContent = product.title || "";
    name.style.cssText =
      "font-weight:600;font-size:13.5px;line-height:1.3;margin-bottom:3px;" +
      (compare ? "" : "overflow:hidden;text-overflow:ellipsis;display:-webkit-box;" +
                      "-webkit-line-clamp:2;-webkit-box-orient:vertical;");
    body.appendChild(name);

    var price = document.createElement("div");
    price.textContent = formatPrice(product.price);
    price.style.cssText = "font-size:13px;color:#444;";
    if (product.available === false) {
      price.textContent += " · Sold out";
      price.style.color = "#999";
    }
    body.appendChild(price);

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;";

    if (product.url) {
      var view = document.createElement("button");
      view.textContent = "View";
      view.style.cssText = buttonStyle(false);
      view.addEventListener("click", function () {
        var moved = navigate(product.url);
        if (moved === true && pendingLeave) {
          var href = pendingLeave;
          pendingLeave = "";
          location.assign(href);
        }
      });
      actions.appendChild(view);
    }

    var variantId = product.default_variant_id ||
      (product.variants && product.variants[0] && product.variants[0].id);
    var choices = (product.variants || []).filter(function (variant) {
      return variant && variant.title && variant.title !== "Default Title";
    });
    var chosen = { id: numericVariant(variantId) };
    if (choices.length > 1) {
      var select = document.createElement("select");
      select.style.cssText = "width:100%;margin-top:6px;font-size:12.5px;padding:4px;";
      choices.forEach(function (variant) {
        var option = document.createElement("option");
        option.value = numericVariant(variant.id);
        option.textContent = variant.title + (variant.available === false ? " (sold out)" : "");
        option.disabled = variant.available === false;
        if (String(numericVariant(variant.id)) === String(chosen.id)) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", function () { chosen.id = select.value; });
      body.appendChild(select);
    }
    if (variantId && product.available !== false) {
      var add = document.createElement("button");
      add.textContent = "Add to cart";
      add.style.cssText = buttonStyle(true);
      add.addEventListener("click", function () {
        add.disabled = true;
        add.textContent = "Adding…";
        Promise.resolve(handlers.add_to_cart({ variant_id: chosen.id, quantity: 1 }))
          .then(function () { add.textContent = "Added ✓"; })
          .catch(function () { add.textContent = "Try on page"; add.disabled = false; });
      });
      actions.appendChild(add);
    }

    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function buttonStyle(primary) {
    return (
      "border:1px solid " + (primary ? "#111" : "#ddd") + ";" +
      "background:" + (primary ? "#111" : "#fff") + ";" +
      "color:" + (primary ? "#fff" : "#111") + ";" +
      "border-radius:8px;padding:5px 11px;font-size:12.5px;cursor:pointer;font-weight:500;"
    );
  }

  /** Storefront cart APIs want the numeric id, protocols return a gid. */
  function numericVariant(id) {
    if (id == null || id === "") return null;
    var text = String(id);
    var match = text.match(/(\d+)\s*$/);
    return match ? match[1] : text;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Backend transport
  // ═══════════════════════════════════════════════════════════════════════════

  function api(path, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = "Bearer " + state.token;
    return fetch(BASE + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }

  function bootstrap() {
    if (!SCHEMA || !AGENT) {
      log("missing data-schema or data-agent-id; not starting");
      return Promise.resolve(false);
    }
    return withCart(pageContext())
      .then(function (context) {
        return api("/api/commerce/browser/session/", {
          method: "POST",
          body: {
            schema_name: SCHEMA,
            agent_code: AGENT,
            session_id: sessionId(),
            origin: location.origin,
            page_context: context,
            widget_open: false,
          },
        });
      })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            log("bootstrap refused", response.status, body.detail || "");
            return false;
          });
        }
        return response.json().then(function (body) {
          state.token = body.token;
          state.capabilities = body.capabilities || [];
          state.actions = body.actions || [];
          state.protocol = body.protocol || null;
          state.autonomy = body.autonomy || "assist";
          log("ready", { protocol: state.protocol, capabilities: state.capabilities });
          window.dispatchEvent(new CustomEvent("snowie:commerce-ready", { detail: body }));
          return true;
        });
      })
      .catch(function (error) {
        log("bootstrap failed", error);
        return false;
      });
  }

  function pushContext(extra) {
    if (!state.token) return Promise.resolve();
    return withCart(pageContext())
      .then(function (context) {
        var body = { page_context: context };
        if (extra && extra.uiMap) body.ui_map = buildUIMap();
        if (extra && typeof extra.widgetOpen === "boolean") body.widget_open = extra.widgetOpen;
        if (extra && extra.clearCall) {
          body.room_name = "";
          body.call_id = "";
        } else {
          if (state.roomName) body.room_name = state.roomName;
          if (state.callId) body.call_id = state.callId;
        }
        return api("/api/commerce/browser/context/", { method: "PATCH", body: body });
      })
      .catch(function () {});
  }

  function ack(actionId, ok, result) {
    return withCart(pageContext()).then(function (context) {
      return api("/api/commerce/browser/actions/" + actionId + "/ack/", {
        method: "POST",
        body: {
          status: ok ? "succeeded" : "failed",
          result: result,
          page_context: context,
        },
      });
    }).catch(function () {});
  }

  /** Ack that must survive the next page load. A normal fetch is cancelled on leave, and the same navigation is then delivered again about 25s later. */
  function ackLeave(actionId, result) {
    try {
      fetch(BASE + "/api/commerce/browser/actions/" + actionId + "/ack/", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          Authorization: state.token ? "Bearer " + state.token : "",
        },
        body: JSON.stringify({
          status: "succeeded",
          result: result || {},
          page_context: pageContext(),
        }),
      });
    } catch (e) {}
  }

  function runAction(task) {
    var handler = handlers[task.action];
    pendingLeave = "";
    window.dispatchEvent(new CustomEvent("snowie:action", { detail: task }));

    if (!handler) {
      return ack(task.id, false, { error: "unsupported_action", action: task.action });
    }
    var outcome;
    try {
      outcome = handler(task.payload || {});
    } catch (error) {
      pendingLeave = "";
      log("action failed", task.action, error);
      return ack(task.id, false, { error: String((error && error.message) || error) });
    }
    return Promise.resolve(outcome)
      .then(function (result) {
        var href = pendingLeave;
        pendingLeave = "";
        if (href) {
          ackLeave(task.id, result || {});
          location.assign(href);
          return;
        }
        var done = ack(task.id, true, result || {});
        if (result && result.already) done.then(function () { poll(); });
        return done;
      })
      .catch(function (error) {
        pendingLeave = "";
        return ack(task.id, false, { error: String((error && error.message) || error) });
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Poll loop + change detection
  // ═══════════════════════════════════════════════════════════════════════════

  // One poll at a time. A second poll used to run a second navigation while the
  // first still had its destination in pendingLeave, so the shopper was sent to
  // the later page and the earlier action was marked done.
  var pollBusy = false;

  function poll() {
    if (state.stopped || !state.token || pollBusy) return;
    pollBusy = true;
    api("/api/commerce/browser/actions/")
      .then(function (response) {
        if (response.status === 204) return null;
        if (response.status === 401) {
          state.token = null;
          return bootstrap().then(function () { return null; });
        }
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (task) {
        state.backoff = 0;
        if (task && task.action) return runAction(task);
      })
      .catch(function () {
        state.backoff = Math.min(state.backoff + 1, 6);
      })
      .then(function () {
        pollBusy = false;
      });
  }

  var pollTimer = null;
  var skipTicks = 0;

  function startPolling() {
    if (pollTimer || state.stopped) return;
    pollTimer = setInterval(function () {
      // After failures, skip a growing number of ticks before trying again.
      if (skipTicks > 0) {
        skipTicks -= 1;
        return;
      }
      skipTicks = state.backoff;
      poll();
    }, POLL_MS);
    poll();
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** "Page changed?" -> re-analyse. Covers SPA themes and in-place updates. */
  function watchForChange() {
    var lastUrl = location.href;
    var settle = null;

    var lastPush = 0;
    var MIN_GAP = 3000;

    var announce = function (reason) {
      clearTimeout(settle);
      // Debounce the burst, then rate-limit so animated pages cannot spin.
      var wait = Math.max(400, MIN_GAP - (Date.now() - lastPush));
      settle = setTimeout(function () {
        lastPush = Date.now();
        log("page changed:", reason);
        window.dispatchEvent(new CustomEvent("snowie:page-changed", { detail: { reason: reason } }));
        pushContext({ uiMap: true });
      }, wait);
    };

    var checkUrl = function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        announce("navigation");
      }
    };

    ["pushState", "replaceState"].forEach(function (method) {
      var original = history[method];
      if (typeof original !== "function") return;
      history[method] = function () {
        var result = original.apply(this, arguments);
        checkUrl();
        return result;
      };
    });
    window.addEventListener("popstate", checkUrl);
    window.addEventListener("hashchange", checkUrl);

    try {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var target = mutations[i].target;
          // Ignore churn inside our own overlay.
          if (target && target.closest && target.closest("#" + OVERLAY_ID)) continue;
          if (mutations[i].addedNodes.length || mutations[i].removedNodes.length) {
            announce("dom");
            return;
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    document.addEventListener("cart:refresh", function () { announce("cart"); });
    window.addEventListener("snowie:cart-updated", function () { announce("cart"); });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public surface
  // ═══════════════════════════════════════════════════════════════════════════

  var api_ = {
    version: "2.0.0",
    getSessionId: sessionId,
    getState: function () {
      return {
        protocol: state.protocol,
        capabilities: state.capabilities.slice(),
        actions: state.actions.slice(),
        autonomy: state.autonomy,
        connected: !!state.token,
      };
    },
    getContext: function () { return withCart(pageContext()); },
    getUIMap: buildUIMap,
    execute: function (action, payload) {
      var handler = handlers[action];
      if (!handler) return Promise.reject(new Error("Unknown action: " + action));
      return Promise.resolve(handler(payload || {}));
    },
    setWidgetOpen: function (open) { return pushContext({ widgetOpen: !!open }); },
    /**
     * Link this browser session to a live voice call. The agent's tool calls
     * carry the room name, which is how the backend routes an action back to
     * this exact shopper rather than guessing.
     */
    setCall: function (roomName, callId) {
      state.roomName = roomName || "";
      state.callId = callId || "";
      log("call linked", state.roomName, state.callId);
      return pushContext({ widgetOpen: true });
    },
    clearCall: function () {
      state.roomName = "";
      state.callId = "";
      return pushContext({ clearCall: true });
    },
    refresh: function () { return pushContext({ uiMap: true }); },
    stop: function () {
      state.stopped = true;
      stopPolling();
    },
  };

  window.__snowieCommerce = api_;
  window.SnowieCommerce = api_;

  function init() {
    bootstrap().then(function (ok) {
      if (!ok) return;
      watchForChange();
      startPolling();
      pushContext({ uiMap: true });
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopPolling();
      else startPolling();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
