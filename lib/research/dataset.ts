/**
 * 确定性 mock 数据集 —— 「A 路线与 B 路线」的研究快照。
 *
 * ## 这个数据集的任务
 *
 * 不是「好看」，而是**把每一条不变量都逼到台面上**。它是 Phase A 的规格书：
 * 如果某个实体或某条规则在数据里体现不出来，那它在这一阶段就不该存在。
 *
 * 它必须同时触发五类张力、包含一条被撤回的论断、包含一份失效来源、
 * 并且有一条 Finding 建立在多条论断之上（其中一条明显比其它弱）。
 *
 * ## 确定性
 *
 * 全部时间戳是固定字面量。没有 `Date.now()`，没有随机数，没有 UUID 生成器。
 * 理由：不变量测试要能对**具体数值**断言，而任何一次「重跑就变」都会让
 * 断言的失败变得无法复现。
 *
 * ## 全是虚构的
 *
 * 公司、报告、访谈对象、数字都是编的。刻意不映射到任何真实公司或真实数据。
 * 数字取的是「像一个真人在这个阶段会看到的东西」，不是「精确的行业事实」。
 *
 * ## 关于轨迹的完整性
 *
 * 夹具里记录了**叙事相关的**事件：六条论断的创建、被撤回论断的完整生命周期、
 * 一条张力的处置、一条 AI 建议的驳回。
 *
 * 真实运行时 `addLink` 也会写 `link-created`；夹具略去了这些条目以免淹没重点。
 * 这不是遗漏——不变量依赖的是 `claim-retracted` / `link-retired` / 实体的
 * 历史投影，与链接的创建记录无关。
 */

import type {
  AiOutput,
  Claim,
  EvidenceLink,
  Finding,
  Passage,
  Question,
  Research,
  ResearchData,
  Source,
  TraceEntry,
} from "./types"

/* -------------------------------------------------------------------------- */
/* 时间                                                                        */
/* -------------------------------------------------------------------------- */

/** 研究开始。所有时间戳都相对它排布，且全部写死。 */
const T0 = "2026-09-01T09:00:00+08:00"
const T_COLLECT = "2026-09-02T14:20:00+08:00"
const T_CLAIMS = "2026-09-05T10:05:00+08:00"
const T_RETRACT = "2026-09-07T16:40:00+08:00"
const T_REVIEW = "2026-09-08T11:15:00+08:00"
const T_DISPOSITION = "2026-09-09T15:30:00+08:00"

/* -------------------------------------------------------------------------- */
/* Research 与 Questions                                                       */
/* -------------------------------------------------------------------------- */

const research: Research = {
  id: "res-load-bearing",
  // title 刻意留空：产品名尚未决定，工作代号不该被硬编码进数据。
  questionId: "q-route-verdict",
  scope: {
    in: ["A 路线与 B 路线的量产可行性", "两条路线的成本结构", "客户端采用意愿"],
    // 「不做什么」写下来才有价值：一周后没人记得当初为什么排除它。
    out: ["两家公司的财务尽调", "专利有效性", "监管政策走向"],
  },
  status: "active",
  createdAt: T0,
}

const questions: Question[] = [
  {
    id: "q-route-verdict",
    researchId: research.id,
    text: "A 路线与 B 路线，哪个更可能先跑出来？",
    parentQuestionId: null,
    status: "open",
  },
  {
    id: "q-capacity",
    researchId: research.id,
    text: "A 路线的产能瓶颈是否已经解除？",
    parentQuestionId: "q-route-verdict",
    status: "open",
  },
  {
    id: "q-cost-curve",
    researchId: research.id,
    text: "B 路线的成本曲线是否已到拐点？",
    parentQuestionId: "q-route-verdict",
    status: "open",
  },
  {
    id: "q-outsourcing",
    researchId: research.id,
    text: "C 路线（海外代工）是否值得纳入比较？",
    parentQuestionId: "q-route-verdict",
    // 被放弃的子问题。它本身是一个状态，不是一条被删掉的记录。
    status: "abandoned",
  },
]

/* -------------------------------------------------------------------------- */
/* Sources（8）                                                                 */
/* -------------------------------------------------------------------------- */

