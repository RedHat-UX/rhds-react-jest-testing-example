/**
 * ============================================================================
 * Design System Test Harness (JSDOM)
 * ============================================================================
 *
 * This file is the only place where the test environment is taught about
 * browser APIs that JSDOM does not implement. It contains **no mocks of
 * `@rhds/elements` itself**: the real components are loaded, upgraded, and
 * rendered by the tests.
 *
 * A design-system team can ship this file as
 * `@rhds/elements/testing/jest-setup` (or equivalent) so application teams do
 * not have to rediscover the JSDOM gaps for every project.
 *
 * Ordering matters: `setupFilesAfterEnv` runs before the test module (and
 * therefore before any RHDS/Lit import), so every shim below is installed
 * before Lit computes its feature-detection flags.
 */

// Importing `jest` from `@jest/globals` keeps this file valid in both Jest's
// CommonJS and ESM runtimes (the demo uses ESM so top-level `await` inside
// server-only RHDS modules parses correctly).
import { jest } from '@jest/globals';

// jest-dom matchers (`toBeInTheDocument`, `toHaveAttribute`, ...).
import '@testing-library/jest-dom';

// JSDOM exposes a *partial* ElementInternals (it has `attachInternals`, but no
// `setFormValue`, `setValidity`, `states`, ...). RHDS components are
// form-associated custom elements, so the polyfill replaces the incomplete
// native implementation with a complete one. Importing the module performs
// feature detection and installs the polyfill automatically.
import 'element-internals-polyfill';

/**
 * `@patternfly/pfe-core`'s `InternalsController` initializes every ARIAMixin
 * property, including the newer element-reference properties. The polyfill's
 * `ElementInternals` is sealed and predates some of those names, so an
 * assignment would throw `TypeError: Cannot add property ...`.
 *
 * Prototype accessors fix that without touching the component code: the value
 * is stored on the internals object through the accessor instead of being
 * added as an own property. Tests assert host attributes/properties, not the
 * ARIAMixin value, so storage is enough here.
 */
const elementInternalsAomFallbacks = [
  'ariaActivedescendant',
  'ariaActiveDescendantElement',
  'ariaControlsElements',
  'ariaDescribedByElements',
  'ariaDetailsElements',
  'ariaErrorMessageElements',
  'ariaFlowToElements',
  'ariaLabelledByElements',
  'ariaOwnsElements',
] as const;

const aomFallbackValues = new WeakMap<object, Map<string, unknown>>();
const ElementInternalsConstructor = globalThis.ElementInternals;

if (ElementInternalsConstructor) {
  for (const property of elementInternalsAomFallbacks) {
    if (property in ElementInternalsConstructor.prototype) {
      continue;
    }

    Object.defineProperty(ElementInternalsConstructor.prototype, property, {
      configurable: true,
      get(this: object): unknown {
        return aomFallbackValues.get(this)?.get(property) ?? null;
      },
      set(this: object, value: unknown) {
        let values = aomFallbackValues.get(this);
        if (!values) {
          values = new Map();
          aomFallbackValues.set(this, values);
        }
        values.set(property, value);
      },
    });
  }
}

/**
 * `themable()` from `@rhds/elements/lib/themable.js` checks at module-evaluation
 * time whether the document already defines `--rh-color-accent-base`. If not,
 * it kicks off an async import of the full token stylesheet. Seeding a single
 * custom property makes that probe succeed synchronously, which keeps tests
 * free of token-loading promises without mocking any component behaviour.
 */
const themeProbe = document.createElement('style');
themeProbe.dataset.rhdsTestHarness = 'theme-probe';
themeProbe.textContent = ':root { --rh-color-accent-base: #0066cc; }';
document.head.append(themeProbe);

