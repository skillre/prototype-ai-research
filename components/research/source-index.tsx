"use client"

/**
 * Source Index —— 「我还有哪些材料，以及它们被怎么用」。
 *
 * ## 它不是什么
 *
 * 不是文件管理器，不是知识库首页，不是表格后台。它是一份**按层展开的清单**：
 *
 * ```
 * 一份材料        标题 · 性质 · 有效性 · 被几条论断用过
 *   └ 一段原文    定位 · 原文 · 被谁以什么身份使用
 *       └ 关联    选论断 → 选关系 → 建立引用
 * ```
 *
 * 三层，一次只展开一层。**不做横向表格**：390px 下的横向表格必然变成
 * 四列 micro text，而密度档是 medium。
 *
 * ## 关系词只从契约来
 *
 * 本文件里没有一次 `stance === "…"`。关系词来自
 * `getRelationPresentation(stance).label`，顺序来自契约的 `order`。
 * 材料视图是**第二个**要显示关系的地方（第一个是论证链），
 * 所以它是最容易长出第二套关系语言的地方——这里刻意没有。
 *
 * ## 关联是本阶段唯一改变事实的界面操作
 *
 * 它走 `onCreateLink`（→ `addEvidenceLink`）。守卫、轨迹、缺口重算全在领域层，
 * 这里只负责把**拒绝**原样显示出来——被拒绝不是异常，它是预期内的一条数据。
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { messages } from "@/lib/i18n"
import {
  ALL_STANCES,
  getRelationPresentation,
  linkCandidatesForPassage,
  projectSourceIndex,
  type DispositionIssue,
  type ResearchData,
  type TensionKind,
  type TensionResolution,
} from "@/lib/research"
import { RESEARCH_LABELS } from "@/lib/research-ui/copy"
import { formatLocator } from "@/lib/research-ui"
import { DispositionPanel } from "./disposition-panel"

const t = messages.research.sources
const tc = messages.research.chain

const VALIDITY_LABEL = t.validity
const TYPE_LABEL = t.sourceType
const KIND_LABEL = t.kind
/** 张力种类的界面词。与窄带共用同一份——不另造一套。 */
const TENSION_LABEL = messages.research.rail.kind
const SEVERITY_LABEL = messages.research.rail.severity

/**
 * 一次写入**关掉**的缺口。
 *
 * 领域层在写入时比较前后两次推导得出它（见 `addEvidenceLink`）——
 * 界面拿不到这个信息就只能自己 diff，那就是第二份重复判定。
 */
export interface ClosedTension {
  tensionId: string
  kind: TensionKind
  severity: "blocking" | "notable"
  claimId: string
}

type LinkResult =
  | { ok: true; stanceLabel: string; claimLabel: string; closedTensions: ClosedTension[] }
  | { ok: false; issues: DispositionIssue[] }

/**
 * 关联表单。
 *
 * 三层，全部是原生控件：`<select>` 选论断、原生 radio 选关系、`textarea` 写理由。
 * 用原生控件而不是自绘列表，是因为它们天然保证 DOM 与无障碍树 1:1
 * ——而这一屏的关系词是**唯一**承载语义的东西。
 */
