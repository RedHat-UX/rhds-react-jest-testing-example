# Testing RHDS React wrappers with Jest and React Testing Library

A small, self-contained proof of concept for React 19 applications that consume
[`@rhds/elements`](https://ux.redhat.com/) (Red Hat Design System) through its
`@lit/react` wrapper exports such as
`@rhds/elements/react/rh-button/rh-button.js`.

The point of the demo is the testing boundary:

> Application tests exercise the real design system in JSDOM and assert only on
> each custom element's public API. They never pierce a shadow root and never
> mock an `@rhds/elements` module.

## Workarounds and caveats (read first)

These are deliberate harness workarounds, not design-system fixes. Review them
before copying this setup into a product repository.

| Area                      | Workaround / caveat                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jest module format        | Runs as native ESM via `NODE_OPTIONS=--experimental-vm-modules` because `rh-icon` has top-level `await` in a server-only branch. Node prints an `ExperimentalWarning`; it is not a test failure.                                                                                                                                                               |
| ElementInternals          | JSDOM's partial implementation is replaced by `element-internals-polyfill`. The polyfill is sealed and older than some ARIAMixin properties, so `jest.setup.ts` adds prototype fallbacks. Those fallbacks only store values; they do not reflect every `aria-*` attribute to the host. Tests that assert `InternalsController` ARIA output need a fuller shim. |
| Constructable stylesheets | `replaceSync`, `replace`, and `adoptedStyleSheets` are shimmed so Lit uses constructed sheets and JSDOM stops rejecting modern RHDS CSS. CSS is stored, not parsed. Do not assert computed styles that depend on the token sheet.                                                                                                                              |
| Observers and media       | `IntersectionObserver` and `ResizeObserver` are inert. `matchMedia` always reports no matches. Lazy icon loading, overflow behavior, and reduced-motion branches are not exercised.                                                                                                                                                                            |
| Native `<dialog>`         | Shim supports `show`, `showModal`, `close`, `returnValue`, and the native `close` event. No top layer, focus trap, backdrop hit testing, or animations.                                                                                                                                                                                                        |
| Theme probe               | `jest.setup.ts` seeds `--rh-color-accent-base` so `themable()` skips its asynchronous token import. The browser app still loads the real `@rhds/tokens` CSS in `src/main.tsx`.                                                                                                                                                                                 |
| Clicking                  | RTL cannot click inside a shadow root. Tests click the host element (where the app owns the React handler) or dispatch the documented custom event. This tests the app's reaction, not the design system's internal click or focus wiring.                                                                                                                     |
| Icons                     | The inert IntersectionObserver means `rh-icon` content is not fetched. Logic tests do not need it; visual tests would.                                                                                                                                                                                                                                         |
| Console guard             | Any `console.error` fails the test. Set `RHDS_STRICT_CONSOLE=0` to see the original stack while debugging.                                                                                                                                                                                                                                                     |
| [Asimonim MCP][asmnm]     | The MCP server caches `.config/design-tokens.yaml` at process start. After adding or changing it, restart the server before `search_tokens`; the CLI (`asimonim search ...`) reads it immediately.                                                                                                                                                             |

## What is in the box

| Path                                           | Purpose                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/DeploymentManager.tsx`                    | App feature using six RHDS wrappers: `Card`, `Button`, `Switch`, `Dialog`, `Alert`, `Tag`                        |
| `src/DeploymentManager.test.tsx`               | Application tests written entirely against host properties, attributes, custom events, slots, and public methods |
| `src/styles.test.ts`                           | Static stylesheet contract: RHDS tokens for colors/scales and the responsive breakpoint                          |
| `jest.config.cjs`                              | ESM Jest configuration, SWC transforms, and the `transformIgnorePatterns` allowlist for RHDS/Lit/PatternFly      |
| `jest.setup.ts`                                | The reusable "DS test harness": JSDOM browser shims plus a strict `console.error` guard                          |
| `src/main.tsx`, `index.html`, `vite.config.ts` | A runnable Vite app for manual inspection                                                                        |
| `src/styles.css`                               | Application chrome built from `--rh-*` design tokens                                                             |
| `.config/design-tokens.yaml`                   | Asimonim workspace config pointing at the RHDS token source                                                      |

Installed versions in this snapshot:

- `react` / `react-dom` `19.3.1`
- `@rhds/elements` `5.0.0`
- `@lit/react` `1.0.8`
- `@rhds/tokens` `3.2.0`
- `lit` `3.3.3`
- `jest` / `jest-environment-jsdom` `30.5.2`

## Quick start

```sh
npm install
npm test
npm run typecheck
npm run dev
```

`npm test` runs thirteen tests: ten application tests in
`src/DeploymentManager.test.tsx` and three stylesheet contract tests in
`src/styles.test.ts`.

```text
Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
```

## The component API this demo relies on

`@rhds/elements` 5.0.0 exposes wrappers through this export map:

```json
{
  ".": "./elements.js",
  "./*": "./elements/*",
  "./lib/*": "./lib/*",
  "./react/*": "./react/*"
}
```

Each wrapper file is named after its element, and exports a React component
with a capitalized name:

```ts
import { Button } from '@rhds/elements/react/rh-button/rh-button.js';
import { Card } from '@rhds/elements/react/rh-card/rh-card.js';
import { Dialog } from '@rhds/elements/react/rh-dialog/rh-dialog.js';
import { Switch } from '@rhds/elements/react/rh-switch/rh-switch.js';
import { Alert } from '@rhds/elements/react/rh-alert/rh-alert.js';
import { Tag } from '@rhds/elements/react/rh-tag/rh-tag.js';
```

The wrappers are generated by `@lit/react`'s `createComponent`. They forward
properties and attributes to the host custom element and map the events that
the design system declares:

```ts
// node_modules/@rhds/elements/react/rh-dialog/rh-dialog.js
export const Dialog = createComponent({
  tagName: 'rh-dialog',
  elementClass: RhDialog,
  react,
  events: {
    onOpen: 'open',
    onClose: 'close',
    onCancel: 'cancel',
  },
});
```

That is the complete contract application tests need.

## Design tokens

The app chrome does not invent its own palette. It installs `@rhds/tokens` and
loads the token sheets before the application stylesheet:

```ts
// src/main.tsx
import '@rhds/tokens/css/global.css';        // base scales
import '@rhds/tokens/css/default-theme.css'; // light/dark semantic mappings
import './styles.css';                       // consumes var(--rh-...)
```

`src/styles.css` uses token variables for color, spacing, typography, borders,
radii, and motion, for example:

```css
.app-bar {
  color: var(--rh-color-text-primary-on-dark, #ffffff);
  background: var(--rh-color-surface-darkest, #151515);
  border-block-start: var(--rh-border-width-lg, 3px) solid
    var(--rh-color-accent-brand, #ee0000);
  padding: var(--rh-space-sm, 6px) var(--rh-space-2xl, 32px);
}

.status-dot--ok {
  background: var(--rh-color-status-success, #3d7317);
  box-shadow: 0 0 0 4px var(--rh-color-surface-status-success, #e9f7df);
}
```

Fallbacks are current token values, so the layout still reads if the token
sheet is late. They are not a second theme.

The repository also includes `.config/design-tokens.yaml`, which points
[Asimonim][asmnm] at the RHDS token source:

```yaml
files:
  - path: node_modules/@rhds/tokens/json/rhds.tokens.json
```

Token names in this README were verified with [Asimonim][asmnm]:

```sh
asimonim search "surface" node_modules/@rhds/tokens/json/rhds.tokens.json --format names
asimonim validate node_modules/@rhds/tokens/json/rhds.tokens.json
```

The MCP variant exposes the same checks as `search_tokens` and
`validate_tokens`. Validation reports 547 tokens and 153 deprecated tokens
upstream. This demo uses only non-deprecated names such as
`--rh-color-surface-lighter`, `--rh-color-text-secondary`,
`--rh-color-status-success`, and `--rh-space-xl`.

## Why Jest runs as ESM

`@rhds/elements` is ESM-only. More importantly, `rh-icon` (imported statically by
`rh-switch` and `rh-alert`, and dynamically by `rh-dialog`'s close button)
contains top-level await in a server-only branch:

```js
if (isServer) {
  await import('./ssr.js');
}
```

A CommonJS transform cannot emit top-level await, even when the branch would
never run in JSDOM. Rather than patching the design system, this project runs
the test graph as native ESM:

```sh
NODE_OPTIONS=--experimental-vm-modules jest
```

The `test` script already sets that flag. Node prints an `ExperimentalWarning`
for VM modules. It does not affect test results and is not a test error.

If your app stays on CommonJS Jest, you need a plan for that top-level await
(for example, a transform that rewrites it). That is outside the public testing
contract described here.

## Jest configuration

The relevant parts of `jest.config.cjs`:

```js
module.exports = {
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    // ESM shipped from a CJS-typed package: emit CommonJS for Jest.
    'node_modules/element-internals-polyfill/.+\\.js$': [
      '@swc/jest',
      {
        jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
        module: { type: 'commonjs' },
      },
    ],
    // Application TypeScript + JSX, kept as ESM.
    '^.+\\.(ts|tsx)$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
          target: 'es2022',
        },
        module: { type: 'es6' },
      },
    ],
    // Vendored ESM JavaScript, kept as ESM.
    '^.+\\.jsx?$': [
      '@swc/jest',
      {
        jsc: { parser: { syntax: 'ecmascript', jsx: false }, target: 'es2022' },
        module: { type: 'es6' },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@rhds|@patternfly|@lit|@lit-labs|lit|lit-html|lit-element|element-internals-polyfill)/)',
  ],
};
```

### `transformIgnorePatterns` explained

Jest ignores `node_modules` by default. The negative lookahead keeps the
following packages transformable:

- `@rhds/*`: the design system and its icons/tokens
- `@patternfly/pfe-core`: controllers used by RHDS
- `@lit/*`, `@lit-labs/*`: Lit's React wrapper, context, and related packages
- `lit`, `lit-html`, `lit-element`: the Lit runtime
- `element-internals-polyfill`: ships ESM without a `"type": "module"` package

`@swc/jest` is used for speed. Babel or `ts-jest` can replace it as long as the
same files are transformed and application TypeScript stays ESM.

### Why `setupFilesAfterEnv`

`jest.setup.ts` must run before the test module imports any RHDS component.
Lit performs feature detection at module evaluation time, so the polyfills must
exist first.

## The DS test harness (`jest.setup.ts`)

The file contains no design-system mocks. It teaches JSDOM only the browser
APIs that RHDS and Lit need.

### ElementInternals

JSDOM 26 has `attachInternals()` but not `setFormValue`, `setValidity`,
`states`, or the complete ARIAMixin surface. RHDS components are
form-associated custom elements and use `@patternfly/pfe-core`'s
`InternalsController`, so the setup:

1. imports `element-internals-polyfill` before components load, and
2. adds prototype accessors for the newer ARIAMixin properties that
   `InternalsController` initializes (for example
   `ariaActiveDescendantElement` and `ariaControlsElements`). Without these,
   the sealed polyfilled `ElementInternals` throws
   `TypeError: Cannot add property ariaActivedescendant`.

This is important: it is a browser API shim, not a change to RHDS behavior.

### Constructable stylesheets

JSDOM has `new CSSStyleSheet()` but no `replaceSync`, `replace`, or
`adoptedStyleSheets`. Lit checks those APIs once at import time. The harness
installs them first, so Lit uses constructed stylesheets instead of appending
`<style>` elements. That avoids JSDOM's CSS parser rejecting modern RHDS CSS and
printing errors.

`rh-dialog`'s scroll lock and `themable()` also use `document.adoptedStyleSheets`
and `CSSStyleSheet.replaceSync`, so the same shims cover them.

### Observers and media queries

- `IntersectionObserver` is an inert stub. `rh-icon` constructs one at module
  scope for lazy loading; this demo does not need icons to load.
- `ResizeObserver` is an inert stub for components that use it.
- `matchMedia` reports no matches. Tests that need a specific media result can
  override it per test.

### Native `<dialog>`

`rh-dialog` renders a native `<dialog>` inside its shadow root and calls
`showModal()` / `close()`. JSDOM 26 does not implement those methods, so the
harness adds the minimum behavior: reflect the `open` attribute, support
`returnValue`, and dispatch the native `close` event that `rh-dialog` listens
for. The component's own logic and custom events still run unchanged.

### Theme probe

`themable()` checks for `--rh-color-accent-base` when a component module is
evaluated. Seeding that single custom property keeps token loading synchronous.
No component behavior is mocked.

### Duplicate registration guard

`customElements.define` is wrapped so re-evaluating the same module (for
example after `jest.resetModules()`) does not throw. Re-registering the same
constructor is a no-op; registering a different constructor under the same tag
still throws loudly.

### Console error guard

Every test fails if anything calls `console.error`. This catches act()
violations, bad property assignments, JSDOM "not implemented" warnings, and
unhandled component errors. Set `RHDS_STRICT_CONSOLE=0` while debugging to see
the original stack traces.

## The Testing Contract

Application tests and design-system tests own different things. Keep the line
sharp.

| Application team tests (public API) | Design system team tests (internals) |
| --- | --- |
| Host properties and reflected attributes (`disabled`, `danger`, `checked`, `open`, `state`, `variant`) | Shadow DOM structure, internal part names, CSS and layout |
| Custom events (`change`, `close`, `cancel`, `open`, `expand`) and the app's reaction | Internal ARIA wiring, focus trapping, keyboard behavior |
| Light-DOM slotted content (`getByText`, `within(host).getByRole`) | Whether a slot is rendered in the right internal wrapper |
| Public imperative methods (`showModal()`, `close(value)`, `focus()`, `toggle()`) | Native dialog plumbing, scroll locking, animations |
| `returnValue` and other documented host state | Internal component state and private fields |

### What application tests should not do

- Do not read `element.shadowRoot` or query inside it.
- Do not reach for `element.shadowRoot.querySelector('button')` just to click.
- Do not `jest.mock('@rhds/elements/...')`.
- Do not assert on internal class names, parts, or CSS.
- Do not test that RHDS renders correct ARIA. That belongs to the DS repository.

### Clicking a host element

RTL cannot click an element inside a shadow root, and it should not try. In this
app the click handler is a React prop on the host:

```tsx
<Button data-testid="rollback-button" onClick={openRollbackDialog}>
  Roll back deployment
</Button>
```

The test clicks the host. In a real browser a click on the internal button
bubbles through the shadow boundary to the host, so the same handler fires. The
test verifies the application's reaction, not RHDS's internal click handling.

Likewise, the alert dismissal test dispatches the documented `close` event on
the host instead of trying to click the alert's internal close button.

## What the tests demonstrate

`src/DeploymentManager.test.tsx` covers:

1. **Real elements upgraded in JSDOM.** `customElements.get('rh-card')` is
   defined and the rendered host is an `HTMLElement`.
2. **State drives host properties.** When maintenance mode is off,
   `<rh-button>` has `disabled` and `danger=false`. Turning the switch on
   removes `disabled`, sets `danger`, and changes `variant`.
3. **Custom events drive app state.** Clicking `<rh-switch>` causes it to
   dispatch `change`; the app reads `checked` and re-renders. Clicking the
   rollback button opens `<rh-dialog>` through `showModal()`.
4. **Slotted light DOM is queryable.** Dialog header, body, and footer content
   are found with `getByText` / `within(dialog).getByTestId`, not by inspecting
   the dialog's internal structure.
5. **Public methods and return values.** Confirming calls
   `dialog.close('rollback')`; the app reads `dialog.returnValue` in the
   `close` handler and updates state.
6. **Custom event dismissal.** Dispatching `close` on the alert host removes it
   from the DOM, exactly as the design system's documented event contract
   promises.
7. **Presentation state.** Status tag text/color and the release-history current
   marker follow the rollback state; deployment metadata and switch-dependent
   helper text are checked. A separate stylesheet contract test enforces token
   usage and the responsive breakpoint.

Representative assertions:

```tsx
// Host properties and reflected attributes.
await waitFor(() => expect(rollback.disabled).toBe(true));
expect(rollback).toHaveAttribute('disabled');
expect(rollback).toHaveAttribute('variant', 'secondary');

// Public imperative method + host state.
dialogRef.current?.showModal();
expect(dialog.open).toBe(true);
expect(dialog).toHaveAttribute('open');

// Slotted light-DOM content.
expect(within(dialog).getByText('Roll back deployment?')).toBeInTheDocument();
```

## UI coverage map, rated by business impact

Impact scale:

- **High**: protects a destructive action or a state transition that changes
  what production runs.
- **Medium**: visible feedback and contract-level integration smoke.
- **Low / none**: presentation only, or intentionally owned by the design system.

| Impact | UI behavior | Test |
| --- | --- | --- |
| High | Rollback is disabled until maintenance mode is on. Initial host `disabled=true`, `danger=false`, `variant=secondary`. | `drives host properties and attributes from React state` |
| High | Maintenance switch dispatches `change`; app reads `checked`; rollback becomes enabled, `danger=true`, `variant=primary`. | `reacts to the switch custom event and re-derives host properties` |
| High | Rollback confirmation dialog opens through the public `showModal()` method and exposes slotted header, body, and footer actions. | `opens the dialog through its public imperative method` |
| High | Cancel closes the dialog through `close()`, leaves version at `v2.4.1`, and shows no alert. | `closes without an alert when the user cancels` |
| High | Confirm calls `close('rollback')`; app reads `returnValue`, version moves to `v2.4.0`, and the success alert renders. | `confirming communicates through the close event and returnValue` |
| Medium | Success alert disappears when the design system dispatches its documented `close` event. | `removes the alert when the design system dispatches its close event` |
| Medium | Six real RHDS elements (`rh-card`, `rh-button`, `rh-switch`, `rh-dialog`, `rh-alert`, `rh-tag`) upgrade in JSDOM; slotted text is queryable. | `upgrades the real custom elements and renders slotted light-DOM text` |
| Low (presentation) | Status `rh-tag` label and color switch from `Healthy`/green to `Rolled back`/orange. | `reflects rollback in the status tag and release-history marker` |
| Low (presentation) | Release history `Current` marker moves from v2.4.1 to v2.4.0. | `reflects rollback in the status tag and release-history marker` |
| Low (presentation) | Metadata grid values render; footer helper text flips with maintenance mode. | `renders deployment metadata and switch-dependent helper text` |
| Low (presentation) | Dialog current/target version line updates before and after rollback. | `shows current and target versions in the dialog before and after rollback` |
| Low (static contract) | Every color-bearing CSS declaration uses an RHDS token; spacing/typography/border/radius scales and the 900px breakpoint are present. | `application stylesheet` suite in `src/styles.test.ts` |
| None (not implemented) | Dark theme. The app opts into `color-scheme: light`; no dark-mode assertions exist. | Not asserted |
| None (DS-owned) | Internal button click handling, focus return, Escape/backdrop close, focus trap, internal ARIA. | Not asserted by app tests |
| Medium / gap | Switching maintenance back off, repeated rollbacks, and error states. | Not asserted; candidate for follow-up tests |

## Verification

```sh
npm test          # 13 passed, strict console guard enabled
npm run typecheck # tsc --noEmit, strict TypeScript over the RHDS wrapper types
npm run build     # tsc --noEmit && vite build
```

`jest.setup.ts` fails a test if `console.error` was called, so a green run also
means there were no unhandled component errors, act() warnings, or JSDOM
"not implemented" messages.

## Known JSDOM limitations

This setup is deliberately minimal and honest about what JSDOM cannot do:

- No layout or painting. Geometry-dependent behavior cannot be tested.
- `IntersectionObserver` and `ResizeObserver` are inert, so lazy icon loading
  and overflow behavior are not exercised.
- `matchMedia` always reports no matches; motion-preference branches are not
  exercised.
- The native `<dialog>` shim covers open/close/returnValue, not top-layer
  rendering, focus trapping, or backdrop clicks.
- The CSS shims store text but do not parse it, so computed-style assertions
  should target CSS custom properties only if you seed them yourself.

For visual, focus, and real keyboard behavior, use a browser test (Playwright,
Web Test Runner, or the RHDS team's own suite). Keep those tests out of the
JSDOM layer.

## Why this boundary works

`@lit/react` already gives React the only interface it needs: host properties in,
custom events out, light-DOM children for slots, and refs for public methods.
JSDOM plus a small, well-documented shim layer is enough to run the real
components. Application tests stay stable across shadow-DOM refactors, and the
design system keeps ownership of its internal correctness.

[asmnm]: https://bennypowers.dev/asimonim/
