/**
 * Style Pack Contract —— Kits 视觉资产的第一公民。
 *
 * 任何 Style Pack（无论自研还是外部引入）都必须在这份契约内表达自己。
 * 契约的存在只有一个目的：**让风格可替换，而不让产品代码知道换过**。
 *
 * 三层结构：
 *   1. Contract  —— 变量名与维度枚举（本文件 + styles/_contract/tokens.css）
 *   2. Pack      —— 每个 style pack 给这些变量填上自己的值
 *   3. Product   —— 只写 `data-kits-pack="cinematic"`，不写任何具体数值
 *
 * 严禁在 Product / Component 代码里出现 `#0b0e14`、`12px`、`cubic-bezier(...)`
 * 这类字面量 —— 它们只允许存在于 pack 的 tokens.css。
 */

/** 资产生命周期。incoming/experimental 的资产禁止进入业务 Prototype。 */
export const ASSET_STATUS = [
  "incoming",
  "experimental",
  "approved",
  "deprecated",
] as const;
export type AssetStatus = (typeof ASSET_STATUS)[number];

/**
 * 资产类型 —— 与 registry/assets.json 的 `type` 字段一一对应。
 *
 * 前四类是人看的资产；`package` 是**基础设施包**：它们不是视觉资产，
 * 但没有它们 style / component 无法被独立安装（契约的类型与编译函数、
 * 组件共享的降级 hook、Installer 自身）。它们同样走 registry 与状态门禁，
 * 因此"哪些文件被装进产品"永远是可审计的。
 */
export const ASSET_TYPE = [
  "style",
  "component",
  "effect",
  "skill",
  "package",
] as const;
export type AssetType = (typeof ASSET_TYPE)[number];

/* -------------------------------------------------------------------------- */
/* 十个必须明显不同的维度                                                       */
/* -------------------------------------------------------------------------- */

/** 1. 排版性格 */
export const TYPE_VOICE = ["editorial", "spatial", "instrumental"] as const;
export type TypeVoice = (typeof TYPE_VOICE)[number];

/** 2. 间距节奏 */
export const SPACING_RHYTHM = ["generous", "layered", "compact"] as const;
export type SpacingRhythm = (typeof SPACING_RHYTHM)[number];

/** 3. 信息密度 */
export const DENSITY = ["low", "medium", "high"] as const;
export type Density = (typeof DENSITY)[number];

/** 4. 圆角哲学 */
export const RADIUS_PHILOSOPHY = [
  "flush", // 0 半径：印刷直角，无圆角
  "square", // 1–3px：机械公差，有圆角但极小
  "soft",
  "continuous",
  "pill",
] as const;
export type RadiusPhilosophy = (typeof RADIUS_PHILOSOPHY)[number];

/** 5. 边界处理 */
export const BORDER_TREATMENT = [
  "hairline-rule",
  "none-with-depth",
  "hard-technical",
] as const;
export type BorderTreatment = (typeof BORDER_TREATMENT)[number];

/** 6. 表面处理 */
export const SURFACE_TREATMENT = [
  "paper",
  "ambient-glow",
  "panel",
] as const;
export type SurfaceTreatment = (typeof SURFACE_TREATMENT)[number];

/** 7. 导航手感 */
export const NAVIGATION_FEEL = [
  "running-head",
  "overlay-space",
  "rail-console",
] as const;
export type NavigationFeel = (typeof NAVIGATION_FEEL)[number];

/** 8. 数据可视化语言 */
export const DATA_LANGUAGE = [
  "ink-rules",
  "glow-series",
  "instrument-grid",
] as const;
export type DataLanguage = (typeof DATA_LANGUAGE)[number];

/** 9. 动效语言 */
export const MOTION_LANGUAGE = [
  "restrained",
  "atmospheric",
  "precise",
] as const;
export type MotionLanguage = (typeof MOTION_LANGUAGE)[number];

/** 10. 视觉层级建立方式 */
export const HIERARCHY_METHOD = [
  "scale-and-space",
  "light-and-depth",
  "rule-and-label",
] as const;
export type HierarchyMethod = (typeof HIERARCHY_METHOD)[number];

/** 一个 Style Pack 在十个维度上的立场。Registry 与文档都从这里派生。 */
export interface StylePackProfile {
  typeVoice: TypeVoice;
  spacingRhythm: SpacingRhythm;
  density: Density;
  radiusPhilosophy: RadiusPhilosophy;
  borderTreatment: BorderTreatment;
  surfaceTreatment: SurfaceTreatment;
  navigationFeel: NavigationFeel;
  dataLanguage: DataLanguage;
  motionLanguage: MotionLanguage;
  hierarchyMethod: HierarchyMethod;
}

/* -------------------------------------------------------------------------- */
/* Motion Contract                                                             */
/* -------------------------------------------------------------------------- */

/**
 * 动效层级。Motion 服务于状态变化 / 层级 / 反馈 / 数据交互，
 * 任何不属于这四类的动画都不允许存在（见 skills/motion-direction/SKILL.md）。
 */
export const MOTION_ROLES = [
  "enter", // 元素入场：建立层级
  "interact", // 交互反馈：确认输入
  "ambient", // 环境动效：空间感，不携带信息
  "data", // 数据交互：图形与读数的响应
] as const;
export type MotionRole = (typeof MOTION_ROLES)[number];

export type MotionDurationName = "instant" | "quick" | "base" | "slow" | "ambient";
export type MotionEaseName = "out" | "inOut" | "linear" | "spring";

