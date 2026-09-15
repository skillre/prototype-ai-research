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
 * The QA port. Deliberately NOT 3000, and deliberately not somebody else's slot.
 *
 * 3000 is Next's default, which means every prototype on this machine, plus any
 * stray `next dev`, races for it. 3200 was the Factory baseline's own slot, and
 * this repository used to hold it too — which is exactly what the workspace
 * catalog flagged: four repositories (`starter`, `s1`, `ai-research`, `kits`)
 * pinned to 3200 at once. Two QA runs on the same port do not fail; they sweep
 * **each other's pages** and report green.
 *
 * `catalog/ports.json` assigns this product 3230 (`advisory.proposed`), with
 * 3200 left to the baseline and 3300 / 3220 to kits / s1. A product needs its
 * own slot: the port is a claim of identity, not a scheduling detail.
 *
 * The port is *pinned* rather than left to Next's auto-increment, because
 * auto-increment is how a test run silently ends up talking to a different
 * server than the one it started.
 */
export const QA_PORT = 3230

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
 *
 * `/r/[researchId]` is the research workspace: a dynamic segment, so the
 * filesystem walk cannot enumerate it. The id below is the only research in the
 * deterministic dataset (`lib/research/dataset.ts`), and the page sets
 * `dynamicParams = false` — so there is exactly one valid value. It is written
 * in three places on purpose (dataset, `generateStaticParams`, here); a fourth
 * copy is what would drift.
 *
 * `/r/[researchId]/finding` is the deliverable. It is a **nested** dynamic
 * segment, so it needs its own entry: the walk sees `finding/` under a dynamic
 * directory and cannot resolve the parent either.
 *
 * @type {string[]}
 */
export const extraRoutes = ["/r/res-load-bearing", "/r/res-load-bearing/finding"]

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

/**
 * Quorum for the style-presence bundle (Factory v1.2 · N3).
 *
 * Every route must differ from a same-browser **unstyled baseline** in at least
 * this many independent style domains — `box-reset` · `type` · `surface` ·
 * `ink`. A page that matches the browser default in all four is not a styled
 * page with a bug; it is an unstyled page.
 *
 * Why 2 and not 4: 4 would make the gate depend on the product painting every
 * domain (a product that only resets margins and sets a font would fail while
 * being perfectly styled). Why not 1: a single differing property is weak
 * evidence — it is exactly what one stray rule produces.
 *
 * Sanity-checked for this product in `tests/style-presence.spec.ts`: the styled
 * fixture clears 2 channels, the unstyled one clears 0.
 */
export const stylePresenceMinChannels = 2

/** Fail the run if any numeric probe cannot be measured. Always leave on. */
export const failOnUnmeasurableProbe = true
