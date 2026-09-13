/**
 * AI Research Workspace — domain types.
 *
 * 这是产品的业务模型，与 Factory 无关，也不属于 Prototype Kits。
 *
 * ## 一条贯穿全文件的立场
 *
 * **只有一种 human-authored 关系原语：`EvidenceLink`。**
 * Passage ── EvidenceLink ──> Claim，stance 是 supports / contradicts / qualifies / context。
 *
 * Claim ↔ Claim 的冲突**不是**第二种边。它由数据推导成 `Tension`（见 `./tensions.ts`）。
 * 一旦引入 `ClaimRelation` / `GraphEdge`，这个产品就会滑向 graph editor，
 * 而 graph editor 既不是它的 Job，也无法在 390px 上成立。
 *
 * ## 三类字段，来源不同，绝不可混
 *
 * | 类别 | 谁来写 | 例子 |
 * |---|---|---|
 * | **记录** | 人（或 AI 起草 + 人确认） | Claim.text、EvidenceLink.stance |
 * | **派生** | 纯函数，永远重算，**从不作为字段存在** | `deriveClaimConfidence`、`deriveClaimBasisStatus`、Tension 事实 |
 * | **处置** | 人，且必须留存 | TensionDisposition.resolution |
 *
 * 把「派生」当成「记录」存下来，就会得到第二个事实来源，然后它与第一个漂移。
 *
 * **本文件里没有任何派生字段。** 这一条是刻意的，并且曾经不是这样：早期版本的
 * `Claim` 上有一个 `confidenceDerived?: EvidenceLevel`，虽然从没被写入过，但它的
 * **存在本身**就是在邀请人往里写值——而一旦有人写了，就会得到一个会静默漂移、
 * 且不会触发任何不变量的第二事实来源。类型层不应该留下这种陷阱，所以它被删掉了。
 * 证据强度现在只由 `deriveClaimConfidence()` 计算。
 *
 * 同理，`Tension` 没有 `resolution` 字段——它属于 disposition，不属于 tension。
 */

/* -------------------------------------------------------------------------- */
/* 标识与枚举                                                                   */
/* -------------------------------------------------------------------------- */

export type Id = string

/** 一条记录产生的时间。ISO 8601。数据集里全部是固定值——确定性优先于「看起来像真的」。 */
export type IsoTimestamp = string

export type ResearchStatus = "active" | "archived"

export type QuestionStatus = "open" | "answered" | "abandoned"

/** 材料的载体形态。影响它怎么被定位（页码 / URL / 时间码）。 */
export type SourceKind = "pdf" | "web" | "transcript" | "dataset" | "note"

/**
 * 来源的性质。**这是可信度判断的唯一依据**，不是数字评分。
 *
 * - `primary`   一手：原始数据、当事人陈述、设备白皮书
 * - `secondary` 二手：行业报告、媒体报道
 * - `tertiary`  三手：付费摘要、转述、内容农场的「研究」
 * - `unknown`   无法判定
 *
 * 用类型而不是 0–100 的分数，是因为分数会撒谎：它看起来像测量结果，
 * 实际上是一堆加权猜测。而「这条依据是三手转述」是一句可以被追究的话。
 */
export type SourceType = "primary" | "secondary" | "tertiary" | "unknown"

/**
 * 来源当前是否仍然可查。
 *
 * 研究产品特有的一条：**来源会变。**链接失效、报告下架、原文被改。
 * `stale` / `missing` 不是元数据，是会传染的状态——见 `deriveClaimBasisStatus`。
 */
export type SourceValidity = "ok" | "stale" | "missing"

/**
 * 论断的语义类型。
 *
 * > **这是一个 declared semantic，当前不参与任何 derived rule。**
 *
 * 明确写下来是因为它有被误读的风险：没有任何不变量、任何派生函数读这个字段。
 * 它记录的是研究者的**意图**（「我这是在预测，不是在陈述」），而不是一条会被
 * 执行的规则。
 *
 * 保留它的理由：断言型与预测型论断在「A 路线与 B 路线哪个先跑出来」这个问题里
 * 是**真实不同**的两类东西。它在 Phase D 之后大概率会参与证据强度的判断
 * （预测不该和已发生的事实同权）。
 *
 * **不要为了让字段「有用」而临时加一条假规则。** 等真实需要出现时，
 * 规则、测试、以及消费它的派生函数**一起**进来。
 */
export type ClaimKind = "assertion" | "prediction" | "definition"

