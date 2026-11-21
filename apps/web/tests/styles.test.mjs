// Guards for styles.css: layout rules that are easy to break by accident.
//
//   npm run test:web
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** Innermost `selector { declarations }` blocks, with the property names they set. */
function rules(source) {
  return [...stripComments(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selectors: selector.split(",").map((s) => s.trim()).filter(Boolean),
    props: [...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map((m) => m[1]),
  }));
}

// The phone layout makes every dialog a full-width bottom sheet with a rule on
// `.dialog`. A more specific selector for the dialog element itself
// (`.dialog--sm`, `.dialog.x`, `.dialog[open]`…) that sets any of these would
// win over it, also on phones. Variants must set --dialog-max instead.
const LAYOUT = new Set([
  "width", "min-width", "max-width", "margin", "margin-left", "margin-right", "margin-inline",
  "inset", "left", "right", "position", "translate",
]);

/** Rules that style a dialog variant and set its width or placement. */
function dialogLayoutOffenders(source) {
  const offenders = [];
  for (const { selectors, props } of rules(source)) {
    for (const sel of selectors) {
      // The last compound selector is the element being styled.
      const target = sel.split(/[\s>+~]+/).pop() ?? "";
      const isVariant = /^\.dialog[.[:-]/.test(target) && !target.startsWith(".dialog__");
      const bad = props.filter((p) => LAYOUT.has(p));
      if (isVariant && bad.length) offenders.push(`${sel} { ${bad.join(", ")} }`);
    }
  }
  return offenders;
}

test("dialog variants never set width, margins or position", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.deepEqual(
    dialogLayoutOffenders(css),
    [],
    "Set --dialog-max on dialog variants: width and placement belong to .dialog (see the note in styles.css).",
  );
});

test("the guard catches the mistake it exists for", () => {
  assert.deepEqual(dialogLayoutOffenders(".dialog.dialog--sm { width: min(420px, 100%); }"), [".dialog.dialog--sm { width }"]);
  assert.deepEqual(dialogLayoutOffenders("@media (min-width: 1px) { .dialog--wide { margin: 0 auto; } }"), [".dialog--wide { margin }"]);
  assert.deepEqual(dialogLayoutOffenders(".dialog--sm { --dialog-max: 420px; } .dialog__header { margin: 0; } .dialog { width: 100%; }"), []);
});
