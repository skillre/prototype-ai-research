"use client"

/**
 * Research Workspace Shell —— 第一屏的根。
 *
 * ## `data-kits-pack` 为什么落在**这里**而不是 `<html>`
 *
 * 两个理由：
 *
 *  1. **作用域。** Style Pack 的 token 是 `[data-kits-pack="…"]` 作用域的，
 *     而本产品的其他路由（`/` 与 `/demo`）用的是 Factory 的中性 fallback。
 *     把 pack 放到 `<html>` 上会让那两条路由一起被重绘。
 *
 *  2. **定位包含块。** 移动端的底部清单是 `position: fixed`。把它挂在
 *     shell 元素下、而不是挂在某个 `transform` 过的容器里，是为了让它相对
 *     视口定位——这是「fixed 元素不要落在有 transform/filter 的祖先下」
 *     这条老规则的正面用法。
 *
 * `data-kits-pack` 由**适配层**提供的常量填充（`lib/kits/adapters/data`），
 * 不是在这里写死的资产 id——把 pack 名抄进 JSX 的那一刻，产品就再也换不了 pack。
 * 产品源码禁止出现具体 pack 名，这一条由 `factory-contract.spec.ts` 守着。
 *
 * ## pack 的动效刻度注入在哪
 *
 * 在 `<html>` 上由 root layout 注入（`stylePackMotionVars`）。那是**变量**，
 * 不带作用域，因此对本页与其它页都无害；对其它页无效果，是因为那些页面上
 * 没有 `[data-kits-pack]` 作用域去消费它们。
 *
 * ## 这里刻意没有的东西
 *
 * 没有主题切换开关、没有导航、没有账户菜单、没有搜索。它们都是**外壳**的
 * 语言，而本阶段只做第一屏。明暗两套由系统偏好驱动（root layout 的
 * ThemeProvider + 水合前脚本），QA 的 `emulateMedia({ colorScheme })` 也走同一条路。
 */

import type { ArgumentChain as ArgumentChainData } from "@/lib/research-ui"
import { stylePackId } from "@/lib/kits/adapters/data"
import { AnchoredQuestion } from "./anchored-question"
import { ArgumentChain } from "./argument-chain"
import { ResearchRunningHead } from "./running-head"
/* Style Pack 的 CSS 缝。**必须显式 import**：适配层里那份 CSS 只是把 pack 的
 * tokens 引进来，它没有任何组件会去 import 它——不写这一行，pack 的
 * `--kits-space-*` / `--kits-border-*` / `--kits-radius-*` 就完全不存在，
 * 而页面**不会报错**：所有 `var(--kits-…)` 静默失效，边框宽度变成 0，
 * 只是看起来「有点平」。这是一次真实的静默失败，所以写在这里。
 *
 * 路径是**中性别名**（`adapters/style.css`），不是 `adapters/style-<pack>.css`：
 * 产品源码里出现具体 pack 名的那一刻，换 pack 就变成一次全量改引用，
 * 而且不会有任何东西报错。别名层把那个名字收在一处。
 *
 * 这条路走适配层，不走 `installed/`。 */
import "@/lib/kits/adapters/style.css"
import "./research-shell.css"

export function ResearchWorkspace({ chain }: { chain: ArgumentChainData }) {
  return (
    <main
      className="rs-shell"
      data-kits-pack={stylePackId}
      data-testid="research-shell"
      /* 移动端会把**首屏那张「最大缺口」卡片已经讲过的**那一条缺口
         在链条里折叠掉——同一件事在 fold 以上说一遍、在 fold 以下再说一遍
         是重复，不是强调。
         判定靠这个显式标记（值是那条论断的 id），而不是靠「是不是第一条论断」
         这种猜测。CSS 只在窄屏消费它，见 research-shell.css §4。 */
      data-suppressed-gap={chain.primaryGap?.claim.claim.id ?? undefined}
    >
      <ResearchRunningHead anchor={chain.anchor} />

      <div className="rs-main">
        <AnchoredQuestion text={chain.anchor.questionText} />
        <ArgumentChain chain={chain} />
      </div>
    </main>
  )
}
