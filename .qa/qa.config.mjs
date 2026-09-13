/**
 * Prototype Factory · Browser QA configuration.
 *
 * Single source of truth for the QA sweep. Everything a product needs to change
 * lives here — routes, viewports, themes, tolerance — so the sweep script itself
 * stays product-agnostic and never learns a route name.
 *
 * This file is imported by three consumers:
 *   - `.qa/browser-qa.mjs`   the sweep
 *   - `playwright.config.ts` the e2e runner's port/host
 *   - `scripts/check-qa-port.mjs` the pre-flight guard
 *
 * A product derived from the Factory edits ONLY this file.
 */

/**
 * The QA port. Deliberately NOT 3000.
 *
 * 3000 is Next's default, which means every prototype on this machine, plus any
 * stray `next dev`, races for it. Sibling projects already claim 3100 (hub) and
 * 3210 (finance); 3200 is the Factory's own slot.
 *
 * The port is *pinned* rather than left to Next's auto-increment, because
 * auto-increment is how a test run silently ends up talking to a different
 * server than the one it started.
 */
export const QA_PORT = 3200

/** Host the QA server binds to. 127.0.0.1 avoids exposing the dev server. */
export const QA_HOST = "127.0.0.1"

/** Full origin, used as Playwright's `baseURL`. */
export const QA_ORIGIN = `http://${QA_HOST}:${QA_PORT}`

/**
 * Routes to sweep.
 *
 * `null` means "discover every route from `app/`" — the default, and the reason
 * this script has no product routes baked into it. Set an explicit array to
 * sweep a subset (e.g. a single feature branch's routes).
 *
 * Dynamic segments (`[id]`) cannot be discovered statically; list the concrete
 * paths for those under `extraRoutes`.
 */
export const routes = null

/**
 * Routes that exist but cannot be discovered from the filesystem — dynamic
 * segments, or pages you want exercised with real ids.
 * @type {string[]}
 */
export const extraRoutes = []

/** Routes deliberately excluded from the sweep (e.g. heavy paywalls, redirects). */
/** @type {string[]} */
export const excludeRoutes = []

/** Viewports every route is swept at. */
export const viewports = [
  { name: "desktop", width: 1440, height: 900, mobile: false, touch: false },
  { name: "mobile", width: 390, height: 844, mobile: true, touch: true },
]

/** Colour schemes every route × viewport is swept at. */
export const themes = ["dark", "light"]

/** Milliseconds to settle after navigation before measuring. */
export const settleMs = 450

/**
 * Tolerance in CSS pixels for the viewport-expansion and overflow checks.
 *
 * The checks are written so this is the *only* slack: a scrollbar or a
 * fractional device-pixel-ratio rounding needs ~1px, and anything larger than
 * that is a real layout bug rather than noise.
 */
export const tolerancePx = 1

/**
 * Ratio threshold for the coarse-pointer spacing check.
 *
 * A touch target's spacing must differ measurably between fine and coarse
 * pointers. `0.02` is tight enough to catch "the media query never applied" and
 * loose enough to survive sub-pixel rounding.
 */
export const pointerRatioTolerance = 0.02

/** Fail the run if any numeric probe cannot be measured. Always leave on. */
export const failOnUnmeasurableProbe = true
