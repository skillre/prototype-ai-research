import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { expect, test } from "@playwright/test"

import {
  FACTORY_LANDING_MARKER,
  INIT_CONTRACT_FILENAME,
  INIT_SCHEMA_VERSION,
  InitScopeError,
  REFERENCE_SAMPLE_MARKER,
  assertNonVacuousInitScan,
  classifyPath,
  formatInitReport,
  scanInitBoundary,
  validateInitContract,
} from "../scripts/lib/init-boundary.mjs"
import { stripComments, walkScoped } from "../scripts/lib/kits-seam.mjs"

/**
 * The initialization boundary (Factory v1.2 · INIT).
 *
 * What is being tested is not "the Reference Sample exists" — it is that the
 * three layers are *named*, that the naming is machine-readable, and that the
 * dangerous state (a half-initialized copy) fails loudly.
 */

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")
const CONTRACT = JSON.parse(read(INIT_CONTRACT_FILENAME))

/** A tree that is structurally a product; individual files are overridden per test. */
const PRODUCT_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "prototype-observability", version: "0.1.0" }),
  "README.md": "# Observability Console\n\n一个自建原型。\n",
  "app/layout.tsx": `export const metadata = { title: { default: "Observability Console" } }\nexport default function L({ children }) { return children }\n`,
  "app/page.tsx": `export default function P() { return <main>hello</main> }\n`,
  "app/not-found.tsx": `export default function N() { return <main>404</main> }\n`,
  "lib/i18n/zh-CN.ts": `export const zhCN = { brand: { name: "观测台" } }\n`,
}

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "factory-init-"))
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

const productContract = (overrides: Record<string, unknown> = {}) => ({
  ...CONTRACT,
  stage: "product",
  ...overrides,
})

const checks = (scan: { violations: Array<{ check: string }> }) => scan.violations.map((v) => v.check)

/* -------------------------------------------------------------------------- */
/* §15.1 / §15.2 / §15.10 — the Factory itself, and the Sample's own space      */
/* -------------------------------------------------------------------------- */

test.describe("this product's own stage", () => {
  test("declares product stage, and its own tree carries no residue", () => {
    const scan = scanInitBoundary(ROOT, CONTRACT)
    assertNonVacuousInitScan(scan)
    expect(scan.stage).toBe("product")
    expect(scan.violations, formatInitReport(scan)).toEqual([])
    expect(scan.scanned).toBeGreaterThan(0)
  })

  test("the kept Reference Sample is counted, not hidden", () => {
    const scan = scanInitBoundary(ROOT, CONTRACT)
    expect(scan.excluded, "sample-owned 文件必须被计数，而不是凭空消失").toBeGreaterThan(0)
    // What this product kept is `/demo` — the Factory's product-neutral demo —
    // and it stays legal *because* the contract lists it.
    expect(CONTRACT.sampleOwned).toContain("app/demo/")
    expect(CONTRACT.sampleOwned).toContain("lib/mock-data.ts")
    // The CRM Reference Sample was removed by the derivation (commit 1316496),
    // so its paths must not sit here as dormant exemptions.
    expect(CONTRACT.sampleOwned.some((entry: string) => entry.startsWith("app/crm"))).toBe(false)
  })

  test("path classification is three-way and sample-owned wins", () => {
    expect(classifyPath("app/demo/page.tsx", CONTRACT)).toBe("sample")
    expect(classifyPath("app/demo/_components/demo-app.tsx", CONTRACT)).toBe("sample")
    expect(classifyPath("lib/mock-data.ts", CONTRACT)).toBe("sample")
    expect(classifyPath("app/page.tsx", CONTRACT)).toBe("initialization")
    expect(classifyPath("app/r/[researchId]/page.tsx", CONTRACT)).toBe("core")
    expect(classifyPath("components/layout/sidebar.tsx", CONTRACT)).toBe("core")
    expect(classifyPath("scripts/verify-init.mjs", CONTRACT)).toBe("core")
  })

  test("a baseline that has been renamed may not keep calling itself a baseline", () => {
    // THE dodge this design closes: leave `stage` alone and never be checked.
    // Exercised with a **synthetic baseline-shaped** contract, because this
    // repo's own contract is a product one — the mechanic still has to be
    // proven somewhere, and it must not be proven by re-lying about this tree.
    const baselineContract = { ...CONTRACT, stage: "baseline" }
    const root = fixture({
      ...PRODUCT_FILES,
      [INIT_CONTRACT_FILENAME]: JSON.stringify(baselineContract),
      "app/page.tsx": `<main ${FACTORY_LANDING_MARKER}>x</main>`,
      "app/layout.tsx": `export const metadata = { title: { default: "${CONTRACT.baselineIdentity.metadataTitle}" } }`,
    })
    const scan = scanInitBoundary(root, baselineContract)
    expect(checks(scan)).toContain("init/stage-mismatch")
  })
})