const sources: Source[] = [
  {
    id: "src-broker-industry-deck",
    researchId: research.id,
    kind: "pdf",
    title: "2026 行业深度：产能与成本的双轨",
    origin: "券商研究报告（内部传阅版）",
    retrievedAt: T_COLLECT,
    sourceType: "secondary",
    validity: "ok",
    contentHash: "sha256:4f1a9c2e",
  },
  {
    id: "src-equipment-whitepaper",
    researchId: research.id,
    kind: "pdf",
    title: "第二条产线技术白皮书（公开版）",
    origin: "设备供应商官网 PDF",
    retrievedAt: T_COLLECT,
    sourceType: "primary",
    validity: "ok",
    contentHash: "sha256:8b30dd17",
  },
  {
    id: "src-association-stats",
    researchId: research.id,
    kind: "dataset",
    title: "行业协会年度统计：分季度产能利用率",
    origin: "行业协会公开数据下载",
    retrievedAt: T_COLLECT,
    sourceType: "secondary",
    validity: "ok",
    contentHash: "sha256:1c77e5b0",
  },
  {
    id: "src-operator-interviews",
    researchId: research.id,
    kind: "transcript",
    title: "两家厂商负责人的访谈转写",
    origin: "访谈录音（已脱敏转写）",
    retrievedAt: T_COLLECT,
    sourceType: "primary",
    validity: "ok",
    contentHash: "sha256:9ade4013",
  },
  {
    id: "src-media-cost-report",
    researchId: research.id,
    kind: "web",
    title: "B 路线成本下降的行业报道",
    origin: "财经媒体",
    retrievedAt: T_COLLECT,
    sourceType: "secondary",
    validity: "ok",
    contentHash: "sha256:2e6b8a94",
  },
  {
    id: "src-paid-summary",
    researchId: research.id,
    kind: "pdf",
    title: "某咨询公司付费摘要（对第三方报告的转述）",
    origin: "第三方摘要服务",
    retrievedAt: T_COLLECT,
    sourceType: "tertiary",
    validity: "ok",
    contentHash: "sha256:77c1f203",
  },
  {
    id: "src-legacy-forecast",
    researchId: research.id,
    kind: "web",
    title: "早期市场预测（发布于 2024 年）",
    origin: "行业媒体的预测专栏",
    retrievedAt: T_COLLECT,
    sourceType: "tertiary",
    // 这一份**已经失效**：原文页面在两周前改版，引用的段落找不到了。
    // 它是 stale-source 张力的来源，也是 basisStatus = invalidated 的来源。
    validity: "stale",
    contentHash: "sha256:05aa9e31",
  },
  {
    id: "src-internal-dd",
    researchId: research.id,
    kind: "transcript",
    title: "内部尽调访谈记录",
    origin: "内部访谈（已脱敏）",
    retrievedAt: T_COLLECT,
    sourceType: "primary",
    validity: "ok",
    contentHash: "sha256:cd42b18f",
  },
]

/* -------------------------------------------------------------------------- */
/* Passages（14）                                                               */
/* -------------------------------------------------------------------------- */

