#!/usr/bin/env node
/**
 * Prototype Factory · Browser QA sweep (v1.1)
 *
 * What this is
 * ------------
 * The executable form of the Factory's QA contract. It sweeps every discovered
 * route across every configured viewport and theme and asserts the things that
 * a code review cannot: real console output, real layout boxes, the real
 * accessibility tree, real media-query states.
 *
 * Product-agnostic by construction: routes, viewports, themes and tolerances
 * come from `.qa/qa.config.mjs`. Nothing here knows a route name.
 *
 * The five checks that were added after real regressions
 * -----------------------------------------------------
 *  1. VIEWPORT EXPANSION + OVERFLOW are measured three ways, because
 *     `scrollWidth - innerWidth` alone reports a false green: Chromium silently
 *     widens the *layout* viewport to fit overflowing content, which can make
 *     the difference zero while `innerWidth` is no longer the width you asked
 *     for. So we also assert the requested width was actually honoured, and that
 *     the page cannot be scrolled sideways.
 *
 *  2. NO INVISIBLE SEMANTICS. Being visible is not the same as being *in the
 *     accessibility tree*. `aria-hidden="true"` on a real content ancestor
 *     silently prunes the whole subtree while looking perfect on screen. This
 *     cost a real regression once, so DOM counts are now compared against the
 *     browser's own accessibility tree per role.
 *
 *  3. PROBE INTEGRITY. Every numeric probe passes through `measure()`, which
 *     fails loudly on a missing selector or a non-finite value. The failure it
 *     prevents is specific and nasty: `Math.abs(NaN - expected) > tolerance` is
 *     `false`, so a probe that measured *nothing* used to report success.
 *
 *  4. REDUCED MOTION + COARSE POINTER + INTERSECTION-OBSERVER FAILURE. Content
 *     must be visible without hover, without animation, and even when the
 *     observer that was supposed to reveal it never fires.
 *
 *  5. PORT ISOLATION. This script starts its own dev server on a dedicated port
 *     and stops only that child. It refuses to attach to a server it did not
 *     start — see `scripts/check-qa-port.mjs` for why.
 *
 * Usage
 * -----
 *   pnpm qa                 # full sweep
 *   pnpm qa --routes=/demo  # subset
 *   pnpm qa --headed        # watch it
 */

import { spawn } from "node:child_process"
import { createConnection } from "node:net"
import { readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

import {
  QA_HOST,
  QA_ORIGIN,
  QA_PORT,
  excludeRoutes,
  extraRoutes,
  pointerRatioTolerance,
  routes as configuredRoutes,
  settleMs,
  themes,
  tolerancePx,
  viewports,
} from "./qa.config.mjs"
import {
  CONTENT_VISIBLE_PROBE,
  DOM_SEMANTIC_COUNT,
  INVISIBLE_SEMANTICS_VIOLATIONS,
  LAYOUT_PROBE,
  POINTER_PROBE,
} from "./probes.mjs"
import { accessibilityRoleCounts } from "./ax-tree.mjs"

/* -------------------------------------------------------------------------- */
/* Result bookkeeping                                                          */
/* -------------------------------------------------------------------------- */

const failures = []
const notes = []
let checksRun = 0

function fail(where, message) {
  checksRun += 1
  failures.push(`${where} — ${message}`)
}

function ok(where, message) {
  checksRun += 1
  if (process.env.QA_VERBOSE === "1") process.stdout.write(`    ✓ ${where} ${message}\n`)
}

function note(message) {
  notes.push(message)
}

/* -------------------------------------------------------------------------- */
/* Probe integrity (section 3)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Measure something and refuse to proceed on a non-answer.
 *
 * Returns the value, or throws a labelled error. Callers cannot accidentally
 * compare `undefined`/`NaN`/`0`-from-nothing and pass: the guard is here, once,
 * rather than repeated (and forgotten) at each probe.
 */
async function measure(where, label, fn, { allowZero = false } = {}) {
  let value
  try {
    value = await fn()
  } catch (error) {
    throw new ProbeError(`${where} · ${label}: 无法测量（${error.message}）`)
  }
  if (typeof value !== "number") {
    throw new ProbeError(`${where} · ${label}: 期望数值，得到 ${typeof value}`)
  }
  if (!Number.isFinite(value)) {
    throw new ProbeError(`${where} · ${label}: 得到非有限值 ${value}（NaN/Infinity）`)
  }
  if (value === 0 && !allowZero) {
    throw new ProbeError(`${where} · ${label}: 得到 0——本不应为零，通常是选择器没命中或变量未解析`)
  }
  return value
}

class ProbeError extends Error {}

/* -------------------------------------------------------------------------- */
/* Route discovery — no hardcoded product routes                               */
/* -------------------------------------------------------------------------- */

function discoverRoutes(appDir) {
  const found = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (!statSync(full).isDirectory()) {
        if (entry === "page.tsx" || entry === "page.ts" || entry === "page.jsx") {
          const rel = relative(appDir, dir).split(sep).filter(Boolean)
          found.add(rel.length === 0 ? "/" : `/${rel.join("/")}`)
        }
        continue
      }
      walk(full)
    }
  }
  walk(appDir)
  return [...found]
}

