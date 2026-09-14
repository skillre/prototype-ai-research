/**
 * Trace 视图模型 —— 「为什么这么判断」，不是 activity feed。
 *
 * ## 一条轨迹记录必须回答五个问题
 *
 * ```
 * 谁 · 什么时候 · 对什么 · 做了什么 · 为什么
 * ```
 *
 * `TraceEntry` 只存了其中的三个半：`actor`、`at`、`kind`，以及一个
 * `subject: { type, id }`。**「对什么」在数据里只是一个 id**，而 id 不是人话。
 *
 * 本模块的**全部职责**就是把那个 id 解析成一个可读的对象名——它不做别的，
 * 也不引入任何新的业务规则。它存在的理由与 `projectArgumentChain` 一样：
 * 组装逻辑长在组件里，就只能靠渲染一棵 DOM 去测它。
 *
 * ## 它与 activity feed 的区别
 *
 * activity feed 说「你做了什么」。轨迹要说的是「**为什么**」——
 * 所以每一条都必须带上 `reason`，而 `reason` 里带着当时那个人写下的话。
 * 一条没有理由的轨迹记录是审计日志，不是研究轨迹；本产品的领域层
 * 从 Phase A 起就要求每个变更函数都必须收到 `reason`，正是为了这一点。
 *
 * ## 处置的两个出口在轨迹里必须仍然是两个词
 *
 * `dispositionTension` 把出口编码进 `reason` 的前缀
 * （`formatDispositionReason`），这里用它的逆运算拆回来。
 * 不拆的话，那一段会显示成一行技术串
 * （`accepted-as-limitation：这份报告的口径……`），而轨迹恰恰是读者
 * 事后追问「这个局限什么时候被接受的」的地方。
 */

import {
  type Actor,
  type AiOutput,
  type AiOutputKind,
  type Id,
  type IsoTimestamp,
  type ResearchData,
  type SubjectType,
  type TensionKind,
  type TensionResolution,
  type TraceEntry,
  type TraceKind,
  describeLinkEnds,
  getAiOutput,
  getRelationPresentation,
  parseDispositionReason,
  traceTimeline,
} from "@/lib/research"

/* -------------------------------------------------------------------------- */
/* 注入的措辞                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 轨迹需要的全部界面词。
 *
 * 注入而不是在这里 import 词典，是因为本模块要保持**可被 Node 直接导入**——
 * 它要能在不起浏览器的前提下被单测调用。这与 `ReviewerCopy` 同一个理由。
 *
 * ⚠ 其中几项刻意**从别处复用**（`claimLabel` 来自论证链、`tensionKind` 来自
 * 窄带、`aiClass` 来自审稿意见）：同一个对象在两个视图里必须叫同一个名字。
 * 在这里再写一套「论断 №3」，就会有两套说法，而且只有一套会被改。
 */
export interface TraceCopy {
  kind: Record<TraceKind, string>
  actor: Record<Actor, string>
  /**
   * 处置出口的词。`unknown` 是手写轨迹条目的兜底——
   * **读不懂不等于要丢掉它**，所以它有一个词而不是被过滤掉。
   */
  resolution: Record<TensionResolution | "unknown", string>
  subjectMissing: string
  /** 论断的措辞。与 rail 共用。 */
  claimLabel: (index: number) => string
  /** 张力种类的措辞。与 rail 共用。 */
  tensionKind: Record<TensionKind, string>
  /** AI 输出类别的措辞。与审稿意见共用。 */
  aiClass: Record<AiOutputKind, string>
  /** 一条引用在轨迹里的名字（`支持引用`）。 */
  linkSubject: (stance: string) => string
}

/* -------------------------------------------------------------------------- */
/* 形状                                                                         */
/* -------------------------------------------------------------------------- */

export interface TraceRow {
  id: Id
  at: IsoTimestamp
  /** 面向人的日期（`2026-09-09`）。轨迹不需要秒级精度，但需要可扫描。 */
  dateLabel: string
  actor: Actor
  actorLabel: string
  kind: TraceKind
  kindLabel: string
  subjectType: SubjectType
  subjectId: Id
  /** 「对什么」。一句能读的话，不是 id。 */
  subjectLabel: string
  /**
   * 对象解析不出来。
   *
   * 它必须是一个**显式的状态**而不是一个空字符串：轨迹里有一条对不上的记录，
   * 与轨迹里有一条对象名叫空的记录，是完全不同的两件事。前者说明数据坏了，
   * 后者说明界面漏了一段渲染。
   */
  dangling: boolean
  /** 「为什么」。已剥掉处置出口的前缀。 */
  reason: string
  /** 只有 `tension-dispositioned` 有；其余为 null。 */
  resolution: TensionResolution | null
  /** 上面那个出口的词。`resolution === null` 时为 null。 */
  resolutionLabel: string | null
  /** 它是否是一条「改变了事实」的记录。界面据此给不同权重。 */
  factChanging: boolean
}

