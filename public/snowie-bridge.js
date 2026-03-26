(function () {
  "use strict";

  // ─── Config ──────────────────────────────────────────────────────────────────
  var scriptTag =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var SCHEMA = scriptTag.getAttribute("data-schema") || "";
  var BASE_URL = scriptTag.getAttribute("data-base-url") || "https://app.snowie.ai";
  var POLL_INTERVAL = 1500; // ms

  // ─── Read shared session_id (written by snowie-tracker.js) ──────────────────
  function getSessionId() {
    return localStorage.getItem("snowie_session_id") || null;
  }

  // ─── Action executor ─────────────────────────────────────────────────────────

  // add_to_cart: { variant_id, quantity }
  function execAddToCart(action) {
    fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: action.variant_id,
        quantity: action.quantity || 1,
      }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function () {
        // Refresh cart drawer if theme supports it
        document.dispatchEvent(new CustomEvent("cart:refresh"));
      })
      .catch(function (err) {
        console.error("[snowie-bridge] add_to_cart failed:", err);
      });
  }

  // redirect: { url }
  function execRedirect(action) {
    if (action.url) {
      window.location.href = action.url;
    }
  }

  // show_products: { products: [{ title, url, price, image }] }
  function execShowProducts(action) {
    var existing = document.getElementById("snowie-product-drawer");
    if (existing) existing.remove();

    var products = action.products || [];
    var items = products
      .map(function (p) {
        return (
          '<a href="' +
          (p.url || "#") +
          '" style="display:flex;align-items:center;gap:12px;padding:12px;' +
          'border-bottom:1px solid #eee;text-decoration:none;color:inherit;">' +
          (p.image
            ? '<img src="' +
              p.image +
              '" style="width:56px;height:56px;object-fit:cover;border-radius:8px;">'
            : "") +
          '<div><div style="font-weight:600;font-size:14px;">' +
          (p.title || "") +
          "</div>" +
          '<div style="font-size:13px;color:#555;">' +
          (p.price || "") +
          "</div></div></a>"
        );
      })
      .join("");

    var drawer = document.createElement("div");
    drawer.id = "snowie-product-drawer";
    drawer.style.cssText =
      "position:fixed;bottom:90px;right:24px;width:320px;max-height:420px;" +
      "background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);" +
      "z-index:2147483640;overflow:hidden;font-family:sans-serif;";

    drawer.innerHTML =
      '<div style="padding:14px 16px;font-weight:700;font-size:15px;' +
      'border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">' +
      "<span>Suggested Products</span>" +
      '<button id="snowie-drawer-close" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>' +
      '</div><div style="overflow-y:auto;max-height:340px;">' +
      items +
      "</div>";

    document.body.appendChild(drawer);

    document.getElementById("snowie-drawer-close").addEventListener(
      "click",
      function () {
        drawer.remove();
      }
    );

    // Auto-close after 30s
    setTimeout(function () {
      if (drawer.parentNode) drawer.remove();
    }, 30000);
  }

  // show_popup: { message, title }
  function execShowPopup(action) {
    var existing = document.getElementById("snowie-popup");
    if (existing) existing.remove();

    var popup = document.createElement("div");
    popup.id = "snowie-popup";
    popup.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
      "background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.22);" +
      "z-index:2147483641;padding:28px 24px;max-width:360px;width:90%;font-family:sans-serif;text-align:center;";

    popup.innerHTML =
      '<button id="snowie-popup-close" style="position:absolute;top:12px;right:14px;' +
      'background:none;border:none;font-size:22px;cursor:pointer;">×</button>' +
      (action.title
        ? '<div style="font-weight:700;font-size:17px;margin-bottom:8px;">' +
          action.title +
          "</div>"
        : "") +
      '<div style="font-size:14px;color:#444;">' +
      (action.message || "") +
      "</div>";

    document.body.appendChild(popup);

    document.getElementById("snowie-popup-close").addEventListener(
      "click",
      function () {
        popup.remove();
      }
    );

    setTimeout(function () {
      if (popup.parentNode) popup.remove();
    }, 15000);
  }

  // scroll: { selector } — scrolls to a CSS selector or top
  function execScroll(action) {
    if (action.selector) {
      var el = document.querySelector(action.selector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // highlight: { selector, color }  — briefly highlights an element
  function execHighlight(action) {
    if (!action.selector) return;
    var el = document.querySelector(action.selector);
    if (!el) return;

    var prev = el.style.outline;
    var prevBg = el.style.backgroundColor;
    el.style.outline = "3px solid " + (action.color || "#f59e0b");
    el.style.backgroundColor = (action.color || "#f59e0b") + "22";
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    setTimeout(function () {
      el.style.outline = prev;
      el.style.backgroundColor = prevBg;
    }, 3000);
  }

  // ─── Dispatch action ──────────────────────────────────────────────────────────
  function dispatch(action) {
    if (!action || !action.type) return;

    switch (action.type) {
      case "add_to_cart":
        execAddToCart(action);
        break;
      case "redirect":
        execRedirect(action);
        break;
      case "show_products":
        execShowProducts(action);
        break;
      case "show_popup":
        execShowPopup(action);
        break;
      case "scroll":
        execScroll(action);
        break;
      case "highlight":
        execHighlight(action);
        break;
      default:
        console.warn("[snowie-bridge] Unknown action type:", action.type);
    }
  }

  // ─── Polling loop ─────────────────────────────────────────────────────────────
  var pollTimer = null;

  function poll() {
    var sessionId = getSessionId();
    if (!sessionId || !SCHEMA) {
      console.warn("[snowie-bridge] poll skipped — sessionId:", sessionId, "schema:", SCHEMA);
      return;
    }

    var url =
      BASE_URL +
      "/api/shopify/action/?session=" +
      encodeURIComponent(sessionId) +
      "&schema=" +
      encodeURIComponent(SCHEMA);

    console.log("[snowie-bridge] polling →", url);

    fetch(url, { method: "GET" })
      .then(function (res) {
        console.log("[snowie-bridge] response status:", res.status);
        if (!res.ok) {
          console.warn("[snowie-bridge] non-OK response:", res.status, res.statusText);
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        console.log("[snowie-bridge] raw data:", data);
        // Always broadcast the raw response so test UIs can display it
        window.dispatchEvent(new CustomEvent("snowie:action", { detail: data }));
        if (data && data.type) {
          console.log("[snowie-bridge] dispatching action:", data.type, data);
          dispatch(data);
        } else {
          console.log("[snowie-bridge] no action pending");
        }
      })
      .catch(function (err) {
        console.error("[snowie-bridge] fetch error:", err);
      });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Only poll while page is visible (saves battery + server load)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    startPolling();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
