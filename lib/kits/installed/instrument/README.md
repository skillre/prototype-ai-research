# Style Pack · instrument

> 工业仪表 · 刻度与读数 —— 数字本身就是内容，因此一切都必须能被读准。

| | |
|---|---|
| **id** | `instrument` |
| **status** | `approved` |
| **version** | `0.1.0` |
| **contract** | `1.0.0`（见 [`../_contract/tokens.css`](../_contract/tokens.css)） |
| **selector** | `[data-kits-pack="instrument"]` |
| **performance** | A · 0 KB JS · ~5 KB CSS（零滤镜 / 零投影 / 零混合模式） |

---

## 1. 这套风格在解决什么问题

监控面板和交易台的真正难点不是"好不好看"，而是**一屏要放 40 个数字，
而且每个都要能被逐位比对**。这时候留白是浪费、阴影是噪音、
展示字体是灾难——因为 `1` 和 `l`、`0` 和 `O` 会读错。

instrument 的答案是回到工程图纸：**刻度、标签、硬边界**。
每个区块都有 1px 实线分格，每个面板有铭牌表头，每个数字等宽对齐。

**第一视觉**：一屏被 1px 实线切成网格的小面板，每格右上角等宽大写标签，
左下角等宽大号读数。

---

## 2. 十个维度上的立场

| 维度 | 立场 | 落地方式 |
|---|---|---|
| typography | `instrumental` | **全站等宽**（含正文，唯一例外是超长说明文）；标题 2.75rem / 1.12 / **+0.02em 正字距**；标签 10px uppercase +0.12em；读数 tabular-nums + **slashed-zero** |
| spacing rhythm | `compact` | 脉搏 4px，区块间距仅 **32px**，content-max **88rem**（更宽，为放更多列） |
| density | `high` | 控件 **28px** 高、行高 **32px**、卡片内边距 12px —— 三套里最密 |
| radius philosophy | `square` | 1–3px：不是"设计选择"，是**机械公差**（editorial 的 0 是印刷直角，语义不同） |
| border treatment | `hard-technical` | **每个区块都有 1px 实线**；强调用 2px；表头用 2px 顶线分格 |
| surface treatment | `panel` | 平面、无投影、无玻璃；表面靠虚线差 + 极淡扫描线（opacity **0.02**，无 blend mode） |
| navigation feel | `rail-console` | 导航 = 机架轨道：竖直、紧凑、gap 0，当前项用**左侧 2px 实心条** |
| data visualization | `instrument-grid` | 网格是**刻度**（不是背景装饰）；1px 线、4px 方形 mark、bar cap 0、无渐变无发光 |
| motion language | `precise` | 50–220ms（上限只有 220ms）；linear 为主；位移 **4px**；**roles 里没有 ambient** —— 仪表不呼吸 |
| visual hierarchy | `rule-and-label` | 层级来自线、刻度与铭牌标签，不来自空间也不来自光 |

> **判据**：灰度化之后，instrument 是唯一一套"页面看起来像被切成格子"的 pack。
> 差异来自**边界哲学**，不是密度或颜色。

---

## 3. 使用方式

```tsx
import "@kits/style-instrument/tokens.css";

<section data-kits-pack="instrument">
  <p className="kits-label">Node / 03 · shanghai-a</p>
  <h1 className="kits-display">集群健康度</h1>

  <div className="kits-surface">
    <header className="kits-panel-head">
      <span className="kits-label">P99 Latency</span>
      <span className="kits-label">60s window</span>
    </header>
    <div style={{ padding: "var(--kits-space-sm)" }}>
      <span className="kits-readout">
        184<span className="kits-label">ms</span>
      </span>
    </div>
    <div className="kits-tick-rule" aria-hidden="true" />
  </div>
</section>
```

### 可用的工具类（由 pack 提供）

| class | 作用 |
|---|---|
| `.kits-display` | 标题（等宽 600 / 1.12 / +0.02em） |
| `.kits-readout` | **仪表读数**（左侧 2px 强调条 + 等宽 tabular-nums，是这套风格的签名元素） |
| `.kits-data` | 裸读数（等宽 tabular-nums slashed-zero） |
| `.kits-label` | 铭牌标签（10px uppercase 等宽 +0.12em） |
| `.kits-body` / `.kits-lead` | 正文 / 导语 |
| `.kits-surface` | 面板（1px 硬边界 + 扫描线伪元素） |
| `.kits-panel-head` | **面板表头**（2px 底线 + 下沉底色 + 圆角仅顶部） |
| `.kits-rule` / `.kits-rule--short` | 1px 分隔线 / 2px 短强调线 |
| `.kits-tick-rule` | **刻度尺**（8px 周期的装饰性量尺，`aria-hidden`） |
| `.kits-control` / `.kits-control--primary` | 方形硬边界按钮（`:active` 直接反色，无位移） |

---

## 4. 什么时候**不要**用

- 品牌营销页、内容型落地页（情绪不对）。
- 需要沉浸与氛围的 AI 对话界面（等宽 + 密集会显得冷）。
- 面向非技术用户的 C 端产品。
- **移动端为主的产品**：高密度在 390px 下会退化为不可读（必须降密度，见下）。
- 一屏讲一个故事的叙事页。

更多见 `manifest.json` 的 `recommendedFor` / `avoidFor`。

---

## 5. 无障碍

- **对比度**：ink `#12161a` on surface `#f4f5f6` ≈ **16.8:1**；ink-muted `#5b6469` ≈ **5.6:1**；accent `#0b63c5` ≈ **5.9:1**。
- **最大风险是小字号**：10px 等宽 uppercase 标签必须保留 `letter-spacing ≥ 0.1em`，且**不得承载唯一关键信息**（应能在正文中找到对应说明）。
- **移动端必须降密度**：390px 下 10px 标签 + 32px 行高会不可读。降级方式：断点 640px 以下把 `--kits-space-unit` 提到 6px、行高提到 40px、标签字号提到 11px（见 `docs/integration.md`）。
- **颜色语义不可单独承担信息**：正负值除了绿/红，必须有 `+/-` 符号或文字标注（色盲用户 + 灰度打印）。
- **slashed-zero 是可读性措施**：密集读数场景下区分 `0`/`O`，不是装饰。
- **reduced-motion**：`collapseTo 0ms` 且**不保留淡入** —— 仪表的状态切换必须瞬时可见，加淡入反而会延迟告警的感知。颜色变化保留（它是状态信号）。

---

## 6. 性能

| 项 | 值 |
|---|---|
| 分类 | **A**（三套里合成成本最低） |
| JS | 0 KB |
| CSS | ~5 KB（未压缩） |
| 滤镜 / 投影 / 混合 | **0 / 0 / 0** |

**约束**：密集排布时瓶颈在 DOM 数量而不是样式。40+ 面板意味着 40+ 个 `.kits-surface`
伪元素——如果需要上百个格子，改用**父容器一次绘制的网格背景**（`.kits-grid` 或 `animated-grid`），
而不是每个格子一个面板。

---

## 7. 相关资产

- 组件：`animated-grid`（必配）、`insight-reveal`（必配）、`data-cursor`（可选）
- 效果：`technical-grid`、`scanline-sweep`
- 不适配组件：`interactive-hero`、`spotlight-surface`（详见各自 manifest 的 `avoidFor`）
- 参考板：[`references/instrument/`](../../references/instrument/)
- 技能：[`skills/visual-direction/SKILL.md`](../../skills/visual-direction/SKILL.md)