export interface TraceBoard {
  /** 最新在前。 */
  rows: TraceRow[]
  /** 涉及的不同对象数。它让「这条论断被改过几次」有一个全局读数。 */
  subjectCount: number
}

/* -------------------------------------------------------------------------- */
/* 单条                                                                         */
/* -------------------------------------------------------------------------- */

/** 截断到一句可扫描的长度。超长对象名会把「做了什么」挤出视野。 */
const SUBJECT_BUDGET = 44

function clamp(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length <= SUBJECT_BUDGET ? flat : `${flat.slice(0, SUBJECT_BUDGET)}…`
}

/**
 * 把 `{ type, id }` 解析成一句人话。
 *
 * 返回 `{ label, dangling }`。**`dangling` 是返回值的一部分**，不是靠
 * label 为空来推断——见 `TraceRow.dangling` 的说明。
 */
function describeSubject(
  data: ResearchData,
  entry: TraceEntry,
  copy: TraceCopy,
): { label: string; dangling: boolean } {
  const missing = () => ({ label: copy.subjectMissing, dangling: true })

  switch (entry.subject.type) {
    case "claim": {
      const index = data.claims.findIndex((claim) => claim.id === entry.subject.id)
      const claim = data.claims[index]
      if (!claim) return missing()
      return {
        label: `${copy.claimLabel(index + 1)} · ${clamp(claim.text)}`,
        dangling: false,
      }
    }

    case "evidence-link": {
      const link = data.links.find((candidate) => candidate.id === entry.subject.id)
      if (!link) return missing()
      /* 引用必须显示**两端**。只写「一条引用」等于把「这条引用什么时候
         加进去的、加到哪」这个问题的答案丢掉——而那正是轨迹要回答的。
         ⚠ 关系词**必须**从契约取。这里最初直接传了 `link.stance`，
         于是界面上显示成 `supports引用`——一个中英混排的怪东西。
         本地化审计**抓不到它**：那串文字含中文，于是被判为「已本地化」。
         抓到它的是一张截图。关系词只有契约一个来源，没有第二个。 */
      const stanceLabel = getRelationPresentation(link.stance).label
      return {
        label: `${copy.linkSubject(stanceLabel)} · ${clamp(describeLinkEnds(data, link))}`,
        dangling: false,
      }
    }

    case "tension": {
      /* 张力的 id 是 `${kind}::${claimId}` —— 拆回来才能说人话。
         这里刻意**不**用 `parseTensionId` 之外的猜测：一个读不懂的 id
         应当看起来像读不懂，而不是被当成某条随机的张力。 */
      const separator = entry.subject.id.indexOf("::")
      if (separator <= 0) return missing()
      const kind = entry.subject.id.slice(0, separator) as TensionKind
      const claimId = entry.subject.id.slice(separator + 2)
      const claimIndex = data.claims.findIndex((claim) => claim.id === claimId)
      const kindLabel = copy.tensionKind[kind]
      if (!kindLabel || claimIndex < 0) return missing()
      return {
        label: `${kindLabel} · ${copy.claimLabel(claimIndex + 1)}`,
        dangling: false,
      }
    }

    case "ai-output": {
      const output = getAiOutput(data, entry.subject.id)
      if (!output) return missing()
      return { label: `${copy.aiClass[output.kind]} · ${clamp(aiOutputText(output))}`, dangling: false }
    }

    case "source": {
      const source = data.sources.find((candidate) => candidate.id === entry.subject.id)
      if (!source) return missing()
      return { label: clamp(source.title), dangling: false }
    }

    case "passage": {
      const passage = data.passages.find((candidate) => candidate.id === entry.subject.id)
      if (!passage) return missing()
      return { label: clamp(passage.text), dangling: false }
    }

    case "question": {
      const question = data.questions.find((candidate) => candidate.id === entry.subject.id)
      if (!question) return missing()
      return { label: clamp(question.text), dangling: false }
    }

    case "finding": {
      const finding = data.findings.find((candidate) => candidate.id === entry.subject.id)
      if (!finding) return missing()
      return { label: clamp(finding.text), dangling: false }
    }

    case "research":
      return { label: data.research.title ?? "", dangling: false }
  }
}

