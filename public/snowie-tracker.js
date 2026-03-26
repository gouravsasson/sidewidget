(function () {
  "use strict";

  // ─── Config (injected by the script tag data attributes) ────────────────────
  var scriptTag =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var SCHEMA = scriptTag.getAttribute("data-schema") || "";
  var AGENT_ID = scriptTag.getAttribute("data-agent-id") || "";
  var BASE_URL = scriptTag.getAttribute("data-base-url") || "https://app.snowie.ai";

  // ─── Session ID ─────────────────────────────────────────────────────────────
  // Reuse if already generated (so tracker + bridge + widget all share the same id)
  function getSessionId() {
    var key = "snowie_session_id";
    var id = localStorage.getItem(key);
    if (!id) {
      id =
        "snw_" +
        Math.random().toString(36).slice(2, 10) +
        "_" +
        Date.now().toString(36);
      localStorage.setItem(key, id);
    }
    return id;
  }

  var SESSION_ID = getSessionId();

  // ─── Send event to backend ──────────────────────────────────────────────────
  function sendEvent(eventType, payload) {
    var body = Object.assign(
      {
        event: eventType,
        session_id: SESSION_ID,
        schema_name: SCHEMA,
        agent_code: AGENT_ID,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      },
      payload
    );

    // Use sendBeacon when available (non-blocking, survives page unload)
    var url = BASE_URL + "/api/shopify/event/";
    var blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    }
  }

  // ─── Detect current Shopify page type ───────────────────────────────────────
  function getPageContext() {
    var path = window.location.pathname;
    var ctx = { page_type: "other", url: window.location.href };

    if (path === "/" || path === "") {
      ctx.page_type = "home";
    } else if (path.indexOf("/products/") !== -1) {
      ctx.page_type = "product";
      // Shopify exposes window.ShopifyAnalytics or meta tags
      ctx.product_handle = path.split("/products/")[1].split("?")[0];
      // Try to get product title from meta
      var titleEl = document.querySelector('meta[property="og:title"]');
      if (titleEl) ctx.product_title = titleEl.getAttribute("content");
      var priceEl = document.querySelector('meta[property="og:price:amount"]');
      if (priceEl) ctx.product_price = priceEl.getAttribute("content");
    } else if (path.indexOf("/collections/") !== -1) {
      ctx.page_type = "collection";
      ctx.collection_handle = path.split("/collections/")[1].split("?")[0];
    } else if (path.indexOf("/cart") !== -1) {
      ctx.page_type = "cart";
    } else if (path.indexOf("/checkout") !== -1) {
      ctx.page_type = "checkout";
    } else if (path.indexOf("/search") !== -1) {
      ctx.page_type = "search";
      ctx.search_query =
        new URLSearchParams(window.location.search).get("q") || "";
    }

    return ctx;
  }

  // ─── page_view event ────────────────────────────────────────────────────────
  function firePageView() {
    var ctx = getPageContext();
    sendEvent("page_view", ctx);

    // Also fire product_view if we are on a product page
    if (ctx.page_type === "product") {
      sendEvent("product_view", ctx);
    }

    // checkout_start
    if (ctx.page_type === "checkout") {
      sendEvent("checkout_start", ctx);
    }
  }

  // ─── Intercept add-to-cart (fetch + XHR) ───────────────────────────────────
  function interceptAddToCart() {
    // --- fetch ---
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      if (url && url.indexOf("/cart/add") !== -1) {
        var body = (init && init.body) || "";
        var parsed = {};
        try {
          parsed = typeof body === "string" ? JSON.parse(body) : {};
        } catch (_) {}
        sendEvent("add_to_cart", {
          variant_id: parsed.id || parsed.items?.[0]?.id || null,
          quantity: parsed.quantity || parsed.items?.[0]?.quantity || 1,
        });
      }
      return origFetch.apply(this, arguments);
    };

    // --- XMLHttpRequest ---
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this._snowie_url = url;
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (
        this._snowie_url &&
        this._snowie_url.indexOf("/cart/add") !== -1
      ) {
        var parsed = {};
        try {
          parsed = typeof body === "string" ? JSON.parse(body) : {};
        } catch (_) {}
        sendEvent("add_to_cart", {
          variant_id: parsed.id || null,
          quantity: parsed.quantity || 1,
        });
      }
      return origSend.apply(this, arguments);
    };
  }

  // ─── SPA / theme navigation (Shopify 2.0 themes use history.pushState) ──────
  function watchNavigation() {
    var lastPath = window.location.pathname;

    var origPushState = history.pushState;
    history.pushState = function () {
      origPushState.apply(this, arguments);
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        firePageView();
      }
    };

    window.addEventListener("popstate", function () {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        firePageView();
      }
    });
  }

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init() {
    firePageView();
    interceptAddToCart();
    watchNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
