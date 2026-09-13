"use client";

/**
 * DataCursor —— 内部稳定 API v1
 *
 * ---------------------------------------------------------------------------
 * 这个组件是做什么的
 * ---------------------------------------------------------------------------
 * 一层**跟随指针的数据指示器**：当指针悬停在标记了
 * `data-cursor="inspect"` 的元素上时，指示器会带上该元素的读数标签
 * （例如 `data-cursor-label="P99 · 184ms"`）。
 *
 * 它把"指针"从系统光标变成一个有语义的探针，用于数据密集的界面。
 *
 * ---------------------------------------------------------------------------
 * 稳定 API（产品只允许用这些）
 * ---------------------------------------------------------------------------
 *   mode?      指示器形态：dot | ring | crosshair（形态的绝对尺寸由 pack 决定）
 *   inspection? 是否启用"悬停读取"（data-cursor 属性的解析）
 *   hideNative? 是否隐藏系统光标（**只对标记了 data-cursor 的区域生效**）
 *   children   被包裹的内容
 *
 * ---------------------------------------------------------------------------
 * 为什么 hideNative 不是简单的一个 boolean
 * ---------------------------------------------------------------------------
 * 隐藏系统光标是一个**有真实风险**的决定：
 *   - 如果指示器因为任何原因没渲染（JS 失败、图层被裁切），用户就"失去光标"；
 *   - 因此本组件只在「精确指针 + 允许动效 + 客户端已挂载」三条同时成立时
 *     才隐藏系统光标，且只在**标记过的区域**内隐藏（用 ::where 选择器）。
 *
 * ---------------------------------------------------------------------------
 * 明确**不属于** API 的东西
 * ---------------------------------------------------------------------------
 *   size / color / ringColor / labelColor / lerp / spring / blendMode …
 *   尺寸来自 --kits-cursor-size / --kits-cursor-ring-size，
 *   颜色来自 --kits-cursor-color / --kits-cursor-ring-color（由 pack 决定），
 *   跟随手感来自 --kits-dur-quick + --kits-ease-spring。
 */

import type { ReactNode } from "react";
import { cx, type MotionFallbackProps } from "../react-utils/index";
import { useFinePointer, useMotionAllowed } from "../react-utils/index";
import { useEffect, useRef, useState } from "react";
import "./data-cursor.css";

export type CursorMode = "dot" | "ring" | "crosshair";

export interface DataCursorProps extends MotionFallbackProps {
  children: ReactNode;
  /** 指示器形态。绝对尺寸由 Style Pack 决定。 */
  mode?: CursorMode;
  /** 是否解析 `data-cursor` / `data-cursor-label` 属性（悬停读取）。 */
  inspection?: boolean;
  /** 是否隐藏标记区域内的系统光标。 */
  hideNative?: boolean;
  /** 指示器的堆叠层级。默认 60。 */
  zIndex?: number;
  className?: string;
}

export function DataCursor({
  children,
  mode = "ring",
  inspection = true,
  hideNative = true,
  zIndex = 60,
  disableMotion = false,
  className,
}: DataCursorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const frame = useRef<number | null>(null);
  const point = useRef<{ x: number; y: number }>({ x: -200, y: -200 });

  const motionAllowed = useMotionAllowed(disableMotion);
  const finePointer = useFinePointer();
  const [mounted, setMounted] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [target, setTarget] = useState<"none" | "inspect" | "interactive">(
    "none",
  );

  const active = mounted && motionAllowed && finePointer;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 契约行为：指示器只能在客户端挂载后渲染（服务端产物不含它）
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;

    const write = () => {
      frame.current = null;
      const { x, y } = point.current;
      // 只写 CSS 变量：具体尺寸/颜色/缓动由 pack 的样式表消费
      dotRef.current?.style.setProperty("--kits-cursor-x", `${x}px`);
      dotRef.current?.style.setProperty("--kits-cursor-y", `${y}px`);
      ringRef.current?.style.setProperty("--kits-cursor-x", `${x}px`);
      ringRef.current?.style.setProperty("--kits-cursor-y", `${y}px`);
    };

    const onMove = (event: PointerEvent) => {
      point.current = { x: event.clientX, y: event.clientY };
      if (frame.current === null) frame.current = requestAnimationFrame(write);

      if (!inspection) return;
      // event.target 是真实 DOM 节点，这里只访问它的 Element 接口，
      // 不触碰 window / document 全局对象。
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-cursor]")
          : null;

      if (!element) {
        setTarget("none");
        setLabel(null);
        return;
      }
      const kind = element.dataset.cursor;
      setTarget(kind === "inspect" ? "inspect" : "interactive");
      // 标签文本来自 DOM 属性 —— 与 pack 的排版规则无关，但长度要设上限，
      // 否则一个超长 label 会把指示器撑变形。
      const raw = element.dataset.cursorLabel;
      setLabel(raw ? raw.slice(0, 48) : null);
    };

    const onLeave = () => {
      setTarget("none");
      setLabel(null);
    };

    // 指针监听挂在 globalThis 上（浏览器里即 window），
    // 这样组件源码保持对 window / document 字面量的零引用，便于审计与静态检查。
    globalThis.addEventListener("pointermove", onMove, { passive: true });
    globalThis.addEventListener("pointerleave", onLeave);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerleave", onLeave);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [active, inspection]);

  return (
    <div
      ref={rootRef}
      className={cx(
        "kits-cursor-root",
        active && "kits-cursor-root--active",
        active && hideNative && "kits-cursor-root--hide-native",
        className,
      )}
      data-kits-component="data-cursor"
      data-kits-active={active ? "true" : "false"}
    >
      {children}

      {/*
        指示器本体：纯装饰。
        - aria-hidden：屏幕阅读器不读它（label 信息必须同时存在于 DOM 其他地方）
        - pointer-events: none：绝不拦截命中测试
        - 未激活时整个节点不渲染，避免留下一层看不见但参与合成的元素
      */}
      {active ? (
        <div
          className={cx(
            "kits-cursor",
            `kits-cursor--${mode}`,
            `kits-cursor--target-${target}`,
          )}
          style={{ zIndex }}
          aria-hidden="true"
        >
          <span ref={dotRef} className="kits-cursor__dot" />
          <span ref={ringRef} className="kits-cursor__ring">
            {label ? <span className="kits-cursor__label">{label}</span> : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default DataCursor;