/* -------------------------------------------------------------------------- */
/* Constructable stylesheets                                                   */
/* -------------------------------------------------------------------------- */
/*
 * JSDOM has `new CSSStyleSheet()` but not `replaceSync` / `replace`, and it has
 * no `adoptedStyleSheets`. Lit detects those APIs at import time:
 *
 *   ShadowRoot && "adoptedStyleSheets" in Document.prototype
 *             && "replace" in CSSStyleSheet.prototype
 *
 * If we install them first, Lit uses constructed stylesheets instead of
 * appending `<style>` tags inside every shadow root. That is both faster and
 * quieter: JSDOM's CSS parser does not have to parse modern RHDS CSS (which it
 * often rejects noisily).
 */

interface PolyfilledStyleSheet extends CSSStyleSheet {
  __rhdsCssText?: string;
}

if (typeof CSSStyleSheet !== 'undefined') {
  if (!('replaceSync' in CSSStyleSheet.prototype)) {
    Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
      configurable: true,
      writable: true,
      value(this: PolyfilledStyleSheet, text: string) {
        this.__rhdsCssText = String(text);
      },
    });
  }

  if (!('replace' in CSSStyleSheet.prototype)) {
    Object.defineProperty(CSSStyleSheet.prototype, 'replace', {
      configurable: true,
      writable: true,
      value(this: PolyfilledStyleSheet, text: string) {
        this.__rhdsCssText = String(text);
        return Promise.resolve(this);
      },
    });
  }
}

type StyleSheetOwner = Document | ShadowRoot;

const adoptedStyleSheetsByOwner = new WeakMap<StyleSheetOwner, CSSStyleSheet[]>();

const adoptedStyleSheetsDescriptor: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  get(this: StyleSheetOwner): CSSStyleSheet[] {
    return adoptedStyleSheetsByOwner.get(this) ?? [];
  },
  set(this: StyleSheetOwner, value: CSSStyleSheet[]) {
    adoptedStyleSheetsByOwner.set(this, Array.from(value));
  },
};

if (!('adoptedStyleSheets' in Document.prototype)) {
  Object.defineProperty(Document.prototype, 'adoptedStyleSheets', adoptedStyleSheetsDescriptor);
}

if (typeof ShadowRoot !== 'undefined' && !('adoptedStyleSheets' in ShadowRoot.prototype)) {
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', adoptedStyleSheetsDescriptor);
}

/* -------------------------------------------------------------------------- */
/* Observers                                                                   */
/* -------------------------------------------------------------------------- */
/*
 * `rh-icon` constructs an IntersectionObserver at module scope for lazy icon
 * loading. Nothing in these tests needs the callback to fire, so inert stubs
 * are enough. They are still real constructors so Lit/RHDS can call
 * `observe`, `unobserve`, and `disconnect`.
 */

if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin = '0px';
    readonly thresholds: readonly number[] = [];

    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  (
    globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }
  ).IntersectionObserver = IntersectionObserverStub;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub;
}

/* -------------------------------------------------------------------------- */
/* matchMedia                                                                  */
/* -------------------------------------------------------------------------- */
/*
 * `ScreenSizeController` and `rh-alert` call `window.matchMedia`. Reporting no
 * matches means "desktop, no reduced-motion preference" for the components in
 * this demo. A test that needs a specific media result can override
 * `window.matchMedia` for that test.
 */

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Animation frames                                                            */
/* -------------------------------------------------------------------------- */

if (typeof window.requestAnimationFrame !== 'function') {
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    setTimeout(() => callback(performance.now()), 0) as unknown as number;
  window.cancelAnimationFrame = (handle: number): void => clearTimeout(handle);
}

/* -------------------------------------------------------------------------- */
/* Scrolling                                                                   */
/* -------------------------------------------------------------------------- */
/*
 * JSDOM prints "Not implemented: window.scrollTo" to the virtual console when
 * these are called. `rh-dialog` and focus helpers may call them, so replace
 * them with silent no-ops.
 */

window.scrollTo = (() => {}) as typeof window.scrollTo;

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}

