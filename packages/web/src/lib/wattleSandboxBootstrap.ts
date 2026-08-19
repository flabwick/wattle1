import type { SandboxThemeTokens } from "./wattleSandboxTheme.js";

/**
 * Builds the full HTML document a `js`-typed Card's iframe runs as its own
 * `srcdoc` — everything self-contained (no external `<script src>`/stylesheet/
 * font), since the sandbox (`sandbox="allow-scripts"`, deliberately WITHOUT
 * `allow-same-origin` — see JsCardView.tsx) gives it an opaque origin that
 * can't fetch anything cross-origin anyway, and a `Content-Security-Policy` meta
 * tag below (`default-src 'none'`) blocks network access outright as a second,
 * explicit line of defense rather than relying on the sandbox attribute alone.
 * `script-src` needs `'unsafe-eval'` alongside `'unsafe-inline'` — the bootstrap
 * below runs the script's own source via `new Function(...)` (dynamic code from
 * a string counts as "eval" for CSP purposes even though it's not literally
 * `eval()`) — safe to allow here specifically *because* `default-src 'none'`
 * plus the missing `allow-same-origin` already remove everything an eval'd
 * script could actually do damage with (no network, no reachable parent
 * document); `unsafe-eval` alone, without those, would not be safe.
 *
 * This file is the ONLY place the `wattle` object a script sees is defined —
 * every method here either draws directly into this document (no RPC needed,
 * it's already this iframe's own DOM) or calls `__wattleRpc(method, args)`,
 * which postMessages the host (JsCardView.tsx's own listener) and awaits a
 * correlated reply. A *mutating* method (create/edit/remove/generate) refuses to
 * even send that RPC unless `insideHandler` is currently true — set only while a
 * `wattle.ui.button` (or future `wattle.on`) callback is actually running — so a
 * script that puts `wattle.createCard(...)` at its own top level throws
 * immediately with a message the model can learn from, rather than spawning a
 * new Card on every single re-run (the Dataview lesson the plan is explicit
 * about: live queries are cheap, live mutations on refresh are how you
 * duplicate the vault). This is the ONE piece of policy enforcement that lives
 * in script the sandbox runs rather than in the host: it doesn't need to be a
 * hard security boundary (the sandbox itself is what keeps this script from
 * reaching the rest of the app regardless), just a reliable guardrail a
 * well-behaved script (human- or model-written) can't accidentally trip past.
 */

/** A source string's own literal `</script>`/`</style>` would otherwise
 *  terminate the surrounding tag early if spliced in as plain text — base64
 *  encoding sidesteps every such escaping question rather than trying to
 *  enumerate them. `unescape(encodeURIComponent(...))` is the standard
 *  (if crusty) way to get UTF-8-safe input into `btoa`, which otherwise only
 *  accepts Latin1. */
