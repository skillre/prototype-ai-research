# Browser QA Standard

`pnpm qa` —— Factory v1.1 的浏览器质量门。跑在 `.qa/browser-qa.mjs`，配置在 `.qa/qa.config.mjs`。

这份文档说明**为什么**是这些判据。每一条都来自一次真实的假绿或真实回归，不是清单式的最佳实践。

---

## 怎么跑

```bash
pnpm qa                    # 全量扫描
pnpm qa --routes=/demo     # 只扫部分路由
pnpm qa --headed           # 看着它跑
QA_VERBOSE=1 pnpm qa       # 打印每一项通过
```

**路由、视口、主题、容差全部来自 `.qa/qa.config.mjs`。** 扫描脚本本身不知道任何路由名：默认从 `app/` 目录自动发现（`**/page.tsx`）。派生项目只需要改配置文件。

### 默认矩阵

| 维度 | 取值 |
|---|---|
| 视口 | desktop **1440×900**（fine pointer）· mobile **390×844**（coarse pointer + touch） |
| 主题 | dark · light |
| 路由 | `app/` 下自动发现的全部静态路由 |

动态段（`[id]`）无法静态发现，会被跳过并在输出里说明；具体路径写进配置的 `extraRoutes`。

---

## 1 · 三条移动端判据（不能只用一条）

**背景**：`scrollWidth - innerWidth > 0` 单独用会假绿。Chromium 在移动端会为溢出内容**自动扩张布局视口**——扩张之后 `scrollWidth` 和 `innerWidth` 一起变大，差值接近 0，看起来"没有溢出"，而页面实际上是按一个用户并不存在的宽度排版的。

所以三条一起查，缺一不可：

| # | 判据 | 通过条件 | 抓的是什么 |
|---|---|---|---|
| 1 | `abs(window.innerWidth - 请求宽度) <= 1` | 请求 390 就必须是 390 | 布局视口被扩张 |
| 2 | `documentElement.scrollWidth <= 请求宽度 + 1` | 不超出 | 内容真的比视口宽 |
| 3 | `scrollTo(9999, 0)` 后 `scrollX ≈ 0` | 不能横向平移 | 最终裁决：页面到底能不能左右滑 |

第 3 条是决定性的：前两条都是间接指标，只有它直接回答"用户能不能把页面滑出去"。

`tests/qa-probes.spec.ts` 里有一组测试用真实页面复现了三者各自的命中与静默，包括"裸判据接近 0 但 `innerWidth` 已经漂移"的那一类假绿。

---

## 2 · No Invisible Semantics

> **看得到 ≠ accessibility tree 看得到。**

`aria-hidden="true"` 会**剪掉整棵子树**，而屏幕上一切正常：布局没变、颜色没变、鼠标照样能点。只有屏幕阅读器和 `getByRole` 会看不到。

这正是 AI Finance 那次真实回归（K-01）的形状。当时产品为了绕过一个问题把 `aria-hidden` 加在了真实内容祖先上，视觉验收完全通过，而所有基于 role 的断言失效。

### 判据

对 `button` / `link` / `heading`，逐个比较：

```
DOM 中真正贡献语义的元素数  ==  无障碍树中该 role 的节点数
```

两边都必须排除框架开发浮层（`<nextjs-portal>`），否则比的是 Next 的调试按钮而不是你的应用。注意它藏在 shadow root 里——**`document.querySelectorAll` 穿不过 shadow 边界，无障碍树可以**。这是探针必须递归遍历 shadow root 的原因。

另外单独检查：**`aria-hidden` / `inert` 宿主里不得有可聚焦内容**。装饰性元素才允许 `aria-hidden`。

### 关于 pruned 的精确定义

| 写在祖先上 | 效果 |
|---|---|
| `aria-hidden="true"` | 剪掉整棵子树 |
| `hidden` / `inert` | 剪掉整棵子树 |
| `display:none` / `visibility:hidden` | 剪掉整棵子树 |
| `role="presentation"` / `role="none"` | **只去掉该节点自己的语义，不剪子树** |

最后一行是探针最容易写错的地方：把它当成剪枝会漏数（假通过），忽略它会误报不匹配。它必须在**候选元素自身**上判断，而不是在祖先链上。

---

## 3 · QA Probe Integrity

> **一个静默通过的探针，比没有探针更危险。**

真实事故的形状：

```js
const v = getComputedStyle(el).getPropertyValue('--x')   // 选择器没命中 → 0
Math.abs(coarse / fine - 1.5) > 0.02                      // 0/0 = NaN → 比较为 false
// → 断言通过。QA 报绿。这个特性从未被验证过。
```

NaN 与任何值的比较都是 `false`，所以"没量到"会被当成"满足条件"。

### 规则

所有数值探针必须经过 `.qa/probe-guard.mjs` 的 `measure()`：

