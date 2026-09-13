# Signature Component · InsightReveal

> 内容进入视口时**按阅读顺序逐段揭示**。它解决的不是"好看"，而是**层级**。

| | |
|---|---|
| **内部 API** | `1.0.0` |
| **status** | `approved` |
| **performance** | **A** · ≈1.4 KB gzip · 共享单例观察器 |
| **SSR** | ✅ 兼容（**服务端 HTML 内容是可见的**） |
| **mobile** | ✅ 内建降级（位移减半） |
| **reduced-motion** | ✅ 内建降级（只留 opacity） |

---

## 1. 契约：产品只能这样调用

```tsx
import { InsightReveal } from "@kits/insight-reveal";

<InsightReveal step="group" shift="medium" blur>
  <div><h3>Insight 01</h3><p>…</p></div>
  <div><h3>Insight 02</h3><p>…</p></div>
</InsightReveal>
```

### Props

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `step` | `"one" \| "group"` | `group` | 整体揭示 / 逐段揭示 |
| `shift` | `"none" \| "subtle" \| "medium" \| "strong"` | `medium` | 位移档位 |
| `blur` | `boolean` | `false` | 景深模糊（只有 cinematic 非 0） |
| `once` | `boolean` | `true` | 只揭示一次 / 离开复位 |
| `as` | `"div" \| "section" \| "article" \| "ol" \| "ul"` | `div` | 语义元素 |
| `maxStagger` | `number` | `6` | 步进序号上限 |
| `children` | `ReactNode` | **必填** | 内容 |
| `disableMotion` | `boolean` | `false` | 仅产品级开关 |

### 明确不暴露（传入即契约违规）

`distance` · `duration` · `delay` · `easing` · `threshold` · `rootMargin` · `blurRadius` · 任何视觉字面量。

---

## 2. 同一份 JSX，三种节奏

| pack | 步进 | 位移 | 模糊 | 阅读感受 |
|---|---|---|---|---|
| editorial | **70ms**/段 | 10px | 0 | 像印刷品的段落顺序 |
| cinematic | **110ms**/段 | 24px | 6px | 像镜头依次对焦 |
| instrument | **25ms**/段 | 4px | 0 | 像扫描仪逐行点亮 |

```tsx
<InsightReveal step="group" blur>…</InsightReveal>
```

**同一份调用**。节奏住在 pack 的 `motion.ts` 里：

```css
transition-delay: calc(var(--kits-reveal-index, 0) * var(--kits-stagger-step));
```

- `--kits-reveal-index` 由**组件**写入（阅读顺序，0..maxStagger）；
- `--kits-stagger-step` 由**pack** 决定（节奏）。

两者相乘 → 产品改不了节奏，pack 改不了顺序。这就是"可替换"的定义。

> `blur` 在 editorial / instrument 下不会有任何效果 —— 因为那两个 pack 的
> `--kits-reveal-blur` 是 `0px`。组件不需要知道这个差异。

---

## 3. 三层降级（本组件最重要的设计）

```
第 1 层  JS 能力探测   没有 IntersectionObserver → 立即标记可见
第 2 层  动效偏好      prefers-reduced-motion / disableMotion → 立即标记可见
第 3 层  CSS 结构      隐藏规则必须带 .kits-reveal--animated 前缀
                       → JS 完全没跑起来时，内容本来就是可见的
```

第 3 层的写法是关键：

```css
/* ✅ 默认可见；只有"已动画 + 尚未进入视口"才隐藏 */
.kits-reveal { opacity: 1; }
.kits-reveal--animated:not([data-kits-visible="true"]) { opacity: 0; }
```

```css
/* ❌ 危险写法：隐藏是无条件的，"显示"依赖 JS */
.reveal { opacity: 0; }
.reveal.is-visible { opacity: 1; }
```

第二种写法下，一次脚本错误 = 整页空白。
第一种写法下，脚本全挂 = 内容照常可读（只是没有揭示动画）。

**验收方式**：关掉浏览器 JS，页面内容必须完整可读。
Playground 的 `/audit` 页对此有说明，测试里也有对应断言。

---

## 4. 无障碍（accessibility notes）