/* -------------------------------------------------------------------------- */
/* §15.3 / §15.5 / §15.6 / §15.7 — a product, and the residues that fail it     */
/* -------------------------------------------------------------------------- */

test.describe("an initialized product", () => {
  test("a clean product passes", () => {
    const scan = scanInitBoundary(fixture(PRODUCT_FILES), productContract())
    expect(scan.violations, formatInitReport(scan)).toEqual([])
    expect(scan.scanned).toBe(6)
  })

  test("keeping the Reference Sample is legal — as long as it is labelled", () => {
    const root = fixture({
      ...PRODUCT_FILES,
      // `sampleOwned` is this repo's (app/demo/, lib/mock-data.ts), so the
      // fixture has to keep something inside it — otherwise `excluded` is 0 and
      // the "counted, not hidden" property is not actually exercised.
      "app/demo/page.tsx": `export default function P() { return null }\n`,
      "app/page.tsx": `export default function P() { return <main><section ${REFERENCE_SAMPLE_MARKER}><a href="/crm">示例</a></section></main> }\n`,
    })
    const scan = scanInitBoundary(root, productContract())
    expect(scan.violations).toEqual([])
    expect(scan.excluded, "保留的 sample 依然被计为豁免").toBeGreaterThan(0)
  })

  test("still writing prototype-starter as the package name FAILS", () => {
    const root = fixture({
      ...PRODUCT_FILES,
      "package.json": JSON.stringify({ name: CONTRACT.baselineIdentity.packageName }),
    })
    expect(checks(scanInitBoundary(root, productContract()))).toContain("init/package-identity")
  })

  test("still carrying the Starter metadata title FAILS", () => {
    const root = fixture({
      ...PRODUCT_FILES,
      "app/layout.tsx": `export const metadata = { title: "${CONTRACT.baselineIdentity.metadataTitle}" }\n`,
    })
    expect(checks(scanInitBoundary(root, productContract()))).toContain("init/metadata-identity")
  })

  test("still shipping the Factory landing FAILS", () => {
    const root = fixture({
      ...PRODUCT_FILES,
      "app/page.tsx": `<main ${FACTORY_LANDING_MARKER}><a href="/crm">AI CRM</a></main>\n`,
    })
    expect(checks(scanInitBoundary(root, productContract()))).toContain("init/homepage-not-replaced")
  })

  test("pointing the home page at the CRM without labelling it FAILS", () => {
    const root = fixture({
      ...PRODUCT_FILES,
      "app/page.tsx": `export default function P() { return <main><a href="/crm">主入口</a></main> }\n`,
    })
    expect(checks(scanInitBoundary(root, productContract()))).toContain("init/homepage-entry")
  })

  test("a sample brand name on the initialization surface FAILS", () => {
    const root = fixture({
      ...PRODUCT_FILES,
      "lib/i18n/zh-CN.ts": `export const zhCN = { brand: { name: "智悟云" } }\n`,
    })
    expect(checks(scanInitBoundary(root, productContract()))).toContain("init/sample-identity")
  })

  test("prose is not code: a commented-out marker does not satisfy the check", () => {
    // Marker checks are **structural**, and a file may say the marker's name
    // without carrying it. Both directions are asserted, because the cheap
    // version of this test (only the negative half) also passes for a scanner
    // that never looks at anything.
    const commented = fixture({
      ...PRODUCT_FILES,
      "app/page.tsx": `// ${FACTORY_LANDING_MARKER}\nexport default function P() { return <main>hi</main> }\n`,
    })
    expect(
      checks(scanInitBoundary(commented, productContract())),
      "注释里的标记不算标记",
    ).not.toContain("init/homepage-not-replaced")

    const real = fixture({
      ...PRODUCT_FILES,
      "app/page.tsx": `<main ${FACTORY_LANDING_MARKER}>x</main>\n`,
    })
    expect(checks(scanInitBoundary(real, productContract())), "真标记必须被抓到").toContain(
      "init/homepage-not-replaced",
    )
  })
})

