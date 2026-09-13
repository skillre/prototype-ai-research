/**
 * @kits/style-instrument —— pack 的 TypeScript 入口。
 *
 * CSS 主入口：`import "@kits/style-instrument/tokens.css";`
 */

import type { StylePackMotion, StylePackProfile } from "../contracts/index";
import { instrumentMotion } from "./motion";

export { instrumentMotion };
export default instrumentMotion;

export const instrumentMotionTokens: StylePackMotion = instrumentMotion;

export const instrumentProfile: StylePackProfile = {
  typeVoice: "instrumental",
  spacingRhythm: "compact",
  density: "high",
  radiusPhilosophy: "square",
  borderTreatment: "hard-technical",
  surfaceTreatment: "panel",
  navigationFeel: "rail-console",
  dataLanguage: "instrument-grid",
  motionLanguage: "precise",
  hierarchyMethod: "rule-and-label",
};

export const instrumentMeta = {
  id: "instrument",
  name: "Instrument",
  selector: '[data-kits-pack="instrument"]',
  cssEntry: "@kits/style-instrument/tokens.css",
} as const;
