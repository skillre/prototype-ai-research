/**
 * Visual Manifest — the Factory's machine-readable Art Direction contract.
 *
 * WHY THIS EXISTS
 * ---------------
 * Without a declared visual direction, an agent's default aesthetic pulls hard
 * back to "generic AI SaaS": purple gradient, card everywhere, 16px radius,
 * glow on everything. The result is a page that is *fine everywhere and true
 * nowhere*. The fix is procedural, not cosmetic: the visual direction must be
 * **declared before any JSX is written**, and the declaration must be
 * machine-checkable so it cannot be quietly skipped.
 *
 * WHAT THIS FILE OWNS — AND WHAT IT DELIBERATELY DOES NOT
 * ------------------------------------------------------
 * Factory Core owns the **contract**: the field set, the shape, and the
 * enforcement rules that make a manifest non-vacuous.
 *
 * Factory Core does NOT own the **creative semantics**. Which Style Pack fits a
 * product, how many signature components a page may carry, what belongs in
 * `avoid`, and what each pack's hard constraints are — all of that lives in
 * Prototype Kits (`skills/visual-direction/SKILL.md`). It is deliberately NOT
 * restated here, because a second copy of a rule is a second source of truth.
 *
 * Consequently this module contains **no asset ids and no visual values**. It
 * must stay a closed vocabulary of *shapes*. The legal *values* for
 * `stylePack` / `signatureComponents` / `effects` are discovered from the Kits
 * registry at verification time, never hardcoded — see
 * `scripts/validate-manifest.mjs`. An enum literal copied into this file would
 * go stale the moment Kits ships a new pack and would make Factory v1.1
 * silently aware of a specific Style Pack, which is exactly what v1.1 exists
 * to prevent.
 *
 * @see docs/visual-manifest.md      — the contract, in prose
 * @see docs/kits-ownership.md       — installed/ vs adapters/ ownership
 */

/** Where a manifest lives, by convention, relative to the prototype repo root. */
export const VISUAL_MANIFEST_FILENAME = "visual-manifest.json"

/** Where a new prototype looks, by convention, for the Kits checkout. */
export const KITS_ROOT_ENV_VAR = "KITS_ROOT"

/**
 * A declared visual direction.
 *
 * Every field is required. `firstVisual` and `avoid` are the two that carry the
 * most weight: `firstVisual` forces the author to say what the user actually
 * sees first, and `avoid` closes the doors the default aesthetic would
 * otherwise walk through.
 *
 * Field semantics are defined by the Kits `visual-direction` skill; the doc
 * comments below only record what the Factory *validates*.
 */
export interface VisualManifest {
  /** JSON Schema pointer. Optional — purely an editor affordance. */
  $schema?: string
  /**
   * Product type in kebab-case (`ai-finance-console`, `observability-console`).
   * Drives the pack recommendation; must not be a bare category word.
   */
  productType: string
  /**
   * One sentence describing **what the user sees first**.
   * A slogan ("modern, clean, premium") is a validation error, not a value.
   */
  firstVisual: string
  /**
   * Style Pack id. Value must resolve to an `approved` asset of type `style`
   * in the Kits registry — checked at verification time, not encoded here.
   */
  stylePack: string
  /**
   * Signature Component ids. Values must resolve to `approved` assets of type
   * `component`. Count constraints belong to the Kits skill, not to us.
   */
  signatureComponents: string[]
  /**
   * Effect Pack ids. Values must resolve to `approved` assets of type `effect`.
   * May legitimately be empty — an empty array is a decision, and a different
   * one from "we forgot".
   */
  effects: string[]
  /**
   * Motion language id (e.g. `restrained` / `atmospheric` / `precise`).
   * Must agree with the chosen pack's `motionLanguage`.
   */
  motionDirection: string
  /** Information density id. Must agree with the chosen pack's `density`. */
  density: string
  /**
   * What this product must **not** look like. Must be non-empty.
   * This is the highest-value field in the manifest: it is the only one that
   * constrains what the default aesthetic would otherwise produce.
   */
  avoid: string[]
}

/** Severity of a manifest problem. `error` blocks; `warning` is advisory. */
export type ManifestIssueSeverity = "error" | "warning"

/** One problem found while validating a manifest. */
export interface ManifestIssue {
  /** Dotted path to the offending field, or `$` for document-level problems. */
  path: string
  severity: ManifestIssueSeverity
  /** Stable, greppable machine code — tests assert on this, not on prose. */
  code: string
  /** Human-readable explanation. */
  message: string
}

/** Result of a structural validation pass. */
export interface ManifestValidationResult {
  ok: boolean
  issues: ManifestIssue[]
}

/**
 * Words that describe an *impression* rather than a *sight*.
 *
 * `firstVisual` exists to answer "what do I see first". An answer built only
 * from these words answers nothing — it is the default aesthetic talking.
 * Matching is substring-based against a normalised form, so "现代简洁" is
 * caught without needing a word segmenter for Chinese.
 */
const VACUOUS_FIRST_VISUAL_TERMS = [
  // zh-CN
  "现代",
  "简洁",
  "简约",
  "高级",
  "优雅",
  "美观",
  "大气",
  "干净",
  "清爽",
  "专业",
  "精致",
  "时尚",
  "科技感",
  "设计感",
  "体验好",
  "好看",
  "漂亮",
  "大方",
  // en
  "modern",
  "clean",
  "minimal",
  "minimalist",
  "sleek",
  "elegant",
  "beautiful",
  "premium",
  "professional",
  "polished",
  "nice",
  "pretty",
  "gorgeous",
  "stunning",
  "sophisticated",
  "state-of-the-art",
  "cutting-edge",
] as const