function resolveRoutes(projectRoot, overrideList) {
  // Precedence: explicit --routes= → qa.config's `routes` → filesystem discovery.
  const base = overrideList ?? configuredRoutes ?? discoverRoutes(join(projectRoot, "app"))
  const all = [...new Set([...base, ...extraRoutes])]
  const dynamic = all.filter((route) => route.includes("["))
  const usable = all.filter((route) => !route.includes("[") && !excludeRoutes.includes(route))
  return { usable: usable.sort(), dynamic }
}

/* -------------------------------------------------------------------------- */
/* Server lifecycle (section 5)                                                */
/* -------------------------------------------------------------------------- */

function isPortInUse(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const settle = (inUse) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(inUse)
    }
    socket.setTimeout(700)
    socket.once("connect", () => settle(true))
    socket.once("timeout", () => settle(false))
    socket.once("error", () => settle(false))
  })
}

async function waitForServer(origin, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { redirect: "manual" })
      if (response.status < 500) return true
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

/**
 * Start the dev server ourselves, always.
 *
 * We never attach to a server we did not spawn: an unrelated process answering
 * on this port would make every assertion below meaningless while still
 * reporting green.
 *
 * The child is spawned **detached**, i.e. as its own process group, because
 * `pnpm dev` is a wrapper: killing the `pnpm` process leaves the real
 * `next-server` grandchild orphaned and holding the port. That is not
 * hypothetical — the first version of this script leaked exactly that way, and
 * the next run then failed the port guard. Killing the process *group* is what
 * makes "only stop what you started" actually true.
 */
async function startOwnServer(projectRoot) {
  if (await isPortInUse(QA_HOST, QA_PORT)) {
    throw new Error(
      `QA 端口 ${QA_HOST}:${QA_PORT} 已被占用。\n` +
        "  QA 不复用任何已存在的 server：一旦接到别的进程上，整套断言都会在错误的页面上通过。\n" +
        `  查看占用者：lsof -nP -iTCP:${QA_PORT} -sTCP:LISTEN\n` +
        "  确认那确实属于当前任务后再单独停止它。\n" +
        '  不要用 pkill -f "next dev" / pkill -f "next-server"（会误杀同机其它原型）。',
    )
  }
  const child = spawn(
    "pnpm",
    ["dev", "--hostname", QA_HOST, "--port", String(QA_PORT)],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      detached: true,
    },
  )
  // Keep the server's own output. It is discarded on the happy path, but on a
  // startup failure it is the only thing that explains *why* — a compile error,
  // a stale project lock, a missing dependency. Printing it beats guessing.
  const serverOutput = []
  const capture = (chunk) => {
    serverOutput.push(chunk.toString())
    if (serverOutput.length > 200) serverOutput.shift()
  }
  child.stdout.on("data", capture)
  child.stderr.on("data", capture)

  const ready = await waitForServer(QA_ORIGIN)
  if (!ready) {
    await stopOwnServer(child)
    throw new Error(
      `dev server 未能在 ${QA_ORIGIN} 就绪。\n` +
        serverDiagnosis(serverOutput.join("")) +
        "  server 自己的输出（最后 40 行）：\n" +
        serverOutput
          .join("")
          .split("\n")
          .slice(-40)
          .map((line) => `    │ ${line}`)
          .join("\n"),
    )
  }
  return child
}

