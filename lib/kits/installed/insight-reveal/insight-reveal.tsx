"use client";

/**
 * InsightReveal —— 内部稳定 API v1
 *
 * ---------------------------------------------------------------------------
 * 这个组件是做什么的
 * ---------------------------------------------------------------------------
 * 当内容滚动进入视口时，**按阅读顺序逐段揭示**。
 *
 * 它解决的不是"好看"的问题，而是**层级**问题：
 * 一份长内容一次性全部出现时，读者不知道从哪里开始；
 * 逐段揭示把阅读顺序变成可见的节奏，并把注意力引导到当前段落。
 *
 * ---------------------------------------------------------------------------
 * 稳定 API（产品只允许用这些）
 * ---------------------------------------------------------------------------
 *   step?      揭示的**粒度**：one（整体）/ group（按直接子元素分组）
 *   shift?     位移档位：none | subtle | medium | strong
 *   blur?      是否带景深模糊（cinematic 的"从远到近"）
 *   once?      是否只揭示一次（默认 true）
 *   as?        语义元素
 *
 * ---------------------------------------------------------------------------
 * 明确**不属于** API 的东西
 * ---------------------------------------------------------------------------
 *   distance(px) / duration(ms) / easing / delay / threshold / blurRadius …
 *   位移来自 --kits-reveal-distance，模糊来自 --kits-reveal-blur，
 *   时长来自 --kits-dur-*，步进来自 --kits-stagger-step —— 全部由 pack 决定。
 *
 * ---------------------------------------------------------------------------
 * 三层降级（全部内建）
 * ---------------------------------------------------------------------------
 *   1. 无 IntersectionObserver → 立即揭示（不做动画）
 *   2. prefers-reduced-motion / disableMotion → 立即揭示
 *   3. **JS 完全失败** → CSS `@media (scripting: none)` 兜底，内容直接可见
 *
 * 第 3 条是最容易被忽略的一条：如果"隐藏"写在 CSS 类上而"显示"依赖 JS，
 * 那么 JS 一挂，整页内容就是空白。
 */

import { Children, type ReactNode } from "react";
import { cx, type MotionFallbackProps } from "../react-utils/index";
import { useReveal } from "../react-utils/index";
import "./insight-reveal.css";

export type RevealStep = "one" | "group";
export type RevealShift = "none" | "subtle" | "medium" | "strong";

export interface InsightRevealProps extends MotionFallbackProps {
  children: ReactNode;
  /** 揭示粒度。`group` 会为每个直接子元素分配一个步进序号。 */
  step?: RevealStep;
  /** 位移档位。实际像素由 pack 的 `--kits-reveal-distance` 决定。 */
  shift?: RevealShift;
  /** 景深模糊。cinematic 有意义（`--kits-reveal-blur: 6px`），其他 pack 为 0。 */
  blur?: boolean;
  /** 只揭示一次，还是每次进入视口都揭示。默认 true。 */
  once?: boolean;
  as?: "div" | "section" | "article" | "ol" | "ul";
  /** 最大步进序号。超出的子元素不再延迟（避免第 20 段等 1.4 秒）。 */
  maxStagger?: number;
  className?: string;
  id?: string;
}

const SHIFT_SCALE: Record<RevealShift, number> = {
  none: 0,
  subtle: 0.5,
  medium: 1,
  strong: 1.8,
};

