<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Prototype Starter — Agent Instructions

这是一个**长期复用的 AI Agent 驱动 Interactive Prototype Starter**：只做「Frontend + local state + realistic mock data」。

## 项目边界

- ✅ Next.js 16 App Router · TypeScript · Tailwind v4 · pnpm
- ✅ shadcn/ui（**base-nova 风格，基于 Base UI**，而非 Radix）· Motion 13 · Zustand 5 · Recharts 3 · dnd-kit · Playwright
- ❌ 禁止加入 Database / Supabase / Authentication / Docker / Kubernetes / Monorepo / Turborepo / Microservices / Backend service / MCP / Multi-agent orchestration / GitHub Actions / Vercel API & CLI automation / Cloudflare / 任何新的 deployment platform。这些以后再处理。

## 开发原则（必须遵守）

1. **先 inspect，再修改**。动手前先读 `AGENTS.md`、相关组件与数据，配置有疑问时查阅 `node_modules/next/dist/docs/`（Next 16 有 breaking changes，如 `next lint` 已移除、`params` 为 Promise、`middleware` 改名为 `proxy`）。
2. **优先复用现有组件**：`components/ui/`（shadcn primitives）、`components/prototype/`（StatsCard、DataTable、FilterBar、DetailDrawer、CommandPalette、EmptyState、LoadingState、ErrorState、OnboardingWizard、ChartCard）、`components/motion/`（FadeIn、SlideIn、ScaleIn、PageTransition、StaggerContainer、AnimatedNumber）、`components/layout/`（Sidebar、TopNav、MobileNav、PageContainer）。
3. **禁止无意义重复组件**。相似 UI 先考虑扩展现有组件，而不是复制新文件。
4. **所有可见交互必须真实可用**。每个按钮/开关/菜单都连到 state、store 或真实行为；**不允许 fake buttons**、不允许仅视觉装饰。
5. **不制作静态 mockup**。页面必须由真实组件 + 局部状态驱动，数据来自 `lib/mock-data.ts`（realistic mock data，禁止 lorem ipsum）。
6. **shadcn/ui 优先作为 UI primitive**。注意 base-nova 风格 API 与旧版不同：用 `render` prop 而不是 `asChild`；Drawer 用 `swipeDirection`；`Select.Value` 的 children 可以是 `(value) => ReactNode`。
7. **Motion 优先负责交互动画**。时长与缓动只从 `lib/motion-presets.ts` / CSS token 取，禁止硬编码 duration/ease。
8. **使用 realistic mock data**：公司、金额、时间戳都要像真实 SaaS 数据。
9. **重要功能必须浏览器验证**：`pnpm dev` 后走一遍流程，或用 Playwright（`pnpm test`）覆盖（详见下方 Browser QA 规则）。
10. **修改时尽量保持现有 architecture**：app 页面在 `app/`，可复用业务组件按职责放入 `components/*`，状态在 `stores/`，mock 数据在 `lib/mock-data.ts`。
11. **必须考虑 responsive**：桌面（Sidebar + TopNav）与移动（MobileNav + Drawer + 单列 grid）都要可用。
12. **必须实现 loading / empty / error states**，并用全局（LoadingState / ErrorState / EmptyState）组件表达。
13. **完工前执行 `pnpm lint`**。
14. **完工前执行 `pnpm typecheck`**。
15. **完工前执行 `pnpm test`**（Playwright）。
16. **完工前执行 `pnpm build`**。
17. **不要假设代码结构**。任何结论都以实际读到的代码为准；route、组件、store、token 的名与实都以仓库现状为准。
18. **先理解现有架构，修改应尽量局部、可控、可回滚**；不进行没有必要的大规模重构。
19. **不覆盖用户已有修改**。开工前确认工作区状态；发现与任务无关的用户改动时，先停止并报告，绝不擅自覆盖或丢弃。

## Prototype 规则

- 所有可见交互控件**必须真实可用**：连接 state / store / 真实行为；**不允许 fake buttons**，不允许仅视觉装饰。
- **不允许纯静态 mockup 冒充 interactive prototype**：页面必须由真实组件 + 局部状态驱动。
- UI primitive 优先 **shadcn/ui**（base-nova API）；业务组件优先复用 `components/prototype`；动画优先复用 `components/motion`。
- 视觉只使用 `app/globals.css` 的 **design tokens** 与 `lib/motion-presets.ts`；禁止 magic number。
- 数据来自 **realistic mock data**；**不使用 lorem ipsum**。
- 必须考虑 **loading / empty / error** 三态（用全局组件表达）。
- 必须考虑 **responsive**（桌面与移动端都要可用）。
- **重要交互必须经过真实浏览器验证**（见 Browser QA 规则）。

