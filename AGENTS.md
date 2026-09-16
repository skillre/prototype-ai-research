<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Prototype AI Research — Agent Instructions

这是一个**AI 研究论证工作台**：把「研究问题 → 论断 → 原文片段 → 来源」连成一条可以逐条核对的
纵向论证链，并如实呈现缺口。只做「Frontend + local state + realistic mock data」。

> 本仓由 Factory baseline 派生，因此仍然**读起来像 Factory**：开发原则、Browser QA、Kits、
> Git 流程这些块是 Factory Core 的规则，逐条照抄。**产品语义与领域规则是本仓自己的**
> （`## 领域层`、`## 产品语义不变量`、`## 文案与本地化`），不要拿 baseline 的示例去覆盖它们。

## 项目边界

- ✅ Next.js 16 App Router · TypeScript · Tailwind v4 · pnpm
- ✅ shadcn/ui（**base-nova 风格，基于 Base UI**，而非 Radix）· Motion 13 · Zustand 5 · Recharts 3 · dnd-kit · Playwright
- ✅ DSH 宿主侧的**多 Subagent 编排**：允许并要求——边界与判据见下方 `factory-core-policy` 管理块。
- ✅ GitHub Actions **只作为 CI 质量门**（`.github/workflows/ci.yml`）：策略门禁 · Visual Manifest · 初始化边界 · 语义契约 · Kits doctor · lint · typecheck · build · test · qa。**部署仍然不是 CI 的事**——由 Vercel Git Integration 负责。
- ❌ 禁止加入 Database / Supabase / Authentication / Docker / Kubernetes / Monorepo / Turborepo / Microservices / Backend service / MCP / Cloudflare / 任何新的 deployment platform。这些以后再处理。
- ❌ 禁止在**产品应用代码**里引入编排框架或编排运行时——这才是旧版那句「Multi-agent orchestration」真正要守的东西。
- ❌ 禁止 Vercel API & CLI automation（deployment token / bypass secret / `vercel` 命令自动化）：部署授权是人的决定，不是构建的副作用。

<!-- BEGIN:factory-core-policy v1.3.0 -->
> 本块由 `pnpm factory:agents --print-block` 从 `factory-policy.json` 渲染，`pnpm factory:agents` 逐字校验。
> **不要手工编辑块内文字**：改 `factory-policy.json`（其关键值由 `lib/factory-policy.schema.json` 钉住），再同步本块。块外仍是人类写的文档。

## Factory Core Policy v1.3.0（Agent 编排与并发）

- **Agent 编排边界（是边界，不是禁令）**：**允许并要求**在 **DSH 宿主**内用多 **Subagent** 拆分与并行任务；
  **禁止**在**产品应用代码**里引入编排框架或编排运行时。
  - 允许：宿主内拆分/并行只读或彼此独立的任务；宿主的 Subagent 调用不属于产品代码。
  - 禁止：产品应用代码及其运行时依赖（app/components/lib/hooks/stores/scripts）里出现 agent framework / orchestrator runtime / 多 agent 调度依赖。
  - 判据：`app` `components` `lib` `hooks` `stores` `scripts` 不得 import 编排 SDK；`package.json` 的运行时依赖不得出现编排框架。宿主侧的 Subagent 调用不是产品代码，不受此限。