const passages: Passage[] = [
  /* --- c1：A 路线产能（来源健康，两个独立来源交叉印证） --- */
  {
    id: "psg-equipment-nameplate",
    sourceId: "src-equipment-whitepaper",
    locator: { page: 12 },
    text: "第二条产线的设计产能为 3.2 万吨/年，标准爬坡周期 14 个月。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-association-utilization",
    sourceId: "src-association-stats",
    locator: { anchor: "2026-H1" },
    text: "2026 年上半年行业整体产能利用率 81%，较去年同期上升 6 个百分点。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-equipment-qualifier",
    sourceId: "src-equipment-whitepaper",
    locator: { page: 21 },
    text: "上述产能数字以满负荷运行为前提；实际产出仍受上游原料供给节奏约束。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-association-methodology",
    sourceId: "src-association-stats",
    locator: { anchor: "methodology" },
    text: "利用率口径为「实际产出 / 设计产能」，样本覆盖 34 家在产企业，未含试产线。",
    quotedAt: T_CLAIMS,
  },

  /* --- c3：单一来源（两段引用，来自同一份报告） --- */
  {
    id: "psg-broker-utilization",
    sourceId: "src-broker-industry-deck",
    locator: { page: 24 },
    text: "两家头部厂商的产能利用率在 2026 年一季度已回升至 85% 以上。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-broker-schedule",
    sourceId: "src-broker-industry-deck",
    locator: { page: 31 },
    text: "从在手订单结构看，A 路线的平均排产周期已从 11 周缩短至 6 周。",
    quotedAt: T_CLAIMS,
  },

  /* --- c4：存在反驳（两个支持来源 + 一条反驳） --- */
  {
    id: "psg-equipment-yield",
    sourceId: "src-equipment-whitepaper",
    locator: { page: 18 },
    text: "良率在量产第 9 个月达到 94%，此后维持在 93%–95% 区间。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-dd-yield",
    sourceId: "src-internal-dd",
    locator: { tStart: 742 },
    text: "访谈对象称：试点线良率长期停在 91% 附近，与供应商给出的曲线有 3 个点的差距。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-media-cost-curve",
    sourceId: "src-media-cost-report",
    locator: { anchor: "cost-curve" },
    text: "报道指出 B 路线的单位成本下降速度快于预期，A 路线的良率优势正在被抹平。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-dd-background",
    sourceId: "src-internal-dd",
    locator: { tStart: 315 },
    text: "访谈背景：该对象负责过两条不同路线的试产，口径以自有产线为准。",
    quotedAt: T_CLAIMS,
  },

  /* --- c5：只由三手来源支撑，且其中一份已失效 --- */
  {
    id: "psg-summary-cost",
    sourceId: "src-paid-summary",
    locator: { page: 3 },
    text: "摘要转述称：B 路线的单位成本在两年内下降 34%，主要来自规模效应。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-legacy-costbottom",
    sourceId: "src-legacy-forecast",
    locator: { anchor: "section-5" },
    text: "早期预测认为 B 路线的成本将在 2026 年前后触底，此后降幅收窄。",
    quotedAt: T_CLAIMS,
  },

  /* --- 撤回论断留下的痕迹：链接已停用，原文片段保留 --- */
  {
    id: "psg-media-expansion",
    sourceId: "src-media-cost-report",
    locator: { anchor: "capacity" },
    text: "报道称 A 路线厂商已宣布新一轮扩产计划，预计次年投产。",
    quotedAt: T_CLAIMS,
  },
  {
    id: "psg-broker-demand",
    sourceId: "src-broker-industry-deck",
    locator: { page: 40 },
    text: "需求侧测算：下游渗透率每提升 1 个百分点，对应约 4,000 吨的年增量需求。",
    quotedAt: T_CLAIMS,
  },
]

/* -------------------------------------------------------------------------- */
/* Claims（6）                                                                  */
/* -------------------------------------------------------------------------- */

const claims: Claim[] = [
  {
    id: "clm-capacity-crossed",
    researchId: research.id,
    questionId: "q-capacity",
    text: "A 路线的产能已在 2025 年越过临界点，2026 年上半年的利用率回升可以交叉印证。",
    kind: "assertion",
    status: "standing",
    authoredBy: "human",
    confirmedByHuman: true,
    createdAt: T_CLAIMS,
  },
  {
    id: "clm-cost-inflection",
    researchId: research.id,
    questionId: "q-cost-curve",
    text: "B 路线的成本曲线在 2026 年出现拐点，降幅开始收窄。",
    kind: "prediction",
    status: "draft",
    // 这条**没有任何证据链接**。它代表研究者心里有、但还没找到材料的判断——
    // 也就是 firstVisual 里那个虚线空槽。unsupported-claim 张力的唯一来源。
    authoredBy: "human",
    confirmedByHuman: true,
    createdAt: T_CLAIMS,
  },
  {
    id: "clm-utilization-recovery",
    researchId: research.id,
    questionId: "q-capacity",
    text: "头部厂商的产能利用率在 2026 年一季度出现实质性回升。",
    kind: "assertion",
    status: "standing",
    authoredBy: "human",
    confirmedByHuman: true,
    createdAt: T_CLAIMS,
  },
  {
    id: "clm-yield-advantage",
    researchId: research.id,
    questionId: "q-route-verdict",
    text: "A 路线的良率优势仍在，但幅度小于供应商给出的曲线。",
    kind: "assertion",
    status: "limited",
    authoredBy: "human",
    confirmedByHuman: true,
    createdAt: T_CLAIMS,
  },
  {
    id: "clm-cost-scale",
    researchId: research.id,
    questionId: "q-cost-curve",
    text: "B 路线的单位成本下降主要来自规模效应，而非工艺改进。",
    kind: "assertion",
    status: "draft",
    authoredBy: "human",
    confirmedByHuman: true,
    createdAt: T_CLAIMS,
  },
  {
    id: "clm-expansion-announced",
    researchId: research.id,
    questionId: "q-capacity",
    text: "A 路线厂商将在次年完成新一轮扩产。",
    kind: "prediction",
    // 撤回：媒体报道只有单一信源，且厂商未确认。
    // 注意它**没有被删除**——它和它的两条链接都在历史投影里。
    status: "retracted",
    authoredBy: "human",
    confirmedByHuman: true,
    createdAt: T_CLAIMS,
  },
]

