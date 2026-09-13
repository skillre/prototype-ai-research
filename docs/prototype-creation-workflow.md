# Prototype Creation Workflow

Factory v1.1 的正式生产流程。**顺序不可交换**——每一步都在为下一步消除一整类返工。

```
Factory baseline
      ↓
new independent repo
      ↓
main baseline
      ↓
feature/<product>
      ↓
Product Model
      ↓
Visual Manifest          ← Art Direction Gate：写 UI 之前必须先有
      ↓
Kits Source Installation
      ↓
Product-owned adapters
      ↓
Build
      ↓
Invariant tests          ← 数据型原型：先定义不变量，再大规模做 UI
      ↓
Browser QA
      ↓
Preview
      ↓
Human Visual Acceptance  ← 机器只能证明"没有回归"
      ↓
Release
      ↓
Production
      ↓
Hub registration
```

---

## 阶段说明

### 1 · Factory baseline → new independent repo

从 Factory baseline 复制出**一个独立的仓库**。不是 monorepo，不是 workspace——产品之间不共享运行时。

### 2 · main baseline → `feature/<product>`

```bash
git status                       # 确认没有未提交的用户修改
git checkout main
git pull --ff-only origin main
git checkout -b feature/<product>
git branch --show-current        # 必须是 feature/<product>
```

一个原型一个 branch。不重复使用旧 branch 做不同的原型。

### 3 · Product Model

先回答：**这是什么产品、用户来干什么、一屏里最重要的是什么。**

这一阶段的产出不是代码，是对"第一视觉焦点是什么"的初步判断——它是下一步的输入。产品模型没想清楚就开始选色，最后得到的是"哪都还行、哪都不成立"。

### 4 · Visual Manifest — Art Direction Gate

**在写任何 UI 之前**产出 `visual-manifest.json`。

见 `docs/visual-manifest.md`。要点：

- 八项必填；`firstVisual` 与 `avoid` 是强约束，会被校验器强制；
- 具体可选值从 Kits registry 读取，Factory 不复制；
- 校验：`pnpm factory:manifest`。

**没有 Manifest 就不能进入实现。** `pnpm factory:kits` 会直接拒绝。

### 5 · Kits Source Installation（`kits add`）

机制上这一步就是执行 `kits add`，由 Factory 包装成一条命令：

```bash
pnpm factory:kits              # 先 dry-run 看计划
pnpm factory:kits --write      # 真实安装 → 校验 lock → 跑 doctor
```

参数全部来自 Manifest（`stylePack` / `signatureComponents` / `effects`）。Factory 调用 Kits CLI，不重新实现它。

### 6 · Product-owned adapters

`lib/kits/adapters/` 归产品所有，Kits 永不覆盖。产品的手写集成放这里。

**产品代码不得直接 import `installed/*`**，必须走 `Product → adapters → installed`。

见 `docs/kits-ownership.md`。

### 7 · Build

真实组件 + 局部状态驱动。每个可见控件连到 state 或 store；不允许假按钮，不允许静态 mockup。

### 8 · Invariant tests（数据型原型必做）

**复杂数据产品：先定义不变量，再做 UI。**

在 UI 大规模实现**之前**写好不变量测试，而不是等页面做完了再补。理由很实际：数据型 UI 的价值完全建立在"图上的数字是对的"之上；如果这一点没有测试守住，后面每一次视觉调整都在赌。

不变量是**产品的**，不是 Factory 的。Factory 只要求这件事发生，并给出判断标准：

| 类型 | 例子 |
|---|---|
| 总量守恒 | 分项之和 == 总计 |
| 派生一致性 | 派生指标 == 从原始数据重算的结果 |
| 数据 == 可视化 | 图上渲染的数值 == 源数据里的数值 |
| 引用真实记录 | 洞察里的实体确实存在于数据集中，且可跳转 |

> Factory **不**包含任何具体的账本规则。AI Finance 的金额/停滞天数语义属于 AI Finance。

写不变量测试的时机是第 8 步，不是第 12 步：它是 UI 的**规格**，不是 UI 的**备注**。

### 9 · Browser QA

```bash
pnpm qa
```

见 `docs/browser-qa.md`。要到达的状态：

```
0 console error · 0 page error · 0 request failure · 0 横向溢出 · 0 viewport expansion
```

### 10 · Preview

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm qa
git add <explicit-files>
git commit -m "feat(<product>): …"
git push -u origin feature/<product>
```

→ GitHub → Vercel Preview。见 `docs/vercel-bootstrap.md`。

### 11 · Human Visual Acceptance

**机器能证明的是"没有回归"；"这一版好不好看"不在机器的证据范围内。**

Preview URL 交给用户做人工视觉验收。同时复核 Manifest 的约束是否被遵守——特别是 `avoid` 里的每一条在产物里是否真的没有出现。

### 12 · Release → Production → Hub registration

只有用户明确要求时才 merge `main`。Agent 默认不 merge、不 tag、不删 feature branch。

---

## Agent 不能跳过的四步

| 步骤 | 跳过会怎样 |
|---|---|
| **Visual Manifest** | 回到默认审美：卡片 + 阴影 + 渐变 + 紫色，产出"哪都还行、哪都不成立" |
| **Art Direction checkpoint** | Agent 替人做了设计决策，而且没有记录 |
| **Invariant tests** | 数据型原型的正确性靠肉眼，每次视觉调整都在赌 |
| **Human Visual Acceptance** | 把"没有回归"当成"可以发布" |

---

## 现在还没做的自动化

Factory v1.1 **不做** one-click generator。上面的流程定义了接口，但每个阶段的判断仍然是人的（或 Agent 的）工作。

下一阶段可以考虑 `create-prototype` v0.1，但它的设计前提是这条流程已经被真实跑过——那正是 v1.1 提供的。
