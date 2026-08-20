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
export function buildSandboxHtml(source: string, theme: SandboxThemeTokens, cardId?: string): string {
  const encodedSource = toBase64Utf8(source);
  const rootVars = Object.entries(theme)
    .map(([name, value]) => `    ${name}: ${value};`)
    .join("\n");
  // A devtools sourceURL — see runMain's own doc comment further down for why
  // this exists at all. Not a JS string literal (it's raw text after a
  // "//# sourceURL=" comment, which must stay on one line with no spaces), so
  // strip everything outside a conservative safe set rather than escaping it.
  const scriptSourceUrl = `wattle-js-card-${(cardId ?? "unsaved").replace(/[^a-zA-Z0-9_-]/g, "")}.js`;
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
  /* Every wattle.ui.* draw call appends one more element straight into #root
     as a plain sibling, with no idea what came before or after it — a flex
     column with a fixed gap is what keeps a run of them (several buttons in a
     row, a field followed by a button) stacking predictably one per line
     instead of the old bare block flow, where an inline-flex button had no
     defined spacing from its neighbors and would crowd or wrap against them.
     Each child stretches to the full width by default (right for fields,
     tables, lists, diffs, paragraphs) — .wattle-button overrides this to stay
     a natural, compact size instead of stretching edge to edge. */
  #root { display: flex; flex-direction: column; gap: var(--space-2); }
  p { margin: 0; }
  ul, ol { margin: 0; padding-left: var(--space-4); }
  table { border-collapse: collapse; width: 100%; }
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
  label.wattle-field { display: block; }
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
    align-self: flex-start;
    transition: transform var(--duration-strike) var(--ease-strike), box-shadow var(--duration-strike) var(--ease-strike);
  }
  button.wattle-button:active:not(:disabled) { box-shadow: var(--shadow-button-pressed); transform: translate(2px, 2px); }
  button.wattle-button:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: var(--shadow-button-pressed); transform: translate(2px, 2px); }
  ul.wattle-list { list-style: none; padding: 0; margin: 0; }
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
  /* wattle.ui.diff — the same red/green-by-tint convention as the app's own
     annotateCard diff review, built from the accent/danger tokens rather than
     hardcoded colors so it still tracks light/dark automatically. */
  .wattle-diff {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    white-space: pre-wrap;
    border: var(--border-width-thin) solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .wattle-diff-line { padding: 0 var(--space-2); }
  .wattle-diff-line--add { background: color-mix(in srgb, var(--color-accent) 15%, transparent); }
  .wattle-diff-line--remove {
    background: color-mix(in srgb, var(--color-danger) 15%, transparent);
    text-decoration: line-through;
    opacity: 0.75;
  }
  .wattle-diff-line--same { color: var(--color-text-muted); }
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

  // A safety net for anything that ISN'T already inside runMain's own
  // try/catch (below) or a handler's own runHandler wrapper — a raw uncaught
  // exception from browser-native code, a rejected promise nobody awaited.
  // Without this, that whole class of failure would only ever show up in
  // devtools, invisible from the card itself — this makes sure it always also
  // surfaces as the same red error banner every other failure here does.
  window.addEventListener("error", function (event) {
    reportError(event.error || event.message || "Unknown script error");
    event.preventDefault();
  });
  window.addEventListener("unhandledrejection", function (event) {
    reportError(event.reason || "Unhandled promise rejection");
    event.preventDefault();
  });

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
    var message;
    if (err instanceof Error) {
      message = (err.name || "Error") + ": " + err.message;
    } else if (err && typeof err === "object" && typeof err.message === "string") {
      message = err.message;
    } else {
      message = String(err);
    }
    // The one syntax-error class this sandbox sees over and over in practice
    // (from real use this session) is a script that isn't actually valid JS on
    // its own — usually a leftover markdown code fence or explanatory text
    // pasted in alongside the code. The bare "Unexpected token" browsers give
    // for this is accurate but not actionable on its own, so name the likely
    // cause explicitly rather than leaving it as a guessing game.
    if (/unexpected (token|identifier|end of input)|invalid or unexpected token/i.test(message)) {
      message +=
        "\\n\\nThis is a JavaScript syntax error — the script text itself doesn't parse as-is. " +
        "The most common cause is extra content alongside the actual code (a markdown code " +
        "fence line, explanatory text before/after it, a stray closing bracket). Check the " +
        "very start and end of the script for anything that isn't real JavaScript.";
    }
    post("error", { message: message });
  }

  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  // Line-level LCS diff — a plain O(n*m) table, not a full Myers diff: good
  // enough for card-sized text (a note, a script), which is all this ever runs
  // against. The size guard below falls back to a blunt whole-text replacement
  // rather than allocating an unreasonable table for two genuinely huge inputs.
  function diffLines(oldText, newText) {
    var a = String(oldText == null ? "" : oldText).split("\\n");
    var b = String(newText == null ? "" : newText).split("\\n");
    var n = a.length;
    var m = b.length;
    if (n * m > 250000) {
      var bluntHunks = [];
      a.forEach(function (line) { bluntHunks.push({ type: "remove", value: line }); });
      b.forEach(function (line) { bluntHunks.push({ type: "add", value: line }); });
      return bluntHunks;
    }
    var dp = [];
    var i, j;
    for (i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var hunks = [];
    i = 0;
    j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { hunks.push({ type: "same", value: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { hunks.push({ type: "remove", value: a[i] }); i++; }
      else { hunks.push({ type: "add", value: b[j] }); j++; }
    }
    while (i < n) { hunks.push({ type: "remove", value: a[i] }); i++; }
    while (j < m) { hunks.push({ type: "add", value: b[j] }); j++; }
    return hunks;
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
    diff: function (oldText, newText) {
      var hunks = diffLines(oldText, newText);
      var wrap = el("div", "wattle-diff");
      hunks.forEach(function (hunk) {
        var line = el("div", "wattle-diff-line wattle-diff-line--" + hunk.type);
        line.textContent = hunk.value === "" ? " " : hunk.value;
        wrap.appendChild(line);
      });
      root.appendChild(wrap);
    },
  };

  // --- wattle.* — read (unrestricted) and mutate (handler-only, via RPC) -----

  var wattle = {
    ui: ui,
    // Pure, always-safe compute — not a draw, not an RPC, just a helper for
    // building your own review-before-apply flow: pair it with wattle.ui.diff
    // (renders the same hunks) and a wattle.ui.button that only THEN calls
    // wattle.editCard/wattle.ai's result into place.
    diffText: function (oldText, newText) {
      return diffLines(oldText, newText);
    },
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
    // patch.script rewrites ANY js card's own source (not just this one) —
    // the same "complete replacement, not a diff" rule as everywhere else in
    // this SDK; throws if id isn't actually a js-typed card. Pair with
    // wattle.diffText/wattle.ui.diff and a confirm button to show the change
    // and require a click before it actually lands, rather than applying a
    // model's proposed edit unreviewed.
    editCard: function (id, patch) {
      requireHandler("editCard");
      return rpc("editCard", [id, patch]);
    },
    removeCard: function (pageCardId) {
      requireHandler("removeCard");
      return rpc("removeCard", [pageCardId]);
    },
    moveCard: function (pageCardId, destPageTitle) {
      requireHandler("moveCard");
      return rpc("moveCard", [pageCardId, destPageTitle]);
    },
    generate: function (instructions, opts) {
      requireHandler("generate");
      return rpc("generate", [instructions, opts]);
    },
    // A raw, silent, one-shot model call: no vault-context injection, no
    // system prompt of its own beyond what you pass in opts.system, and no
    // card is ever created or shown — just text back into the script. This is
    // what lets a script run a generation step WITHOUT it becoming visible:
    // nothing appears anywhere unless you go on to call wattle.ui.* (or
    // wattle.editCard/createCard) with the result yourself.
    ai: function (prompt, opts) {
      requireHandler("ai");
      return rpc("ai", [prompt, opts]);
    },
    navigate: {
      toPage: function (pageIdOrTitle) {
        requireHandler("navigate.toPage");
        return rpc("navigate.toPage", [pageIdOrTitle]);
      },
    },
    // This card's own explicit, opt-in persistence — the ONE thing that
    // survives a reload. Local variables never do (top-level code re-running
    // fresh on every load/rerun is the whole point of this being a live
    // query), so a script that wants something to stick around across a
    // reload has to say so explicitly, one key at a time, rather than getting
    // it automatically for everything.
    state: {
      get: function (key, defaultValue) {
        return rpc("state.get", [key, defaultValue]);
      },
      set: function (key, value) {
        requireHandler("state.set");
        return rpc("state.set", [key, value]);
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
      // sourceURL labels this specific card's compiled script in devtools —
      // without it, every js card's own errors show up under the same
      // anonymous "VM##" label, making it impossible to tell which card an
      // error in the console even belongs to once more than one is open.
      var fn = new Function("wattle", "return (async () => {\\n" + source + "\\n})()\\n//# sourceURL=${scriptSourceUrl}\\n");
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
//# sourceURL=wattle-js-bootstrap.js
</script>
</body>
</html>`;
}