## Browser QA 规则（Factory v1.1）

对于重要交互，**不能只通过源码阅读判断**。必须真实打开浏览器执行。

```bash
pnpm qa            # 全量：所有路由 × 桌面/移动 × 明暗 + 能力探针
pnpm qa --routes=/demo
```

标准见 `docs/browser-qa.md`。要到达的状态：

```
0 console error · 0 page error · 0 request failure · 0 横向溢出 · 0 viewport expansion
```

### 移动端必须三条判据一起查

**不能只用 `scrollWidth - innerWidth`。** Chromium 会为溢出内容自动扩张**布局视口**，
扩张之后两个值一起变大、差值接近 0，看起来"没有溢出"，而页面其实是按一个用户并不存在的
宽度排版的。必须同时满足：

1. `abs(window.innerWidth - 请求宽度) <= 1`
2. `documentElement.scrollWidth <= 请求宽度 + tolerance`
3. `scrollTo(9999, 0)` 后 `scrollX ≈ 0`

默认矩阵：desktop **1440×900** · mobile **390×844** · dark / light。

### No Invisible Semantics

> **看得到 ≠ accessibility tree 看得到。**

`aria-hidden="true"` 会剪掉整棵子树，而屏幕上一切正常——布局没变、鼠标照样能点，
只有屏幕阅读器和 `getByRole` 看不到。

- 对 `button` / `link` / `heading`：**DOM 中贡献语义的元素数必须等于无障碍树中该 role 的节点数**。
- **真实内容祖先禁止 `aria-hidden="true"`。** 只有装饰性元素才允许。
- 注意 pruned 的精确含义：`aria-hidden` / `hidden` / `inert` / `display:none` 剪子树；
  `role="presentation"` **只去掉该节点自己的语义，不剪子树**。

### QA Probe Integrity

> **一个静默通过的探针，比没有探针更危险。**

`0 / 0 = NaN`，而 `Math.abs(NaN - expected) > tolerance` 返回 `false` —— **断言静默通过**。
所有数值探针必须：

- 先 `Number.isFinite(value)`；
- `NaN` / `undefined` / 非数字 / selector 未命中 → **fail loudly**；
- 得到 `0` 而本不应为零 → 失败（几乎总是"没量到"，不是真实的零）；
- 确实允许为零时显式声明。

**不要把「没量到」当成「满足条件」。** 统一使用 `.qa/probe-guard.mjs` 的 `measure()` /
`expectRatio()`，不要在调用点各写一遍。

**CSS 自定义属性只在声明它的元素及其后代上可见。** 把探针挂到 `<body>` 上去读一个声明在
深层元素上的变量，一定读到 0。

### Reduced Motion / Coarse Pointer

任何 Signature Component 必须经过三种状态：desktop fine pointer · touch/coarse pointer ·
`prefers-reduced-motion`。至少检查：

- 内容默认可见（不得停在 `opacity: 0` 等动画）
- touch 不依赖 hover
- custom cursor 在 touch 下关闭
- ambient motion 在 reduced-motion 下关闭
- **不因为 JS / IntersectionObserver 失败而永久隐藏内容**

`hasTouch` / `isMobile` 是 **browser context** 属性，不是 viewport 属性——`setViewportSize`
不会让 `(pointer: coarse)` 变成 true。

### Port Isolation

**Playwright 的 `reuseExistingServer` 会接受任何以 2xx/3xx 应答就绪 URL 的 server，
不做任何身份校验。** 端口 3000 是 Next 的默认端口，一个残留或不属于本项目的 server
会被当成"被测应用"，整套断言在**错误的页面**上通过——而且不报错。

- **不复用 3000。** Factory 的 QA 端口是 `.qa/qa.config.mjs` 里的 `QA_PORT`。
- **不自动连接已经存在的未知 server。** `reuseExistingServer: false`，**永远**。
- **server 必须由当前 test run 管理**，端口显式固定（否则 Next 会自动 +1 而 `baseURL` 还指着旧端口）。
- **QA 完成后只停止自己启动的 process**（杀进程组；`pnpm dev` 是一层包装，只杀 `pnpm` 会留下孤儿 `next-server`）。