if (typeof Element.prototype.scrollTo !== 'function') {
  Object.defineProperty(Element.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}

/* -------------------------------------------------------------------------- */
/* Native <dialog>                                                             */
/* -------------------------------------------------------------------------- */
/*
 * JSDOM 26 does not implement the dialog methods. `rh-dialog` renders a native
 * `<dialog>` in its shadow root and calls `showModal()` / `close()` on it, so
 * the minimum behaviour is required: reflect the `open` attribute and dispatch
 * the native `close` event that `rh-dialog` listens for.
 *
 * This is a browser API shim, not a mock of `rh-dialog`: the component still
 * runs its real logic and dispatches its real custom events.
 */

const dialogPrototype = window.HTMLDialogElement?.prototype;

if (dialogPrototype && typeof dialogPrototype.showModal !== 'function') {
  if (!('returnValue' in dialogPrototype)) {
    Object.defineProperty(dialogPrototype, 'returnValue', {
      configurable: true,
      get(this: HTMLDialogElement & { __rhdsReturnValue?: string }): string {
        return this.__rhdsReturnValue ?? '';
      },
      set(this: HTMLDialogElement & { __rhdsReturnValue?: string }, value: string) {
        this.__rhdsReturnValue = String(value);
      },
    });
  }

  Object.defineProperties(dialogPrototype, {
    show: {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement) {
        if (!this.open) {
          this.setAttribute('open', '');
        }
      },
    },
    showModal: {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement) {
        if (this.open) {
          throw new DOMException('The dialog is already open.', 'InvalidStateError');
        }
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement, returnValue?: string) {
        if (!this.open) {
          return;
        }
        if (returnValue !== undefined) {
          this.returnValue = String(returnValue);
        }
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    },
    requestClose: {
      configurable: true,
      writable: true,
      value(this: HTMLDialogElement, returnValue?: string) {
        this.close(returnValue);
      },
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Custom element registration guard                                           */
/* -------------------------------------------------------------------------- */
/*
 * A test file can evaluate the same component module more than once (for
 * example after `jest.resetModules()`), which would otherwise throw
 * `NotSupportedError: this name has already been used with this registry`.
 *
 * The guard is deliberately narrow: re-defining the *same constructor* is a
 * no-op; a genuinely different constructor for the same tag still throws.
 */

const nativeDefine = customElements.define.bind(customElements);

customElements.define = function define(
  name: string,
  constructor: CustomElementConstructor,
  options?: ElementDefinitionOptions,
): void {
  const existing = customElements.get(name);
  if (existing) {
    if (existing === constructor) {
      return;
    }
    throw new DOMException(
      `Custom element "${name}" is already defined with a different constructor.`,
      'NotSupportedError',
    );
  }
  nativeDefine(name, constructor, options);
} as typeof customElements.define;

/* -------------------------------------------------------------------------- */
/* Console error guard                                                         */
/* -------------------------------------------------------------------------- */
/*
 * The demo's contract is "zero console errors". React, Lit, and JSDOM all use
 * `console.error` for genuine problems (act() violations, bad property
 * assignments, unhandled DOM events), so any call fails the current test with
 * the original arguments.
 */

// Set RHDS_STRICT_CONSOLE=0 locally to see the original stack traces when a
// component misbehaves; the default is to fail the test.
const strictConsole = process.env.RHDS_STRICT_CONSOLE !== '0';

let consoleErrorSpy: ReturnType<typeof jest.spyOn> | undefined;

beforeEach(() => {
  if (strictConsole) {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  }
});

afterEach(() => {
  const calls = consoleErrorSpy?.mock.calls ?? [];
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = undefined;

  if (calls.length > 0) {
    const details = calls.map((args: unknown[]) => args.map(String).join(' ')).join('\n');
    throw new Error(`Unexpected console.error during test:\n${details}`);
  }
});