/** `motion.ts` 必须导出的形状。单位：毫秒 / CSS 时间函数。 */
export interface StylePackMotion {
  /** 该 pack 的动效性格 */
  language: MotionLanguage;
  /** 时长刻度（ms） */
  duration: Record<MotionDurationName, number>;
  /** 缓动刻度（CSS easing 字符串） */
  ease: Record<MotionEaseName, string>;
  /** 层级顺序 + 每级步进（ms），供 stagger 使用 */
  staggerStep: number;
  /** 环境动效周期（ms） */
  ambientCycle: number;
  /** 进入动效位移量（px 或 CSS 长度） */
  enterDistance: string;
  /** 指针驱动的位移强度倍率（0 = 完全禁用指针视差） */
  pointerFactor: number;
  /** 该 pack 允许使用的动效角色 */
  roles: readonly MotionRole[];
  /** 无障碍：reduced-motion 下保留哪些（弱化的、非位移的）反馈 */
  reducedMotion: {
    /** 全部动画时长坍缩到的值（ms），0 表示完全静态 */
    collapseTo: number;
    /** 是否保留透明度淡入 */
    keepOpacity: boolean;
    /** 是否保留颜色/描边等非位移动效 */
    keepColor: boolean;
    /** reduced-motion 下应当完全关闭的角色 */
    disableRoles: readonly MotionRole[];
  };
  /** 移动端约束 */
  mobile: {
    /** 小于该宽度（px）时启用移动降级 */
    breakpoint: number;
    /** 移动端是否允许指针视差（触屏通常应 false） */
    pointer: boolean;
    /** 移动端位移量缩放 */
    distanceScale: number;
    /** 移动端环境动效是否关闭（省电 / 省性能） */
    ambient: boolean;
  };
}

/* -------------------------------------------------------------------------- */
/* 校验                                                                        */
/* -------------------------------------------------------------------------- */

const REQUIRED_DURATIONS: MotionDurationName[] = [
  "instant",
  "quick",
  "base",
  "slow",
  "ambient",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 运行时校验一份 `motion.ts`。Playground 与测试都用它，
 * 因此 pack 作者写错字段会在 CI 里立刻暴露，而不是等到产品上线。
 */
export function assertStylePackMotion(
  value: unknown,
  label = "motion",
): asserts value is StylePackMotion {
  if (!isRecord(value)) throw new Error(`${label}: 必须是对象`);
  if (!MOTION_LANGUAGE.includes(value.language as MotionLanguage)) {
    throw new Error(`${label}.language 非法: ${String(value.language)}`);
  }
  const duration = value.duration;
  if (!isRecord(duration)) throw new Error(`${label}.duration 缺失`);
  for (const name of REQUIRED_DURATIONS) {
    const v = duration[name];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new Error(`${label}.duration.${name} 非法: ${String(v)}`);
    }
    if (name !== "ambient" && v > 1000) {
      throw new Error(
        `${label}.duration.${name}=${v}ms 过长，交互动效上限 1000ms`,
      );
    }
  }
  const ease = value.ease;
  if (!isRecord(ease)) throw new Error(`${label}.ease 缺失`);
  for (const name of ["out", "inOut", "linear", "spring"] as const) {
    if (typeof ease[name] !== "string" || !ease[name]) {
      throw new Error(`${label}.ease.${name} 非法: ${String(ease[name])}`);
    }
  }
  if (typeof value.staggerStep !== "number" || value.staggerStep < 0) {
    throw new Error(`${label}.staggerStep 非法`);
  }
  if (typeof value.ambientCycle !== "number" || value.ambientCycle < 0) {
    throw new Error(`${label}.ambientCycle 非法`);
  }
  if (typeof value.enterDistance !== "string") {
    throw new Error(`${label}.enterDistance 必须是 CSS 长度字符串`);
  }
  if (typeof value.pointerFactor !== "number" || value.pointerFactor < 0) {
    throw new Error(`${label}.pointerFactor 非法`);
  }
  if (!Array.isArray(value.roles) || value.roles.length === 0) {
    throw new Error(`${label}.roles 必须是非空数组`);
  }
  for (const role of value.roles) {
    if (!MOTION_ROLES.includes(role as MotionRole)) {
      throw new Error(`${label}.roles 含非法角色: ${String(role)}`);
    }
  }
  if (!isRecord(value.reducedMotion)) {
    throw new Error(`${label}.reducedMotion 缺失`);
  }
  if (!isRecord(value.mobile)) throw new Error(`${label}.mobile 缺失`);
  return;
}

/**
 * 把一份 motion.ts 编译成 CSS 自定义属性。
 * 这是 motion 从 TS 进入 CSS 的**唯一**通道，组件只读 CSS 变量，
 * 因此换 pack 不需要动任何组件代码。
 */
export function motionToCssVars(
  motion: StylePackMotion,
): Record<string, string> {
  const vars: Record<string, string> = {
    "--kits-dur-instant": `${motion.duration.instant}ms`,
    "--kits-dur-quick": `${motion.duration.quick}ms`,
    "--kits-dur-base": `${motion.duration.base}ms`,
    "--kits-dur-slow": `${motion.duration.slow}ms`,
    "--kits-dur-ambient": `${motion.duration.ambient}ms`,
    "--kits-ease-out": motion.ease.out,
    "--kits-ease-inout": motion.ease.inOut,
    "--kits-ease-linear": motion.ease.linear,
    "--kits-ease-spring": motion.ease.spring,
    "--kits-stagger-step": `${motion.staggerStep}ms`,
    "--kits-ambient-cycle": `${motion.ambientCycle}ms`,
    "--kits-enter-distance": motion.enterDistance,
    "--kits-pointer-factor": String(motion.pointerFactor),
  };
  return vars;
}