/* -------------------------------------------------------------------------- */
/* EvidenceLinks（14：12 活跃 + 2 已停用）                                        */
/* -------------------------------------------------------------------------- */

const links: EvidenceLink[] = [
  /* c1 —— 健康：两个独立来源（设备白皮书 primary + 行业协会 secondary） */
  {
    id: "lnk-nameplate",
    claimId: "clm-capacity-crossed",
    passageId: "psg-equipment-nameplate",
    stance: "supports",
    note: "设计产能是硬数字，直接来自设备方。",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-association-utilization",
    claimId: "clm-capacity-crossed",
    passageId: "psg-association-utilization",
    stance: "supports",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-equipment-qualifier",
    claimId: "clm-capacity-crossed",
    passageId: "psg-equipment-qualifier",
    stance: "qualifies",
    note: "产能是前提而非保证——这句话限制了上面那条的强度。",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-association-methodology",
    claimId: "clm-capacity-crossed",
    passageId: "psg-association-methodology",
    stance: "context",
    note: "统计口径说明，不构成支持。",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },

  /* c3 —— 单一来源：两段引用都来自同一份券商报告 */
  {
    id: "lnk-broker-utilization",
    claimId: "clm-utilization-recovery",
    passageId: "psg-broker-utilization",
    stance: "supports",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-broker-schedule",
    claimId: "clm-utilization-recovery",
    passageId: "psg-broker-schedule",
    stance: "supports",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },

  /* c4 —— 有支持也有反驳 */
  {
    id: "lnk-equipment-yield",
    claimId: "clm-yield-advantage",
    passageId: "psg-equipment-yield",
    stance: "supports",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-dd-yield",
    claimId: "clm-yield-advantage",
    passageId: "psg-dd-yield",
    stance: "supports",
    note: "一手访谈，但与供应商数据不一致——这条本身就说明了差距。",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-media-cost-curve",
    claimId: "clm-yield-advantage",
    passageId: "psg-media-cost-curve",
    stance: "contradicts",
    note: "媒体口径，不是一手数据；但没有理由忽略它。",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-dd-background",
    claimId: "clm-yield-advantage",
    passageId: "psg-dd-background",
    stance: "context",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },

  /* c5 —— 只由三手来源支撑（且其中一份已失效） */
  {
    id: "lnk-summary-cost",
    claimId: "clm-cost-scale",
    passageId: "psg-summary-cost",
    stance: "supports",
    note: "转述的转述——目前手上只有这个。",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },
  {
    id: "lnk-legacy-costbottom",
    claimId: "clm-cost-scale",
    passageId: "psg-legacy-costbottom",
    stance: "supports",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: null,
  },

  /* c6 —— 已撤回论断的两条链接：已停用，但保留 */
  {
    id: "lnk-media-expansion",
    claimId: "clm-expansion-announced",
    passageId: "psg-media-expansion",
    stance: "supports",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: T_RETRACT,
    retiredReason: "媒体单一信源，厂商未确认。",
  },
  {
    id: "lnk-broker-demand",
    claimId: "clm-expansion-announced",
    passageId: "psg-broker-demand",
    stance: "supports",
    createdBy: "human",
    createdAt: T_CLAIMS,
    retiredAt: T_RETRACT,
    retiredReason: "媒体单一信源，厂商未确认。",
  },
]

