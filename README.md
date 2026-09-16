# AI Research Workspace — 承重结构 / Load-Bearing

> **Working code name.** The product name is deliberately undecided — see §Naming below.

一个以**研究过程、证据、来源、论断、关系、研究轨迹**为核心的 AI 研究工作台。

它的核心 Job 是：**判断手上的证据到底支持什么结论，以及哪里还不支持。**
不是「帮你找资料」，也不是「帮你写」——那两件事已经有足够好的工具。
第一等的价值是**告诉你你的论证哪里是断的**。

## Visual direction

人工 Art Direction checkpoint 已通过，方向为 **承重结构 / Load-Bearing**：一条纵向论证链，
**无证据支撑的断点以虚线空槽成为第一视觉焦点**，右侧窄带只列尚未处理的证据缺口与矛盾。

| | |
|---|---|
| Style Pack | `instrument` |
| Signature Components | `insight-reveal` · `data-cursor` |
| Effects | *(none — 本产品要验证的是严肃、可核查的研究工作台，不是 cyber/terminal aesthetic)* |
| Motion | `precise-structural`（**有意偏离**：pack 的 `motion.language` 是 `precise`） |
| Density | `medium`（**有意偏离**：pack 的 `profile.density` 是 `high`） |

两条偏离都记在 `visual-manifest.json` 的 `deviations` 里，各带理由与来源——它们原本只活在
`components/research/research-shell.css` 的注释里（v1.1 的 Manifest 没有承载偏离的字段，
机器看起来和一次笔误没有区别）。签名组件上限**没有声明**：那是人的决定，Factory 不代填。

权威来源是 `visual-manifest.json`。校验：`pnpm factory:manifest --kits ../prototype-kits`
（L1 结构 + L2 自洽 + L3 与 pack 的 profile 比对）。**不带 `--kits` 时找不到 registry 就只做
L1/L2，并打印 `[upstream-unavailable]`**——那是「没比对」，不是「比对通过」。

## Naming

产品正式名称未决定。仓库名 `prototype-ai-research` 与工作代号 `Load-Bearing` 都只是代号。
`Research.title` 在数据集里是 `undefined` —— 这是刻意的：一个尚未做出的决定不应该被硬编码进数据。

## Phase status

| Phase | 内容 | 状态 |
|---|---|---|
| 1 | Product Model + Art Direction（A/B/C 三方向 + 推荐） | ✅ 完成，人工 checkpoint 已通过 |
| 2 | Visual Manifest + Implementation Plan | ✅ 完成，Manifest `[verified]` |
| **A** | **Repository + Domain Model + Invariants** | ✅ **完成 —— 12 条不变量全绿，零 Product UI** |
| B | Relation Contract implementation | ⬜ 未开始 |
| C+ | Kits installation → Build → QA → Preview → Visual Acceptance | ⬜ 未开始 |

**本阶段没有写任何产品界面。** `lib/research/` 是纯 TypeScript 领域层，`tests/invariants.spec.ts`
是它的规格书。在 UI 大规模实现之前先把不变量跑绿，是 Factory 的 invariant-first 要求，
也是这个产品的实际需要：数据型 UI 的价值完全建立在「屏幕上的数字是对的」之上。

## Domain layer

业务真相只有一个来源，且它不依赖 React、不依赖网络、不依赖时间：

```
lib/research/
  types.ts        实体与值类型
  projections.ts  所有派生值的唯一来源（活跃/历史投影、证据强度、依据状态、引用完整性）
  tensions.ts     张力推导 + 处置合并
  trace.ts        append-only 轨迹
  operations.ts   唯一允许修改数据的入口（状态与轨迹原子同写）
  ai-reviewer.ts  AI 输出的数据契约与校验（无模型调用）
  dataset.ts      确定性 mock 数据集
```

见 `AGENTS.md` 的「领域层」一节，以及 `tests/invariants.spec.ts` 里那 18 条不变量
（机器可读 id 登记在 `product-contract.json`，由 `pnpm factory:contract` 双向核对）。

