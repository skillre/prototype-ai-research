/**
 * Kits 适配层 · style-pack · 当前 pack 的稳定入口（数据侧）。
 *
 * ===========================================================================
 * 这个文件属于**产品**，不属于 Kits。
 * ===========================================================================
 *
 *   lib/kits/installed/   Kits 托管区 —— 重新安装会覆盖，产品只读
 *   lib/kits/adapters/    ← 你在这里 —— Kits 永不覆盖这个目录
 *
 * ## 为什么要有这一个文件
 *
 * Kits 的溯源检查（`kits doctor` / `factory-contract.spec.ts`）要求：**产品源码
 * 不得出现具体 Kits 资产 id**（`cinematic` / `instrument` / `data-cursor` …）。
 * 可选值必须从适配层读取。这个约束是对的——把 pack 名抄进 JSX，换 pack 的那天
 * 产品不会报错，只会静默过期。
 *
 * 但**数字必须被渲染出来**：`data-kits-pack` 属性就是我们实际声明「当前用哪套
 * 风格作用域」的地方。事件处理器不能直接写在 server component 里，所以
 * `data-*` 不能用函数属性传；那个值只能来自一个常量。
 *
 * 于是这里做一件事：**把当前 pack 的身份导出成产品可用的常量**。
 * 它从 `style-pack.ts` 转发（而后者是 `style-<id>.ts` 的稳定别名），
 * 因此换 pack 时产品一行不改，改的是适配层里那一行。
 *
 * 这不是绕过溯源检查——**这正是适配层存在的理由**：产品表达「当前这套风格」，
 * 适配层负责「当前这套风格是哪一个资产」。
 */

"use client"

export {
  /** 当前 pack 的 id，例如「仪表」那一套。用于 `data-kits-pack` 作用域。 */
  stylePackId,
  /** 注入 `<html style={…}>` 的 pack 动效刻度（CSS 变量表）。 */
  stylePackMotionVars,
  /** pack 的十个维度画像。 */
  stylePackProfile,
  /** pack 元信息：id / name / selector / cssEntry。 */
  stylePackMeta,
  /** pack 的作用域选择器，等价于 `[data-kits-pack="<id>"]`。 */
  stylePackSelector,
  /** pack 的动效刻度（TS 形态）。 */
  stylePackMotion,
} from "./style-pack"