/**
 * 论断在研究里的位置。
 *
 * 注意 `retracted`：**它是撤回，不是删除。** 论断一旦撤回，它的证据链接
 * 进入历史投影，轨迹里留下一条记录。研究轨迹的价值恰恰在于「我考虑过这条，
 * 后来排除了」——物理删除会把这个产品最重要的信息删掉。
 */
export type ClaimStatus = "draft" | "standing" | "limited" | "retracted"

/**
 * 关系原语的四个取值。
 *
 * `contradicts` 是信息量最大的一个：工具普遍只记录「我引用过这个」，
 * 不记录「这段材料其实在反驳我」。丢掉它，产品就退化成收藏夹。
 */
export type Stance = "supports" | "contradicts" | "qualifies" | "context"

export type AuthoredBy = "human" | "ai-drafted"

/** 谁做的这件事。轨迹里必须区分——人的决定和 AI 的建议不是一回事。 */
export type Actor = "human" | "reviewer-ai"

/**
 * 五类结构性问题。
 *
 * 全部**派生**。用户不能「创建一条 Tension」——那会立刻与事实漂移。
 * 用户只能对它做 disposition。
 */
export type TensionKind =
  | "unsupported-claim"
  | "contradictory-evidence"
  | "single-source"
  | "stale-source"
  | "low-quality-evidence"

/** 阻断发布 vs 值得注意。派生自 kind，不是人填的。 */
export type TensionSeverity = "blocking" | "notable"

/**
 * 人对张力的处置。**三个出口里有两个是成功。**
 *
 * `resolved` 把洞填上；`accepted-as-limitation` 承认这个洞存在并写进交付物。
 * 后者不是失败——一个有边界的结论比一个假装完整的结论可信得多。
 */
export type TensionResolution = "resolved" | "accepted-as-limitation"

/** 轨迹指向的对象类型。 */
export type SubjectType =
  | "research"
  | "question"
  | "source"
  | "passage"
  | "claim"
  | "evidence-link"
  | "tension"
  | "finding"
  | "ai-output"

/**
 * 证据强度阶梯。**0–4 的整数，不是百分比。**
 *
 * 「73% 置信」是假精度：它看起来像测量结果，实际上没有任何东西测量过它。
 * 「3 —— 两个独立来源交叉印证」是一句可以被检查和争辩的话。
 */
export type EvidenceLevel = 0 | 1 | 2 | 3 | 4

/**
 * 论断当前依据的健康状况。派生。
 *
 * - `unsupported` 没有任何支持
 * - `supported`   有支持、无反驳
 * - `contested`   有支持、**也**有反驳（这不是坏状态——被处理过的反对意见让结论更强）
 * - `invalidated` 依据已失效（引用的来源 stale / missing）
 */
export type ClaimBasisStatus = "unsupported" | "supported" | "contested" | "invalidated"

/* -------------------------------------------------------------------------- */
/* 实体                                                                         */
/* -------------------------------------------------------------------------- */

/** 一次研究。容器，也是**显式边界**——研究范围本身就是结论的一部分。 */
export interface Research {
  id: Id
  /** 可空：产品名尚未决定，工作代号也不该被硬编码进数据。 */
  title?: string
  /** 主问题 id。它是「完成」的定义——没有它，收集永不收敛。 */
  questionId: Id
  scope: {
    /** 明确在研究范围内的问题。 */
    in: string[]
    /** 明确排除的。写下来才有价值：一周后没人记得为什么没做。 */
    out: string[]
  }
  status: ResearchStatus
  createdAt: IsoTimestamp
}

/** 研究问题。可以被分解为子问题。 */
export interface Question {
  id: Id
  researchId: Id
  text: string
  /** 子问题的父问题。顶层问题为 null。 */
  parentQuestionId: Id | null
  status: QuestionStatus
}

/** 一份外部材料整体。 */
export interface Source {
  id: Id
  researchId: Id
  kind: SourceKind
  title: string
  /** URL、本地路径、或访谈对象标识。用于回去找它。 */
  origin: string
  retrievedAt: IsoTimestamp
  sourceType: SourceType
  validity: SourceValidity
}

/**
 * 原文片段——**Citation 的唯一合法落点**。
 *
 * 引到 Source（「参见那份报告」）在评审会上是答不上来的；引到 Passage
 * （「第 4 页第 2 段」）才是。这个区分是整个产品可信度的基石。
 */
export interface Passage {
  id: Id
  sourceId: Id
  locator: {
    /** PDF 页码 */
    page?: number
    /** 网页锚点 / 章节标识 */
    anchor?: string
    /** 转写时间码（秒） */
    tStart?: number
  }
  /** 原文。不是转述、不是摘要。 */
  text: string
  /** 被首次引用进研究的时间；null 表示尚未被使用。用于 `passage.no-orphan`。 */
  quotedAt: IsoTimestamp | null
}

