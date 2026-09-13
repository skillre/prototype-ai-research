# Vercel Bootstrap Checklist

新原型上线前对照这份清单。每一条都来自于**真实踩过的坑**，不是通用最佳实践。

---

## 项目设置

| 设置 | 正确值 | 说明 |
|---|---|---|
| **Framework Preset** | `Next.js` | 自动识别通常正确；如果 Root Directory 非仓库根，识别会失败，必须手选 |
| **Root Directory** | 仓库根 | 本模板是单应用仓库，不是 monorepo |
| **Output Directory** | 框架默认（留空） | 手动填 `.next` 之类会破坏 Next 的产物布局 |
| **Production Branch** | `main` | |
| `feature/*` | **Preview** | 每个原型一个 feature branch，天然对应一个 Preview |
| **Deployment Protection** | **不擅自修改** | 见下 |

### Root Directory 例外

如果新项目**必须**使用非根目录，必须显式记录原因。默认假设是错的常见来源：Root Directory 填错时构建会在找不到 `package.json` 或识别不出框架时失败，错误信息不会指向这个设置。

---

## Agent 不得做的事

| 禁止 | 原因 |
|---|---|
| 修改用户的 Vercel **CLI credentials** | 那是 **user-managed state**，不是项目文件 |
| **不得删除** auth files（`~/.vercel/`、`~/.config/vercel/` 等） | 同上；删了要用户重新登录 |
| 自动断开 Git integration | 会切断部署来源，且难以从仓库侧恢复 |
| 擅自修改 Deployment Protection | 保护策略是**安全设置**，不是构建配置 |
| 擅自创建新项目 / 新部署平台 | 属于基础设施变更，需要明确授权 |
| 在项目里加入 Vercel API / CLI automation / GitHub Actions | 见 `AGENTS.md` 的项目边界 |

> **凭证是 user-managed state。** Agent 可以读取部署结果，但不拥有认证状态。遇到凭证问题时**报告并停止**，不要"修复"它。

---

## 部署失败的诊断顺序

1. **项目是否存在？** 用 CLI/API 确认 project id 仍然有效。
   - 真实案例：`.vercel/project.json` 指向的项目已被删除或转移，CLI 报 "Your Project was either deleted, transferred to a new Team, or you don't have access to it anymore"，而 `GET /v9/projects` 里根本没有这个项目。这时**不要创建新项目**——先报告。
2. **Root Directory / Framework Preset** 是否正确。
3. **构建命令**是否与本地一致（`pnpm build`）。
4. **Node 版本**与 `packageManager` 字段是否匹配。
5. 本地先跑一遍 `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm qa`——CI 里失败的东西通常本地也会失败。

---

## Preview 之后

`feature/<name> → GitHub → Vercel Preview → 人工确认 → merge main`。

- Preview URL 交给用户做**人工视觉验收**。
- Agent **默认不 merge `main`**，即使 Preview 全绿。
- 机器能证明的是"没有回归"；"这一版好不好看"不在机器的证据范围内。

---

## 相关

- `AGENTS.md` — Git 工作流与安全规则（红线命令、branch 策略）
- `skills/git-delivery/SKILL.md` — 交付工作流
- `docs/prototype-creation-workflow.md` — 完整生产流程
