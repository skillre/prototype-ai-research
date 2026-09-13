---
name: git-delivery
description: 在 Prototype Starter 中完成 Prototype 开发后执行 Git 交付的标准工作流：Inspect → Branch Check → Diff Review → Quality Gates → Commit → Push → Preview。适用于 task 明确要求 delivery / publish，或用户明确要求 push 的交付任务。默认不 push、不 push main、不自动 merge。
---

# Git Delivery Skill

## 目标

把**已经通过 Browser QA 与测试**的 Prototype，安全、可回滚地交付到 GitHub，并通过 GitHub → Vercel 自动连接获得 Preview URL。绝不擅自 push main、绝不自动 merge、绝不覆盖用户修改。

## 前置约束（必须先读）

1. 先读 `AGENTS.md` 的「Git 工作流与安全」章节（危险命令红线、Branch Strategy、Commit / Push / Merge 规则）。
2. 本 Skill 只负责交付；开发与验证属于 `skills/interactive-prototype/SKILL.md` 的职责。
3. 本 Skill 默认**不改变 main**；只有在用户明确要求时才考虑 merge（见下）。

## 工作流（逐阶段执行，不跳步）

```
Inspect → Branch Check → Diff Review → Quality Gates → Commit → Push → Preview
```

### 1. Inspect

```bash
git status
git branch --show-current
git remote -v
```

确认仓库状态、当前位置与远程配置。发现未提交的**用户修改**时：先停止并报告，不擅自提交或覆盖。

### 2. Branch Check

- 确认当前 branch。
- 新 Prototype 如果仍在 `main`：**先在 main 上创建 `feature/<name>`**（先 `git pull --ff-only origin main` 更新基线），不要把开发直接留在 main。
  ```bash
  git checkout -b feature/<name>   # e.g. feature/ai-crm
  git branch --show-current        # 必须是 feature/<name>
  ```
- 已经在其他 feature branch：不要把新 Prototype 混进去，先停止并报告；不自动删除旧 branch。

### 3. Diff Review

```bash
git diff --stat
git diff
```

重点检查：

- unrelated changes（不属于当前 Prototype 的改动）
- secrets / API keys
- `.env`
- `node_modules` / `.next` / `test-results` / `coverage` 等产物
- temporary files

一切与当前 Prototype 无关的内容**不进入 commit**。

### 4. Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

任何一项失败：**禁止 commit / push**。修复后重新执行，直至全部通过。

### 5. Commit

commit 前再次 `git status`。创建清晰的 commit，例如：

```
feat: add ai crm prototype
fix: improve mobile layout
test: add dashboard interaction coverage
```

- 用 `git add <explicit-files>`，不要盲目 `git add -A`。
- 禁止无意义信息（update / changes / work / misc / final）。
- commit 后再次 `git status` 确认状态。

### 6. Push

**默认不 push。** 只有任务明确要求 delivery / publish，或用户明确要求 push 时才执行。

push 前再次确认：

```bash
git branch --show-current   # 绝对不能是 main
```

然后：

```bash
git push -u origin feature/<name>
```

**绝对不能默认 push main。** 禁止 `--force` / `--force-with-lease`，除非用户明确要求并确认风险。

### 7. Preview

GitHub 已与 Vercel 自动连接，因此：

```
feature branch → GitHub → Vercel → Preview Deployment
```

不需要在项目里加入 Vercel API、Vercel CLI automation 或 GitHub Actions，**除非以后明确需要**。

推送后把 Preview URL 报告给用户，等待**人工确认**。

## 关于 merge

Agent 默认**禁止自动 merge、push main、删除 feature branch**。

只有当用户明确要求时才执行 `feature/<name> → main` 的合并。发生 merge conflict：**停止并报告**，不做高风险冲突解决。

## 完成标准（Definition of Done）

- [ ] 当前 branch 是 `feature/<name>`（不是 main）
- [ ] diff 已审查，无 secrets / 产物 / 无关改动
- [ ] lint / typecheck / test / build 全部通过
- [ ] commit 信息清晰、范围明确
- [ ] （任务要求 delivery 时）已 push 并获得 Vercel Preview URL
- [ ] 未擅自改动 main、未强推、未覆盖用户修改

## 参考文件

- `AGENTS.md` — Git 工作流与安全规则（必读）
- `skills/interactive-prototype/SKILL.md` — 开发与验证工作流