/** 一个可以被判断真假的陈述句。论证链的节点。 */
export interface Claim {
  id: Id
  researchId: Id
  /** 它回答哪个问题。 */
  questionId: Id
  text: string
  kind: ClaimKind
  status: ClaimStatus
  authoredBy: AuthoredBy
  /**
   * AI 起草的论断在被人工确认之前不算数。
   *
   * 这不是流程装饰：`verified` 要求它为 true（见 `projectClaimVerification`），
   * 所以「AI 写的、没人看过」在数据层面就走不到「已验证」。
   */
  confirmedByHuman: boolean
  createdAt: IsoTimestamp
}

/**
 * **唯一的人写的关系原语。** Passage ↔ Claim。
 *
 * ## 为什么有 `retiredAt`
 *
 * 「删除一条论断」在本产品里必须**不丢历史**。物理删除做不到这一点，
 * 所以链接只被**停用**，从不被移除：
 *
 * - 活跃投影：`retiredAt == null`
 * - 历史投影：全部，含已停用
 *
 * 这让「我当时引用过什么」永远可查，也让 `deletion.preserves-history` 成为
 * 一个可以断言的事实，而不是一句承诺。
 */
export interface EvidenceLink {
  id: Id
  claimId: Id
  passageId: Id
  stance: Stance
  /** 为什么这么判。可空，但「反驳」类链接建议写——它将来会被追问。 */
  note?: string
  createdBy: Actor
  createdAt: IsoTimestamp
  /** 停用时间。null = 活跃。停用不删除——见上方说明。 */
  retiredAt: IsoTimestamp | null
  retiredReason?: string
}

/**
 * 张力的**事实部分**。全部派生，从不存储。
 *
 * `id` 必须确定性可复现（`${kind}::${claimId}`），否则处置会失联——
 * 每次重算都换 id，人的处置就找不到自己的对象了。
 */
export interface DerivedTension {
  id: Id
  researchId: Id
  kind: TensionKind
  subject: TensionSubject
  severity: TensionSeverity
}

/** 张力指向什么。可选字段按 kind 填，不是全部都填。 */
export interface TensionSubject {
  claimId: Id
  /** 与具体链接相关的张力（contradictory-evidence / low-quality-evidence）。 */
  linkIds?: Id[]
  /** 与来源相关的张力（single-source / stale-source / low-quality-evidence）。 */
  sourceIds?: Id[]
}

/**
 * 人对张力的**处置**。这是人的输入，与派生事实分开存储。
 *
 * 分开存是刻意的：`tension.is-derived` 要求「重算张力，除处置外事实字段完全一致」。
 * 如果 resolution 挂在 tension 对象上，重算就得小心翼翼地保留它——
 * 那是一次「记得别写错」的机会，而这类机会总会被写错。
 */
export interface TensionDisposition {
  tensionId: Id
  researchId: Id
  resolution: TensionResolution
  reason: string
  actor: Actor
  at: IsoTimestamp
}

/** 投影后的张力：派生事实 + 处置。UI 读这个。 */
export interface Tension extends DerivedTension {
  resolution: TensionResolution | null
  dispositionReason?: string
  dispositionAt?: IsoTimestamp
}

/** 研究者署名的判断。交付物。 */
export interface Finding {
  id: Id
  researchId: Id
  text: string
  /** 它建立在哪些论断上。 */
  claimIds: Id[]
  /** 必须 ≤ 所引用论断里最弱的那一条——见 `deriveFindingConfidence`。 */
  confidence: EvidenceLevel
  /** 用户承认的边界。来自 accepted-as-limitation 的张力，或手写。 */
  knownLimitations: string[]
}

/* -------------------------------------------------------------------------- */
/* 轨迹：append-only event log                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 轨迹事件的类型。
 *
 * 只列**真实存在的产品动作**。刻意没有写一个通用的 `updated`——
 * 一个什么都记的事件日志，等于什么都没记。
 */
export type TraceKind =
  | "claim-created"
  | "claim-retracted"
  | "link-created"
  | "link-retired"
  | "tension-dispositioned"
  | "ai-output-rejected"

