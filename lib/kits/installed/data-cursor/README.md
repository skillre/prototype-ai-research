# Signature Component · DataCursor

> 把系统光标换成**有语义的探针**：悬停在数据元素上时，指示器显示该点的读数。

| | |
|---|---|
| **内部 API** | `1.0.0` |
| **status** | `approved` |
| **performance** | **B** · ≈1.5 KB gzip · 0 运行时依赖 |
| **SSR** | ✅ 兼容（首帧无指示器节点） |
| **mobile** | ✅ 内建降级（完全不激活） |
| **reduced-motion** | ✅ 内建降级（完全不激活） |

---

## 1. 契约：产品只能这样调用

```tsx
import { DataCursor } from "@kits/data-cursor";

<DataCursor mode="ring" inspection hideNative>
  <button
    type="button"
    data-cursor="inspect"
    data-cursor-label="P99 · 184ms"
  >
    <span className="kits-label">P99</span>
    <span className="kits-data">184ms</span>
  </button>
</DataCursor>
```

### Props

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `mode` | `"dot" \| "ring" \| "crosshair"` | `ring` | 形态（尺寸由 pack 决定） |
| `inspection` | `boolean` | `true` | 是否解析 `data-cursor*` |
| `hideNative` | `boolean` | `true` | 仅隐藏**标记区域内**的系统光标 |
| `zIndex` | `number` | `60` | 指示器层级 |
| `children` | `ReactNode` | **必填** | 被包裹的内容 |
| `disableMotion` | `boolean` | `false` | 仅产品级开关 |

### DOM 契约（这是产品唯一依赖的接口）

| 属性 | 取值 | 效果 |
|---|---|---|
| `data-cursor="inspect"` | — | 悬停时环放大 + 显示读数标签 |
| `data-cursor="interactive"` | — | 悬停时环收紧 + 点亮 |
| `data-cursor-label="…"` | 字符串 | 标签文本（截断至 48 字符） |

### 明确不暴露（传入即契约违规）

`size` · `color` · `ringColor` · `lerp` · `spring` · `followSpeed` · `blendMode` · 任何视觉字面量。

---

## 2. 为什么 `hideNative` 需要三条前提

隐藏系统光标是一个**有真实风险**的决定：如果指示器因为任何原因没渲染
（JS 失败、图层被裁切、浏览器不支持），用户就"失去光标"了。

因此组件只在三条**同时**成立时才激活：

```
精确指针（hover: hover + pointer: fine）
  AND 允许动效（未 reduce + 产品未关闭）
  AND 已挂载（客户端）
```

三条任一不满足 → 组件完全不激活：不注册监听、不渲染指示器、**不隐藏系统光标**。

而且即使激活，`hideNative` 也只作用于 `[data-cursor]` 被标记的元素：

```css
.kits-cursor-root--active.kits-cursor-root--hide-native [data-cursor] {
  cursor: none;
}
```

页面其余部分（输入框、段落、链接）保留正常的系统光标 ——
用户永远不会在需要文本选择的地方失去 I 形光标。

---

## 3. 实现要点

- **指示器节点按需渲染**：未激活时**根本不渲染**（不是 `display: none`），
  避免留下参与合成的不可见层。
- **只写 CSS 变量**：指针坐标写入 `--kits-cursor-x/y`，
  形态变化由 pack 的 `--kits-dur-quick` / `--kits-ease-spring` 驱动。
- **`position: fixed` + `translate3d`**：完全脱离文档流，不参与任何布局。
- **一次 rAF 一次写入**：`pointermove` 只记录坐标，实际写变量在下一帧合并。
- **`closest('[data-cursor]')`**：祖先链查询（不是全文档查询），
  复杂度与元素深度成正比。

---

## 4. 无障碍（accessibility notes）

**最重要的一条契约**：

> `data-cursor-label` 承载的信息**必须同时存在于可见文本中**。
> 光标标签是**增强**，不是唯一的信息载体。

理由很直接：触屏用户、键盘用户、屏幕阅读器用户、reduced-motion 用户
**全都看不到这个标签**。如果读数只存在于 `data-cursor-label` 里，
那这四类用户就都拿不到数据了。

其余要点：

- 指示器与标签全部 `aria-hidden="true"` —— 屏幕阅读器只读 DOM 里的真实文本。
- `data-cursor="interactive"` 只是**视觉反馈**：可交互语义必须由真实
  `<button>` / `<a>` 提供（见 demo：标记挂在一个真实 button 上）。
- 标签文本截断至 48 字符，防止撑破指示器；截断不导致信息丢失（完整信息在 DOM 中）。
- 指示器颜色来自 `--kits-cursor-color`，pack 保证非文本对比 ≥ 3:1。

### 键盘用户

组件不参与键盘交互。键盘用户通过 Tab 到达真实控件，
读取其**可见文本**（这也是上面那条契约存在的原因）。
`data-cursor` 标记不产生任何键盘可达性变化。

---

## 5. 移动端降级

| 条件 | 行为 |
|---|---|
| `pointer: coarse` / `hover: none` | **完全不激活**：不注册 pointermove、不渲染指示器、不隐藏系统光标 |
| 同上（CSS 兜底） | 即使激活状态被误判，`cursor: auto` 恢复系统光标 |

`data-cursor` / `data-cursor-label` 标记保留在 DOM 中但无效果 ——
它们只承载增强信息，隐藏后不影响任何功能。

**触屏用户零信息损失**（因为标签信息本来就在可见文本里）。

---

## 6. reduced-motion 降级

组件不激活：不渲染指示器，系统光标照常显示。
CSS 层另有 `@media (prefers-reduced-motion: reduce)` 把 transition 全部置 `none`，
应对"用户运行中改系统偏好"的情况。

标签信息不丢失 —— 它同时存在于可见文本里（契约要求）。

---

## 7. SSR / Next.js 兼容性

- **服务端产物里没有指示器节点**：`active` 依赖 `mounted`（`useEffect` 后才 true）。
- 因此服务端 HTML 与客户端首帧完全一致 → **无 hydration mismatch**。
- 系统光标在挂载完成前保持默认形态 —— 服务端产物永远可用。
- 渲染期不读 `window` / `document`；`pointermove` 监听在 `useEffect` 内注册/注销。
- 组件无随机数、无时间戳。

---

## 8. 性能分级

**B**

| 项 | 值 |
|---|---|
| gzip | ≈1.5 KB |
| 每帧成本 | 2 次 `setProperty`（dot + ring），rAF 合并 |
| 查询 | 每次 pointermove 一次 `closest()`（祖先链） |
| 常驻合成层 | 激活时 2 个（dot + ring），未激活时 **0 个** |

**约束**：
1. 一个页面只放**一个** DataCursor（多个会互相争抢 cursor: none）。
2. 不要在 `pointermove` 里再加自己的坐标逻辑 —— 组件的 rAF 合并会被破坏。
3. `will-change: transform` 常驻在两个指示器节点上，这是刻意的：
   只有 2 个节点，代价可接受，换来零抖动。

---

## 9. Changelog

| 版本 | 变更 |
|---|---|
| `1.0.0` | 首个稳定版：mode / inspection / hideNative / zIndex + DOM 契约 |