function LinkForm({
  data,
  passageId,
  claimLabelFor,
  claimIndexFor,
  onSubmit,
  onSubmitDisposition,
  onCancel,
}: {
  data: ResearchData
  passageId: string
  claimLabelFor: (claimId: string) => string
  claimIndexFor: (claimId: string) => number | undefined
  onSubmit: (input: { claimId: string; passageId: string; stance: string; note: string }) => LinkResult
  onSubmitDisposition: (
    tensionId: string,
    resolution: TensionResolution,
    reason: string,
  ) => { ok: true } | { ok: false; issues: DispositionIssue[] }
  onCancel: () => void
}) {
  const candidates = useMemo(() => linkCandidatesForPassage(data, passageId), [data, passageId])

  const [claimId, setClaimId] = useState(candidates[0]?.claimId ?? "")
  const [stance, setStance] = useState<string>("supports")
  const [note, setNote] = useState("")
  const [result, setResult] = useState<LinkResult | null>(null)
  /* 哪一条刚被填上的缺口正在收尾（面板开着）。 */
  const [closingId, setClosingId] = useState<string | null>(null)
  /* 已经记录过的那几条。**本地状态就够了**：处置成功后数据会重算，
     但那一条记录已经写进 `dispositions`，重复提交只会留下两条一样的记录。 */
  const [disposedIds, setDisposedIds] = useState<string[]>([])

  const selectRef = useRef<HTMLSelectElement | null>(null)

  /**
   * 表单挂载时把焦点**接过来**。
   *
   * ## 这不是可选的无障碍润色，它修的是一个真实的功能缺陷
   *
   * 打开这个表单的按钮（「关联到论断」）会被**卸载**，于是焦点掉到 `<body>`。
   * 后果有两层：
   *
   * ```
   * ① 键盘用户失去位置：他刚按了回车，焦点却回到了页面开头。
   * ② **Escape 从此失效**：Escape 的处理函数挂在抽屉面板上，
   *    靠事件冒泡。焦点在 <body> 时按键根本不会冒泡到面板——
   *    于是「点开表单之后按 Escape」什么都不会发生，抽屉关不掉。
   * ```
   *
   * ② 是实测到的，不是推理：在补上这一行之前，
   * `press("Escape")` 在表单打开后确实无法关闭抽屉。
   * 而它的根因（焦点掉出面板）比症状更难看见。
   */
  useEffect(() => {
    selectRef.current?.focus()
  }, [])

  const idBase = `rs-link-${passageId}`

  if (candidates.length === 0) {
    return <p className="rs-link__empty kits-label">{t.linkNoCandidates}</p>
  }

  const submit = () => {
    const outcome = onSubmit({ claimId, passageId, stance, note })
    if (outcome.ok) {
      /* 成功后清空理由并保留表单：研究者常常要连着补几条引用，
         关掉表单会让「再补一条」变成三次点击。 */
      setNote("")
      /* 上一次写入的收尾状态跟着作废——那是**上一次**操作的结果。 */
      setClosingId(null)
      setDisposedIds([])
      setResult(outcome)
      return
    }
    setResult(outcome)
  }

  return (
    <div className="rs-link" data-testid={`link-form-${passageId}`}>
      <p className="rs-link__title kits-label">{t.linkFormTitle}</p>

      <label className="rs-link__field" htmlFor={`${idBase}-claim`}>
        <span className="rs-link__field-label kits-label">{t.linkClaimLabel}</span>
        <select
          id={`${idBase}-claim`}
          ref={selectRef}
          className="rs-link__select kits-control"
          value={claimId}
          onChange={(event) => setClaimId(event.target.value)}
        >
          {candidates.map((candidate) => (
            <option key={candidate.claimId} value={candidate.claimId}>
              {tc.claimLabel(candidate.index)} · {candidate.text.slice(0, 28)}
              {candidate.text.length > 28 ? "…" : ""}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="rs-link__stances">
        <legend className="rs-link__field-label kits-label">{t.linkStanceLabel}</legend>
        {/* 顺序来自契约（contradicts 最先）。ALL_STANCES 就是那个顺序。 */}
        {ALL_STANCES.map((value) => {
          const presentation = getRelationPresentation(value)
          const already = candidates.find((c) => c.claimId === claimId)?.existingStances ?? []
          return (
            <label key={value} className="rs-link__stance" data-stance={value}>
              <input
                type="radio"
                name={`${idBase}-stance`}
                value={value}
                checked={stance === value}
                onChange={() => setStance(value)}
              />
              <span className="rs-link__stance-word">{presentation.label}</span>
              {/* 已经用过的关系**先说出来**。领域层会拒绝重复，
                  但让用户点一次才知道，是一次不必要的失败。 */}
              {already.includes(value) ? (
                <span className="rs-link__stance-existing kits-label" data-testid={`existing-${value}`}>
                  {t.linkExisting}
                </span>
              ) : null}
            </label>
          )
        })}
      </fieldset>

      <label className="rs-link__field" htmlFor={`${idBase}-note`}>
        <span className="rs-link__field-label kits-label">{t.linkNoteLabel}</span>
        <textarea
          id={`${idBase}-note`}
          className="rs-link__note kits-control"
          rows={2}
          value={note}
          placeholder={t.linkNotePlaceholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <div className="rs-link__actions">
        <button type="button" className="rs-action kits-control" data-testid="link-submit" onClick={submit}>
          {t.linkSubmit}
        </button>
        <button
          type="button"
          className="rs-action rs-action--quiet kits-control"
          data-testid="link-cancel"
          onClick={onCancel}
        >
          {t.linkCancel}
        </button>
      </div>

      {/* 结果原样显示。拒绝时带稳定 code，供测试断言具体是哪一条守卫。 */}
      {result ? (
        result.ok ? (
          <p className="rs-link__ok" role="status" data-testid="link-accepted">
            <span className="kits-label">{t.linkAcceptedTitle}</span>
            <span>{t.linkAcceptedBody(result.stanceLabel, result.claimLabel)}</span>
          </p>
        ) : (
          <div className="rs-link__reject" role="alert" data-testid="link-rejected">
            <p className="kits-label">{t.linkRejectedTitle}</p>
            <ul>
              {result.issues.map((issue) => (
                <li key={issue.code} data-issue-code={issue.code}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {/* ---- 收尾：这次写入关掉了哪些缺口 ----
          这是 `resolved` 在界面上**唯一可达**的地方，而且必须是这里：
          缺口一旦不再成立，rail 里那一行连同它的「处理」按钮就一起消失了。
          `resolved` 刚刚变得合法，同时它的入口刚刚不见——用户能捕捉到
          这一刻的地方只有刚刚做的那次操作。

          数据来自 `addEvidenceLink` 的 `closedTensions`，不是这里 diff 出来的。 */}
      {result?.ok && result.closedTensions.length > 0 ? (
        <div className="rs-link__closed" data-testid="closed-tensions">
          <p className="rs-link__closed-title kits-label">{t.closedTitle}</p>
          <p className="rs-link__closed-note">{t.closedNote}</p>
          <ul className="rs-link__closed-list">
            {result.closedTensions.map((closed) => {
              const done = disposedIds.includes(closed.tensionId)
              return (
                <li
                  key={closed.tensionId}
                  className="rs-link__closed-item"
                  data-tension-id={closed.tensionId}
                  data-disposed={done ? "true" : "false"}
                >
                  <p className="rs-link__closed-subject">
                    <span className="kits-label">{TENSION_LABEL[closed.kind]}</span>
                    <span aria-hidden>·</span>
                    <span className="kits-label">{SEVERITY_LABEL[closed.severity]}</span>
                    <span aria-hidden>·</span>
                    <span className="kits-label">{claimLabelFor(closed.claimId)}</span>
                  </p>

                  {done ? (
                    <p className="rs-link__closed-done" role="status" data-testid={`disposed-${closed.tensionId}`}>
                      {t.closedDone}
                    </p>
                  ) : (
                    /* 按钮**保持挂载**（不是「点一下就换成面板」）：卸载它会让焦点
                       掉到 body，而焦点一旦掉出抽屉，Escape 就再也不冒泡到面板上——
                       抽屉会关不掉。这个坑是实测出来的，见 LinkForm 的 useEffect。 */
                    <>
                      <button
                        type="button"
                        className="rs-action rs-action--quiet kits-control"
                        aria-expanded={closingId === closed.tensionId}
                        data-testid={`resolve-gap-${closed.tensionId}`}
                        onClick={() =>
                          setClosingId(closingId === closed.tensionId ? null : closed.tensionId)
                        }
                      >
                        {t.resolveShort}
                      </button>

                      {closingId === closed.tensionId ? (
                        <DispositionPanel
                          idPrefix={`rs-link-close-${closed.tensionId}`}
                          showTitle={false}
                          /* **这里默认选中「已解决」是对的**：事实刚刚变了。
                             别处一律默认「接受为已知局限」——默认值是推荐，
                             而界面不该把用户往「声称自己解决了」那边推。 */
                          defaultResolution="resolved"
                          tensionId={closed.tensionId}
                          tensionKind={closed.kind}
                          severity={closed.severity}
                          claimIndex={claimIndexFor(closed.claimId)}
                          onSubmit={(resolution, reason) => {
                            const outcome = onSubmitDisposition(closed.tensionId, resolution, reason)
                            if (outcome.ok) setDisposedIds((ids) => [...ids, closed.tensionId])
                            return outcome
                          }}
                          onClose={() => setClosingId(null)}
                        />
                      ) : null}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function SourceIndex({
  data,
  claimLabelFor,
  claimIndexFor,
  onCreateLink,
  onSubmitDisposition,
}: {
  data: ResearchData
  /** 论断 id → 「论断 N」。与 rail 用同一份措辞，不另造一套。 */
  claimLabelFor: (claimId: string) => string
  /** 论断 id → 序号。处置面板要显示「论断 N」。 */
  claimIndexFor: (claimId: string) => number | undefined
  onCreateLink: (input: {
    claimId: string
    passageId: string
    stance: string
    note: string
  }) => LinkResult
  /** 收尾入口用。与窄带里的处置走**同一个**领域操作，只是位置不同。 */
  onSubmitDisposition: (
    tensionId: string,
    resolution: TensionResolution,
    reason: string,
  ) => { ok: true } | { ok: false; issues: DispositionIssue[] }
}) {
  const entries = useMemo(() => projectSourceIndex(data), [data])

  /* 三层展开，各自只记一个 id —— 同时展开两个来源会让这一屏变回一个列表页。 */
  const [openSourceId, setOpenSourceId] = useState<string | null>(entries[0]?.source.id ?? null)
  const [openPassageId, setOpenPassageId] = useState<string | null>(null)
  const [composingId, setComposingId] = useState<string | null>(null)

  if (entries.length === 0) {
    return <p className="rs-sources__empty kits-label">{t.empty}</p>
  }

  return (
    <div className="rs-sources" data-testid="source-index" data-source-count={entries.length}>
      <p className="rs-sheet__sub">{t.subtitle}</p>

      <ol className="rs-src-list">
        {entries.map((entry) => {
          const sourceOpen = openSourceId === entry.source.id
          return (
            <li
              key={entry.source.id}
              className="rs-src"
              data-source-id={entry.source.id}
              data-open={sourceOpen ? "true" : "false"}
            >
              <button
                type="button"
                className="rs-src__head"
                aria-expanded={sourceOpen}
                onClick={() => {
                  setOpenSourceId(sourceOpen ? null : entry.source.id)
                  setOpenPassageId(null)
                  setComposingId(null)
                }}
              >
                <span className="rs-src__title">{entry.source.title}</span>
                <span className="rs-src__meta">
                  {/* 性质与有效性是**两件事**，所以它们各自带自己的标记上色，
                      而不是被拼成一个「可信度」词。 */}
                  <span className="rs-src__type" data-source-type={entry.source.sourceType}>
                    {TYPE_LABEL[entry.source.sourceType]}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="rs-src__kind kits-label">{KIND_LABEL[entry.source.kind]}</span>
                  <span aria-hidden>·</span>
                  <span
                    className="rs-src__validity kits-label"
                    data-validity={entry.source.validity}
                  >
                    {VALIDITY_LABEL[entry.source.validity]}
                  </span>
                </span>
                <span className="rs-src__counts kits-label">
                  <span>{t.usedByClaims(entry.usedByClaimIds.length)}</span>
                  <span aria-hidden>·</span>
                  <span>{t.passageCount(entry.passages.length)}</span>
                  {entry.unusedPassageCount > 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span data-unused="true">{t.unusedPassages(entry.unusedPassageCount)}</span>
                    </>
                  ) : null}
                </span>
              </button>

              {sourceOpen ? (
                <div className="rs-src__body">
                  {entry.passages.length === 0 ? (
                    <p className="kits-label">{t.passagesEmpty}</p>
                  ) : (
                    <ol className="rs-psg-list">
                      {entry.passages.map((passageEntry) => {
                        const passage = passageEntry.passage
                        const passageOpen = openPassageId === passage.id
                        const composing = composingId === passage.id
                        return (
                          <li
                            key={passage.id}
                            className="rs-psg"
                            data-passage-id={passage.id}
                            data-open={passageOpen ? "true" : "false"}
                          >
                            <button
                              type="button"
                              className="rs-psg__head"
                              aria-expanded={passageOpen}
                              onClick={() => {
                                setOpenPassageId(passageOpen ? null : passage.id)
                                setComposingId(null)
                              }}
                            >
                              <span className="rs-psg__locator kits-label">
                                {formatLocator(passage, RESEARCH_LABELS)}
                              </span>
                              <span className="rs-psg__text">{passage.text}</span>
                            </button>

                            {passageOpen ? (
                              <div className="rs-psg__body">
                                {passageEntry.usages.length === 0 ? (
                                  <p className="rs-psg__none kits-label">{t.noUsage}</p>
                                ) : (
                                  <ul className="rs-psg__usages">
                                    {passageEntry.usages.map((usage) => {
                                      /* 关系词**只**从契约取。这是本文件里唯一
                                         显示 stance 的地方，而它读的是 label。 */
                                      const presentation = getRelationPresentation(usage.stance)
                                      return (
                                        <li
                                          key={usage.linkId}
                                          className="rs-psg__usage"
                                          data-stance={usage.stance}
                                          data-retired={usage.retiredAt ? "true" : "false"}
                                        >
                                          <span
                                            className="rs-psg__usage-stance"
                                            data-form={presentation.form}
                                          >
                                            {presentation.label}
                                          </span>
                                          <span className="rs-psg__usage-claim">
                                            {t.usageOn(claimLabelFor(usage.claimId))}
                                          </span>
                                          {usage.retiredAt ? (
                                            <span className="rs-psg__usage-retired kits-label">
                                              {t.retired}
                                            </span>
                                          ) : null}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}

                                {composing ? (
                                  <LinkForm
                                    data={data}
                                    passageId={passage.id}
                                    claimLabelFor={claimLabelFor}
                                    claimIndexFor={claimIndexFor}
                                    onCancel={() => setComposingId(null)}
                                    onSubmit={onCreateLink}
                                    onSubmitDisposition={onSubmitDisposition}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    className="rs-action rs-action--quiet kits-control"
                                    data-testid={`compose-${passage.id}`}
                                    onClick={() => setComposingId(passage.id)}
                                  >
                                    {t.linkAction}
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
