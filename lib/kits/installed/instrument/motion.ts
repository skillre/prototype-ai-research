/**
 * Style Pack · instrument · motion
 *
 * 动效语言：precise（精确）。
 *
 * 仪表不会"呼吸"。这里的动效只有两个目的：
 *   1. 状态切换要被立刻看见（所以极短：50–220ms，且用 linear 或短 ease-out）；
 *   2. 数值变化要在原地完成（所以位移只有 4px，禁止任何入场"漂浮"）。
 *
 * 关键取舍：`roles` 里**没有 ambient**。
 * 工业面板上不存在"无意义但好看"的动画 —— 网格不呼吸、刻度不流动。
 * 这是 instrument 与 cinematic 最本质的动效分歧。
 */

import type { StylePackMotion } from "../contracts/index";

export const instrumentMotion: StylePackMotion = {
  language: "precise",

  duration: {
    instant: 50, // 按压反馈：必须感觉不到延迟
    quick: 100,
    base: 160,
    slow: 220, // 上限只有 220ms：仪表不做慢动作
    ambient: 4000,
  },

  // 缓动：线性为主。仪器是恒速的，曲线会引入"情绪"。
  ease: {
    out: "cubic-bezier(0.2, 0, 0.4, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.6, 1)",
    linear: "linear",
    spring: "cubic-bezier(0.2, 0, 0.4, 1)", // 无回弹：spring === out
  },

  staggerStep: 25, // 逐行点亮，节奏像扫描而不是像阅读
  ambientCycle: 4000,
  enterDistance: "4px", // 几乎不位移：内容应该"本来就位"
  pointerFactor: 0.4, // 指针有反馈，但只用于读数跟随，不做大范围视差

  // 没有 ambient：仪表不做无信息量的持续动画
  roles: ["enter", "interact", "data"],

  reducedMotion: {
    collapseTo: 0,
    keepOpacity: false, // 不加淡入：状态切换必须瞬时可见，延迟反而是错误
    keepColor: true, // 颜色变化保留：它是状态信号，不是装饰
    disableRoles: ["enter", "interact", "ambient", "data"],
  },

  mobile: {
    breakpoint: 640,
    pointer: false,
    distanceScale: 1, // 位移本来就只有 4px，不再缩放
    ambient: false,
  },
};

export default instrumentMotion;
