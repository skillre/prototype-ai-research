/**
 * Kits 适配层 · 别名 · 结构揭示层。
 *
 * 这个文件属于**产品**，Kits 永不覆盖它。
 *
 * 与 `pointer.tsx` 同一目的：把「当前用哪一个揭示组件资产」收在一处，
 * 这样产品源码里不出现 Kits 资产 id（`factory-contract.spec.ts` 会检查）。
 *
 * 换实现时只改下面这一行。产品代码 import 的是
 * `@/lib/kits/adapters/structure`。
 */

"use client"

export {
  InsightReveal,
  InsightReveal as StructureReveal,
  type InsightRevealProps,
} from "./insight-reveal"

