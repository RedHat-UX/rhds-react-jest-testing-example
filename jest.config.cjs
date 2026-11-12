/**
 * Jest configuration for a React 19 application that consumes
 * `@rhds/elements` through its `@lit/react` wrapper exports.
 *
 * ## Why ESM?
 *
 * `@rhds/elements` is ESM-only, and some of its modules (notably `rh-icon`,
 * which `rh-switch`, `rh-alert`, and `rh-dialog` pull in) contain top-level
 * `await import('./ssr.js')` inside an `if (isServer)` guard. A CommonJS
 * transform cannot emit that syntax, so Jest runs the graph as native ESM:
 *
 *   NODE_OPTIONS=--experimental-vm-modules jest
 *
 * Application `.ts`/`.tsx` files are opted into ESM with
 * `extensionsToTreatAsEsm`; packages whose `package.json` says
 * `"type": "module"` (RHDS, Lit, PatternFly) are already ESM to Jest.
 *
 * ## Transforms
 *
 * Everything that is still transformed passes through SWC. The
 * `transformIgnorePatterns` allowlist defeats Jest's default "node_modules is
 * already CommonJS" assumption for the ESM-only design-system packages.
 *
 * `element-internals-polyfill` is the one intentional exception: it publishes
 * ESM syntax from a package without `"type": "module"`, so it is transformed
 * to CommonJS and imported from ESM as a CJS dependency.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],

  // Treat application TypeScript as ESM. Node's package.json metadata already
  // marks the vendored ESM packages as ESM.
  extensionsToTreatAsEsm: ['.ts', '.tsx'],

  // The JSDOM part of the design-system test harness. Keep this file focused
  // on browser shims so it can be published by a design-system team verbatim.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  transform: {
    // `element-internals-polyfill` ships ESM from a CJS-typed package. Jest
    // loads it as CommonJS, so this transformer must emit CommonJS.
    'node_modules/element-internals-polyfill/.+\\.js$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'ecmascript' },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
    // Application code: TypeScript + JSX, kept as ESM.
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
    // Vendored ESM from the design system: plain JavaScript, no JSX.
    // The ECMAScript parser (rather than the TSX parser) avoids treating type
    // argument syntax in compiled JS as JSX.
    '^.+\\.jsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'ecmascript', jsx: false },
          target: 'es2022',
        },
        module: { type: 'es6' },
      },
    ],
  },

  // `@rhds/elements` and its runtime dependencies are published as ESM only.
  // Everything else in node_modules keeps Jest's default CJS treatment.
  transformIgnorePatterns: [
    'node_modules/(?!(@rhds|@patternfly|@lit|@lit-labs|lit|lit-html|lit-element|element-internals-polyfill)/)',
  ],

  // Surface the original component stack instead of the SWC output.
  clearMocks: true,
};