function toBase64Utf8(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

/** Every token is a literal resolved CSS value (a hex color, an `Npx` length, a
 *  font stack, an ms duration — see wattleSandboxTheme.ts's own doc comment for
 *  why), spliced in as `:root { --<name>: <value>; }` under the SAME name the
 *  rest of the app uses. The stylesheet below then styles `wattle.ui.*`'s own
 *  elements with `var(--color-surface)`/`var(--radius-sm)`/etc., not a
 *  bespoke palette — this is what makes a script's own controls come out
 *  looking like `Button`/`InputField` (packages/web/src/components/primitives/)
 *  automatically, including matching light/dark and reduced-motion, without
 *  this file hand-encoding any of that itself. */
export function buildSandboxHtml(source: string, theme: SandboxThemeTokens): string {
  const encodedSource = toBase64Utf8(source);
  const rootVars = Object.entries(theme)
    .map(([name, value]) => `    ${name}: ${value};`)
    .join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:;">
<style>
  :root {
${rootVars}
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  html {
    /* Transparent, not --color-bg — this iframe has no border/box of its own
       (JsCard.css's own .js-card__iframe) and is auto-sized to its content
       height (the resize-report loop further down), so it's meant to read as
       part of the card's own surface, not a distinct panel sitting on it. */
    background: transparent;
  }
  body {
    font-family: var(--font-family-base);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-base, 1.5);
    color: var(--color-text);
    background: transparent;
    padding: var(--space-2) 0;
  }
  #root > :first-child { margin-top: 0; }
  #root > :last-child { margin-bottom: 0; }
  p { margin: 0 0 var(--space-2); }
  ul, ol { margin: 0 0 var(--space-2); padding-left: var(--space-4); }
  table { border-collapse: collapse; width: 100%; margin-bottom: var(--space-2); }
  th, td { border: var(--border-width-thin) solid var(--color-border); padding: var(--space-1) var(--space-2); text-align: left; font-size: var(--font-size-sm); }
  th { background: var(--color-surface-raised); }

  /* Same shape as primitives/InputField.css. */
  input, select, textarea {
    font: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    border: var(--border-width-bold) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-2);
    min-height: var(--touch-target-sm);
    margin: 0 0 var(--space-2);
    width: 100%;
    display: block;
  }
  textarea { min-height: calc(var(--touch-target-sm) * 2); padding: var(--space-2); }
  input[type="checkbox"] { width: auto; min-height: 0; margin: 0; }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 var(--border-width-thin) var(--color-accent);
  }
  label.wattle-field { display: block; margin-bottom: var(--space-2); }
  label.wattle-field > span { display: block; font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: var(--space-1); }
  label.wattle-field.wattle-field--toggle { display: flex; align-items: center; gap: var(--space-2); }

  /* Same shape as primitives/Button.css's own tactile press: a bold outline, a
     solid offset shadow, and a press that flattens the shadow — no blur, no
     color inversion. */
  button.wattle-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--touch-target-sm);
    padding: 0 var(--space-3);
    border: var(--border-width-bold) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    color: var(--color-accent-text);
    font: inherit;
    font-weight: var(--font-weight-bold);
    white-space: nowrap;
    cursor: pointer;
    box-shadow: var(--shadow-button);
    transform: translate(0, 0);
    margin: 0 0 var(--space-2);
    transition: transform var(--duration-strike) var(--ease-strike), box-shadow var(--duration-strike) var(--ease-strike);
  }
  button.wattle-button:active:not(:disabled) { box-shadow: var(--shadow-button-pressed); transform: translate(2px, 2px); }
  button.wattle-button:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: var(--shadow-button-pressed); transform: translate(2px, 2px); }
  ul.wattle-list { list-style: none; padding: 0; margin: 0 0 var(--space-2); }
  ul.wattle-list li { padding: var(--space-1) 0; border-bottom: var(--border-width-thin) solid var(--color-border); }
  ul.wattle-list li:last-child { border-bottom: none; }
  button.wattle-list-item {
    font: inherit;
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
    padding: 0;
  }
  button.wattle-list-item:hover { text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) {
    button.wattle-button { transition: none; }
  }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  "use strict";

  var root = document.getElementById("root");
  var pending = Object.create(null);
  var nextCallId = 1;
  var insideHandler = false;

  function post(type, payload) {
    parent.postMessage(Object.assign({ wattleJs: true, type: type }, payload), "*");
  }

  // Auto-sizing: the host can't read this document's own scrollHeight directly
  // (a sandboxed iframe without allow-same-origin is cross-origin from the
  // host's point of view), so this document measures and reports its own
  // height instead — the host sets the <iframe> element's own height to match
  // (JsCardView.tsx), which is what lets this read as part of the card's own
  // content instead of a fixed-size box with its own internal scrollbar.
  if (typeof ResizeObserver !== "undefined") {
    var lastReportedHeight = -1;
    var resizeObserver = new ResizeObserver(function () {
      var height = document.body.scrollHeight;
      if (height === lastReportedHeight) return;
      lastReportedHeight = height;
      post("resize", { height: height });
    });
    resizeObserver.observe(document.body);
  }

  function rpc(method, args) {
    var id = String(nextCallId++);
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post("call", { id: id, method: method, args: args });
    });
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.wattleJs !== true || data.type !== "result") return;
    var entry = pending[data.id];
    if (!entry) return;
    delete pending[data.id];
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || "wattle call failed"));
  });

  function requireHandler(name) {
    if (!insideHandler) {
      throw new Error(
        "wattle." + name + "() can only be called from inside a handler (wattle.ui.button's onClick, " +
        "wattle.on(...)) — never at the top level of the script. Top-level code may only read and draw; " +
        "put mutations behind a button so re-running the block doesn't repeat them."
      );
    }
  }

  async function runHandler(fn) {
    var was = insideHandler;
    insideHandler = true;
    try {
      await fn();
    } catch (err) {
      reportError(err);
    } finally {
      insideHandler = was;
    }
  }

  function reportError(err) {
    var message = err && err.message ? err.message : String(err);
    post("error", { message: message });
  }

  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  // --- wattle.ui.* — draws directly into this document, no RPC ---------------

  var fieldValues = Object.create(null);

  var ui = {
    clear: function () {
      root.innerHTML = "";
    },
    html: function (html) {
      var wrap = el("div");
      wrap.innerHTML = String(html == null ? "" : html);
      root.appendChild(wrap);
    },
    text: function (str) {
      var p = el("p");
      p.textContent = String(str == null ? "" : str);
      root.appendChild(p);
    },
    field: function (name, spec) {
      spec = spec || {};
      var kind = spec.kind || "text";
      var label = el("label", "wattle-field" + (kind === "toggle" ? " wattle-field--toggle" : ""));
      var caption = null;
      if (spec.label && kind !== "toggle") {
        caption = el("span");
        caption.textContent = spec.label;
        label.appendChild(caption);
      }
      var input;
      if (kind === "textarea") {
        input = el("textarea");
        input.rows = spec.rows || 3;
      } else if (kind === "toggle") {
        input = document.createElement("input");
        input.type = "checkbox";
      } else if (kind === "select") {
        input = document.createElement("select");
        (spec.options || []).forEach(function (opt) {
          var o = document.createElement("option");
          var value = typeof opt === "string" ? opt : opt.value;
          var text = typeof opt === "string" ? opt : opt.label || opt.value;
          o.value = value;
          o.textContent = text;
          input.appendChild(o);
        });
      } else {
        input = document.createElement("input");
        input.type = kind === "number" ? "number" : "text";
      }
      if (spec.placeholder) input.placeholder = spec.placeholder;
      var initial = Object.prototype.hasOwnProperty.call(fieldValues, name) ? fieldValues[name] : spec.defaultValue;
      if (kind === "toggle") {
        input.checked = !!initial;
        fieldValues[name] = !!initial;
      } else if (initial !== undefined) {
        input.value = initial;
        fieldValues[name] = initial;
      } else {
        fieldValues[name] = kind === "toggle" ? false : "";
      }
      input.addEventListener("input", function () {
        fieldValues[name] = kind === "toggle" ? input.checked : input.value;
      });
      input.addEventListener("change", function () {
        fieldValues[name] = kind === "toggle" ? input.checked : input.value;
      });
      if (spec.onSubmit && (kind === "text" || kind === "number" || kind === "select")) {
        input.addEventListener("keydown", function (e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          runHandler(async function () {
            await spec.onSubmit();
          });
        });
      }
      if (kind === "toggle" && spec.label) {
        var toggleCaption = document.createElement("span");
        toggleCaption.textContent = spec.label;
        label.appendChild(input);
        label.appendChild(toggleCaption);
      } else {
        label.appendChild(input);
      }
      root.appendChild(label);
    },
    value: function (name) {
      return fieldValues[name];
    },
    button: function (label, onClick) {
      var b = el("button", "wattle-button");
      b.type = "button";
      b.textContent = String(label == null ? "" : label);
      b.addEventListener("click", function () {
        if (b.disabled) return;
        b.disabled = true;
        runHandler(async function () {
          if (typeof onClick === "function") await onClick();
        }).finally(function () {
          b.disabled = false;
        });
      });
      root.appendChild(b);
    },
    list: function (items) {
      var ulEl = el("ul", "wattle-list");
      (items || []).forEach(function (item) {
        var li = document.createElement("li");
        if (item && typeof item === "object" && typeof item.onClick === "function") {
          var b = el("button", "wattle-list-item");
          b.type = "button";
          b.textContent = String(item.label == null ? "" : item.label);
          b.addEventListener("click", function () {
            runHandler(async function () {
              await item.onClick();
            });
          });
          li.appendChild(b);
        } else {
          li.textContent = item && typeof item === "object" ? String(item.label || "") : String(item);
        }
        ulEl.appendChild(li);
      });
      root.appendChild(ulEl);
    },
    table: function (rows, columns) {
      rows = rows || [];
      columns = columns || (rows[0] ? Object.keys(rows[0]) : []);
      var t = el("table");
      var thead = el("thead");
      var headRow = el("tr");
      columns.forEach(function (c) {
        var th = document.createElement("th");
        th.textContent = String(c);
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      t.appendChild(thead);
      var tbody = el("tbody");
      rows.forEach(function (row) {
        var tr = el("tr");
        columns.forEach(function (c) {
          var td = document.createElement("td");
          td.textContent = row && row[c] != null ? String(row[c]) : "";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      t.appendChild(tbody);
      root.appendChild(t);
    },
  };

  // --- wattle.* — read (unrestricted) and mutate (handler-only, via RPC) -----

  var wattle = {
    ui: ui,
    on: function (_eventName, _handler) {
      // Reserved for a future event source beyond a button click (e.g. "this
      // block's own field changed without a submit") — v1 only wires
      // wattle.ui.button's own onClick as a handler context. Calling this is a
      // harmless no-op today rather than a hard error, so a script written
      // against the fuller SDK the plan describes doesn't crash outright.
    },
    this: function () {
      return rpc("this", []);
    },
    page: {
      cards: function () {
        return rpc("page.cards", []);
      },
      card: function (id) {
        return rpc("page.card", [id]);
      },
    },
    vault: {
      search: function (query) {
        return rpc("vault.search", [query]);
      },
    },
    card: function (id) {
      return rpc("card", [id]);
    },
    search: function (query, opts) {
      return rpc("search", [query, opts]);
    },
    createCard: function (input) {
      requireHandler("createCard");
      return rpc("createCard", [input]);
    },
    editCard: function (id, patch) {
      requireHandler("editCard");
      return rpc("editCard", [id, patch]);
    },
    removeCard: function (pageCardId) {
      requireHandler("removeCard");
      return rpc("removeCard", [pageCardId]);
    },
    generate: function (instructions, opts) {
      requireHandler("generate");
      return rpc("generate", [instructions, opts]);
    },
    navigate: {
      toPage: function (pageIdOrTitle) {
        requireHandler("navigate.toPage");
        return rpc("navigate.toPage", [pageIdOrTitle]);
      },
    },
  };

  // Re-runs the same script in place — a rerun message (JsCardView.tsx's own
  // "the page's card list changed" trigger) never touches srcdoc, so this same
  // document/iframe stays alive across it: no navigation, no reload flash, no
  // lost fieldValues. Cheap insurance against overlapping runs (several rerun
  // messages arriving close together, e.g. a fast sequence of page edits) — a
  // run already in flight just gets one more pass queued after it finishes,
  // instead of two copies of the script executing over each other's
  // half-drawn output at once.
  var mainRunning = false;
  var rerunPending = false;

  async function runMain() {
    if (mainRunning) {
      rerunPending = true;
      return;
    }
    mainRunning = true;
    root.innerHTML = "";
    try {
      var encoded = "${encodedSource}";
      var source = decodeURIComponent(escape(atob(encoded)));
      var fn = new Function("wattle", "return (async () => {\\n" + source + "\\n})()");
      await fn(wattle);
      post("done", {});
    } catch (err) {
      reportError(err);
    } finally {
      mainRunning = false;
      if (rerunPending) {
        rerunPending = false;
        runMain();
      }
    }
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.wattleJs !== true || data.type !== "rerun") return;
    runMain();
  });

  runMain();
})();
</script>
</body>
</html>`;
}
