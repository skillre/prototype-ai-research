/**
 * AI Reviewer —— 数据契约与校验。**没有任何模型调用。**
 *
 * ## 为什么先写这里
 *
 * 本阶段要证明的是**产品契约**，不是模型能力。所以 AI 的输出在这里是一组
 * 受约束的数据形状，而不是一次 API 调用。这样做的实际好处是：契约可以在
 * 没有模型、没有网络、没有密钥的情况下被完整测试。等真正的模型接进来时，
 * 它要么产出符合契约的东西，要么被拒绝——**模型的能力不可能绕过契约**。
 *
 * ## 三类输出，三条硬规则
 *
 * | 类 | 硬规则 | 违反时 |
 * |---|---|---|
 * | `factual` | `passageIds.length >= 1` 且全部可解析 | **不得被构造出来** |
 * | `critique` | `target` 必须指向真实存在的 Claim / EvidenceLink | **不得被构造出来** |
 * | `suggestion` | 允许零引用 | 但**永远不得进入 Finding** |
 *
 * 第三条是最容易松懈的一条。意见是意见，可以是好意见；但把它写进交付物，
 * 就是把 AI 的判断冒充成材料的判断——而这份交付物是要被署名的。
 */

import { getClaim, getLink, getPassage } from "./projections"
import type {
  AiCritiqueOutput,
  AiDocument,
  AiFactualOutput,
  AiOutput,
  AiSuggestionOutput,
  Id,
  ResearchData,
} from "./types"

/** 一条校验失败。`code` 稳定，便于测试与界面分类；`message` 给人看。 */
export interface AiOutputIssue {
  code: string
  message: string
}

/** 校验结果：要么通过，要么带着具体原因被拒。 */
export type AiOutputValidation =
  | { ok: true; output: AiOutput }
  | { ok: false; issues: AiOutputIssue[] }

/* -------------------------------------------------------------------------- */
/* 逐类校验                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Class 1 · 事实抽取。
 *
 * 无引用的「事实」不是「低置信度事实」，它**不是事实**。所以这里没有任何
 * 「降级为低置信」的选项：`passageIds` 为空就直接不成立。
 *
 * 每条 id 都要真的解析到 Passage——引用一个不存在的段落是最坏的失败模式，
 * 因为它看起来和真引用一模一样，直到有人去核对。
 */
export function validateFactualOutput(
  data: ResearchData,
  output: Pick<AiFactualOutput, "passageIds">,
): AiOutputIssue[] {
  const issues: AiOutputIssue[] = []

  if (output.passageIds.length === 0) {
    issues.push({
      code: "ai/factual-needs-passage",
      message: "事实型输出必须至少挂一条原文片段。无出处的断言不是低置信事实，它根本不得存在。",
    })
    return issues
  }

  const unresolved = output.passageIds.filter((id) => getPassage(data, id) === undefined)
  if (unresolved.length > 0) {
    issues.push({
      code: "ai/factual-unresolved-passage",
      message: `引用了不存在的原文片段：${unresolved.join(", ")}。不可核查的引用必须被拒绝，而不是被容忍。`,
    })
  }

  return issues
}

/**
 * Class 2 · 反驳 / 证据批评。
 *
 * 必须有靶心。没有 `target` 的批评（「建议再深入一些」）不可被处理，
 * 所以它只会变成噪音，而且会稀释真正有靶心的那些批评。
 */
export function validateCritiqueOutput(
  data: ResearchData,
  output: Pick<AiCritiqueOutput, "target">,
): AiOutputIssue[] {
  const { target } = output

  if (target.type === "claim") {
    return getClaim(data, target.id)
      ? []
      : [
          {
            code: "ai/critique-unknown-target",
            message: `批评指向了不存在的论断：${target.id}`,
          },
        ]
  }

  return getLink(data, target.id)
    ? []
    : [
        {
          code: "ai/critique-unknown-target",
          message: `批评指向了不存在的证据链接：${target.id}`,
        },
      ]
}

/**
 * Class 3 · 意见 / 建议。
 *
 * 唯一一条校验是**非空文本**。允许零引用是刻意的：要求意见也必须有出处，
 * 会逼着它伪装成事实型输出——那比没有意见更糟。
 *
 * 它的约束不在「能否存在」，而在「能否进入交付物」。见 `mayEnterFinding`。
 */
export function validateSuggestionOutput(
  output: Pick<AiSuggestionOutput, "text">,
): AiOutputIssue[] {
  if (output.text.trim().length === 0) {
    return [{ code: "ai/suggestion-empty", message: "建议的文本为空。" }]
  }
  return []
}

/* -------------------------------------------------------------------------- */
/* 统一入口                                                                     */
/* -------------------------------------------------------------------------- */

/** 按 kind 分派到对应的校验。 */
export function validateAiOutput(
  data: ResearchData,
  output:
    | Pick<AiFactualOutput, "kind" | "passageIds">
    | Pick<AiCritiqueOutput, "kind" | "target">
    | Pick<AiSuggestionOutput, "kind" | "text">,
): AiOutputIssue[] {
  switch (output.kind) {
    case "factual":
      return validateFactualOutput(data, output)
    case "critique":
      return validateCritiqueOutput(data, output)
    case "suggestion":
      return validateSuggestionOutput(output)
  }
}

/**
 * 构造一条 AI 输出。**校验不通过就不返回对象。**
 *
 * 这是「不得被构造出来」这句硬规则的落点。提供一个「先构造、再标记为无效」
 * 的 API 是很容易的，但那样无效输出就会存在于数据里——而只要它存在，
 * 迟早会在某个环节被当成有效的东西用掉。
 */
export function constructAiOutput<T extends AiOutput>(data: ResearchData, candidate: T): AiOutputValidation {
  const issues = validateAiOutput(data, candidate)
  return issues.length > 0 ? { ok: false, issues } : { ok: true, output: candidate }
}

/**
 * 这条输出能否进入 Finding 的正文。
 *
 * `suggestion` 永远不能。这不是「建议一般」——它可能是最好的判断，
 * 但 Finding 是研究者署名的东西，其中每一句话都必须能被追到材料上。
 * 建议的位置在旁注和未决事项带里，不在交付物里。
 */
export function mayEnterFinding(output: AiOutput): boolean {
  return output.kind !== "suggestion"
}

/** 这条输出是否携带来源依据（决定它在界面上的视觉等级）。 */
export function isEvidenceBacked(output: AiOutput): boolean {
  return output.kind === "factual"
}

/** 供检索与调试：一条输出指向的对象 id 列表。 */
export function subjectsOf(output: AiOutput): Id[] {
  switch (output.kind) {
    case "factual":
      return [...output.passageIds]
    case "critique":
      return [output.target.id, ...(output.opposingPassageIds ?? [])]
    case "suggestion":
      return []
  }
}

/* -------------------------------------------------------------------------- */
/* 文档                                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 把 AI 输出整理成一份「意见书」。
 *
 * 这是 Phase F 的输入，不是本阶段的实现。类型放这里是因为它决定了
 * 三类输出如何被一起持有、以及它们的相对视觉权重来自哪里。
 */
export function buildAiDocument(
  data: ResearchData,
  outputs: AiOutput[],
): AiDocument {
  const accepted = outputs.filter((output) => {
    const issues = validateAiOutput(data, output)
    return issues.length === 0
  })

  return {
    factual: accepted.filter((output): output is AiFactualOutput => output.kind === "factual"),
    critiques: accepted.filter((output): output is AiCritiqueOutput => output.kind === "critique"),
    suggestions: accepted.filter((output): output is AiSuggestionOutput => output.kind === "suggestion"),
  }
}
