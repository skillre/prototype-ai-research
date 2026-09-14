/**
 * Finding —— 交付物。
 *
 * ## 它不是什么
 *
 * 不是 dashboard summary，不是「把工作区里的东西再列一遍」。它是一份
 * **稳定、可分享、可引用**的定稿（Phase 2 IA），所以它必须能独立被读懂：
 * 带着研究问题、范围、结论、依据、引用、以及它不覆盖什么。
 *
 * ## 它是 Server Component，而且这一点是刻意的
 *
 * 交付物是一份**快照**。工作区是活的（客户端状态，每次处置都重算），
 * 而一份会随着你的本地未保存编辑而变化的交付物，既不可分享也不可引用。
 * 所以这一页从数据集渲染，并带上 `generatedAt`——读者因此知道
 * 它反映的是哪一刻。
 *
 * ## 三条契约在这里**呈现**，而不是在这里执行
 *
 * ```
 * 置信度上限      deriveFindingConfidenceCeiling —— 这一页只读结果
 * 建议不得进入     mayEnterFinding —— 这一页拿不到建议的文本（见下）
 * 边界措辞由人定   Finding.knownLimitations —— 候选措辞单独一处，不混排
 * ```
 *
 * 「拿不到」是字面意思：下面所有 AI 相关的内容都读 `draft.aiCandidates`，
 * 而它在领域层被 `buildAiDocument` 分过类，只含 Class 1。
 * 被挡在外面的那 N 条只以一个**计数**出现——它们没有文本进得来。
 */

import Link from "next/link"
import { messages } from "@/lib/i18n"
import {
  type Finding,
  type ResearchData,
  getRelationPresentation,
  projectFindingDraft,
  validateFinding,
} from "@/lib/research"
import { RESEARCH_LABELS } from "@/lib/research-ui/copy"
import { formatLocator } from "@/lib/research-ui"
/* ⚠ 这两行**必须**出现在每一个渲染 `.rs-*` 的路由入口里，而不只是在
 * ResearchWorkspace 里。
 *
 * App Router 的 CSS 是按**模块图**打包的：`research-shell.css` 由
 * `research-workspace.tsx` import，于是它只跟着**工作区那条路由**走。
 * Finding 是另一条路由、另一个入口组件，它不渲染 `ResearchWorkspace`——
 * 所以那两份样式根本不会加载，整页退回浏览器默认样式。
 *
 * 这个失败是**完全静默**的：不报错、不警告、元素都在，按 testid 的断言
 * 也全能过（它们只查存不存在）。它只让页面看起来像一个没写样式的 HTML。
 * 抓到它的是一条 `getComputedStyle` 断言（`overflow-wrap` 应当是
 * `anywhere`，实测是 `normal`）—— 在打包边界这种问题上，
 * 视觉断言比 DOM 断言有用得多。
 *
 * 以后每新增一个「渲染 `.rs-*` 的路由入口」，都要带上这两行。 */
import "@/lib/kits/adapters/style.css"
import "./research-shell.css"

const t = messages.research.finding
const tc = messages.research.chain
const tr = messages.research.rail

/** 张力种类的界面词。与窄带、轨迹共用同一份，不另造一套。 */
const KIND_LABEL = tr.kind