**禁止：**

```bash
pkill -f "next dev"        # ✗ 会杀掉同机其它原型，甚至你自己的开发服务器
pkill -f "next-server"     # ✗ 同上
```

端口被占用时用 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 定位，**确认那确实属于当前任务**再单独停止它。

> 另注：Next 16 的 dev server 是**按项目**加锁的（`.next/dev/lock`），不是按端口。
> 同一项目不能再起第二个 `next dev`；`pnpm test` 与 `pnpm qa` 不能同时跑。

## Quality Gates

任何 Prototype 在「完成」之前必须全部通过：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm qa
```

任何一项失败：**禁止声称完成**。必须修复后重新执行，直至全部通过。

`pnpm check` 会依次跑完这五项。

## Kits Ownership Contract

Factory 不 vendor 任何 Kits 内容，只集成**调用机制**。安装后：

| 路径 | 归属 |
|---|---|
| `lib/kits/installed/` | **Kits-managed** —— 重新安装会整体覆盖 |
| `lib/kits/.kits/` | **Kits-managed** tooling |
| `lib/kits/kits.lock.json` | **Kits-managed** state（安装状态的唯一凭据） |
| `lib/kits/adapters/` | **Product-owned** —— Kits 永不覆盖 |

- **禁止手工修改 `installed/`。** 需要升级 = 重新跑 `kits add`，不是手工 patch asset。
- **产品代码不得直接 import `installed/*`。** 必须走 `Product → adapters → installed`。
  唯一合法例外是适配层自己（`boundary` 检查豁免它）。
- `pnpm qa:doctor` 是正式质量门。**doctor 不通过 = 安装状态不可信 = 禁止声称完成。**
- doctor 在 Kits 仓库缺席时报告 `[upstream-unavailable]` 并**明说未做上游比对**——
  独立交付是这个模式的正常状态，但"没检查"绝不能被说成"通过"。

详见 `docs/kits-ownership.md`。

## Git 工作流与安全

### Git 安全规则（红线）

Agent 默认**禁止**执行：

- `git reset --hard`
- `git clean -fd`
- `git push --force`
- `git push --force-with-lease`
- `git branch -D`
- `git checkout .`
- `git restore .`
- `rm -rf`
- `pkill -f "next dev"` / `pkill -f "next-server"`（会误杀同机其它原型）

除非用户明确要求（force 类操作还需用户确认风险）。对于任何可能覆盖用户修改的命令：**先停止并报告**，不允许擅自覆盖用户工作。

### Branch Strategy

- **`main` 是稳定基线**：只保存稳定、可展示、可部署版本。
- 开发一律在 **`feature/<name>`**：
  - 每个新 Prototype 使用独立 feature branch；**一个 Prototype 对应一个 feature branch**。
  - 不同 Prototype 不混在同一个 feature branch。
  - 不重复使用旧 feature branch 做完全不同的 Prototype。
  - Agent **默认不直接在 `main` 开发**。
- 命名要求：**lowercase、kebab-case、简洁、英文、无空格、无中文**。
- 推荐命名：`feature/ai-crm`、`feature/ai-dashboard`、`feature/analytics`、`feature/workflow`、`feature/mobile-app`。

### 开始新 Prototype 的 Branch 工作流

每次开始新 Prototype：

```bash
git status                 # 确认没有未提交的用户修改
git branch --show-current   # 确认当前位置

git checkout main
git pull --ff-only origin main   # 若有远程仓库

git checkout -b feature/<name>   # 例如 feature/ai-crm

git branch --show-current         # 必须是 feature/<name>
```

**只有确认在 `feature/<name>` 之后才开始开发。** 如果当前已经在其他 feature branch：**不把新 Prototype 混进去，先停止并报告**；不自动删除旧 branch。

### 在 feature branch 上开发

所有新 Prototype 的修改发生在 `feature/<name>`，允许有多个合理 commit。推荐 commit 类型：

`feat:` `fix:` `refactor:` `style:` `test:` `docs:` `chore:`

例如：`feat: add customer detail drawer`、`fix: improve mobile dashboard layout`、`test: add customer workflow coverage`。

禁止无意义的：`update` / `changes` / `work` / `misc` / `final`。

### Commit 规则

commit 之前必须：

1. `git status` → `git diff --stat` → `git diff`，检查：unintended changes、secrets、API keys、`.env`、`node_modules`、`.next`、`test-results`、临时文件、无关改动。
2. 全部通过 `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` 以后才能 commit。
3. 尽量使用 `git add <explicit-files>`；不要盲目 `git add -A`，除非已明确确认所有变更都属于当前任务。
4. commit 后再次 `git status` 确认。

### Push 规则

**默认不 push。** 只有以下情况才允许 push：用户明确要求 push、当前任务明确要求 delivery / publish。

push 之前必须 `git branch --show-current` 确认当前**不是 `main`**，然后：

```bash
git push -u origin feature/<name>
```

禁止 `git push --force` / `git push --force-with-lease`，除非用户明确要求并确认风险。

### Merge 规则

`main` 表示稳定版本。标准流程：

```
feature branch → development → browser QA → Playwright
→ lint/typecheck/build → commit → push → Vercel Preview
→ 人工确认 → merge into main
```

Agent 默认**禁止自动 merge**；默认禁止 push main、合并 main、删除 feature branch。只有用户明确要求时才执行 merge。发生 merge conflict：**停止并报告**，不擅自进行高风险 conflict resolution。

## 设计 Token

一切视觉常量来自 `app/globals.css` 的 design token 层（typography `text-display/title/subtitle/heading/caption/label/eyebrow/metric/metric-sm/numeric`、semantic spacing `p-gutter/gap-stack/mt-section`、radius `rounded-field/rounded-card/rounded-panel`、motion `duration-*`/`ease-*`、内容宽度 `max-w-dashboard/content/text`）。禁止在页面里撒 magic number。

## 视觉方向（由 Prototype Kits 负责）

**Factory 不规定 Prototype 长什么样。**

Factory 负责「怎么生产 Prototype」，Prototype Kits 负责「Prototype 可以长什么样」。具体风格、
签名组件、效果、颜色、排版数值都在 Kits 里，通过 Visual Manifest 选择。

Factory Core **禁止**出现：具体 Style Pack 名、具体签名组件名、具体效果名、具体颜色值、
具体排版数值。可选值一律在**运行时**从 Kits registry 读取——把 id 抄进 Core 的当天就会过期，
而且会让 Factory 悄悄认识某一个 pack。

> 历史注记：v1.0.0 这里写的是「Design System V4 — AI Sales Command Center」，把某个参考产品的
> 视觉方向（`RevenueHero` / `AiInsightLayer` / `CrmDataBoundary` 的构图阶梯）当成了 Factory 的
> 通用规则。那是参考产品的美术方向，不是 Factory 的。它已迁出 Core。

### Art Direction Gate（不可跳过）

```
Understand → Inspect → Product Model → Visual Direction → Visual Manifest
→ 【人工 / 显式 Art Direction checkpoint】
→ kits add → Build → Invariant tests → Browser QA → Test → Preview
→ Visual Acceptance → Release
```

- **任何业务 Prototype 在 UI 实现前必须先产出 `visual-manifest.json`。**
  没有 Manifest 就开始写 JSX = 违规。`pnpm factory:kits` 会直接拒绝。
- **Agent 不能在没有 Manifest 的情况下默认生成 generic AI SaaS visual。**
  默认审美（卡片 + 阴影 + 渐变 + 紫色）会主动回拉，Manifest 就是那道闸门。
- **Manifest 里 `firstVisual` 与 `avoid` 是强约束**，由校验器强制。
- **Art Direction checkpoint 是人工决定**：选哪个 pack、第一视觉是什么、不要什么。
  Agent 不能替人做这个决定，也不能不记录就跳过。
- 详见 `docs/visual-manifest.md`；创作语义见 Kits 的 `skills/visual-direction/SKILL.md`。

### 层级与构图（方法，不是配方）

无论选哪套 pack，这几条是**方法**：

1. **一屏一个主角**。先定第一视觉焦点，其余信息按重要性递减。不要让所有模块视觉权重相同；
   同一个数字在同一屏里只出现一次。
2. **容器是语义容器，不是装饰容器**。能用「开放区块 + hairline」的地方不要用「又一个圆角盒子」。
3. **构图允许非对称**。全部 50/50 会让页面读起来像表格。
4. **一屏一个光源**。页面自带 Hero 时把全局环境光关掉——两个晕染互相抵消等于没有设计。
5. **签名交互只有一个**。其余地方保持静止；「交互动效」用于交代状态变化，不是用来装饰。
6. **层级在灰度下依然成立**。不依赖颜色，也不依赖 glow。

### 视觉常量

一切视觉常量来自 `app/globals.css` 的 design token 层与 `lib/motion-presets.ts`。
**禁止在页面里撒 magic number**，禁止硬编码 duration / ease / 颜色。

token 层是 Factory 的**中性 fallback**：它保证新建原型不会是空仓库。但它不是美术方向——
美术方向由 Manifest + Kits 决定，并可以覆盖 token 层。

### 中文排版红线

- **中文不使用负字距**。负 tracking 只允许出现在纯数字 token 上（`text-metric` / `text-numeric` / `.numeric`）。
- 中文行高高于纯拉丁方案：`text-display` 1.18、`text-title` 1.3、`text-body` 1.7。
- 字体栈以 Geist 起头，再回落到 PingFang / Hiragino / YaHei / Noto，**不用拉丁字体合成中文**。
- 控件命中区不小于 24px。

### 数据型 Prototype：invariant-first

**复杂数据产品：先定义 invariants，再做 UI。**

在 UI 大规模实现**之前**写不变量测试。数据型 UI 的价值完全建立在"图上的数字是对的"之上；
没有测试守住这一点，后面每次视觉调整都在赌。

判断标准：totals reconcile（分项之和 == 总计）· derived metrics consistency（派生 == 重算）·
source data == visualization（图上数值 == 源数据）· insights refer to real records（洞察引用真实记录且可跳转）。

**Factory 只建立这条契约，不包含任何具体业务规则。** 具体账本规则属于具体产品。
详见 `docs/prototype-creation-workflow.md`。

## 文案与本地化

- 默认语言 **zh-CN**。`app/**` 与 `components/**` 里**不允许**出现硬编码的用户可见文案，一律经 `useMessages()`（服务端用 `messages`）从 `lib/i18n` 取。
- 词典负责**界面文案**；**业务记录内容**（客户名、公司名、备注、金额）留在 `lib/crm-data.ts` / `lib/mock-data.ts`，不做翻译。
- 路由 slug 保持英文（`/crm/customers`），界面显示中文。新增 locale 只需在 `lib/i18n/` 增加一个 `Messages` 形状的文件。
- 允许保留原文的只有：品牌名、URL、Email、技术栈名称、代码、键盘快捷键。这份白名单集中在 `tests/support/localization.ts`，并断言 `/`、`/demo` 与全部 `/crm` 路由（含浮层）零泄漏。

## Zustand 约定

- selector 只取**原始值**（如 `customers` 数组本身），派生（filter/sort/计数）在组件内用 `useMemo`。**禁止在 selector 里返回新数组/新对象**（zustand v5 会无限渲染）。
- 参考 `stores/dashboard-store.ts` 的 `selectFilteredCustomers` 纯函数。

## 常用命令

```bash
pnpm dev               # http://localhost:3000 ，demo 在 /demo
pnpm lint              # ESLint
pnpm typecheck         # next typegen + tsc --noEmit
pnpm test              # Playwright E2E（端口守卫 + 自管 server，需先 pnpm exec playwright install chromium）
pnpm build             # production build（Turbopack）
pnpm qa                # Browser QA 全量扫描（自带 server，端口 3200）
pnpm check             # lint + typecheck + test + build + qa

pnpm factory:manifest  # 校验 visual-manifest.json（结构 + 上游比对）
pnpm factory:kits      # 依 Manifest 安装 Kits（默认 dry-run）
pnpm factory:kits --write
pnpm qa:doctor         # Kits doctor 质量门
```

> `pnpm test` 与 `pnpm qa` **不能同时运行**：Next 16 的 dev server 按项目加锁。

- 开发高保真交互原型时，请同时加载 `skills/interactive-prototype/SKILL.md` 的完整工作流。
- 完成原型、准备交付时，请加载 `skills/git-delivery/SKILL.md` 的 Git 交付工作流。