- **模型路由**：provider `opencode-go-dsv41` / model `deepseek-flash` / reasoning effort `max`（2026-09-15 与 DSH 模型目录核对）。Subagent 默认走这条路由；改路由先改 `factory-policy.json`。
- **单 worktree 单写者**（`single-writer`）：同一棵工作副本同一时间只有一个写者；要并行写就各自独立 worktree。两个写者共享一棵树，冲突不是概率问题，是时间问题。
- **共享路径单 owner**（`single-owner`）：`AGENTS.md`、`package.json`、`factory-policy.json`、`factory.lock.json`、契约 schema 与门禁脚本这类共享面，同一时间只有一个 owner，其余 agent 只读。
- **test / qa 串行**（`serial`）：`pnpm test` 与 `pnpm qa` **永不并发**（Next 16 dev server 按项目加锁，并行只会在错误的 server 上出结果）。CI 里同样不得拆成两个并行 job。
- **HVA（人工视觉验收）**：`required-before-release` —— 没有 HVA 就没有发布；Agent 不能替人验收，未完成时状态只能是 `READY FOR HUMAN VISUAL ACCEPTANCE`。
- **部署授权**：`explicit-user-authorization` —— 源码发布 ≠ Production 部署。没有用户明确授权，不创建/提升 Production 部署、不改 Deployment Protection、不 push Production Branch。详见 `docs/vercel-bootstrap.md` 第 0 节与 `docs/release-runbook.md`。

机器可读副本：`factory-policy.json` · 关键值：`lib/factory-policy.schema.json` · 基线锁：`factory.lock.json` · 校验器：`scripts/guard-agent-policy.mjs`（`pnpm factory:agents`）。
<!-- END:factory-core-policy -->

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

## Browser QA 规则（Factory v1.1 标准 · v1.2 执行器）

对于重要交互，**不能只通过源码阅读判断**。必须真实打开浏览器执行。

```bash
pnpm qa            # 全量：所有路由 × 桌面/移动 × 明暗 + 能力探针
pnpm qa --routes=/demo
```

**执行器是共享的**：`pnpm qa`（LOCAL_MANAGED，自己起 server、自己停）与 `pnpm qa:online`
（REMOTE，扫一个已经存在的 URL）跑的是**同一份扫描器** `.qa/sweep.mjs`——检查项、阈值、
矩阵、style-presence 通道全部复用，只有 origin 与请求头不同。**两套实现等于两套真相**，
而分歧时报告的永远是较弱的那一套。

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
- **`DOM == AX` 是必要条件，不是充分条件。** 剪枝会同时从两侧移除节点，整块内容被隐藏时两侧数量依然相等。
  真正的检测器是配套的「`aria-hidden` 宿主内不得有可交互内容」扫描。**两条检查必须同时存在**，
  任何一条被删掉，这一类回归都会重新变成静默通过。

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

### Style Presence（这一页不是一份没写 CSS 的 HTML）

**App Router 按模块图打包 CSS。** 某条路由的入口组件没有 import 那份样式表，样式就永远到不了浏览器——
而不报错、不警告、DOM 完整、所有按 testid 的断言全部通过。第三个 Prototype 真的发布过这样一条路由。

`pnpm qa` 现在把每条路由与**同一个浏览器**里渲染的**未加样式基线**做差，要求至少在
`stylePresenceMinChannels` 个独立样式域（`box-reset` · `type` · `surface` · `ink`）上不同。

**禁止**用这些代理指标替代：`styleSheets.length > 0` · CSS 请求存在 · 只检查 CSS 变量是否声明 ·
`fontFamily !== ""`（UA 默认字体也是非空字符串）· 引用产品专属 class · 注入 debug marker。

**已知边界**：它检测的是**整页处于浏览器默认态**。根样式表加载了、只有路由自己的样式表缺失时，
产品必须自己写断言（那是产品知识，Factory 无从猜测）。见 `docs/browser-qa.md` 第 7 节。

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

### 在线 QA（REMOTE）

**本地绿了不等于部署上是对的。** `pnpm qa:online` 用**同一个** `.qa/sweep.mjs` 扫一个已经存在的 URL：

```bash
pnpm qa:online --base-url=<url> --identity=<deployment.json> --expect-sha=<rc-sha>
```

- **不是两套真相**：探针、判据、矩阵、style-presence 通道、DOM==AX 配套扫描全部复用；
  只有 origin 与请求头不同；
- **只观察，不编排**：不部署 · 不 promote · 不 merge · 不 tag · **永不创建 bypass token** ·
  不启动本地 server · 不持久化凭证；