/**
 * 一条轨迹记录。**事件，不是实体。**
 *
 * ## 为什么不是独立实体
 *
 * 每条轨迹记录都「关于」某个已存在的对象。若做成实体，就需要一个多态的
 * `subject_id` 指向 8 种表——那是事件日志的形状，不是实体的形状。
 *
 * 更重要的是：做成实体意味着「这条论断被撤回」会同时活在 Claim 和 Trace 里，
 * 两边必然漂移。轨迹是**追加的观察**，不是第二个状态来源。
 *
 * ## 但它必须可查
 *
 * 轨迹不是隐藏的审计列。`traceForSubject()` 把它物化成「研究轨迹」视图——
 * 「我考虑过 X 吗」这个问题只能靠它回答，而这是研究者最容易被追问、
 * 也最没有工具支持的一件事。
 */
export interface TraceEntry {
  id: Id
  at: IsoTimestamp
  actor: Actor
  kind: TraceKind
  subject: { type: SubjectType; id: Id }
  reason: string
}

/* -------------------------------------------------------------------------- */
/* 聚合根                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 一次研究的全部数据。不可变；所有变更函数返回新的聚合。
 *
 * 注意这里**没有** `tensions` 数组——张力是派生的，存下来就是第二个事实来源。
 * `dispositions` 存的是人的处置，那是记录，不是派生。
 */
export interface ResearchData {
  research: Research
  questions: Question[]
  sources: Source[]
  passages: Passage[]
  claims: Claim[]
  links: EvidenceLink[]
  findings: Finding[]
  dispositions: TensionDisposition[]
  aiOutputs: AiOutput[]
  trace: TraceEntry[]
}

/* -------------------------------------------------------------------------- */
/* AI Reviewer 输出（数据契约，不含任何模型调用）                                 */
/* -------------------------------------------------------------------------- */

/**
 * AI 在这个产品里的角色是 **Reviewer**，不是 Assistant / Copilot / Chatbot。
 *
 * 三类输出，三套硬规则。重点是**第三类与第一类必须在视觉上不可混淆** ——
 * 混淆「AI 说的」和「材料说的」正是通用 AI 产品的长相。
 */
export type AiOutputKind = "factual" | "critique" | "suggestion"

/**
 * **Class 1 — 事实抽取。**
 *
 * 硬规则：`passageIds.length >= 1` 且全部可解析。
 * 不满足时对象**根本不应该被构造出来**——不是「标记为低置信」。
 *
 * 理由：无出处的「看起来像真的」是这个产品的毒药。它可以被降级、被隐藏、
 * 被讨论，但只要它存在，它就会在某个环节被当成事实用掉。
 */
export interface AiFactualOutput {
  kind: "factual"
  id: Id
  statement: string
  /** ≥1，且每一条都必须解析到真实存在的 Passage。 */
  passageIds: Id[]
  /** 所依据来源里最强的那一档。用于在 UI 上和人工内容区分权重。 */
  sourceType: SourceType
  createdAt: IsoTimestamp
}

/**
 * **Class 2 — 反驳 / 证据批评。** AI 在这里的最高价值。
 *
 * 硬规则：`target` 必须指向真实存在的 Claim 或 EvidenceLink。
 * 「整体上建议再深入一些」这类无靶心的输出不得实例化——它不可被处理，
 * 所以它只会变成噪音。
 */
export interface AiCritiqueOutput {
  kind: "critique"
  id: Id
  target: { type: "claim"; id: Id } | { type: "evidence-link"; id: Id }
  issue: TensionKind
  rationale: string
  /** 它认为构成反驳的原文。可空（批评可以是「你没处理某个问题」）。 */
  opposingPassageIds?: Id[]
  createdAt: IsoTimestamp
}

/**
 * **Class 3 — 意见 / 建议。**
 *
 * 允许零引用。但有一条不可协商的规则：
 * **它永远不得进入 Finding 的正文。**
 *
 * 意见是意见。它可以是好的意见，但把它写进交付物就是把 AI 的判断
 * 冒充成材料的判断——而这份交付物是要被署名的。
 */
export interface AiSuggestionOutput {
  kind: "suggestion"
  id: Id
  text: string
  rationale?: string
  createdAt: IsoTimestamp
}

export type AiOutput = AiFactualOutput | AiCritiqueOutput | AiSuggestionOutput

/**
 * 一份「意见书」：三类输出被一起持有。
 *
 * 三类**分开装**而不是混成一个列表，是因为它们在界面上的权重不同——
 * 这是产品立场在数据结构上的落点。混装之后，区分它们就只能靠渲染时记得
 * 判断 kind，而那种「记得」迟早会漏掉一处。
 */
export interface AiDocument {
  factual: AiFactualOutput[]
  critiques: AiCritiqueOutput[]
  suggestions: AiSuggestionOutput[]
}