---

# Factory baseline

This repo is a product built **on** the Prototype Factory. The sections below describe the
Factory mechanisms that came with the baseline (派生自 v1.1.0，v1.2 工具链与 v1.3 治理政策
已在 `chore(factory): adopt governance policy v1.3` 中补齐)。

It is a **Factory**: it defines *how a prototype is produced*. It deliberately does **not**
define what a prototype looks like — that belongs to **Prototype Kits**, chosen per product
through a Visual Manifest.

## Governance（这棵树归哪一版工厂管）

| 事实 | 值 | 在哪里 |
|---|---|---|
| 治理政策 | **1.3.0** | `factory-policy.json` 的 `policyVersion`；`AGENTS.md` 的 `factory-core-policy` 管理块逐字渲染自它 |
| 工厂版本（锁） | **1.2.0** | `factory.lock.json` 的 `factoryVersion` —— 与政策版本是**两个轴** |
| 派生来源 | prototype-starter v1.1.0 @ `ae07caf` | `factory.lock.json` 的 `baseline` |
| 初始化 stage | **product** | `init-contract.json`，与锁里的 `stage` 由 `pnpm factory:agents` 逐字对账 |
| CI | 质量门 only，自包含，无 Vercel CLI/token | `.github/workflows/ci.yml` |
| QA 端口 | **3230** | `.qa/qa.config.mjs` 的 `QA_PORT`（3200 是 baseline 的槽位） |
| Visual Manifest | **verified**（对着 registry 0.2.0 真比对） | `visual-manifest.json` + `pnpm factory:manifest --kits ../prototype-kits` |
| 已知未完成项 | **1 个**：F5 / N1 迁移，`pnpm test` 里表现为 **1 skipped** | `AGENTS.md`「已知未完成项」 |

锁有两种形状（baseline 治理锁 / 产品锁），权威定义在根控制面
`contracts/factory-lock.schema.json`；本仓是产品，用产品形状。

> **skip 不是 pass。** 那一项未完成的迁移在测试里是 `test.fixme`（报告为 skipped）。发布证据里
> 不许把这次 skip 记成「test 门禁全绿」；`tests/init-boundary.spec.ts` 有一条不会被跳过的测试
> 钉住它——删掉 fixme 会让它失败。

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium   # first e2e / QA run only

pnpm dev          # http://localhost:3000 — neutral demo at /demo
pnpm check        # factory:agents + lint + typecheck + test + build + qa
pnpm build        # production build (Turbopack)
```

## What changed in v1.1

v1.0.0 worked, but it had one systemic flaw: **product identity lived in shared defaults.**

- `components/layout/sidebar.tsx` fell back to one product's nav, brand, user, and a literal
  `progress: 64`.
- `components/layout/top-nav.tsx` imported `@/stores/dashboard-store` as its default data
  source and fell back to another product's account identity — so the
  neutral `/demo` page displayed the CRM Reference Sample's account as if it were the product's.
- `AGENTS.md` and this README documented one product's art direction — "Design System V4 —
  AI Sales Command Center" — as if it were the Factory's own rule.
- Playwright ran on port 3000 with `reuseExistingServer` on, which adopts *any* server that
  answers the readiness URL while performing **no identity check**.
- There was no accessibility check, no overflow check, and no guard against a probe that
  measured nothing and passed anyway.

v1.1 removes the defaults, adds the missing gates, and backports the mechanisms that two rounds
of real production use (AI CRM, AI Finance) and Prototype Kits v0.1.1 proved out.

The full audit is in `docs/factory-audit-v1.1.md`.

### Shared components now require injection

`Sidebar` / `MobileNav` take `brand`, `items`, `user` as **required** props. `TopNav` takes a
**required** `dataSource`. There is no fallback, because a fallback is a Factory opinion about
what the product is called.

```tsx
<Sidebar
  active={activeTab}
  onNavigate={navigate}
  items={navItems}   // required — the product's navigation
  brand={brand}      // required — the product's identity
  user={account}     // required — the product's account
  usage={usage}
