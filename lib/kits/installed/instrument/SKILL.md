---
name: style-instrument
description: 使用 instrument Style Pack 做 Visual Direction 与界面实现时的约束清单。当一屏必须放很多「必须被读准的数字」时加载。
---

# SKILL · instrument Style Pack

你在用 **instrument**。它唯一的目的是让**数字被读准**。
如果你的产物里有个数字读错了、对不齐、或者被装饰淹没了，那它就不是 instrument。

## 0. 先写 Visual Manifest，再写 JSX

```json
{
  "stylePack": "instrument",
  "productType": "observability-console",
  "firstVisual": "一屏被 1px 实线切开的等宽面板，每格右上角铭牌标签、左下角大号读数",
  "signatureComponents": ["animated-grid", "insight-reveal"],
  "effects": ["technical-grid"],
  "motionDirection": "precise",
  "density": "high",
  "avoid": ["glassmorphism", "purple-gradient", "neon-glow", "drop-shadow-elevation", "soft-radius"]
}
```

## 1. 必须做

1. **一切等宽**：标题、标签、读数、按钮、表格。唯一例外是超过 3 行的说明文本。
2. **一切数字 tabular**：`font-variant-numeric: tabular-nums slashed-zero`，否则刷新时列会跳。
3. **每个区块都有边界**：`1px` 实线分格，强调用 `2px`。不要用留白"暗示"分区。
4. **面板必须有铭牌表头**（`.kits-panel-head`：2px 底线 + 下沉底色 + 大写等宽标签）。
5. **正负值必须带符号**：`+2.4%` / `-1.1%`，不能只靠颜色。
6. **动效 ≤ 220ms，位移 ≤ 4px，无回弹**。按压反馈 50ms 内必须发生。
7. **密度要真的高**：控件 28px、行高 32px。如果做出来比普通后台还松，那是违规。
8. **移动端必须降密度**（断点 640px）：行高 → 40px、标签 → 11px、`--kits-space-unit` → 6px。

## 2. 禁止做

| 禁止 | 原因 |
|---|---|
| `glassmorphism` | 玻璃与机柜互斥，且滤镜让密集面板掉帧 |
| 任何装饰性渐变 / `purple-gradient` | 颜色必须携带语义，不能携带情绪 |
| `neon-glow` / bloom | 光属于 cinematic；仪表上的光必须代表告警 |
| `drop-shadow-elevation` | 面板是平的，投影破坏机械感 |
| 半径 > 4px | 会让仪表变消费级 App |
| 展示字体（衬线/无衬线大标题字）用在读数 | 无法逐位比对 |
| **无信息量的持续动画**（网格呼吸、刻度流动） | 监控面板上这是噪音 + 耗电；`roles` 里根本没有 ambient |
| 回弹缓动 | 让读数看起来不可信 |
| 大留白（section gap > 48px） | 一屏就是一张表，留白 = 少一个指标 |
| 超过 3 个数据系列颜色 | 颜色失去语义 |
| 10px 标签承担唯一关键信息 | 可读性风险，必须能在正文找到对应 |

## 3. 自检清单

- [ ] 所有数字是否等宽且 tabular？（刷新一次看列有没有跳动）
- [ ] 每个区块是否都有可见的 1px 边界？
- [ ] 灰度打印后，正负值是否仍可区分？（符号必须存在）
- [ ] 灰度打印后，数据系列是否仍可区分？（不能只靠色相）
- [ ] 是否出现了任何 `box-shadow` / `backdrop-filter` / `filter`？
- [ ] 半径是否全部 ≤ 4px？
- [ ] 所有动效是否 ≤ 220ms、位移 ≤ 4px、无回弹？
- [ ] 是否出现了任何"无信息量但好看"的持续动画？（一个都不允许）
- [ ] 390px 下是否降了密度？还是一屏挤到不可读？
- [ ] `prefers-reduced-motion: reduce` 下状态切换是否仍然**瞬时可见**（不是变成淡入）？

## 4. 常见误用

**误用：用无衬线字体做读数，只加 `font-variant-numeric`。**
→ 后果：列宽在数值变化时依旧会抖（比例字体 + tabular 只能对齐数字本身，
标签与单位仍会错位）。仪表场景必须整段等宽。

**误用：给面板加 `border-radius: 12px` + 柔和投影，"让它看起来现代一点"。**
→ 后果：立刻变成消费级 Dashboard，密度感消失，机械可信度归零。

**误用：为了"有科技感"给网格加缓慢流动动画。**
→ 后果：监控面板上 24 小时运行的动画 = 无意义耗电 + 干扰对真实变化的感知。
→ 正确做法：instrument 只有**变化时**才动（`data` 角色），静止时绝对静止。

**误用：把 instrument 用在移动端主场景。**
→ 后果：10px uppercase 标签 + 28px 控件在触屏上无法点、无法读。
→ 正确做法：移动端降到 3–5 个核心指标，或换 pack。

## 5. 与其它 pack 的边界

- 需要**阅读优先** → 换 `editorial`。
- 需要**沉浸与氛围** → 换 `cinematic`。
- 同一页（例如"实时监控用 instrument，日报叙事用 editorial"）→ 两个 `data-kits-pack` 容器分区。

## 6. 换 pack 时你唯一要改的东西

```diff
- <section data-kits-pack="instrument">
+ <section data-kits-pack="editorial">
```

`.kits-panel-head` / `.kits-readout` / `.kits-tick-rule` 是 instrument 专属，
换 pack 后它们会失去样式——**这是预期行为**。仪表铭牌和刻度尺不该出现在
编辑式页面上。如果你发现"必须保留它们"，说明选错 pack 了。