/* -------------------------------------------------------------------------- */
/* Finding                                                                     */
/* -------------------------------------------------------------------------- */

const findings: Finding[] = [
  {
    id: "fnd-route-verdict",
    researchId: research.id,
    text:
      "以现有材料判断，A 路线更可能先跑出来：它的产能与利用率有两个独立来源交叉印证，" +
      "而 B 路线的成本优势目前只有转述材料支撑。但这个判断的强度被两处限制压住——" +
      "A 路线的良率存在一条未能解释的反驳证据，且产能利用率只有一份券商报告可查。",
    // 引用三条论断，其中两条明显弱于第一条。
    claimIds: ["clm-capacity-crossed", "clm-utilization-recovery", "clm-yield-advantage"],
    // = min(3, 2, 2)。不可能更高——结论的强度不可能超过它最薄弱的一环。
    confidence: 2,
    knownLimitations: [
      "B 路线的成本结论只有三手来源支撑，尚未取得一手成本数据。",
      "A 路线的产能利用率只有单一券商报告可查，未经交叉验证。",
      "良率差距（94% vs 91%）的来源双方均未公开原始方法，无法判断谁的测量口径更接近真实。",
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* 人的处置（1 条）                                                              */
/* -------------------------------------------------------------------------- */

const dispositions = [
  {
    tensionId: "single-source::clm-utilization-recovery",
    researchId: research.id,
    resolution: "accepted-as-limitation" as const,
    reason: "这份报告的口径与协会统计一致，短期内不再找第二来源，改在结论里写明它只有一处可查。",
    actor: "human" as const,
    at: T_DISPOSITION,
  },
]

/* -------------------------------------------------------------------------- */
/* AI Reviewer 输出（4 条，其中 1 条被驳回）                                      */
/* -------------------------------------------------------------------------- */

const aiOutputs: AiOutput[] = [
  {
    // Class 1 —— 事实：带两条可解析的原文片段。
    kind: "factual",
    id: "ai-fact-utilization",
    statement: "行业协会统计显示 2026 上半年行业整体产能利用率升至 81%。",
    passageIds: ["psg-association-utilization"],
    sourceType: "secondary",
    createdAt: T_REVIEW,
  },
  {
    // Class 2 —— 批评：有明确靶心（那条没有任何支撑的论断）。
    kind: "critique",
    id: "ai-critique-unsupported",
    target: { type: "claim", id: "clm-cost-inflection" },
    issue: "unsupported-claim",
    rationale:
      "这条论断目前没有任何来源支撑。如果它要留在结论里，需要至少一份成本口径的一手材料；否则应降级为待验证假设。",
    createdAt: T_REVIEW,
  },
  {
    // Class 3 —— 建议：允许零引用，但永远不得进入 Finding 正文。
    kind: "suggestion",
    id: "ai-suggestion-interview",
    text: "建议补一次与产线设备方的访谈，直接问良率差异的测量口径。",
    rationale: "现有的良率分歧可能来自口径不同，而不是实际差距。",
    createdAt: T_REVIEW,
  },
  {
    // 被驳回的建议：输出仍在（没有删除），轨迹记着它被驳回了。
    kind: "suggestion",
    id: "ai-suggestion-expand-scope",
    text: "建议把 C 路线（海外代工）重新纳入比较范围。",
    createdAt: T_REVIEW,
  },
]

/* -------------------------------------------------------------------------- */
/* 轨迹                                                                        */
/* -------------------------------------------------------------------------- */

const trace: TraceEntry[] = [
  {
    id: "trace-0001",
    at: T_CLAIMS,
    actor: "human",
    kind: "claim-created",
    subject: { type: "claim", id: "clm-capacity-crossed" },
    reason: "从设备白皮书与协会统计归纳出的第一条论断。",
  },
  {
    id: "trace-0002",
    at: T_CLAIMS,
    actor: "human",
    kind: "claim-created",
    subject: { type: "claim", id: "clm-cost-inflection" },
    reason: "先从访谈里记下来，材料还没找到。",
  },
  {
    id: "trace-0003",
    at: T_CLAIMS,
    actor: "human",
    kind: "claim-created",
    subject: { type: "claim", id: "clm-utilization-recovery" },
    reason: "券商报告的利用率数据值得单独成条。",
  },
  {
    id: "trace-0004",
    at: T_CLAIMS,
    actor: "human",
    kind: "claim-created",
    subject: { type: "claim", id: "clm-yield-advantage" },
    reason: "良率是两条路线的关键分野。",
  },
  {
    id: "trace-0005",
    at: T_CLAIMS,
    actor: "human",
    kind: "claim-created",
    subject: { type: "claim", id: "clm-cost-scale" },
    reason: "成本下降的归因待确认。",
  },
  {
    id: "trace-0006",
    at: T_CLAIMS,
    actor: "human",
    kind: "claim-created",
    subject: { type: "claim", id: "clm-expansion-announced" },
    reason: "先记下这条预测，等厂商口径。",
  },
  {
    id: "trace-0007",
    at: T_RETRACT,
    actor: "human",
    kind: "link-retired",
    subject: { type: "evidence-link", id: "lnk-media-expansion" },
    reason: "媒体单一信源，厂商未确认。",
  },
  {
    id: "trace-0008",
    at: T_RETRACT,
    actor: "human",
    kind: "link-retired",
    subject: { type: "evidence-link", id: "lnk-broker-demand" },
    reason: "需求侧测算不能支撑「扩产已宣布」这个事实性判断。",
  },
  {
    // ★ 这条是 deletion.preserves-history 的核心：论断被撤回，但记录仍在。
    id: "trace-0009",
    at: T_RETRACT,
    actor: "human",
    kind: "claim-retracted",
    subject: { type: "claim", id: "clm-expansion-announced" },
    reason: "只有一篇报道提到扩产，且厂商从未确认。留着会污染「A 路线更可能先跑出来」这个结论。",
  },
  {
    id: "trace-0010",
    at: T_DISPOSITION,
    actor: "human",
    kind: "tension-dispositioned",
    subject: { type: "tension", id: "single-source::clm-utilization-recovery" },
    reason: "accepted-as-limitation：这份报告的口径与协会统计一致，短期内不再找第二来源，改在结论里写明它只有一处可查。",
  },
  {
    id: "trace-0011",
    at: T_DISPOSITION,
    actor: "human",
    kind: "ai-output-rejected",
    subject: { type: "ai-output", id: "ai-suggestion-expand-scope" },
    reason: "C 路线已在研究范围外明确排除；重新纳入会推翻已经收敛的范围，成本高于收益。",
  },
]

/* -------------------------------------------------------------------------- */
/* 导出                                                                        */
/* -------------------------------------------------------------------------- */

/** 完整的、确定的 research 快照。 */
export const loadBearingResearch: ResearchData = {
  research,
  questions,
  sources,
  passages,
  claims,
  links,
  findings,
  dispositions,
  aiOutputs,
  trace,
}

/**
 * 深拷贝一份数据集。
 *
 * 测试会修改数据（撤回论断、停用链接、把来源改成 stale……），
 * 而 `ResearchData` 是共享的单例对象。返回结构化克隆而不是浅拷贝，
 * 是为了让「改坏一个夹具跑负例」这件事不会污染下一个测试。
 */
export function freshResearch(): ResearchData {
  return structuredClone(loadBearingResearch)
}

/** 数据集的规模摘要。测试与文档都读它，避免两处各写一遍数字。 */
export const datasetSummary = {
  sources: sources.length,
  passages: passages.length,
  claims: claims.length,
  links: links.length,
  activeLinks: links.filter((link) => link.retiredAt === null).length,
  retirementPath: "clm-expansion-announced",
  findings: findings.length,
  dispositions: dispositions.length,
  aiOutputs: aiOutputs.length,
  trace: trace.length,
} as const