- **服务端 HTML 中内容可见** → 屏幕阅读器、爬虫、read-it-later 都能读到完整内容。
- **不改变 DOM 顺序或语义**：揭示是纯视觉增强，`as` 保证列表内容用 `ol`/`ul` 时语义正确。
- **`step="group"` 的宿主带 `role="presentation"`，绝不带 `aria-hidden`**。
  宿主里包的是**真实内容**（heading / button / link / listitem）；
  `aria-hidden="true"` 会把整棵子树从无障碍树剪掉 —— 按钮还在 DOM 里，
  但 `getByRole("button")` 命中 0，屏幕阅读器读不到整个揭示区。
  `role="presentation"` 只声明"本元素无语义"，**不剪枝**。
  （v0.1.0 用过 `aria-hidden`，这是一次真实的无障碍回归，见 CHANGELOG K-01。）
- **只动 `opacity` / `transform` / `filter`**，绝不用 `display: none` 或 `visibility: hidden`。
  否则键盘用户会被困在"看不见但可聚焦"的元素上（这是最常见的 reveal 组件无障碍事故）。
- **reduced-motion 下仍保留 opacity 淡入**：避免内容"突兀出现"看起来像加载失败。
  用户要的是**没有运动**，不是**没有设计**。
- 尚未揭示的元素**仍然可以聚焦**，Tab 顺序不受影响。

---

## 5. 移动端降级

| 条件 | 行为 |
|---|---|
| `pointer: coarse` / `hover: none` | 位移**减半**（CSS 层 ×0.5） |
| 同上 | 步进与时长沿用 pack 配置 —— 触屏用户同样需要阅读节奏 |

**不取消揭示**：移动端只是"轻一点"。原因是滚动过程中的大幅位移在小屏上
会让元素来回抖动，但阅读节奏本身对小屏更重要（屏小 = 一屏少量 = 更需要引导顺序）。

---

## 6. reduced-motion 降级

| 层 | 行为 |
|---|---|
| JS | `useMotionAllowed()` 为 false → 立即标记可见，不创建观察 |
| CSS | `@media (prefers-reduced-motion: reduce)`：`transform: none !important`、`filter: none !important`、`transition-delay: 0ms` |

结果：**只保留 opacity 淡入**，信息零损失。

---

## 7. SSR / Next.js 兼容性

**这一条是本组件相对同类库的关键差异。**

- 服务端产出的 HTML **内容是可见的**（没有 `--animated` 类）。
- 因此：SEO 正常、首屏可访问、爬虫不会读到空白、`view-source` 就能看到内容。
- 对比之下，"默认隐藏 + JS 显示"的实现在 SSR 下会输出一个空页面。
- 首帧 `data-kits-visible="false"` 且无 `animated` 类 → 可见；
  挂载后才可能隐藏并揭示 → **无 hydration mismatch**。
- 渲染期不读 `window`/`document`；观察器在 `useEffect` 内创建。
- 另有 `@media (scripting: none)` 作为第三层兜底。

### 与其他 reveal 库的关键差别

| | 常见实现 | InsightReveal |
|---|---|---|
| 默认 CSS 状态 | 隐藏 | **可见** |
| JS 失败时 | 整页空白 | 内容照常 |
| SSR 首屏 | 空 | 完整内容 |
| 键盘可达性 | 可能被困 | 不受影响 |

---

## 8. 性能分级

**A**

| 项 | 值 |
|---|---|
| gzip | ≈1.4 KB |
| IntersectionObserver | **1 个 / 页面**（模块级单例，20 段落仍然只有 1 个） |
| 动画属性 | `opacity` / `transform` / `filter`（无布局属性） |
| 揭示完成后 | `will-change: auto` 释放合成资源 |

**约束**：
1. 不要嵌套 InsightReveal（步进会叠加成不可预测的延迟）。
2. `maxStagger` 默认 6 —— cinematic 下最长等待 660ms；如需更长列表，用 `step="one"`。
3. 首屏以上的内容不要包 InsightReveal（用户立刻要看的东西不该等动画）。

---

## 9. Changelog

| 版本 | 变更 |
|---|---|
| `1.0.0` | 首个稳定版：step / shift / blur / once / as / maxStagger + 三层降级 |
