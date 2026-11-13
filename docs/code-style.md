# Code style

The editor is TypeScript (D-087). esbuild bundles it for the browser and for Home Assistant (`npm run build`); Node runs the
tests straight from the `.ts` files, with no build step (`npm test`). `npm run check` runs the formatter's check, `tsc`
(strict) and the tests. The code is written to be read, not to be short.

- **Types.** Named functions (declarations and named `const` arrows) have their parameters and return type written out.
  Inline callbacks (`map`, `filter`, event handlers) may leave them to inference. The data the modules hand to each other
  (the plan file, Home Assistant's states, the UI's saved state) is declared in `src/core/types.ts`; a shape only one
  module uses is declared in that module.
- **No `any`.** A value from outside (a plan file, `localStorage`, Home Assistant, a server's answer) is `unknown` until it
  is checked, then gets its named type.
- **The DOM.** Elements our own markup always has are found with the helpers that throw when one is missing, so the code
  does not fill up with `!`. A `!` or an `as` is allowed where the reason is plain; a non-obvious one gets a comment.
- **Names say what a thing is.** `room`, `opening`, `wallLength`, not `r`, `o`, `L`. Short names only for loop indices
  (`i`, `j`), coordinates (`x`, `y`, `z`) and a comparator's `a`, `b`.
- **One statement per line, one name per declaration.** No `const a = 1, b = 2`. A long expression is split into named
  steps.
- **Numbers with a meaning have a name**, with the unit: `const DOOR_CLEARANCE_METRES = 0.05`.
- **Comments say why**, in plain English.
- **Erasable syntax only** (what Node can strip): no `enum`, `namespace`, parameter properties or `import x = require`;
  type-only imports with `import type`. Relative imports name the file with its `.ts` extension.
- **Formatting** is Prettier's (`npm run format`), with the repo's `editor/.prettierrc.json`.