- secret 只能由用户通过 `QA_ONLINE_BYPASS_SECRET` 提供（→ `x-vercel-protection-bypass` 头），
  **不打印、不持久化、不提交**；没有 secret 时停下来说明；
- **受保护（302 跳 SSO / 401 / 403）既不是部署失败，也不是 public**；
- **身份先于 QA**：给了 `--expect-*` 却没给 `--identity` → 不跑；
  期望值与部署记录不一致 → **跑 QA 之前** STOP。

详见 `docs/browser-qa.md` 第 8 节、`docs/release-runbook.md`。

### T1：dev-server manifest 竞态不是产品缺陷

只在 Turbopack dev server 下出现、日志里是路由 manifest 的 JSON 解析错误（读到写入中的文件）、
**重跑即绿**，且从未在 `next start` / Preview / Production 上复现 —— 三条同时成立才算 T1：
**重跑一次并记录，不要去改产品**。**「跑得慢」不等于 T1**；任何一条不成立就按真实失败处理。
见 `docs/browser-qa.md` 第 9 节。

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

```bash
pnpm factory:agents    # 策略门禁：编排边界 / 管理块 / schema 关键值 / CI 契约（check 的第一项）
pnpm factory:manifest  # Visual Manifest：L1 结构 + L2 自洽 +（Kits 在场时）L3 上游比对
pnpm factory:init      # 初始化边界：stage=product、baseline / sample 身份残留、0-scan
pnpm factory:contract  # 产品语义不变量：声明 ↔ 测试登记，双向核对
pnpm qa:doctor         # Kits 安装状态是否可信
```

`pnpm check` 会依次跑完 **`pnpm factory:agents && pnpm factory:manifest`** 加上面五项——
**策略门禁是第一项**，由 `scripts/guard-agent-policy.mjs` 机器校验（`check` 必须以
`pnpm factory:agents &&` 开头）。顺序不是风格：「先过政策，再谈绿」。一个在绿树之外的策略门禁等于没有门禁。

### Visual Manifest 的上游比对：两种模式，说清楚哪一种

`pnpm factory:manifest` 只有在**能找到 Kits registry** 时才算一次上游比对。找不到时它照样做
L1（结构）与 L2（自洽 / deviations / budget），但会打印 `[upstream-unavailable]` 并**明说本次没有比对**——
`pnpm factory:manifest` 与 `pnpm factory:manifest --kits ../prototype-kits` 因此不是同一句话，
报告里的 `status` 才是它是哪一种。

```bash
pnpm factory:manifest --kits ../prototype-kits   # 真比对：registry id 是否 approved + pack profile（L3）
pnpm factory:manifest                            # 自动发现；找不到 Kits 就是 upstream-unavailable
```

CI 同样只有这两种模式（`.github/workflows/ci.yml` 的 KITS REGISTRY 一节）：配置了
`KITS_REPO_TOKEN` 就按**固定 commit** checkout `skillre/prototype-kits` 真比对，否则退化为诚实模式
并打一条 `upstream-unavailable` warning annotation。**绿 ≠ 比对过**，这句话在 CI 里也是真的。

### 已知未完成项（不是通过）

- **F5 / N1（Core Neutrality 迁移）**：`components/prototype/loading-state.tsx` 仍是 v1.1 的形状
  （带 `METRIC_DIVIDERS` 的示例性 composition），且本仓没有 `app/_sample/`。规格里对应的那条测试
  标成 `test.fixme`，所以 `pnpm test` 会显示 **1 skipped**。

> **skip 不是 pass。** `test.fixme` 的语义是「已知没做」，不是「已经通过」；发布证据里
> **不许**把这次 skip 记成「test 门禁全绿」。`tests/init-boundary.spec.ts` 里有一条**不会被跳过**的
> 测试钉住这件事——删掉 fixme 会让它失败，所以这份债不能悄悄消失。
> 做迁移的那一轮（把 Core 的性格移进 `app/_sample/`）应当把它变成真正的断言，而不是继续带着它。


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

### 部署授权（Vercel）

