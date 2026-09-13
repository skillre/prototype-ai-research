# Visual Manifest Contract

> **写 UI 之前，先写 Manifest。**
> 没有 Visual Manifest 就开始写 JSX = 违规。

这份文档定义 **Factory 拥有的那一半**：字段集合、形状、以及让 Manifest 无法被敷衍跳过的强制规则。

**创作语义不在 Factory 手里。** 哪个 Style Pack 适合什么产品、一页最多几个签名组件、`avoid` 该写什么——那些属于 Prototype Kits 的 `skills/visual-direction/SKILL.md`。这里不重述它们，因为规则的第二个副本就是第二个事实来源。

---

## 为什么需要它

Agent 的默认审美会强烈回拉：紫色渐变、到处卡片、圆角 16px、处处 glow。结果是"哪都还行、哪都不成立"的页面——**到处都说得过去，但哪里都不成立**。

修法是流程性的，不是装饰性的：视觉方向必须**在写任何 JSX 之前被声明**，而且声明必须**机器可检查**，否则它会被静默跳过。

---

## 字段

八项全部必填。权威的字段语义与可选值见 Kits 的 `visual-direction` skill。

| 字段 | 类型 | Factory 检查什么 |
|---|---|---|
| `productType` | string | 非空，kebab-case 产品类型 |
| `firstVisual` | string | **必须写出"第一眼看到什么"**——印象词会被拒 |
| `stylePack` | string | 能在 Kits registry 里解析到一个 `approved` 的 `style` 资产 |
| `signatureComponents` | string[] | 每项都是 `approved` 的 `component` 资产（数量约束由 Kits 定义，不由我们） |
| `effects` | string[] | 每项都是 `approved` 的 `effect` 资产；**空数组合法** |
| `motionDirection` | string | 非空；应与所选 pack 的 `motionLanguage` 一致 |
| `density` | string | 非空；应与所选 pack 的 `density` 一致 |
| `avoid` | string[] | **不能为空** |

字段集合是**封闭的**：出现未知字段是错误，不是被忽略。写错字段名通常意味着某个决策没有被记录。

### 两个强约束

**`firstVisual`** 存在的意义是回答"第一眼看到什么"。如果答案只由印象词构成，它什么也没回答——那正是默认审美在说话。所以：

- 长度不足、或
- 把空话词全部剔除之后剩余内容太少

都会被判错。词表覆盖中英文（`现代/简洁/高级/大气/…`、`modern/clean/minimal/premium/…`），按子串匹配，所以「现代简洁」这种没有分词器也能抓到，而「深色空间里从左上打下来的环境光，标题浮在光里，下方一条发光曲线」能通过。

**`avoid`** 是 Manifest 里最有价值的一栏，因为它是**唯一一条约束默认审美的决策**。空列表意味着这个决策从未做出，所以它是错误，不是风格偏好。

> 「我不想让它长成什么样」比「我想要什么」更能约束产出。默认审美会主动回拉，写下 `avoid` 就是在动手前先把那些门关掉。

### 为什么只有 `avoid` 不能为空，`effects` 可以

「不要任何 effect」是一个**决定**，而且是一个和「忘了写」不同的决定。空数组合法地表达前者。

---

## 文件位置

```
visual-manifest.json          # 仓库根，约定名（VISUAL_MANIFEST_FILENAME）
lib/visual-manifest.ts        # 类型 + 校验器（Factory Core）
lib/visual-manifest.schema.json  # JSON Schema（形状）
docs/examples/visual-manifest.example.json
```

**Factory 不提供默认 manifest。** 这不是疏漏：没有默认，才能逼出一次真实的视觉方向决策。所以 `pnpm factory:kits` 在没有 manifest 时会明确拒绝，并给出该读哪两个文件。

---

## Schema 里为什么没有 enum

`lib/visual-manifest.schema.json` 只描述**形状**，不枚举 `stylePack` 的合法取值。

把 `["cinematic","editorial","instrument"]` 写进 Schema 会有两个后果：

1. **让 Factory Core 知道具体 Style Pack 存在**——而这正是 v1.1 要消除的东西；
2. **在 Kits 发布新 pack 的当天静默过期**——Schema 说"非法"，registry 里有，两边都是"权威"。

所以合法取值在**运行时**从 Kits registry 读取：

```
manifest 里的 id  →  registry/assets.json  →  status === "approved" ？
```

`tests/factory-contract.spec.ts` 会扫描 `lib/` `components/` `app/` `scripts/` `hooks/` `stores/`，断言其中**不出现任何具体 asset id**。`docs/` 与 `tests/` 不在扫描范围内：文档示例允许具体，测试夹具不是 Core 源码。

---

## 校验的两种状态

```bash
pnpm factory:manifest                          # 结构校验（总是可用）
pnpm factory:manifest --kits ../prototype-kits # 额外的上游比对
```

| 状态 | 含义 |
|---|---|
| `verified` | 结构通过 + 所有 id 都在 registry 里且 `approved` |
| `upstream-unavailable` | 结构通过，但**没有做上游比对**——并会明说这一点 |
| `invalid` | 结构错误，或引用了不存在/未批准的资产 |

`upstream-unavailable` 是**受支持的状态**：已经安装完成的产品在脱离 Kits 仓库后必须继续工作。工具在那种情况下的正确行为是承认自己的边界，而不是把"没检查"说成"通过"。

---

## Art Direction Gate

Manifest 不是文档，是**门**。

```
Understand → Inspect → Product Model → Visual Direction → Visual Manifest
→ 【Human / explicit Art Direction checkpoint】
→ kits add → Build → Browser QA → Test → Preview → Visual Acceptance → Release
```

- **没有 Manifest 就不能进入实现。** `pnpm factory:kits` 会拒绝；`skills/interactive-prototype/SKILL.md` 把它写成不可跳过的阶段。
- **Art Direction checkpoint 是人工决定。** 选哪个 pack、第一视觉是什么、不要什么——这些是设计决策，不是可以默认的。Agent 不能在没有 Manifest 的情况下生成 generic AI SaaS visual。
- **`firstVisual` 与 `avoid` 是强约束**，会被校验器强制。
- **Manifest 是约束，不是装饰。** 写了 `avoid: ["card-everywhere"]` 却在产物里到处是卡片 = 违规；Browser QA 与人工验收是复核它的地方。

---

## 与 Kits 的分工

| | 归属 | 内容 |
|---|---|---|
| **Factory** | 机制 | 字段集合、形状校验、非空话规则、registry 交叉核对、门与顺序 |
| **Kits** | 创作 | 可选值、参考板、pack 选择、组件数量约束、`avoid` 词表、每个 pack 的硬约束 |

Factory 调用 Kits，不重新实现 Kits。新加一个 Style Pack 时，Factory 侧**一行都不用改**——它本来就不认识任何 pack。
