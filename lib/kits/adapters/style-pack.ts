/**
 * Kits 适配层 · style-pack · 由 `kits add` 生成（v0.1.0）
 *
 * ===========================================================================
 * 这个文件属于**产品**，不属于 Kits。
 * ===========================================================================
 *
 *   lib/kits/installed/   Kits 托管区 —— 重新安装会覆盖，产品只读
 *   lib/kits/adapters/    ← 你在这里 —— Kits 永不覆盖这个目录
 *
 * 产品代码请只 import 这一层：
 *
 *   import { AnimatedGrid } from "@/lib/kits/adapters/animated-grid";
 *
 * 而不是直接 import 托管区。这样 Kits 升级时，产品的引用面不动。
 *
 * 想改行为（换实现、覆盖品牌色、加自己的降级）就在本文件里改 ——
 * `kits add` 不会覆盖它，`kits doctor` 也不会把它算作「被改动的托管文件」。
 *
 * 注意 import 路径**不带扩展名**：Kits 源码内部用具名扩展名（workspace 的
 * 源码分发一直开着 allowImportingTsExtensions），但那不该成为产品的要求。
 * 安装器在写盘时会把 .ts / .tsx 剥掉，因此产品不需要改任何 tsconfig。
 */

/**
 * 当前 pack 的稳定入口 —— 产品代码 import 的是**这个路径**。
 *
 * 它只是 `style-instrument.ts` 的别名，因此换 pack 时产品代码不用改：
 * 把下面这一行换成另一个 `style-<id>` 即可。
 *
 * 为什么要有别名：产品关心的是"当前用哪套风格"（一个产品语义），
 * 而不是"cinematic 这个资产"（一个具体实现）。直接 import
 * `style-cinematic` 会把资产名焊进产品代码，换风格就要全量改引用。
 *
 * 注意：本文件属于**产品**，Kits 永不覆盖它。因此换 pack 之后
 * `kits add --style <新 pack>` 只会**新建** `style-<新 pack>.ts`，
 * 不会替你改这一行 —— 这是刻意的，见 README 的「适配层所有权」一节。
 */
export * from "./style-instrument";
