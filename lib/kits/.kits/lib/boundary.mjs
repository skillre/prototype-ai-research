/**
 * 边界检查 —— 产品代码不得直接 import 托管区。
 *
 * ===========================================================================
 * 为什么这条要单独做成一个检查
 * ===========================================================================
 * Kits 的整条 Distribution 设计只有一个承重点：
 *
 *     installed/（Kits 托管，重新安装会覆盖）
 *          ↓
 *     adapters/（产品托管，Kits 永不覆盖）
 *          ↓
 *     产品代码
 *
 * 产品代码只依赖 adapters/。这样升级 Kits 时托管区被覆盖，产品的引用面不动。
 *
 * 但如果产品代码直接 `import … from "../installed/cinematic/index"`，
 * 中间那一层就被绕过去了 —— 适配层退化成一个装饰品，升级时产品的 import
 * 路径全部失效。**而且它不会报错，只会让"升级很安全"这个承诺变成假的。**
 *
 * 第二次真实 Source Installation 正好发生了这件事：产品需要从 style pack 里
 * 取 motion 刻度去做 `motionToCssVars()`，而 v0.1.0 的安装器只给 style 生成了
 * CSS 缝、没有 TS 缝，产品**没有合规的路可走**，只好越界。
 *
 * 那次教训是双份的：
 *   1. 工具链没给合规的路，产品就会违规 → 补 TS 缝（K-04）；
 *   2. 越界必须被看见，否则下一次还会发生 → 这个检查（v0.1.1 §7）。
 *
 * ===========================================================================
 * 检查的范围
 * ===========================================================================
 *   - 扫描产品的源码文件（.ts/.tsx/.js/.jsx/.mjs/.css）
 *   - **不扫描** Kits 自己的托管区与 CLI 副本（installed/、.kits/）——
 *     从 adapters/ 与 .kits/ 指向 installed/ 是**设计如此**，不是违规
 *   - 跳过 node_modules / .next / dist / build / out / coverage
 *   - 只认 import / export … from / @import 里的说明符，不看注释与散文
 *     （复用 installer 的 scanSpecifiers，规则与安装器保持一致）
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { scanSpecifiers } from "./installer.mjs";
import { DEFAULT_LAYOUT } from "./lock.mjs";

/** 默认跳过：这些目录里的东西不是产品源码。 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "out",
  "coverage",
  ".cache",
]);

const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|css)$/;

/**
 * 读产品的路径别名（tsconfig.json 的 compilerOptions.paths）。
 *
 * 需要它是因为越界有两种写法：
 *   "../installed/cinematic/index"     ← 相对路径
 *   "@/lib/kits/installed/…"           ← 别名路径
 * 只查前者会漏掉后者，而后者在产品里更常见（Next 默认就是 @/*）。
 *
 * @returns {Array<{prefix:string, targets:string[]}>}
 */
export function readPathAliases(productRoot) {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const file = path.join(productRoot, name);
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // tsconfig 允许注释与尾随逗号；Kits 的产物不用，简单剥离即可。
    const cleaned = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1");
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      continue;
    }
    const paths = parsed?.compilerOptions?.paths;
    if (!paths || typeof paths !== "object") continue;
    return Object.entries(paths)
      .filter(([key, value]) => key.endsWith("/*") && Array.isArray(value) && value.length)
      .map(([key, value]) => ({
        prefix: key.slice(0, -1), // "@/" 保留结尾斜杠
        targets: value.filter((v) => typeof v === "string"),
      }));
  }
  return [];
}

/**
 * 把一个说明符解析成"相对产品根的路径"（POSIX），解析不了就返回 null。
 *
 * @param {string} spec
 * @param {string} fromDir   发起 import 的文件所在目录（相对产品根，POSIX）
 * @param {Array<{prefix:string, targets:string[]}>} aliases
 */
export function resolveSpecifier(spec, fromDir, aliases) {
  if (spec.startsWith(".")) {
    const joined = path.posix.normalize(path.posix.join(fromDir, spec));
    return joined.startsWith("..") ? null : joined;
  }
  for (const alias of aliases) {
    if (!spec.startsWith(alias.prefix)) continue;
    const rest = spec.slice(alias.prefix.length);
    for (const target of alias.targets) {
      /*
       * tsconfig 的 paths 目标几乎总是带一个 `*`：
       *   "@/*": ["./*"]        → 产品根
       *   "@/*": ["./src/*"]    → src/
       * 把 `*` 替换成 rest 才是解析结果。**不能**只做字符串拼接 ——
       * `"./*"` 去掉开头的 `./` 之后只剩一个 `*`，直接拼接会得到一个
       * 以 `*` 开头的畸形路径，永远匹配不上托管区。
       * （第一次实现就踩了这个：别名越界被静默放过，靠兜底规则才补回来。）
       */
      const star = target.lastIndexOf("*");
      const joined = path.posix.normalize(
        star < 0 ? `${target}/${rest}` : `${target.slice(0, star)}${rest}`,
      );
      return joined.startsWith("..") ? null : joined;
    }
  }
  return null;
}