/* -------------------------------------------------------------------------- */
/* §15.7 — the scanner cannot pass by measuring nothing                        */
/* -------------------------------------------------------------------------- */

test.describe("vacuity", () => {
  test("zero scanned files FAILS", () => {
    const root = fixture({ [INIT_CONTRACT_FILENAME]: JSON.stringify(productContract()) })
    const scan = scanInitBoundary(root, productContract())
    expect(scan.scanned).toBe(0)
    expect(scan.missing.length).toBeGreaterThan(0)
    expect(() => assertNonVacuousInitScan(scan)).toThrow(InitScopeError)
    expect(() => assertNonVacuousInitScan(scan)).toThrow(/0 scanned|不存在/)
  })

  test("a declared file that is missing FAILS instead of being skipped", () => {
    const { "app/page.tsx": dropped, ...withoutLanding } = PRODUCT_FILES
    expect(dropped).toBeDefined()
    const scan = scanInitBoundary(fixture(withoutLanding), productContract())
    expect(scan.missing).toContain("app/page.tsx")
    expect(() => assertNonVacuousInitScan(scan)).toThrow(/app\/page\.tsx/)
  })
})

/* -------------------------------------------------------------------------- */
/* the contract document itself                                                */
/* -------------------------------------------------------------------------- */

test.describe("the boundary contract", () => {
  test("validates, and is closed", () => {
    expect(validateInitContract(CONTRACT).ok).toBe(true)
    const codes = (input: unknown) =>
      validateInitContract(input).issues.map((issue: { code: string }) => issue.code)
    expect(codes({ ...CONTRACT, stage: "half" })).toContain("init/unknown-stage")
    expect(codes({ ...CONTRACT, schemaVersion: 99 })).toContain("init/unsupported-schema-version")
    expect(codes({ ...CONTRACT, extra: 1 })).toContain("init/unknown-field")
    expect(codes({ ...CONTRACT, sampleOwned: [] })).toContain("init/missing-field")
    expect(validateInitContract(null).ok).toBe(false)
  })

  test("the schema and the module agree", () => {
    const schema = JSON.parse(read("lib/init-contract.schema.json"))
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.schemaVersion.const).toBe(INIT_SCHEMA_VERSION)
    expect(new Set(schema.properties.stage.enum)).toEqual(new Set(["baseline", "product"]))
    expect(new Set(schema.required)).toEqual(
      new Set(["schemaVersion", "stage", "baselineIdentity", "sampleOwned", "productFacing", "sampleMarkers"]),
    )
  })

  test("the gate exits 0 / 1 / 2 for pass / residue / missing", () => {
    const run = (cwd: string) => {
      try {
        const stdout = execFileSync(process.execPath, [join(ROOT, "scripts/verify-init.mjs")], {
          encoding: "utf8",
          cwd,
        })
        return { status: 0, stdout }
      } catch (error) {
        const failure = error as { status?: number; stdout?: string; stderr?: string }
        return { status: failure.status ?? -1, stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}` }
      }
    }

    expect(run(ROOT).status).toBe(0)

    const productRoot = fixture({
      ...PRODUCT_FILES,
      [INIT_CONTRACT_FILENAME]: JSON.stringify(productContract()),
    })
    expect(run(productRoot).status, "干净的产品应当通过").toBe(0)

    const residueRoot = fixture({
      ...PRODUCT_FILES,
      [INIT_CONTRACT_FILENAME]: JSON.stringify(productContract()),
      "package.json": JSON.stringify({ name: CONTRACT.baselineIdentity.packageName }),
    })
    const residue = run(residueRoot)
    expect(residue.status).toBe(1)
    expect(residue.stdout).toContain("init/package-identity")

    const missingRoot = fixture({ "README.md": "x" })
    expect(run(missingRoot).status).toBe(2)
  })
})

/* -------------------------------------------------------------------------- */
/* §17 — the sample layer must not be orphaned by an init sweep                */
/* -------------------------------------------------------------------------- */

/**
 * The baseline's version of this section checked `app/sample-command-center.css`,
 * the Reference Sample's personality layer. This product never had that file —
 * the derivation removed the CRM sample, and `/demo` was kept without it — so
 * porting those assertions would have been porting a claim about a tree that
 * does not exist here.
 *
 * What this product *does* have, and what breaks in exactly the same way, is a
 * route-scoped stylesheet: App Router bundles CSS by module graph, so a route
 * whose entry component stops importing its stylesheet renders correct markup
 * with no CSS at all — every testid assertion still passes. See
 * `docs/browser-qa.md` §7 and `tests/style-presence.spec.ts`.
 */
test.describe("route-scoped stylesheet is not orphaned", () => {
  const ROUTE_ENTRY_POINTS = [
    "components/research/research-workspace.tsx",
    "components/research/finding-view.tsx",
  ]

  test("both product routes import their own stylesheet", () => {
    const importRe = /^\s*import\s+"\.\/research-shell\.css"/m
    for (const entry of ROUTE_ENTRY_POINTS) {
      expect(read(entry), `${entry} 必须显式 import 路由样式表`).toMatch(importRe)
    }
    // And nothing else does: the stylesheet is route-scoped, not global.
    const { files } = walkScoped(ROOT, { roots: ["app", "components"], excludeTrees: [] })
    const importers = files.filter((file) => importRe.test(read(file))).sort()
    expect(importers).toEqual([...ROUTE_ENTRY_POINTS].sort())
  })

  test("the sample does not borrow the product's stylesheet", () => {
    // /demo is sample-owned; it must not depend on a product route's CSS, or
    // deleting the sample would take a product route's styling with it.
    const sampleOwned = CONTRACT.sampleOwned as string[]
    expect(sampleOwned, "app/demo/ 必须是 sample-owned").toContain("app/demo/")
    expect(read("app/demo/_components/demo-app.tsx")).not.toMatch(/research-shell\.css/)
  })
})

/* -------------------------------------------------------------------------- */
/* §10 / §21 — F5, F6, F7 and the workflow order                               */
/* -------------------------------------------------------------------------- */

test.describe("F5 · F6 · F7", () => {
  /**
   * F5 is **expected to fail here, and that is stated rather than hidden.**
   *
   * The test encodes Factory v1.2's N1 migration: Core keeps structure only, and
   * the Reference Sample's composition moves into `app/_sample/dashboard-skeleton.tsx`.
   * This product still carries the v1.1 loading state (with its metric dividers),
   * and it has no `app/_sample/` tree at all. Performing that migration is a UI
   * change to a shared component, explicitly out of scope for this governance
   * round.
   *
   * `test.fixme` instead of deletion on purpose: the report then shows a skipped
   * test with a reason, which is a fact, rather than green, which would be a
   * lie — and the debt stays visible to whoever does the N1 round.
   */
  test.fixme("F5: the Core loading state carries no product composition", () => {
    // Comment-stripped: the file *explains* what it no longer assumes, and
    // explaining it means naming it.
    const rawCore = read("components/prototype/loading-state.tsx")
    const core = stripComments(rawCore)
    // No hero, no fixed metric strip, no product's divider table.
    expect(core).not.toContain("METRIC_DIVIDERS")
    expect(core).not.toContain("lg:grid-cols-4")
    expect(core).not.toMatch(/hero/i)
    // The intent is documented… (prose)
    expect(rawCore).toMatch(/Structure only/)
    // …and the code has no product composition left. (code)

    // …and the sample-shaped skeleton lives in the sample, used by both surfaces.
    const sample = read("app/_sample/dashboard-skeleton.tsx")
    expect(sample).toContain("METRIC_DIVIDERS")
    for (const consumer of ["app/crm/_components/crm-data-boundary.tsx", "app/demo/_components/demo-app.tsx"]) {
      expect(read(consumer), `${consumer} 应当使用 sample 自己的骨架`).toContain("DashboardSkeleton")
    }
  })

  test("F6: no Core component is invisible dead inventory", () => {
    // F6 reported `profile-dialog` as having zero importers. That is no longer
    // true — but the real lesson is that dead inventory was invisible. This
    // keeps it visible: an unused component must be *declared*, with a reason.
    const UNEXERCISED: Record<string, string> = {
      // F6 reported `profile-dialog` as dead. It is not (see the assertion at
      // the end) — but the sweep found four files that genuinely are, and none
      // of them is *sample* inventory: they are Core vocabulary a product may
      // reach for. Declaring them is the fix; deleting a capability because the
      // sample happens not to use it would be the opposite mistake.
      "components/prototype/chart-card.tsx": "Core 能力：Recharts 卡片外壳，Reference Sample 当前未使用",
      "components/prototype/stats-card.tsx": "Core 能力：指标卡片，Reference Sample 当前未使用",
      "components/motion/slide-in.tsx": "Core 能力：位移动画原语，Reference Sample 当前未使用",
      "components/ui/switch.tsx": "Core primitive：shadcn 开关，Reference Sample 当前未使用",
      // This product's own five. Same rule as above, same reason: these are Core
      // vocabulary the product has not reached for yet. Deleting a capability
      // because today's routes do not use it would be the opposite mistake.
      "components/prototype/ai-summary-panel.tsx": "Core 能力：AI 摘要面板，本产品当前未使用（研究结果用 evidence chain 表达，不用摘要卡）",
      "components/prototype/open-section.tsx": "Core 能力：开放区块容器，本产品当前未使用",
      "components/prototype/pagination.tsx": "Core 能力：分页控件，本产品当前未使用（数据集是单页快照）",
      "components/prototype/profile-dialog.tsx": "Core 能力：账户对话框，本产品当前未使用（研究界面没有账户概念）",
      "components/prototype/sign-out-dialog.tsx": "Core 能力：登出对话框，本产品当前未使用（没有认证）",
    }

    const { files } = walkScoped(ROOT, { roots: ["components"], excludeTrees: [] })
    const sources = walkScoped(ROOT, { roots: ["app", "components", "tests"], excludeTrees: [] }).files
    const offenders: string[] = []

    for (const file of files) {
      if (!file.endsWith(".tsx")) continue
      const modulePath = file.replace(/\.tsx$/, "").split("/").pop()
      // Matched against an import specifier's tail, not against any mention.
      const importRe = new RegExp(`["'][^"']*/${modulePath}["']`)
      const referenced = sources.some((other) => other !== file && importRe.test(read(other)))
      if (!referenced && !UNEXERCISED[file]) offenders.push(file)
    }

    expect(
      offenders,
      "未使用的共享组件必须显式声明（附理由），否则它会悄悄烂在那里 —— 见 UNEXERCISED。",
    ).toEqual([])

    // And the declared list must not go stale.
    for (const [file, reason] of Object.entries(UNEXERCISED)) {
      expect(reason.length).toBeGreaterThan(8)
      expect(read(file).length, `${file} 存在且非空`).toBeGreaterThan(200)
    }

    // The exemption is for **Core vocabulary only**. A file under `app/` that
    // nothing links to is not a capability — it is a dead route, and parking it
    // here would turn this list into a place where debt goes to disappear.
    for (const file of Object.keys(UNEXERCISED)) {
      expect(file.startsWith("components/"), `${file} 不在 Core 目录内`).toBe(true)
    }
  })

  test("F7: the shell is an optional capability, not a forced product IA", () => {
    // Core's root layout may not impose a navigation structure: a product that
    // is not navigated by a sidebar must be able to keep it out entirely.
    const layout = read("app/layout.tsx")
    for (const shell of ["Sidebar", "TopNav", "MobileNav"]) {
      expect(layout, `app/layout.tsx 不得引入 ${shell}`).not.toContain(shell)
    }
    // The shell primitives exist as capabilities…
    for (const file of ["components/layout/sidebar.tsx", "components/layout/top-nav.tsx", "components/layout/mobile-nav.tsx"]) {
      expect(read(file)).toContain("export function")
    }
    // …and the Reference Sample is the only thing that wires them up.
    // The sample this product kept is `/demo` (the CRM shell went with the
    // derivation), and it is the thing that composes Sidebar / TopNav / MobileNav.
    expect(read("app/demo/_components/demo-app.tsx")).toContain("Sidebar")
    for (const doc of ["docs/product-initialization.md", "AGENTS.md"]) {
      expect(read(doc), `${doc} 必须写明 shell 是可选的`).toMatch(/Shell 是.?\*\*可选能力\*\*|Shell 是可选能力|可选能力/)
    }
  })

  test("the workflow puts semantic decisions before the UI", () => {
    const doc = read("docs/prototype-creation-workflow.md")
    const semantics = doc.indexOf("### 4 · Product Semantic Invariants")
    const divergence = doc.indexOf("### 5 · Art Direction Divergence")
    const manifest = doc.indexOf("### 6 · Visual Manifest")
    const build = doc.indexOf("### 10 · Build")
    const contract = doc.indexOf("pnpm factory:contract", semantics)

    expect(semantics, "语义不变量必须是独立一步").toBeGreaterThan(-1)
    expect(semantics).toBeLessThan(divergence)
    expect(divergence).toBeLessThan(manifest)
    expect(manifest, "Manifest 在 Build 之前").toBeLessThan(build)
    expect(contract, "这一步要有机器化的收口命令").toBeGreaterThan(semantics)

    for (const needle of [
      "Product Model",
      "Product Semantic Invariants",
      "Art Direction Divergence",
      "Visual Manifest",
      "Human Art Direction Gate",
      "Kits Source Installation",
      "adapter",
      "Browser QA",
      "部署",
    ]) {
      expect(doc, `workflow 必须包含 ${needle}`).toContain(needle)
    }
  })

  test("the initialization checklist covers the thirteen areas", () => {
    const doc = read("docs/product-initialization.md")
    for (const area of [
      "Product identity",
      "Reference Sample boundary",
      "Product Model",
      "Product Semantic Contract",
      "Art Direction divergence",
      "Visual Manifest",
      "Human Art Direction Gate",
      "Kits installation",
      "Adapter seam",
      "Route / QA registration",
      "Localization residue",
      "Deployment ownership",
      "Git branch baseline",
    ]) {
      expect(doc, `清单必须覆盖 ${area}`).toContain(area)
    }
    // It is a checklist, not a 50-step manual.
    expect(doc.split("\n").length).toBeLessThan(220)
    // And it names the three layers, machine-readable and in prose.
    for (const layer of ["Factory Core", "Reference Sample", "Initialization Surface"]) {
      expect(doc).toContain(layer)
      expect(read("AGENTS.md")).toContain(layer)
    }
  })
})
