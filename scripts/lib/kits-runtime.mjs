/**
 * Shared runtime for Factory v1.1's Kits-facing scripts.
 *
 * This module **calls** the Prototype Kits CLI; it never reimplements it. The
 * Factory owns the workflow (when to install, what to validate, what to gate)
 * and Kits owns the mechanics (packaging, manifest rewriting, lock format).
 * A second implementation of the installer inside the Factory would be a second
 * source of truth for the ownership rules — precisely the thing Factory v1.1 is
 * meant to stop.
 *
 * Nothing here reads or writes `lib/kits/**`. That tree belongs to Kits.
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

import {
  KITS_ROOT_ENV_VAR,
  VISUAL_MANIFEST_FILENAME,
  formatManifestIssues,
  validateVisualManifest,
} from "../../lib/visual-manifest.ts"

/** Kits asset types that a Visual Manifest may reference, keyed by field name. */
export const MANIFEST_ASSET_TYPES = {
  stylePack: "style",
  signatureComponents: "component",
  effects: "effect",
}

/** Exit codes, kept distinct so CI can tell "bad input" from "missing upstream". */
export const EXIT = {
  OK: 0,
  /** The manifest is structurally wrong, or references something unapproved. */
  INVALID: 1,
  /** A required file (manifest, Kits CLI) was not found. */
  MISSING: 2,
}

/**
 * Minimal `--flag value` / `--flag` / `--flag=value` parser.
 *
 * Deliberately not a dependency: the Factory installs nothing it does not need,
 * and every added package is a thing every derived prototype inherits.
 */
export function parseArgs(argv) {
  const flags = new Map()
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) {
      positional.push(token)
      continue
    }
    const body = token.slice(2)
    const equals = body.indexOf("=")
    if (equals !== -1) {
      flags.set(body.slice(0, equals), body.slice(equals + 1))
      continue
    }
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(body, next)
      index += 1
    } else {
      flags.set(body, true)
    }
  }
  return { flags, positional }
}

/** Read and JSON-parse a file, failing loudly and specifically. */
export function readJsonFile(path) {
  if (!existsSync(path)) return { ok: false, reason: "missing", path, value: undefined }
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    return { ok: false, reason: "unreadable", path, detail: String(error), value: undefined }
  }
  try {
    return { ok: true, path, value: JSON.parse(text), text }
  } catch (error) {
    return { ok: false, reason: "malformed", path, detail: String(error), value: undefined }
  }
}

/**
 * Locate the Visual Manifest for a prototype.
 *
 * A missing manifest is a hard stop, not a default. This is the Art Direction
 * Gate expressed as code: without a declared visual direction the pipeline
 * cannot proceed to `kits add`, so it cannot fall through to a generic default
 * aesthetic either.
 */
export function loadManifest(projectRoot, explicitPath) {
  const path = explicitPath
    ? isAbsolute(explicitPath)
      ? explicitPath
      : resolve(projectRoot, explicitPath)
    : join(projectRoot, VISUAL_MANIFEST_FILENAME)

  const read = readJsonFile(path)
  if (!read.ok) {
    const detail =
      read.reason === "missing"
        ? `没有找到 Visual Manifest：${path}`
        : read.reason === "malformed"
          ? `Visual Manifest 不是合法 JSON：${path}\n${read.detail}`
          : `Visual Manifest 无法读取：${path}\n${read.detail}`
    const hint =
      read.reason === "missing"
        ? "\nArt Direction Gate：在写任何 UI 之前必须先产出 Visual Manifest。" +
          "\n先读 docs/visual-manifest.md，并加载 Kits 的 skills/visual-direction/SKILL.md。" +
          "\n（Factory 不提供默认 manifest —— 没有默认，才能逼出一次真实的视觉方向决策。）"
        : ""
    return { ok: false, path, detail: detail + hint }
  }

  const validation = validateVisualManifest(read.value)
  if (!validation.ok) {
    return {
      ok: false,
      path,
      detail: `Visual Manifest 结构校验失败：${path}\n${formatManifestIssues(validation.issues)}`,
    }
  }

  return { ok: true, path, manifest: read.value, warnings: validation.issues }
}

