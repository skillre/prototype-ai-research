/**
 * Kits 适配层 · 别名 · 指针读数层。
 *
 * 这个文件属于**产品**，Kits 永不覆盖它。
 *
 * 它把「当前用哪一个指针组件资产」这件事**收在一处**：产品代码 import 的是
 * `@/lib/kits/adapters/pointer`，因此产品源码里不出现任何 Kits 资产 id
 * （这条规则由 `tests/factory-contract.spec.ts` 守着）。
 *
 * 换一个指针实现时，只改下面这一行——不是改每一个调用点。
 * 这正是适配层存在的理由。
 */

"use client"

export {
  DataCursor,
  DataCursor as Pointer,
  type DataCursorProps,
} from "./data-cursor"

/**
 * 「可以被指针读取」这个能力的标记属性。
 *
 * 产品代码用这个常量，而不是手写字符串——手写会让资产名重新出现在产品源码里，
 * 而且会让「Kits 改了这个属性名」变成一次静默失效。
 */
export const POINTER_TARGET_ATTRIBUTE = "data-cursor" as const

/** 可以挂在 `POINTER_TARGET_ATTRIBUTE` 上的读取模式。 */
export const POINTER_TARGET_INSPECT = "inspect" as const

/** 读数标签的属性名。 */
export const POINTER_LABEL_ATTRIBUTE = "data-cursor-label" as const