export function FindingView({
  data,
  finding,
}: {
  data: ResearchData
  finding: Finding
}) {
  const draft = projectFindingDraft(data, finding)
  const issues = validateFinding(data, finding)
  const claimLabel = (index: number) => tc.claimLabel(index)

  return (
    <main className="rs-shell rs-finding" data-testid="finding-view">
      <header className="rs-finding__head">
        <p className="rs-section-label">
          <span aria-hidden className="rs-section-label__tick" />
          {t.eyebrow}
        </p>
        <h1 className="rs-finding__title">{t.heading}</h1>
        {/* 一句话说清这一页与工作区的区别。不写这句话，读者会以为
            它是又一个实时视图，然后开始奇怪为什么它不跟着变。 */}
        <p className="rs-finding__note">{t.note}</p>
        <p className="rs-finding__envelope kits-label">
          <span className="numeric">{t.generatedAt(finding.generatedAt.slice(0, 10))}</span>
          <span aria-hidden>·</span>
          {/* 研究状态：active / archived。交付物的信封字段之一。 */}
          <span>{t.researchState[draft.researchStatus]}</span>
          <span aria-hidden>·</span>
          <Link className="rs-head-link" data-testid="back-to-workspace" href={`/r/${data.research.id}`}>
            {t.backToWorkspace}
          </Link>
        </p>
      </header>

      {/* ---- 研究问题 + 范围。边界本身就是结论的一部分。 ---- */}
      <section className="rs-finding__section" aria-labelledby="rs-finding-question">
        <h2 id="rs-finding-question" className="rs-section-label">
          {t.questionLabel}
        </h2>
        <p className="rs-finding__question">{draft.question}</p>

        <h3 className="rs-section-label rs-finding__sub">{t.scopeLabel}</h3>
        <div className="rs-finding__scope">
          <p className="rs-finding__scope-row">
            <span className="kits-label">{t.scopeIn}</span>
            {draft.scope.in.map((item) => (
              <span key={item} className="rs-finding__scope-item">
                {item}
              </span>
            ))}
          </p>
          <p className="rs-finding__scope-row" data-excluded="true">
            <span className="kits-label">{t.scopeOut}</span>
            {draft.scope.out.map((item) => (
              <span key={item} className="rs-finding__scope-item">
                {item}
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* ---- 契约失败。**不静默修正**：把两个数字都摆出来。 ---- */}
      {!draft.contractOk ? (
        <section
          className="rs-finding__breach"
          role="alert"
          aria-labelledby="rs-finding-breach"
          data-testid="finding-contract-failure"
          data-issue-code={issues[0]?.code ?? ""}
        >
          <h2 id="rs-finding-breach" className="rs-section-label">
            {t.contractFailureTitle}
          </h2>
          <p className="rs-finding__breach-line">
            {t.contractFailure(draft.declaredConfidence, draft.ceiling)}
          </p>
          {draft.weakestClaimId ? (
            <p className="rs-finding__breach-line">
              {t.contractFailureWeakest(
                claimLabel(draft.claimIndex.get(draft.weakestClaimId) ?? 0),
              )}
            </p>
          ) : null}
          <p className="rs-finding__breach-action kits-label">{t.contractFailureAction}</p>
        </section>
      ) : null}

      {/* ---- 正文 + 置信度 ---- */}
      <section className="rs-finding__section" aria-labelledby="rs-finding-body">
        <h2 id="rs-finding-body" className="rs-section-label">
          {t.heading}
        </h2>
        <p className="rs-finding__body">{draft.finding.text}</p>

        <p className="rs-finding__confidence" data-testid="finding-confidence">
          <span className="kits-label">{t.confidenceLabel}</span>
          {/* 声明值与上限**并排**。合成一个数会让越界变得看不见——
              而那是这一整页唯一一个必须显式报错的地方。 */}
          <span className="numeric rs-finding__confidence-value" data-declared={draft.declaredConfidence}>
            {draft.declaredConfidence}
          </span>
          <span className="kits-label rs-finding__confidence-ceiling" data-ceiling={draft.ceiling}>
            {t.ceilingLabel(draft.ceiling)}
          </span>
        </p>
        <p className="rs-finding__hint kits-label">{t.ceilingNote}</p>
      </section>

      {/* ---- 依据的论断 ---- */}
      <section className="rs-finding__section" aria-labelledby="rs-finding-claims">
        <h2 id="rs-finding-claims" className="rs-section-label">
          {t.claimsLabel}
          <span className="kits-label numeric">{t.count(draft.supportingClaims.length)}</span>
        </h2>
        <ol className="rs-finding__claims">
          {draft.supportingClaims.map((claim) => {
            const index = draft.claimIndex.get(claim.id)
            return (
              <li key={claim.id} className="rs-finding__claim" data-claim-id={claim.id}>
                <span className="rs-finding__claim-index kits-label numeric">
                  {index ? claimLabel(index) : claim.id}
                </span>
                <span className="rs-finding__claim-text">{claim.text}</span>
                {draft.weakestClaimId === claim.id ? (
                  <span className="rs-finding__claim-weakest kits-label" data-testid="weakest-claim">
                    {t.weakestLabel}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      {/* ---- 引用。落点是 Passage，所以必须显示 locator。 ---- */}
      <section className="rs-finding__section" aria-labelledby="rs-finding-citations">
        <h2 id="rs-finding-citations" className="rs-section-label">
          {t.citationsLabel}
          <span className="kits-label numeric">{t.citationsCount(draft.citations.length)}</span>
        </h2>

        {draft.unverifiableCitationCount > 0 ? (
          <p className="rs-finding__warn" data-testid="unverifiable-citations">
            {t.unverifiableCount(draft.unverifiableCitationCount)}
          </p>
        ) : null}

        <ul className="rs-finding__citations">
          {draft.citations.map((citation) => {
            /* 关系词只从契约取——交付物里出现第二套关系语言，
               读者就会以为「限定」和「支持」之外还有第三种关系。 */
            const presentation = getRelationPresentation(citation.stance)
            return (
              <li
                key={citation.linkId}
                className="rs-finding__citation"
                data-stance={citation.stance}
                data-verifiable={citation.verifiable ? "true" : "false"}
              >
                <p className="rs-finding__citation-head">
                  <span className="rs-finding__citation-stance" data-form={presentation.form}>
                    {presentation.label}
                  </span>
                  <span className="kits-label">{citation.source?.title ?? t.sourceMissing}</span>
                  <span className="kits-label numeric">
                    {formatLocator(citation, RESEARCH_LABELS)}
                  </span>
                  {!citation.verifiable ? (
                    <span className="rs-finding__citation-bad kits-label">{t.unverifiable}</span>
                  ) : null}
                </p>
                <p className="rs-finding__citation-text">{citation.passageText}</p>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ---- 已知局限。与「已解决」**分开，且方向相反**。 ---- */}
      <section className="rs-finding__section" aria-labelledby="rs-finding-limitations">
        <h2 id="rs-finding-limitations" className="rs-section-label">
          {t.limitationsLabel}
          <span className="kits-label numeric">{t.count(draft.limitations.length)}</span>
        </h2>
        <p className="rs-finding__hint">{t.limitationsNote}</p>

        <ul className="rs-finding__limitations">
          {draft.limitations.map((limitation, position) => (
            <li
              key={`${position}-${limitation.wording}`}
              className="rs-finding__limitation"
              data-tracked={limitation.ref ? "true" : "false"}
              data-overstated={limitation.overstated ? "true" : "false"}
            >
              <p className="rs-finding__limitation-text">{limitation.wording}</p>
              {limitation.overstated ? (
                <p className="rs-finding__warn" data-testid={`overstated-${position}`}>
                  {t.limitationOverstated}
                </p>
              ) : null}
              {limitation.dangling ? (
                <p className="rs-finding__warn" data-testid={`dangling-${position}`}>
                  {t.limitationDangling}
                </p>
              ) : null}
              <p className="rs-finding__limitation-meta kits-label">
                {/* 手的边界与有出处的边界必须能区分：前者是作者的判断，
                    后者能被追到工作区里的一条处置记录。 */}
                {limitation.ref ? t.limitationTracked : t.limitationHandwritten}
                {limitation.limitation ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{KIND_LABEL[limitation.limitation.kind]}</span>
                    <span aria-hidden>·</span>
                    <span className="numeric">
                      {t.generatedAt(limitation.limitation.acceptedAt.slice(0, 10))}
                    </span>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>

        {/* ---- 已接受、但还没写进交付物 ---- */}
        <h3 className="rs-section-label rs-finding__sub" id="rs-finding-candidates">
          {t.candidatesLabel}
        </h3>
        {draft.candidates.length === 0 ? (
          <p className="rs-finding__hint" data-testid="no-candidates">
            {t.candidatesNone}
          </p>
        ) : (
          <>
            <p className="rs-finding__hint">{t.candidatesNote}</p>
            <ul className="rs-finding__candidates">
              {draft.candidates.map((candidate) => (
                <li
                  key={candidate.tensionId}
                  className="rs-finding__candidate"
                  data-tension-id={candidate.tensionId}
                >
                  <p className="kits-label">
                    {t.candidateFrom(KIND_LABEL[candidate.kind], claimLabel(candidate.claimIndex))}
                  </p>
                  {/* 候选措辞只是**原料**。它不会自动变成上面那一段里的任何一句——
                      那正是「不要把 disposition reason 当成成稿」。 */}
                  <p className="rs-finding__candidate-wording">
                    {t.candidateWording(candidate.dispositionReason)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ---- 已解决。与已知局限分开，并且说清它是什么。 ---- */}
        <h3 className="rs-section-label rs-finding__sub" id="rs-finding-resolved">
          {t.resolvedLabel}
          <span className="kits-label numeric">{t.resolvedCount(draft.resolvedCount)}</span>
        </h3>
        <p className="rs-finding__hint" data-testid="resolved-count">
          {t.resolvedNote}
        </p>
      </section>

      {/* ---- AI 抽取的事实：只作为**候选材料**，不是正文。 ---- */}
      <section className="rs-finding__section" aria-labelledby="rs-finding-ai">
        <h2 id="rs-finding-ai" className="rs-section-label">
          {t.aiLabel}
        </h2>
        <p className="rs-finding__hint">{t.aiNote}</p>

        <ul className="rs-finding__ai">
          {draft.aiCandidates.map((output) => (
            <li key={output.id} className="rs-finding__ai-row" data-ai-id={output.id}>
              <p className="rs-finding__ai-statement">{output.statement}</p>
              <p className="kits-label">
                {t.aiSources(output.passageIds.length)}
              </p>
            </li>
          ))}
        </ul>

        {/* 被挡在外面的建议：**只有计数，没有文本**。 */}
        {draft.excludedCount > 0 ? (
          <p className="rs-finding__hint" data-testid="excluded-suggestions">
            {t.aiExcluded(draft.excludedCount)}
          </p>
        ) : null}
      </section>

      {/* ---- 定稿时仍未处理的缺口。读者应该知道它们存在。 ---- */}
      <section className="rs-finding__section" aria-labelledby="rs-finding-open">
        <h2 id="rs-finding-open" className="rs-section-label">
          {t.openLabel}
          <span className="kits-label numeric">{t.openCount(draft.openTensions.length)}</span>
        </h2>
        {draft.openTensions.length === 0 ? (
          <p className="rs-finding__hint">{t.openNone}</p>
        ) : (
          <>
            <p className="rs-finding__hint">{t.openNote}</p>
            <ul className="rs-finding__open">
              {draft.openTensions.map((tension) => (
                <li key={tension.id} className="rs-finding__open-row" data-tension-id={tension.id}>
                  {KIND_LABEL[tension.kind]}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  )
}