/** 判断一个已解析路径是否落在某个托管目录里。 */
function insideManaged(resolved, managedRoots) {
  return managedRoots.some(
    (root) => resolved === root || resolved.startsWith(`${root}/`),
  );
}

/**
 * 遍历产品源码。
 *
 * @param {string} root 产品根
 * @param {string[]} skipRoots 相对产品根、不扫描的目录
 */
function* walkSource(root, skipRoots) {
  const stack = [""];
  while (stack.length) {
    const relDir = stack.pop();
    const absDir = path.join(root, relDir);
    let entries;
    try {
      entries = readdirSync(absDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".") continue;
      if (SKIP_DIRS.has(entry)) continue;
      const rel = relDir ? `${relDir}/${entry}` : entry;
      if (skipRoots.some((m) => rel === m || rel.startsWith(`${m}/`))) continue;
      const abs = path.join(root, rel);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(rel);
      } else if (st.isFile() && SOURCE_EXT.test(entry)) {
        yield { rel, abs };
      }
    }
  }
}

/**
 * 找出产品源码里绕过适配层、直接引用托管区的说明符。
 *
 * @param {{ productRoot: string, layout?: typeof DEFAULT_LAYOUT }} options
 * @returns {{ violations: Array<{file:string, line:number|null, spec:string, reason:string, resolved:string|null}>, scanned: number }}
 */
export function findManagedImports({ productRoot, layout = DEFAULT_LAYOUT }) {
  const installedRoot = layout.installedRoot; // lib/kits/installed
  const agentRoot = layout.agentRoot; // lib/kits/.kits
  const adapterRoot = layout.adapterRoot; // lib/kits/adapters

  /*
   * 两份清单，不能合并 —— 它们的语义不同：
   *
   *   skipRoots       这些目录里的文件**不被扫描**。
   *                   adapters/ 在列表里：从适配层指向 installed/ 正是设计本身。
   *                   .kits/ 在列表里：installer 自己当然要读托管区。
   *
   *   forbiddenRoots  指向这些目录的引用**算越界**。
   *                   adapters/ 不在这里 —— 从产品代码 import adapters/ 才是对的。
   *
   * 把两者混在一起会造成两个方向的错误：要么漏报产品越界，
   * 要么把适配层自己的合法引用报成违规（v0.1.1 第一次实现就踩了后者）。
   */
  const skipRoots = [installedRoot, agentRoot, adapterRoot];
  const forbiddenRoots = [installedRoot, agentRoot];
  const aliases = readPathAliases(productRoot);

  const violations = [];
  let scanned = 0;

  for (const { rel, abs } of walkSource(productRoot, skipRoots)) {
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    scanned += 1;
    if (!content.includes("installed") && !content.includes("@kits/")) continue;

    const fromDir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
    for (const { spec } of scanSpecifiers(content)) {
      // 1. 裸包说明符：源码安装必须把它们全部重写成相对路径
      if (spec.startsWith("@kits/")) {
        violations.push({
          file: rel,
          line: lineOf(content, spec),
          spec,
          resolved: null,
          reason: "引用了 @kits/* 裸包说明符 —— 源码安装后产品不应再依赖 Kits 包",
        });
        continue;
      }
      // 2. 相对 / 别名路径落到托管区
      const resolved = resolveSpecifier(spec, fromDir, aliases);
      if (resolved && insideManaged(resolved, forbiddenRoots)) {
        violations.push({
          file: rel,
          line: lineOf(content, spec),
          spec,
          resolved,
          reason: `直接引用了托管区（${resolved}）—— 应从 adapters/ 引用`,
        });
        continue;
      }

      /*
       * 3. 兜底：说明符里**字面**含有托管区路径。
       *
       * 为什么需要这一条：别名解析依赖产品的 tsconfig.json。产品没有
       * tsconfig（或在里面用了别的别名）时，`@/lib/kits/installed/…`
       * 会解析不出来，于是越界被**静默放过** —— 这比误报更糟。
       * 布局路径是 Kits 自己定的，直接按文本匹配既准确又不依赖配置。
       */
      const literal = spec.replace(/^[@~][^/]*\//, "/");
      if (
        forbiddenRoots.some(
          (root) => literal === `/${root}` || literal.startsWith(`/${root}/`),
        )
      ) {
        violations.push({
          file: rel,
          line: lineOf(content, spec),
          spec,
          resolved: null,
          reason: `说明符字面指向托管区（${forbiddenRoots.find((r) => literal.startsWith(`/${r}`))}）—— 应从 adapters/ 引用`,
        });
      }
    }
  }

  return { violations, scanned };
}

/** 找到某个说明符在文件里第一次出现的行号（1 起）。 */
function lineOf(content, spec) {
  const needle = `"${spec}"`;
  const single = `'${spec}'`;
  let index = content.indexOf(needle);
  if (index < 0) index = content.indexOf(single);
  if (index < 0) return null;
  return content.slice(0, index).split("\n").length;
}