/**
 * Turn Next's most confusing startup failure into an actionable message.
 *
 * `next dev` takes a **per-project** singleton lock (`.next/dev/lock`), not a
 * per-port one. So a second dev server for this project refuses to start *even
 * on a different port* — and if a previous server was killed uncleanly, its
 * stale pid in that lock keeps blocking every later run while the port itself
 * looks perfectly free. The bare error ("Another next dev server is already
 * running") points at a symptom in the wrong place.
 */
function serverDiagnosis(output) {
  if (!/Another next dev server is already running/i.test(output)) return ""
  const pid = output.match(/- PID:\s+(\d+)/)?.[1]
  return (
    "  ⚠ Next 16 的 dev server 是**按项目**加锁的（.next/dev/lock），不是按端口。\n" +
    "    同一个项目不能再起第二个 `next dev`，即使端口不同；而且上一次被强杀的服务\n" +
    "    会在 lock 里留下过期 pid，让之后每一次启动都失败——而端口看起来是空的。\n" +
    (pid
      ? `    定位到的 pid：${pid}。确认它属于本项目后再停止：kill -9 ${pid}\n`
      : "") +
    "    另外：`pnpm test` 与 `pnpm qa` 不能同时跑，它们抢同一个项目锁。\n"
  )
}

/** Stop only the process group this run started, then confirm the port is free. */
async function stopOwnServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const signal = (name) => {
    try {
      // Negative pid targets the whole group (we spawned detached).
      process.kill(-child.pid, name)
    } catch {
      try {
        child.kill(name)
      } catch {
        /* already gone */
      }
    }
  }
  signal("SIGTERM")
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    if (!(await isPortInUse(QA_HOST, QA_PORT))) {
      note(`QA server 已停止（pid ${child.pid} 进程组），端口 ${QA_PORT} 已释放`)
      return
    }
  }
  signal("SIGKILL")
  await new Promise((resolve) => setTimeout(resolve, 400))
  if (await isPortInUse(QA_HOST, QA_PORT)) {
    note(
      `QA server 可能未完全停止：端口 ${QA_PORT} 仍被占用（pid ${child.pid}）。` +
        "下次运行会由端口守卫拦下并给出定位命令。",
    )
  } else {
    note(`QA server 已在 SIGKILL 后停止（pid ${child.pid}）`)
  }
}

/* -------------------------------------------------------------------------- */
/* In-page probes                                                              */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* One page check                                                              */
/* -------------------------------------------------------------------------- */