**这是基础设施边界，不是构建配置。完整契约见 `docs/vercel-bootstrap.md` 第 0 节。**

没有用户**明确授权**时，不得：

- 创建 Vercel Project · link project · 修改 Production Branch · 修改 Deployment Protection
- 创建 Production deployment · 把 Preview 提升为 Production · 创建 automation bypass secret
- **push 到项目的 Production Branch**（它可能自动创建 Production deployment）

另外四条：

1. **push Production Branch 之前先探测再决定。** Production Branch 未知时也要 **STOP**——
   "不知道"不是"不会触发生产"。**不允许先 push 再 cancel**：Production 建起来之后 cancel 不是回滚。
2. **部署身份必须验证 `target` / `git ref` / `git SHA` / `readyState`，不能靠 URL。**
   `gitSource` 的 target 语义不能猜，要回读。
3. **受 SSO 保护的 URL 不得称为 public。** 只有匿名请求 2xx 才支持 "public" 这个说法。
4. **`vercel curl` 会顺带创建 automation bypass secret。** 执行前说明，或执行后立即披露——
   包括它是否仍然存在。不得当普通 curl 处理。

```bash
node scripts/verify-deployment.mjs actions     # 授权矩阵
node scripts/verify-deployment.mjs preflight --branch <b> [--production-branch <p>] [--authorized]
node scripts/verify-deployment.mjs verify --deployment <json> --rc <accepted-sha>
node scripts/verify-deployment.mjs access --status <code> [--location <url>]
```

发布到 Production 时：**Production 部署的 SHA 必须等于已验收 RC 的 SHA**（`pnpm factory:deploy`）。

### 发布（RELEASE）

**完整顺序见 `docs/release-runbook.md`。** 发布不是一次 push，是一个 commit 依次过门：

```
RC SHA → 本地门禁 → Preview(同一 SHA) → 在线 QA → 人工视觉验收
       → 源码发布 → Production(同一 SHA) → annotated tag → housekeeping
```

1. **RC 是一个明确的 SHA**，不是「feature branch 上最新的 commit」。定了 RC 就不要再往同一分支推新 commit。
2. **状态不是布尔**：`NOT READY` → `READY FOR HUMAN VISUAL ACCEPTANCE` → `READY TO RELEASE SOURCE`
   → `READY TO DEPLOY PRODUCTION`。**没有 `READY FOR RELEASE` 这个状态**：
   HVA 未完成时只能是 `READY FOR HUMAN VISUAL ACCEPTANCE`。
3. **源码发布 ≠ Production 部署。** merge `main` 与「创建 Production deployment」是两次独立授权。
4. **在线 QA 跑在部署上**（`pnpm qa:online`）：本地绿了不等于部署上是对的。
   REMOTE 模式是**观察者**：不部署、不 promote、不 merge、不 tag、**不创建 bypass token**；
   secret 只能由用户通过 `QA_ONLINE_BYPASS_SECRET` 提供，且不打印、不持久化、不提交。
5. **受保护不是失败，也不是 public。** 没有 secret 时 runner 停下来说明，不报假绿。
6. **Production 验收是多证据**：target / ref / SHA == RC / alias 正在服务 / 核心路由 HTTP /
   Production 在线 QA。`readyState: READY` 必要但不充分；平台的 `live` 字段**不作为判据**。
7. **tag 必须是 annotated，且 target == 已验收 RC SHA**；不要 `git push --tags`。
   PR 走 ff-only 时不要假设 `mergeCommit.sha` 存在，也不要为了「有个 SHA 可引用」而制造 merge commit。
8. **housekeeping 不是可选项**（九项）：bypass secret 是否已清理 · 临时 credential 是否清理 ·
   Deployment Protection 未被改动 · working tree clean ·
   local/origin/tag SHA 对齐 · 截图与报告不在 repo 内 · 被取消的 deployment 只作历史 ·
   feature branch 去留已决定 · 文案/polish 进 backlog（**不偷偷塞进已验收的 SHA**）。