/>
```

The Factory's own neutral demo does exactly this (`app/demo/_components/demo-app.tsx`) — the
same thing an AI CRM or an AI Finance must do. `components/**` may not import a store, product
data, or a product route; a contract test enforces it.

## The production flow

```
Understand → Inspect → Product Model → Visual Direction → Visual Manifest
→ 【human / explicit Art Direction checkpoint】
→ kits add → Build → Invariant tests → Browser QA → Test → Preview
→ Human Visual Acceptance → Release
```

Full detail: `docs/prototype-creation-workflow.md`.

### Visual Manifest — the Art Direction Gate

No business prototype may start UI work without one. The Factory owns the *contract* (field set,
shape, non-vacuity rules, registry cross-check); Prototype Kits owns the *creative semantics*
(which pack fits, how many signature components, what `avoid` should say).

```json
{
  "productType": "ai-finance-console",
  "firstVisual": "深色空间里从左上打下来的环境光，标题浮在光里，下方一条发光曲线",
  "stylePack": "cinematic",
  "signatureComponents": ["interactive-hero", "data-cursor"],
  "effects": ["ambient-glow"],
  "motionDirection": "atmospheric",
  "density": "medium",
  "avoid": ["generic-ai-dashboard", "card-everywhere", "animation-everywhere"]
}
```

`firstVisual` and `avoid` are **hard constraints**: an impression-only `firstVisual`
(「现代简洁」) and an empty `avoid` are both validation errors.

The schema enumerates **no asset ids** — legal values are read from the Kits registry at
verification time. A contract test asserts Factory Core source never names a specific Style
Pack, so adding a pack to Kits requires **zero** Factory changes.

See `docs/visual-manifest.md`.

### Kits Source Installation

```bash
pnpm factory:manifest          # validate the manifest (+ upstream cross-check)
pnpm factory:kits              # dry-run: show the plan
pnpm factory:kits --write      # install → verify lock → run doctor
pnpm qa:doctor                 # doctor gate
```

The Factory **calls** the Kits CLI; it does not reimplement it. Ownership is a file-system fact,
not a convention:

| Path | Owner |
|---|---|
| `lib/kits/installed/` | **Kits-managed** — overwritten on reinstall; never hand-edit |
| `lib/kits/.kits/` | **Kits-managed** tooling |
| `lib/kits/kits.lock.json` | **Kits-managed** state — the only evidence of install state |
| `lib/kits/adapters/` | **Product-owned** — Kits never overwrites |

Product code must go `Product → adapters → installed`.

When the Kits checkout is absent, the doctor reports `[upstream-unavailable]` and says in as many
words that **no upstream comparison was performed**. A standalone product is a normal state;
claiming a check you did not run is not.

See `docs/kits-ownership.md`.

## Browser QA

```bash
pnpm qa                    # every discovered route × 2 viewports × 2 themes + capability probes
pnpm qa --routes=/demo
```

Routes, viewports, themes and tolerances live in `.qa/qa.config.mjs` — the sweep knows no route
names and discovers them from `app/`.

Target state:

```
0 console error · 0 page error · 0 request failure · 0 horizontal overflow · 0 viewport expansion
```

### The checks that exist because of a real regression

- **Three mobile criteria, never one.** `scrollWidth - innerWidth` alone reports a false green:
  Chromium silently widens the *layout* viewport to fit overflowing content, so both values grow
  together and the difference stays ~0 while the page is laid out for a screen the user does not
  have. QA also asserts the requested width was honoured, and that `scrollTo(9999, 0)` leaves
  `scrollX ≈ 0`.
- **No Invisible Semantics.** Being visible is not the same as being *in the accessibility tree*.
  For `button` / `link` / `heading`, the count of semantics-contributing DOM elements must equal
  the count of that role in the browser's real accessibility tree (read over CDP, since
  `page.accessibility` was removed in Playwright 1.63). An `aria-hidden` ancestor holding real
  interactive content is a failure.
- **Probe integrity.** Every numeric probe goes through `measure()`, which fails loudly on
  `NaN` / `Infinity` / a non-number / an unexplained `0`. The bug it prevents:
  `Math.abs(NaN - expected) > tolerance` is `false`, so a probe that measured **nothing** used to
  report success.
- **Reduced motion, coarse pointer, observer failure.** Content must be visible without hover,
  without animation, and even when the `IntersectionObserver` that was supposed to reveal it
  never fires.
- **Port isolation.** A dedicated port, `reuseExistingServer: false` unconditionally, a pre-flight
  guard that names the process holding the port, and process-group teardown so only the server
  this run started is ever stopped.

Full rationale, including the browser behaviours that a probe must model correctly: `docs/browser-qa.md`.

## Kits-agnostic by construction

The Factory does not know any Style Pack, Signature Component or Effect. That is enforced, not
just intended: a contract test scans `lib/`, `components/`, `app/`, `scripts/`, `hooks/` and
`stores/` for every known Kits asset id and fails if one appears.

## What's in the box

| Area | Contents |
|---|---|
| **Design tokens** | one layer in `app/globals.css` + a JS mirror in `lib/motion-presets.ts`. A neutral fallback — a Style Pack may override it |
| **UI primitives** | `components/ui/*` (shadcn "base-nova", built on **Base UI** — use the `render` prop, not `asChild`) |
| **Product components** | `components/prototype/*` (OpenSection, SectionHeading, MetricStrip, DataTable, FilterBar, DetailDrawer, CommandPalette, EmptyState, LoadingState, ErrorState, OnboardingWizard, StatsCard, ChartCard, AmbientBackdrop) |
| **Motion** | `components/motion/*` (FadeIn, SlideIn, ScaleIn, PageTransition, StaggerContainer, AnimatedNumber) |
| **Layout** | `components/layout/*` (Sidebar, TopNav, MobileNav, PageContainer) — all injection-required |
| **i18n** | `lib/i18n/*` + `components/i18n/*`; every user-visible string resolves through the dictionary |
| **Contract** | `lib/visual-manifest.ts` + `.schema.json` |
| **Tooling** | `scripts/install-kits.mjs`, `scripts/validate-manifest.mjs`, `scripts/doctor-gate.mjs`, `scripts/check-qa-port.mjs`, `.qa/*` |
| **Docs** | `docs/visual-manifest.md`, `docs/kits-ownership.md`, `docs/browser-qa.md`, `docs/prototype-creation-workflow.md`, `docs/vercel-bootstrap.md`, `docs/factory-audit-v1.1.md` |
| **Skills** | `skills/interactive-prototype/SKILL.md`, `skills/git-delivery/SKILL.md` |

### What this repo removed

This repo was derived from Factory v1.1.0 and the **CRM Reference Sample was removed**, not demoted:
`app/crm/**`, `lib/crm-data.ts`, `lib/insights.ts`, `lib/ai-summary.ts`, `lib/activity-groups.ts`,
`stores/crm-store.ts` and the CRM specs are gone. The CRM identity that had leaked into the shared
copy layer went with them (`customers` / `customer` / `dashboard` / `tasks` / `activities` /
`opportunities` / `account` / `status` / `plan` / `page` / `nav` / `brand` dictionary groups;
`lib/i18n/zh-CN.ts` 1028 → 603 lines).

That also removed the compile-time coupling recorded in Factory v1.1's audit §5: the dictionary no
longer imports CRM types, because the module it pointed at no longer exists.

The neutral demo `/demo` is kept deliberately — non-CRM, no Style Pack. It exists so the baseline is
demonstrably runnable and the shared components stay exercised. **It is not a product template and
not product UI.**

## Structure

```
app/                     # routes: / (landing), /demo (Factory neutral demo)
components/
  ui/                    # shadcn/ui primitives (Base UI "base-nova")
  prototype/             # reusable product components — injection-required
  motion/                # Motion-based animation components
  layout/                # Sidebar, TopNav, MobileNav, PageContainer
  i18n/                  # LocaleProvider, useMessages()
hooks/                   # useMediaQuery, useDebouncedValue, useHotkey
lib/
  i18n/                  # dictionaries (zh-CN) + locale registry
  visual-manifest.ts     # the Art Direction contract
  motion-presets.ts      # JS mirror of the motion tokens
stores/                  # Zustand stores (demo + reference product)
tests/                   # Playwright e2e + Factory contract tests
.qa/                     # Browser QA sweep, config, probes, probe guard
scripts/                 # Kits manifest / install / doctor / port guard
docs/                    # the contracts, in prose
skills/                  # agent skills (interactive-prototype, git-delivery)
```

## Commands

```bash
pnpm dev               # http://localhost:3000
pnpm lint              # ESLint
pnpm typecheck         # next typegen + tsc --noEmit
pnpm test              # Playwright (port guard + self-managed server)
pnpm build             # production build (Turbopack)
pnpm qa                # Browser QA sweep (port 3230, self-managed server)
pnpm qa:online         # Online QA (REMOTE observer: sweeps an existing URL; never deploys, never creates a token)
pnpm check             # factory:agents + factory:manifest + the five gates above, in order

pnpm factory:agents    # agent-policy gate (managed block ↔ factory-policy.json; --print-block syncs it)
pnpm factory:manifest  # visual manifest: L1 shape + L2 self-consistency (+ L3 upstream when a registry is reachable)
pnpm factory:init      # initialization boundary (stage, identity residue, 0-scan)
pnpm factory:contract  # product semantic invariants: declared ↔ registered, both directions
pnpm factory:deploy    # deployment authorization & identity (preflight / verify / access / actions)
pnpm factory:kits      # install Kits assets from the manifest (dry-run by default)
pnpm qa:doctor         # Kits doctor gate
```

> `pnpm test` and `pnpm qa` cannot run at the same time: Next 16's dev server takes a
> **per-project** lock (`.next/dev/lock`), not a per-port one.
>
> `pnpm factory:agents` is the **first** item of `pnpm check`, and that order is machine-checked.
> A policy gate that is not wired into the aggregate script is a gate that runs when someone
> remembers to run it.
>
> `pnpm factory:manifest` has two modes and names which one it used. With `--kits <path>` (or a
> discoverable sibling checkout) it really crosses the manifest against the registry **and** the
> pack's own profile — `status: verified`. Without one it still runs L1/L2 and prints
> `[upstream-unavailable]`, saying in as many words that nothing upstream was compared. The word
> `verified` only ever comes from the validator, never from a caller. In CI the registry comes from
> a **pinned** `skillre/prototype-kits` checkout when `KITS_REPO_TOKEN` is configured, and the honest
> mode carries a warning annotation otherwise.

## Stack notes

- **shadcn/ui "base-nova"** is built on **Base UI**, not Radix — use `render` instead of `asChild`,
  `swipeDirection` on Drawer, `(value) => …` children on `Select.Value`.
- **Next.js 16** has breaking changes; read `node_modules/next/dist/docs/` when in doubt
  (`next lint` is gone, `params` is async, Turbopack is the default bundler).
- **Zustand**: selectors must return stable references — derive with `useMemo` in components, never
  create arrays/objects inside selectors.

## Git workflow

```
main → feature/<name> → development → QA → commit → push → Vercel Preview
     → human review → merge main
```

`main` is the stable baseline; agents never develop on it and never merge to it by default. Git
safety rules live in `AGENTS.md`; the delivery checklist is in `skills/git-delivery/SKILL.md`;
Vercel setup is in `docs/vercel-bootstrap.md`.