/** Minimum meaningful length of a `firstVisual` description. */
const FIRST_VISUAL_MIN_LENGTH = 12
/** Minimum meaningful length once every vacuous term has been removed. */
const FIRST_VISUAL_MIN_SUBSTANCE = 8

/** Normalise for vacuity matching: lowercase, drop whitespace and punctuation. */
function normaliseForVacuity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "")
}

/**
 * Does `firstVisual` actually describe something visible?
 *
 * Two ways to fail: too short to carry information, or composed entirely of
 * impression words. Both are reported separately so the author knows which
 * mistake they made.
 */
export function isVacuousFirstVisual(value: string): boolean {
  const normalised = normaliseForVacuity(value)
  if (normalised.length < FIRST_VISUAL_MIN_LENGTH) return true

  let residue = normalised
  for (const term of VACUOUS_FIRST_VISUAL_TERMS) {
    residue = residue.split(normaliseForVacuity(term)).join("")
  }
  return residue.length < FIRST_VISUAL_MIN_SUBSTANCE
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/** The eight required fields, in the order they should be authored. */
const REQUIRED_STRING_FIELDS = [
  "productType",
  "firstVisual",
  "stylePack",
  "motionDirection",
  "density",
] as const

/** Required fields that hold a list of asset ids. */
const REQUIRED_ARRAY_FIELDS = ["signatureComponents", "effects", "avoid"] as const

/** Fields the contract defines. Anything else is rejected, not ignored. */
const KNOWN_FIELDS = new Set<string>([
  "$schema",
  ...REQUIRED_STRING_FIELDS,
  ...REQUIRED_ARRAY_FIELDS,
])

/**
 * Validate a parsed manifest against the Factory's structural contract.
 *
 * Structural only — this deliberately does NOT check whether an asset id
 * exists, because that requires the Kits registry and must therefore happen
 * where the registry is reachable (`scripts/validate-manifest.mjs`).
 *
 * Never throws, and never returns `ok: true` for a document it could not
 * understand. A validator that silently accepts "I couldn't read this" is the
 * exact failure mode that produced a false-green QA pass in Prototype Kits
 * v0.1.1, so unreadable input is always an error.
 */
export function validateVisualManifest(input: unknown): ManifestValidationResult {
  const issues: ManifestIssue[] = []

  if (!isPlainObject(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          severity: "error",
          code: "manifest/not-an-object",
          message: "Visual Manifest 必须是一个 JSON 对象。",
        },
      ],
    }
  }

  for (const key of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(key)) {
      issues.push({
        path: key,
        severity: "error",
        code: "manifest/unknown-field",
        message: `未知字段 \`${key}\`。Visual Manifest 的字段集合是封闭的；写错字段名通常意味着某个决策没有被记录。`,
      })
    }
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = input[field]
    if (value === undefined) {
      issues.push({
        path: field,
        severity: "error",
        code: "manifest/missing-field",
        message: `缺少必填字段 \`${field}\`。`,
      })
    } else if (!isNonEmptyString(value)) {
      issues.push({
        path: field,
        severity: "error",
        code: "manifest/empty-string",
        message: `\`${field}\` 必须是非空字符串。`,
      })
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    const value = input[field]
    if (value === undefined) {
      issues.push({
        path: field,
        severity: "error",
        code: "manifest/missing-field",
        message: `缺少必填字段 \`${field}\`。`,
      })
      continue
    }
    if (!Array.isArray(value)) {
      issues.push({
        path: field,
        severity: "error",
        code: "manifest/not-an-array",
        message: `\`${field}\` 必须是数组。`,
      })
      continue
    }
    value.forEach((entry, index) => {
      if (!isNonEmptyString(entry)) {
        issues.push({
          path: `${field}[${index}]`,
          severity: "error",
          code: "manifest/empty-entry",
          message: `\`${field}[${index}]\` 必须是非空字符串。`,
        })
      }
    })
  }

  // `avoid` is the manifest's load-bearing field: an empty list means the one
  // decision that constrains the default aesthetic was never made.
  const avoid = input.avoid
  if (Array.isArray(avoid) && avoid.length === 0) {
    issues.push({
      path: "avoid",
      severity: "error",
      code: "manifest/avoid-empty",
      message:
        "`avoid` 不能为空。这一栏是 Manifest 里最有价值的一条：默认审美会主动回拉，写下 avoid 就是在动手前把那些门关掉。",
    })
  }

  // `effects` may be empty — "no effects" is a legitimate decision.
  const firstVisual = input.firstVisual
  if (isNonEmptyString(firstVisual) && isVacuousFirstVisual(firstVisual)) {
    issues.push({
      path: "firstVisual",
      severity: "error",
      code: "manifest/first-visual-vacuous",
      message:
        "`firstVisual` 必须写出「第一眼看到什么」，而不是印象词（如「现代简洁」「modern, clean」）。写不出这一句，说明视觉方向还没想清楚。",
    })
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
  }
}

/** Render issues as a printable report. Used by the CLI and by tests. */
export function formatManifestIssues(issues: ManifestIssue[]): string {
  if (issues.length === 0) return "Visual Manifest 结构校验通过。"
  return issues
    .map((issue) => {
      const glyph = issue.severity === "error" ? "✗" : "!"
      return `${glyph} [${issue.code}] ${issue.path} — ${issue.message}`
    })
    .join("\n")
}