机器判据在 `scripts/lib/release-contract.mjs`（授权/身份/可访问性一律 re-export 自 Phase A DEPLOY 契约，没有第二份实现）。

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
Understand → Inspect → Product Model
→ Product Semantic Invariants  ← 先定义「绝不能搞错什么」，登记进 product-contract.json
→ Art Direction Divergence   ← 这个产品为什么不该长得像 Reference Sample / 上一个 Prototype？
→ Visual Manifest            ← 把决定写下来（含 intentional deviations）
→ 【Human Art Direction Gate：九问，人工确认】
→ kits add → Build → Invariant tests → Browser QA → Test → Preview
→ Visual Acceptance → Release
```

- **Divergence 先于 Manifest。** 在继承任何已有视觉模式之前，先给出 divergence statement：
  禁止 dashboard hero / 不用 sidebar 作主结构 / 不采用 card grid / mobile 必须重新编排……
  Starter 与 Style Pack 会施加一个重力场；不说话，产出就会朝它塌下去。它是**人的输入**，不是生成物。
- **任何业务 Prototype 在 UI 实现前必须先产出 `visual-manifest.json`。**
  没有 Manifest 就开始写 JSX = 违规。`pnpm factory:kits` 会直接拒绝。
- **与 pack 默认不一致的地方必须记进 `deviations`**（`axis` / `from` / `to` / `reason`）。
  偏离是**记录，不是自动批准**：它不能绕过 `avoid`，链接轴（`density` / `motion`）还必须与对应字段一致。
  没记录的偏离 = 下一个人眼里的笔误。
- **签名组件数量上限由人写进 `signatureComponentBudget`。** Factory 守住你写的数，不替你定数；
  没写就只是 warning（不假装通过）。0 个是合法决定。
- **校验分三层**：L1 字段合法性 → L2 Factory 自洽 → L3 与所选 pack 的 profile 比对
  （`motion.language` / `profile.density`，只在 Kits 在场时）。**L3 没跑就说没跑，不写成 PASS。**
- **Agent 不能在没有 Manifest 的情况下默认生成 generic AI SaaS visual。**
  默认审美（卡片 + 阴影 + 渐变 + 紫色）会主动回拉，Manifest 就是那道闸门。
- **Manifest 里 `firstVisual` 与 `avoid` 是强约束**，由校验器强制。
- **Art Direction checkpoint 是人工决定**：选哪个 pack、第一视觉是什么、不要什么。
  Agent 不能替人做这个决定，也不能不记录就跳过。
- 详见 `docs/visual-manifest.md`；创作语义见 Kits 的 `skills/visual-direction/SKILL.md`。

- **本产品的现状**：`visual-manifest.json` 里有 **2 条已记录的偏离**（`density`、`motion`），
  各自带着理由与出处；**签名组件上限未声明**——那是人的决定，Factory 不代填，gate 会以 warning
  说出来而不是假装通过。上游比对（L3）对着 registry 0.2.0 跑过，状态是 `verified`。

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
- 词典负责**界面文案**；**业务记录内容**（研究问题、论断、原文片段、来源标题）留在 `lib/research/`，不做翻译。
- 路由 slug 保持英文，界面显示中文。新增 locale 只需在 `lib/i18n/` 增加一个 `Messages` 形状的文件。
- 允许保留原文的只有：品牌名、URL、Email、技术栈名称、代码、键盘快捷键。这份白名单集中在 `tests/support/localization.ts`，并断言 `LOCALIZED_ROUTES` 里的每条路由（含浮层）零泄漏。
  **产品页面出现后，把它加进 `LOCALIZED_ROUTES`。** 不要预先登记尚未实现的路由——那会让这个 spec 在上线前就假绿。

## 领域层（lib/research/）

本产品的业务真相只有一个来源：**纯 TypeScript 领域层**。它不依赖 React、不依赖网络、不依赖时间。

```
types.ts        实体与值类型。只有形状，没有行为。
projections.ts  所有派生值的唯一来源（活跃/历史投影、证据强度、依据状态、引用完整性）
tensions.ts     张力推导（派生事实）+ 处置合并
trace.ts        append-only 轨迹与查询
operations.ts   唯一允许修改数据的入口，状态与轨迹原子同写
ai-reviewer.ts  AI 输出的数据契约与校验（无模型调用）
dataset.ts      确定性 mock 数据集
```

**四条不可协商的规则：**

1. **同一计算不能有第二份实现。** 界面里显示的每一个数字——引用数、证据强度、缺口——都必须来自领域层。页面里重算一次就等于开了一个会静默漂移的第二事实来源。
2. **派生值从不存储。** 证据强度、依据状态、张力事实全部在读取时算。`ResearchData` 里**没有** `tensions` 数组，这是刻意的。
3. **撤回不是删除。** 没有 `deleteClaim` / `deleteLink`，也不会有。论断用 `status: "retracted"`，链接用 `retiredAt`。历史投影永远查得到。
4. **只有一种人写的关系原语：`EvidenceLink`。** 不要引入 `ClaimRelation` / `GraphEdge` / `RelationNode`。Claim ↔ Claim 的冲突由数据推导成 `Tension`。

**改动领域层之前先读 `tests/invariants.spec.ts` + `product-contract.json`。** 那 **18 条**不变量是这个
产品的规格书，不是测试的附属品；它们的机器可读 id 登记在 `product-contract.json`，由
`pnpm factory:contract` 双向核对（见下节）。

**唯一的关系原语：** `Passage ── EvidenceLink ──> Claim`，stance 为 `supports` / `contradicts` / `qualifies` / `context`。
`contradicts` 是信息量最大的一类——工具普遍只记录「我引用过这个」，不记录「这段材料其实在反驳我」。

## 产品语义不变量（Product Semantic Contract）

**视觉回答「长什么样」；语义回答「绝不能搞错什么」。两者分开。**

`product-contract.json` 是产品语义约束的登记面，**不是** Visual Manifest 的一部分：

```json
{ "schemaVersion": 1,
  "invariants": [
    { "id": "resolved.requires-fact-change",
      "statement": "把张力标记为「已解决」必须伴随一次真实的事实变更，而不只是状态字段被改写。",
      "enforcement": "test" } ] }