- 首先 `Number.isFinite(value)`；
- `NaN` / `Infinity` / `undefined` / 非数字 → **fail loudly**；
- 得到 `0` 而本不应为零 → 失败（在实践中这几乎总是"选择器没命中"或"CSS 变量没在该元素上解析"，而不是真实的零）；
- 确实允许为零时显式传 `allowZero`；
- 比例类断言统一走 `expectRatio()`，让 `Math.abs(NaN - expected)` 这个坑只在一个地方被堵住。

`tests/qa-probes.spec.ts` 先复现裸比较确实会静默通过，再证明守卫会报错——两种行为都被固定下来。

> **CSS 自定义属性只在声明它的元素及其后代上可见。** 把探针挂到 `<body>` 上去读一个声明在 `.kits-grid` 上的变量，一定读到 0。这是上面那条规则最常见的触发原因。

---

## 4 · Reduced Motion / Coarse Pointer / 观察者失效

任何 Signature Component 都要经过三种状态。

| 检查 | 判据 |
|---|---|
| **reduced-motion** | `prefers-reduced-motion: reduce` 下内容完整可见；没有无限循环动画还在跑 |
| **coarse pointer** | touch 上下文下 `(pointer: coarse)` 必须命中；细指针必须不命中；粗细指针的间距/缩放比例必须有可测差异 |
| **观察者失效** | 删掉 `IntersectionObserver` 之后，内容**仍然可见** |
| **默认可见** | 不依赖任何动画/观察者，`<main>` 里就有可见文本；内容区块不得停在 `opacity: 0` |

最后两条防的是同一个失效模式：reveal-on-scroll 实现习惯把内容初始设为 `opacity: 0` 等观察者回调。观察者缺失、失败、或永远不触发时，内容就**永久不可见**——而任何"已经滚到位"的截图都看不出来。

**coarse pointer 必须是独立的 browser context**：`hasTouch` / `isMobile` 是 context 属性，不是 viewport 属性。改 `setViewportSize` 不会让 `(pointer: coarse)` 变成 true。

---

## 5 · Port Isolation

### 问题

Playwright 的 `reuseExistingServer` 会接受**任何**以 2xx/3xx 应答就绪 URL 的 HTTP server，**不做任何身份校验**。端口 3000 是 Next 的默认端口，于是：

- 一个残留的 dev server，或者同机的另一个原型，会被当成"被测应用"；
- 整套断言在**错误的页面**上通过；
- 更糟的是它不会失败——它报绿。

同机的兄弟项目已经各自规避了这一点（hub 固定 3100，finance 固定 3210），而 finance 的配置注释里**点名**了本仓库的 3000 是那个危险源。

### 规则

| 规则 | 实现 |
|---|---|
| 不复用 3000 | `.qa/qa.config.mjs` 的 `QA_PORT = 3200`（Factory 自己的槽位） |
| 不自动连接已存在的未知 server | `reuseExistingServer: false`，**永远**，不是 `!process.env.CI` |
| server 必须由当前 run 管理 | `pnpm dev --hostname ... --port ...` 显式固定端口，Next 不会自动 +1 |
| 完成后只停止自己启动的 process | `detached: true` spawn，`process.kill(-pid)` 杀**进程组** |
| 端口被占用时 fail loudly | `scripts/check-qa-port.mjs`，已接入 `pnpm test` |

### 为什么必须杀进程组

`pnpm dev` 是一层包装：杀掉 `pnpm` 进程会把真正的 `next-server` 孙子进程留成孤儿，而它仍然占着端口。第一版 QA 脚本就是这样漏的——下一次运行直接被端口守卫拦下。所以 spawn 时 `detached: true`，停止时杀掉整个进程组。

### 禁止

```bash
pkill -f "next dev"        # ✗ 会杀掉同机其它原型，甚至你自己的开发服务器
pkill -f "next-server"     # ✗ 同上
```

端口守卫在失败信息里直接写明了这一点——规则要出现在 Agent 真正会读到的地方，也就是失败现场。

---

## 6 · 其他每页检查

| 检查 | 判据 |
|---|---|
| console error | 0 |
| page error | 0 |
| request failure | 0（`requestfailed`，网络层失败也要抓，不只是 HTTP ≥ 400） |
| HTTP ≥ 400 | 0 |
| 横向溢出 | 见第 1 节 |
| 内容默认可见 | 见第 4 节 |

---

## 判据来自哪里

| 判据 | 来源 |
|---|---|
| 三条移动端判据 | 移动端 QA 假绿调查 |
| No Invisible Semantics | AI Finance K-01 回归（`aria-hidden` 剪掉真实内容祖先） |
| Probe integrity | AI Finance K-02 回归（`0/0 = NaN` 静默通过） |
| shadow DOM 感知 | Factory v1.1 首次全量扫描：每条路由都因 Next 调试浮层报 `DOM n ≠ AX n+1` |
| coarse pointer 用独立 context | 同上首次扫描：`setViewportSize` 不会改变 `(pointer: coarse)` |
| 进程组清理 | 同上首次扫描：`pnpm dev` 的孙子进程泄漏，端口被占 |