export function InsightReveal({
  children,
  step = "group",
  shift = "medium",
  blur = false,
  once = true,
  as: Element = "div",
  maxStagger = 6,
  disableMotion = false,
  className,
  id,
}: InsightRevealProps) {
  const { ref, visible, animated } = useReveal({ disableMotion, once });

  const items = Children.toArray(children);

  return (
    <Element
      /*
       * 根元素是联合类型（div | section | article | ol | ul），因此 ref
       * 必须收窄成一个对所有分支都可赋值的形态。
       *
       * 一次真实接入曾在消费方的 `tsc` 上对这个位置报 TS2322，
       * 看起来像是这行断言的锅 —— 其实是 @types/react 的版本漂移：
       * 消费方跟着符号链接到本文件真实路径编译，用**本仓库自己的**
       * @types/react 检查，于是同一次编译里出现两份 VoidOrUndefinedOnly，
       * 报出 "Two different types with this name exist, but they are unrelated"。
       * 根因在依赖策略（见 package.json 的 peer/dev 分工与 kits doctor），
       * 不在这里。因此这行保持不变 —— 不要为了掩盖版本问题而加断言。
       */
      ref={ref as React.Ref<never>}
      id={id}
      className={cx(
        "kits-reveal",
        step === "group" && "kits-reveal--group",
        animated && "kits-reveal--animated",
        once && "kits-reveal--once",
        shift !== "none" && "kits-reveal--shift",
        blur && "kits-reveal--blur",
        className,
      )}
      style={{
        // 位移与模糊的"档位乘数"在这里合成，绝对数值仍由 pack 决定
        ["--kits-reveal-shift-scale" as string]: String(SHIFT_SCALE[shift]),
      }}
      data-kits-component="insight-reveal"
      data-kits-visible={visible ? "true" : "false"}
      data-kits-step={step}
    >
      {step === "group"
        ? items.map((child, index) => (
            /*
             * 宿主 wrapper —— 步进序号的**唯一落点**。
             *
             * 旧实现用 `cloneElement(child, { style: … })` 把
             * `--kits-reveal-index` 写给子元素。那要求子元素必须把 `style`
             * 原样转发到自己的宿主元素上；而产品里的子元素通常是自定义
             * 组件（有自己的 props、不接收 style），于是变量被 React 静默丢弃：
             *
             *     children[0].getAttribute("style")  →  null
             *     --kits-reveal-index                →  ""     ← 步进彻底失效
             *
             * 不报错、不警告，只是不生效 —— 组件不应当依赖消费方配合才能工作。
             * 现在由组件自己建立宿主：DOM 里**一定**存在带序号的元素，
             * 消费方不需要知道这件事。
             *
             * `display: contents` 让这一层对布局不可见（见 insight-reveal.css），
             * 因此 flex 容器的间距、网格的列数都不受影响。
             */
            <div
              key={index}
              /*
               * role="presentation"：这一层是纯装饰的步进宿主，不承载语义。
               *
               * 这里**曾经**写的是 aria-hidden="true"，那是一个 P0 无障碍回归
               * （v0.1.1 修复，见 CHANGELOG K-01）。区别在于：
               *
               *   aria-hidden="true"      → 把**整棵子树**从无障碍树剪掉。
               *                             display:contents 只影响布局，不阻止剪枝。
               *   role="presentation"     → 只声明"本元素无语义"，**不剪枝**，
               *                             后代的 heading / button / link /
               *                             listitem 照常暴露。
               *
               * 真实证据（第二次 Source Installation 实验）：DOM 里按钮存在，
               * 但 getByRole("button") 命中 0 —— 屏幕阅读器读不到整个洞察层。
               *
               * 用 role="presentation" 而不是"什么都不写"：如果产品把
               * display:contents 改掉（例如为了给每段做位移动画而改成 block），
               * 这个 div 就会变成真实盒子；不带 role 时它会成为一个匿名节点，
               * 破坏 ul/ol 与 listitem 之间的父子关系。显式声明更稳。
               */
              role="presentation"
              className="kits-reveal__item"
              data-kits-reveal-item=""
              data-kits-reveal-index={index}
              style={
                {
                  // 序号作为 CSS 变量；CSS 用 calc 与 pack 的
                  // --kits-reveal-stagger 相乘得到延迟。绝对步进值组件不知道。
                  "--kits-reveal-index": String(Math.min(index, maxStagger)),
                } as React.CSSProperties
              }
            >
              {child}
            </div>
          ))
        : children}
    </Element>
  );
}

export default InsightReveal;