/** AI 输出的正文。三类字段名不同，所以这里必须收窄——不能 `.text` 一把梭。 */
function aiOutputText(output: AiOutput): string {
  switch (output.kind) {
    case "factual":
      return output.statement
    case "critique":
      return output.rationale
    case "suggestion":
      return output.text
  }
}

/**
 * 一条轨迹条目 → 一行。
 *
 * **导出的唯一理由**是让「条目 → 行」的映射只有一份实现：
 * 时间线视图与「某个对象的历史」视图读的是同一个函数，
 * 所以它们不可能对同一条记录给出两种说法。
 */
export function traceRow(data: ResearchData, entry: TraceEntry, copy: TraceCopy): TraceRow {
  const subject = describeSubject(data, entry, copy)

  /* 处置出口编码在理由前缀里。用**写入时那个函数的逆运算**拆回来——
     两处各写一遍前缀逻辑就会在两处各错一遍。 */
  const parsed = entry.kind === "tension-dispositioned" ? parseDispositionReason(entry.reason) : null

  return {
    id: entry.id,
    at: entry.at,
    dateLabel: entry.at.slice(0, 10),
    actor: entry.actor,
    actorLabel: copy.actor[entry.actor],
    kind: entry.kind,
    kindLabel: copy.kind[entry.kind],
    subjectType: entry.subject.type,
    subjectId: entry.subject.id,
    subjectLabel: subject.label,
    dangling: subject.dangling,
    reason: parsed ? parsed.text : entry.reason,
    resolution: parsed?.resolution ?? null,
    resolutionLabel: parsed
      ? copy.resolution[parsed.resolution ?? "unknown"]
      : null,
    /* 只有这两种事件会改变论证本身。其余是判断与记录。
       界面据此把「事实变了」的那些做得更重一点——读者最需要看到的
       是论证什么时候被改动过。 */
    factChanging: entry.kind === "link-created" || entry.kind === "link-retired",
  }
}

/* -------------------------------------------------------------------------- */
/* 时间线                                                                       */
/* -------------------------------------------------------------------------- */

/** 全局时间线，最新在前。 */
export function projectTrace(data: ResearchData, copy: TraceCopy): TraceBoard {
  const rows = traceTimeline(data).map((entry) => traceRow(data, entry, copy))
  return {
    rows,
    subjectCount: new Set(rows.map((row) => `${row.subjectType}:${row.subjectId}`)).size,
  }
}

/**
 * 某一个对象的历史，**仍未解决的在最前**。
 *
 * 排序是刻意的：读者问「这条论断为什么后来被降级」时，要的是**最新的那次改动**
 * 先出现。按时间正序读一遍会让人先读完所有无关的早期事件。
 */
export function projectTraceForSubject(
  data: ResearchData,
  type: SubjectType,
  id: Id,
  copy: TraceCopy,
): TraceRow[] {
  return data.trace
    .filter((entry) => entry.subject.type === type && entry.subject.id === id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((entry) => traceRow(data, entry, copy))
}

/**
 * 轨迹里出现过的全部对象，按「最后一次被提到」的时间倒序。
 *
 * ## 为什么需要它
 *
 * §18 要求轨迹能回答「这条论断为什么后来被降级」。那句话的入口是**论断**，
 * 不是一条事件。没有这一层，读者只能在一个按时间排列的事件流里
 * 自己把属于同一条论断的记录挑出来——那正是 activity feed 的用法，
 * 而本产品的轨迹要避免的恰恰是这个。
 */
export interface TraceSubjectGroup {
  type: SubjectType
  id: Id
  label: string
  /** 属于它的记录数。 */
  count: number
  /** 最近一次的时间。 */
  latestAt: IsoTimestamp
  rows: TraceRow[]
}

export function groupTraceBySubject(data: ResearchData, copy: TraceCopy): TraceSubjectGroup[] {
  const groups = new Map<string, TraceSubjectGroup>()

  for (const row of projectTrace(data, copy).rows) {
    const key = `${row.subjectType}:${row.subjectId}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      existing.rows.push(row)
      continue
    }
    groups.set(key, {
      type: row.subjectType,
      id: row.subjectId,
      label: row.subjectLabel,
      count: 1,
      latestAt: row.at,
      rows: [row],
    })
  }

  /* 最新的组在最前。组内也是最新在前（`projectTrace` 已经排好）。 */
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}