```

- **id 机器可读、与语言无关**（点分小写 kebab），不依赖中文文案，也不依赖测试标题；
- **测试用 `tests/support/product-contract.ts` 的 `invariant(id, title, …)` 登记**同一个 id；
- `pnpm factory:contract` **双向核对**：声明了没登记 → FAIL；登记了没声明 → FAIL；
- **0 条合法**，但它必须是一个决定（gate 会以 warning 说出来）；
- **Factory 不生成、不推断、不改写任何一条**：不许从代码猜 invariant、从 UI 猜状态机、
  自动生成 statement 或领域测试。判断是人做的。

本产品有 **18 条**，全部在 `tests/invariants.spec.ts` 里，每条都带负例。`invariant()` 的调用写在
**对应的 `test.describe` 内部**——登记紧挨着持有它的那些测试。因此 `N · id` 形式的标题被保留：
**标题给人读，id 给机器查**，两者不互相替代。

## 初始化边界（Initialization Boundary）

**`prototype-starter` 里住着三种东西，处置方式完全不同：**

| 层 | 路径 | 派生新原型时 |
|---|---|---|
| **A · Factory Core** | `components/**` `lib/**` `scripts/**` `.qa/**` `hooks/**` `stores/**` `skills/**` 与 Core 契约测试 | **复制** |
| **B · Reference Sample** | `app/demo/**` `lib/mock-data.ts` 与示例测试 | **参考，默认删除**；保留就必须显式标注 |
| **C · Initialization Surface** | `package.json` `README.md` `app/layout.tsx` `app/page.tsx` `app/not-found.tsx` `lib/i18n/zh-CN.ts` | **必须重写** |

边界是机器可读的：`init-contract.json` + `pnpm factory:init`。

- 本仓 `stage: "product"`：初始化面上不得残留 baseline 身份（包名、`app/layout.tsx` 的标题、
  Factory 落地页标记），Reference Sample 只能在 `sampleOwned` 的路径里说自己的名字；
- 扫描有 `scanned / excluded / violations`，**0 scanned 不能 PASS**；
- **本仓保留了 `/demo`**（`app/demo/**` + `lib/mock-data.ts` + 两个 demo spec 列在 `sampleOwned`）。
  它是被有意保留的 Reference Sample，不是残留；首页的 `/demo` 入口带 `data-reference-sample` 标注。
- `sampleMarkers` 只列**已被移除**的 CRM 参考产品的身份（`智悟云` / `zhiwu.cn`）。`/demo` 自己的
  品牌文案仍在 `lib/i18n/zh-CN.ts` 的 `demo` 组里——这是「决定保留该示例」的代价；把它一并列成
  禁止项，会让 `pnpm factory:init` 在「有意保留示例」这个**正确**状态下失败，从而逼出一个假的
  豁免。**这是一条被写下来的取舍，不是漏检**；要彻底清掉它需要把 demo 文案移出产品词典，
  那属于 UI 迁移，不在本轮范围内。

**完整清单（13 步，人工执行）见 `docs/product-initialization.md`。**

> **Shell 是可选能力**：`Sidebar` / `TopNav` / `MobileNav` 由产品按需使用，
> `app/layout.tsx`（Core）不得引入任何一种产品 IA（有 contract test 守着）。
> 本产品的产品路由（`/r/[researchId]` 及其交付物）**没有用 shell**——它自带
> `research-shell.css` 那一套编排；唯一把 shell 接起来的是保留下来的 `/demo` 示例。


## Zustand 约定

- selector 只取**原始值**，派生（filter/sort/计数）在组件内用 `useMemo`。**禁止在 selector 里返回新数组/新对象**（zustand v5 会无限渲染）。
- 领域层的派生函数是纯函数，可以从 selector 里直接调；**不要把派生值塞进 store**。

## 常用命令

```bash
pnpm dev               # http://localhost:3000 ，demo 在 /demo
pnpm lint              # ESLint
pnpm typecheck         # next typegen + tsc --noEmit
pnpm test              # Playwright E2E（端口守卫 + 自管 server，需先 pnpm exec playwright install chromium）
pnpm build             # production build（Turbopack）
pnpm qa                # Browser QA 全量扫描（自带 server，端口 3230）
pnpm qa:online         # 在线 QA（REMOTE：扫一个已存在的 URL，不部署、不建 token）
pnpm check             # factory:agents + factory:manifest + lint + typecheck + test + build + qa

pnpm factory:agents    # Agent 策略门禁（管理块 ↔ factory-policy.json；--print-block 同步块）
pnpm factory:manifest  # Visual Manifest（L1 结构 + L2 自洽；--kits <path> 时做 L3 上游比对）
pnpm factory:init      # 初始化边界（baseline / product、身份残留、0-scan）
pnpm factory:contract  # 产品语义不变量：声明 ↔ 测试登记，双向核对
pnpm factory:deploy    # 部署授权与身份（preflight / verify / access / actions）
pnpm factory:kits      # 依 Manifest 安装 Kits（默认 dry-run）
pnpm factory:kits --write
pnpm qa:doctor         # Kits doctor 质量门
```

> QA 端口是 **3230**（`.qa/qa.config.mjs` 的 `QA_PORT`）。3200 是 baseline 的槽位，同机还有
> s1 / kits 在跑——端口是独占资源，见根工作区 `catalog/ports.json`。

> `pnpm test` 与 `pnpm qa` **不能同时运行**：Next 16 的 dev server 按项目加锁。

- 开发高保真交互原型时，请同时加载 `skills/interactive-prototype/SKILL.md` 的完整工作流。
- 完成原型、准备交付时，请加载 `skills/git-delivery/SKILL.md` 的 Git 交付工作流。