/**
 * Static contract tests for the application stylesheet.
 *
 * JSDOM does not implement layout, cascade, or `light-dark()`, so computed
 * values cannot be asserted here. What *can* be enforced is the contract the
 * BU cares about: application chrome must consume RHDS tokens instead of
 * reintroducing a private palette, and the responsive breakpoint must exist.
 *
 * These tests parse the stylesheet with PostCSS; they never regex the CSS.
 */

import { readFileSync } from 'node:fs';

import postcss from 'postcss';

const stylesheet = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const root = postcss.parse(stylesheet);

// Declarations that carry a color. Border radius and width are intentionally
// excluded because only their color-bearing longhands belong to the palette
// contract.
const COLOR_BEARING_PROPERTY =
  /^(color|background|background-color|border|border-(block|inline)(-(start|end))?|border-(top|right|bottom|left)|border-color|box-shadow|outline|fill|stroke)$/;

describe('application stylesheet', () => {
  it('uses RHDS tokens for every color-bearing declaration', () => {
    const declarations: postcss.Declaration[] = [];

    root.walkDecls((declaration) => {
      if (COLOR_BEARING_PROPERTY.test(declaration.prop)) {
        declarations.push(declaration);
      }
    });

    expect(declarations.length).toBeGreaterThan(0);

    const untokenized = declarations
      .filter((declaration) => !declaration.value.includes('var(--rh-'))
      .map((declaration) => `${declaration.prop}: ${declaration.value}`);

    expect(untokenized).toEqual([]);
  });

  it('uses the RHDS spacing, typography, border, and radius scales', () => {
    const requiredTokenPrefixes = [
      '--rh-color-text-primary',
      '--rh-color-surface',
      '--rh-space-',
      '--rh-font-family-',
      '--rh-font-size-',
      '--rh-font-weight-',
      '--rh-line-height-',
      '--rh-border-width-',
      '--rh-border-radius-',
    ];

    for (const prefix of requiredTokenPrefixes) {
      expect(stylesheet).toContain(prefix);
    }
  });

  it('keeps a responsive single-column breakpoint for narrow screens', () => {
    const mediaQueries: postcss.AtRule[] = [];

    root.walkAtRules('media', (rule) => {
      mediaQueries.push(rule);
    });

    // The layout switches to one column at 900px; this guards against the
    // breakpoint being dropped during a refactor. It does not prove rendering.
    expect(mediaQueries.some((rule) => rule.params.includes('max-width: 900px'))).toBe(true);
  });
});