/**
 * Find the Prototype Kits checkout.
 *
 * Order: explicit `--kits` → `$KITS_ROOT` → sibling directories of the project
 * root. Returns `null` when nothing is found — which is a **supported state**,
 * not a failure. A prototype that has already been installed must keep working
 * with the Kits repo absent (that is the whole point of Source Installation), so
 * callers report `upstream-unavailable` rather than erroring.
 */
export function resolveKitsRoot({ explicit, projectRoot }) {
  const candidates = []
  if (explicit) candidates.push(isAbsolute(explicit) ? explicit : resolve(projectRoot, explicit))
  const fromEnv = process.env[KITS_ROOT_ENV_VAR]
  if (fromEnv) candidates.push(isAbsolute(fromEnv) ? fromEnv : resolve(projectRoot, fromEnv))

  const parent = dirname(projectRoot)
  for (const name of ["prototype-kits", "kits"]) {
    candidates.push(join(parent, name))
    candidates.push(join(projectRoot, "..", name))
  }

  for (const candidate of candidates) {
    const cli = join(candidate, "packages", "cli", "kits.mjs")
    const registry = join(candidate, "registry", "assets.json")
    if (existsSync(cli) && existsSync(registry)) {
      return { root: resolve(candidate), cli, registry }
    }
  }
  return null
}

/** Load and sanity-check the Kits registry. */
export function loadKitsRegistry(registryPath) {
  const read = readJsonFile(registryPath)
  if (!read.ok || !Array.isArray(read.value?.assets)) {
    return { ok: false, detail: `无法读取 Kits registry：${registryPath}` }
  }
  return {
    ok: true,
    registryVersion: read.value.registryVersion ?? "unknown",
    assets: read.value.assets,
  }
}

/** Approved asset ids of one type. Unapproved assets are never offered. */
export function approvedIds(registry, type) {
  return new Set(
    registry.assets
      .filter((asset) => asset.type === type && asset.status === "approved")
      .map((asset) => asset.id),
  )
}

/**
 * Cross-check a manifest's asset references against the registry.
 *
 * This is the half of manifest validation that cannot live in
 * `lib/visual-manifest.ts`, because it needs the registry. It is deliberately
 * also the ONLY place that knows asset ids are a thing — the TypeScript contract
 * stays a pure shape so Factory Core never learns which Style Packs exist.
 */
export function crossCheckManifest(manifest, registry) {
  const issues = []
  for (const [field, type] of Object.entries(MANIFEST_ASSET_TYPES)) {
    const declared = Array.isArray(manifest[field]) ? manifest[field] : [manifest[field]]
    const legal = approvedIds(registry, type)
    if (legal.size === 0) {
      issues.push({
        path: field,
        code: "registry/no-approved-assets",
        message: `registry 里没有 status=approved 的 ${type} 资产。`,
      })
      continue
    }
    for (const id of declared) {
      if (typeof id !== "string") continue
      if (!legal.has(id)) {
        issues.push({
          path: field,
          code: "registry/unknown-or-unapproved",
          message: `\`${id}\` 不是 registry 中已批准的 ${type} 资产。可选：${[...legal].sort().join(", ")}`,
        })
      }
    }
  }
  return issues
}

/**
 * Invoke the Prototype Kits CLI.
 *
 * `--kits` is passed through when we know the checkout location, so the CLI
 * resolves assets from the same tree we validated against. `stdio: inherit`
 * keeps Kits' own coloured report readable rather than re-rendering it.
 */
export function runKitsCli(cliPath, args, { dryRun = true } = {}) {
  const argv = [cliPath, ...args]
  const result = spawnSync(process.execPath, argv, {
    stdio: "inherit",
    env: process.env,
  })
  if (result.error) {
    return { ok: false, status: null, detail: String(result.error) }
  }
  return { ok: result.status === 0, status: result.status, dryRun }
}

/** Small presentation helpers, matching the CLI's own visual grammar. */
export const glyph = {
  ok: "✓",
  warn: "!",
  bad: "✗",
}

/** Print a labelled section header. */
export function heading(text) {
  process.stdout.write(`\n\u001b[1m${text}\u001b[0m\n`)
}