async function checkPage(context, route, viewport, theme) {
  const where = `${route} · ${viewport.name} · ${theme}`
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  const requestFailures = []
  const badResponses = []

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`)
  })
  page.on("response", (response) => {
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  try {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto(`${QA_ORIGIN}${route}`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(settleMs)

    // ---- errors -----------------------------------------------------------
    if (consoleErrors.length > 0) fail(where, `console error ×${consoleErrors.length}: ${consoleErrors[0]}`)
    else ok(where, "console clean")

    if (pageErrors.length > 0) fail(where, `page error ×${pageErrors.length}: ${pageErrors[0]}`)
    else ok(where, "no page error")

    if (requestFailures.length > 0)
      fail(where, `request failure ×${requestFailures.length}: ${requestFailures[0]}`)
    else ok(where, "no request failure")

    if (badResponses.length > 0)
      fail(where, `HTTP ≥400 ×${badResponses.length}: ${badResponses[0]}`)
    else ok(where, "no bad response")

    // ---- layout: three independent criteria -------------------------------
    const layout = await page.evaluate(LAYOUT_PROBE)

    const widthDrift = Math.abs(layout.innerWidth - viewport.width)
    if (widthDrift > tolerancePx) {
      fail(
        where,
        `viewport expansion: 请求 ${viewport.width}px，实际 innerWidth ${layout.innerWidth}px（漂移 ${widthDrift}px）——` +
          "这是 Chromium 为容纳溢出内容自动扩张布局视口，scrollWidth-innerWidth 会因此假绿",
      )
    } else {
      ok(where, `viewport width honoured (${layout.innerWidth}px)`)
    }

    const overflow = layout.scrollWidth - viewport.width
    if (overflow > tolerancePx) {
      fail(
        where,
        `horizontal overflow: documentElement.scrollWidth ${layout.scrollWidth}px > 请求宽度 ${viewport.width}px（超出 ${overflow}px）`,
      )
    } else {
      ok(where, `no horizontal overflow (${layout.scrollWidth}px)`)
    }

    // The decisive one: can the page actually be panned sideways?
    const scrollX = await page.evaluate(async () => {
      window.scrollTo(9999, 0)
      await new Promise((r) => requestAnimationFrame(() => r()))
      const value = window.scrollX
      window.scrollTo(0, 0)
      return value
    })
    if (Math.abs(scrollX) > tolerancePx) {
      fail(where, `可横向滚动: scrollTo(9999,0) 后 scrollX=${scrollX}，页面确实能左右平移`)
    } else {
      ok(where, "not horizontally scrollable")
    }

    // ---- No Invisible Semantics ------------------------------------------
    const session = await context.newCDPSession(page)
    const axCounts = await accessibilityRoleCounts(session, note)
    await session.detach()

    const axCount = (role) => axCounts.get(role) ?? 0

    const roleSelectors = {
      button: "button, [role=button]",
      link: "a[href], [role=link]",
      heading: "h1, h2, h3, h4, h5, h6, [role=heading]",
    }

    for (const [role, selector] of Object.entries(roleSelectors)) {
      const domCount = await page.evaluate(DOM_SEMANTIC_COUNT(selector))
      const treeCount = axCount(role)
      if (domCount !== treeCount) {
        fail(
          where,
          `No Invisible Semantics (${role}): DOM ${domCount} ≠ 无障碍树 ${treeCount}` +
            "——看得到不等于 accessibility tree 看得到（典型原因：真实内容祖先被设了 aria-hidden）",
        )
      } else if (domCount > 0) {
        ok(where, `${role}: DOM ${domCount} == AX ${treeCount}`)
      }
    }

    const violations = await page.evaluate(INVISIBLE_SEMANTICS_VIOLATIONS)
    if (violations.length > 0) {
      const first = violations[0]
      fail(
        where,
        `aria-hidden 祖先里仍有可交互内容 ×${violations.length}：<${first.tag}${first.testid ? ` data-testid="${first.testid}"` : ""}> 含 ${first.interactive} 个可聚焦元素——装饰性元素才允许 aria-hidden`,
      )
    } else {
      ok(where, "no interactive content under aria-hidden")
    }

    // ---- content is visible by default -----------------------------------
    const visible = await page.evaluate(CONTENT_VISIBLE_PROBE)
    if (visible.height === 0 || visible.textLength === 0) {
      fail(where, `内容不可见: main 高度 ${visible.height}px，可见文本 ${visible.textLength} 字`)
    } else if (visible.fadedRoots > 0) {
      fail(where, `内容默认不可见: ${visible.fadedRoots} 个内容区块 opacity 为 0（不应依赖动画/观察者才可见）`)
    } else {
      ok(where, `content visible (${visible.height}px / ${visible.textLength} chars)`)
    }
  } catch (error) {
    if (error instanceof ProbeError) fail(where, error.message)
    else fail(where, `检查过程异常: ${error.message}`)
  } finally {
    await page.close()
  }
}

/* -------------------------------------------------------------------------- */
/* Media / capability probes (section 4)                                       */
/* -------------------------------------------------------------------------- */

async function checkReducedMotion(context, route) {
  const where = `${route} · reduced-motion`
  const page = await context.newPage()
  try {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(`${QA_ORIGIN}${route}`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(settleMs)

    const state = await page.evaluate(CONTENT_VISIBLE_PROBE)
    if (state.height === 0 || state.textLength === 0) {
      fail(where, "reduced-motion 下内容不可见")
    } else if (state.fadedRoots > 0) {
      fail(where, `reduced-motion 下仍有 ${state.fadedRoots} 个内容区块 opacity 为 0——动画关闭后内容必须仍然存在`)
    } else {
      ok(where, "reduced-motion 下信息完整")
    }

    const running = await page.evaluate(
      `document.getAnimations().filter((a) => a.playState === "running" && a.effect &&
        a.effect.getComputedTiming().iterations === Infinity).length`,
    )
    if (running > 0) {
      fail(where, `reduced-motion 下仍有 ${running} 个无限循环动画在运行`)
    } else {
      ok(where, "无无限循环动画")
    }
  } catch (error) {
    if (error instanceof ProbeError) fail(where, error.message)
    else fail(where, `检查过程异常: ${error.message}`)
  } finally {
    await page.close()
  }
}

/**
 * Coarse-pointer probe.
 *
 * `hasTouch` / `isMobile` are properties of the **browser context**, not of the
 * page viewport — resizing a page cannot turn `(pointer: coarse)` on. So the two
 * states are measured in two genuinely different contexts, which is also how a
 * real phone differs from a desktop.
 */
async function checkCoarsePointer(browser, route) {
  const where = `${route} · coarse-pointer`
  const fine = viewports.find((v) => !v.touch)
  const coarse = viewports.find((v) => v.touch)
  if (!fine || !coarse) {
    note("coarse-pointer 检查已跳过：需要至少一个 fine 与一个 touch viewport")
    return
  }

  const read = async (viewport) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.touch,
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    try {
      await page.goto(`${QA_ORIGIN}${route}`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(settleMs)
      return await page.evaluate(POINTER_PROBE)
    } finally {
      await context.close()
    }
  }

  try {
    const fineState = await read(fine)
    const coarseState = await read(coarse)

    if (coarseState.coarse !== true) {
      fail(where, "touch context 下 (pointer: coarse) 未匹配——触屏 CSS 分支根本没生效")
    } else {
      ok(where, "(pointer: coarse) matched")
    }
    if (fineState.coarse !== false) {
      fail(where, "fine context 下意外匹配了 (pointer: coarse)")
    }

    // 比例类断言只在两边都测到非零值时才比较；否则必须显式报错，不能靠 NaN 静默通过。
    if (fineState.scale > 0 || coarseState.scale > 0) {
      const ratio = await measure(
        where,
        "coarse/fine scale ratio",
        () => coarseState.scale / fineState.scale,
      )
      if (Math.abs(ratio - 1) < pointerRatioTolerance) {
        fail(where, `触屏缩放比例 ${ratio.toFixed(3)} 与细指针几乎相同——粗指针分支可能没生效`)
      } else {
        ok(where, `scale ratio ×${ratio.toFixed(2)}`)
      }
    } else {
      note(
        `${route}: 未声明 --kits-grid-cell-scale，跳过比例断言（该断言只在页面消费 Kits 间距契约时适用）`,
      )
    }
  } catch (error) {
    if (error instanceof ProbeError) fail(where, error.message)
    else fail(where, `检查过程异常: ${error.message}`)
  }
}

/**
 * The page must not depend on IntersectionObserver to become visible.
 *
 * Reveal-on-scroll implementations routinely start at `opacity: 0` and wait for
 * the observer. If the observer is missing, unavailable, or simply never fires,
 * the content stays permanently invisible — and no screenshot of a
 * pre-scrolled-into-view state would show it.
 */
async function checkNoObserverDependency(context, route) {
  const where = `${route} · no-IntersectionObserver`
  const page = await context.newPage()
  try {
    await page.addInitScript(() => {
      delete window.IntersectionObserver
    })
    await page.goto(`${QA_ORIGIN}${route}`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(settleMs)
    const state = await page.evaluate(CONTENT_VISIBLE_PROBE)
    if (state.height === 0 || state.textLength === 0) {
      fail(where, "没有 IntersectionObserver 时内容永久不可见")
    } else if (state.fadedRoots > 0) {
      fail(
        where,
        `没有 IntersectionObserver 时仍有 ${state.fadedRoots} 个区块不可见——内容可见性不能依赖观察者成功回调`,
      )
    } else {
      ok(where, "不依赖 IntersectionObserver")
    }
  } catch (error) {
    fail(where, `检查过程异常: ${error.message}`)
  } finally {
    await page.close()
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  const projectRoot = process.cwd()
  const routeOverride = process.argv.find((arg) => arg.startsWith("--routes="))
  const overrideList = routeOverride
    ? routeOverride.slice("--routes=".length).split(",").map((r) => r.trim()).filter(Boolean)
    : null

  const { usable, dynamic } = resolveRoutes(projectRoot, overrideList)
  if (dynamic.length > 0) {
    note(`动态路由无法静态发现，已跳过：${dynamic.join(", ")}（用 .qa/qa.config.mjs 的 extraRoutes 补具体路径）`)
  }
  if (usable.length === 0) {
    process.stderr.write("没有可扫描的路由。请检查 .qa/qa.config.mjs 或 app/ 目录。\n")
    process.exit(1)
  }

  process.stdout.write(
    `\n\u001b[1mPrototype Factory · Browser QA\u001b[0m\n` +
      `  origin    ${QA_ORIGIN}\n` +
      `  routes    ${usable.length} 条（${usable.join(", ")}）\n` +
      `  viewports ${viewports.map((v) => `${v.name} ${v.width}×${v.height}`).join(" · ")}\n` +
      `  themes    ${themes.join(" · ")}\n`,
  )

  let child = null
  let browser = null
  try {
    child = await startOwnServer(projectRoot)
    process.stdout.write(`  server    已由本次运行启动（pid ${child.pid}）\n\n`)

    const { chromium } = await import("./playwright-runtime.mjs")
    browser = await chromium.launch({ headless: !process.argv.includes("--headed") })

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.mobile,
        hasTouch: viewport.touch,
        deviceScaleFactor: 1,
      })
      try {
        for (const theme of themes) {
          for (const route of usable) {
            await checkPage(context, route, viewport, theme)
          }
        }
      } finally {
        await context.close()
      }
    }

    // Capability probes run once per route on a fresh context each.
    for (const route of usable) {
      const probeContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      })
      try {
        await checkReducedMotion(probeContext, route)
        await checkNoObserverDependency(probeContext, route)
      } finally {
        await probeContext.close()
      }
      await checkCoarsePointer(browser, route)
    }
  } catch (error) {
    fail("environment", error.message)
  } finally {
    // 只停止自己启动的 server，且只在此时停止。
    await stopOwnServer(child)
    if (browser) await browser.close()
  }

  process.stdout.write("\n")
  for (const line of notes) process.stdout.write(`  \u001b[33m!\u001b[0m ${line}\n`)
  if (notes.length > 0) process.stdout.write("\n")

  if (failures.length > 0) {
    process.stdout.write(`\u001b[31m✗ QA FAILED\u001b[0m — ${failures.length}/${checksRun} 项未通过\n\n`)
    for (const line of failures) process.stdout.write(`    ✗ ${line}\n`)
    process.stdout.write("\n")
    process.exit(1)
  }

  process.stdout.write(`\u001b[32m✓ QA OK\u001b[0m — ${checksRun} 项检查全部通过\n\n`)
}

main().catch((error) => {
  process.stderr.write(`QA 运行失败: ${error?.stack ?? error}\n`)
  process.exit(1)
})
