// Claude Usage — Scriptable widget
//
// Fetches usage directly from the phone with your Claude Code login token (kept in the Keychain).
// If that fails, it falls back to claude-usage.json, which the SwiftBar plugin on the Mac
// (~/.swiftbar/claude-usage.5m.sh) writes into iCloud Drive/Claude Usage every 5 minutes.
// Setup: run the token command below on your Mac and paste the result when Scriptable asks.
// Optional iCloud fallback: Scriptable Settings → File Bookmarks → + → Pick Folder → iCloud Drive/Claude Usage,
// and name the bookmark "Claude Usage".
// Supports small and medium home-screen widgets plus lock-screen widgets.
// The last good reading is cached on the phone, so the widget still shows data when the network, iCloud or the Mac is unavailable.

const FILE = "claude-usage.json"
const CACHE_FILE = "claude-usage-cache.json"
const BOOKMARK = "Claude Usage"
const TOKEN_KEY = "claude-oauth-token"
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const STALE_MIN = 30

const ACCENT = new Color("#d97757")
const AMBER = new Color("#f5a524")
const RED = new Color("#e5484d")
const FG = Color.dynamic(new Color("#1f1e1d"), new Color("#f5f4ef"))
const DIM = Color.dynamic(new Color("#73726c"), new Color("#9c9a92"))
const BG = Color.dynamic(new Color("#faf9f5"), new Color("#1f1e1d"))
const TRACK = new Color("#8e8e93", 0.3)

const colorFor = p => (p >= 90 ? RED : p >= 70 ? AMBER : ACCENT)
const pctColor = p => (p >= 70 ? colorFor(p) : FG)

// Same endpoint /usage uses. The token is a Claude Code login token; this script never refreshes it.
async function fetchLive() {
  if (!Keychain.contains(TOKEN_KEY)) return null
  const req = new Request(USAGE_URL)
  req.headers = {
    Authorization: `Bearer ${Keychain.get(TOKEN_KEY)}`,
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": "claude-code-scriptable",
  }
  req.timeoutInterval = 15
  const data = await req.loadJSON()
  const code = req.response.statusCode
  if (code === 401) throw new Error("login token expired. Run the token command on your Mac and paste it again.")
  if (code !== 200) throw new Error(`usage request failed (HTTP ${code})`)
  return { ...data, fetched_at: new Date().toISOString() }
}

// Returns the freshest data available: live fetch first, then the iCloud file, then the on-device cache.
async function load() {
  const local = FileManager.local()
  const cachePath = local.joinPath(local.documentsDirectory(), CACHE_FILE)
  let err = null
  try {
    const live = await fetchLive()
    if (live) {
      local.writeString(cachePath, JSON.stringify(live))
      return live
    }
  } catch (e) {
    err = e
  }
  try {
    const fm = FileManager.iCloud()
    if (!fm.bookmarkExists(BOOKMARK)) throw new Error(`Add a file bookmark named "${BOOKMARK}" in Scriptable settings.`)
    const path = fm.joinPath(fm.bookmarkedPath(BOOKMARK), FILE)
    if (fm.fileExists(path)) {
      await fm.downloadFileFromiCloud(path)
      const raw = fm.readString(path)
      const data = JSON.parse(raw)
      local.writeString(cachePath, raw)
      return data
    }
  } catch (e) {
    err = err || e
  }
  if (local.fileExists(cachePath)) return JSON.parse(local.readString(cachePath))
  if (err) throw err
  return null
}

// First run in the app: ask for the token once and keep it in the Keychain.
async function askForToken() {
  const a = new Alert()
  a.title = "Claude login token"
  a.message = 'On your Mac, run:\nsecurity find-generic-password -s "Claude Code-credentials" -w | /usr/bin/jq -r .claudeAiOauth.accessToken\nThen paste the output here.'
  a.addSecureTextField("Token")
  a.addAction("Save")
  a.addCancelAction("Skip")
  if ((await a.present()) === 0) {
    const value = a.textFieldValue(0).trim()
    if (value) Keychain.set(TOKEN_KEY, value)
  }
}

// Once a reset time has passed, the old percent no longer applies, so show 0% until the next update
const passed = d => d && d.getTime() <= Date.now()
const norm = l => {
  const reset = l?.resets_at ? new Date(l.resets_at) : null
  return { percent: passed(reset) ? 0 : Math.floor(l?.percent ?? 0), reset: passed(reset) ? null : reset }
}

function parse(data) {
  const ls = data.limits || []
  const pick = kind => ls.find(l => l.kind === kind)
  const session = pick("session") || { percent: data.five_hour?.utilization, resets_at: data.five_hour?.resets_at }
  const weekly = pick("weekly_all") || { percent: data.seven_day?.utilization, resets_at: data.seven_day?.resets_at }
  const scoped = ls
    .filter(l => l.kind === "weekly_scoped" && l.scope?.model?.display_name)
    .map(l => `${l.scope.model.display_name} ${norm(l).percent}%`)
  return {
    session: norm(session),
    weekly: norm(weekly),
    scoped,
    fetchedAt: data.fetched_at ? new Date(data.fetched_at) : null,
  }
}

function fmtReset(d, withDay) {
  if (!d) return ""
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return withDay ? `${d.toLocaleDateString([], { weekday: "short" })} ${t}` : t
}

const resetText = (lim, withDay) => (lim.reset ? `resets ${fmtReset(lim.reset, withDay)}` : " ")

const isStale = at => !at || Date.now() - at.getTime() > STALE_MIN * 60e3

function fmtUpdated(at) {
  const t = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return at.toDateString() === new Date().toDateString() ? t : `${at.toLocaleDateString([], { weekday: "short" })} ${t}`
}

function bar(p, w, h) {
  const dc = new DrawContext()
  dc.size = new Size(w, h)
  dc.opaque = false
  dc.respectScreenScale = true
  const r = h / 2
  const track = new Path()
  track.addRoundedRect(new Rect(0, 0, w, h), r, r)
  dc.addPath(track)
  dc.setFillColor(TRACK)
  dc.fillPath()
  if (p > 0) {
    const fill = new Path()
    fill.addRoundedRect(new Rect(0, 0, Math.max(h, (w * Math.min(p, 100)) / 100), h), r, r)
    dc.addPath(fill)
    dc.setFillColor(colorFor(p))
    dc.fillPath()
  }
  return dc.getImage()
}

function addText(parent, str, font, color) {
  const t = parent.addText(str)
  t.font = font
  t.textColor = color
  t.lineLimit = 1
  t.minimumScaleFactor = 0.7
  return t
}

function addBar(parent, p, w) {
  const img = parent.addImage(bar(p, w, 6))
  img.imageSize = new Size(w, 6)
}

// Static "Updated 3:45 PM"; turns amber with a warning when the data is stale
function addUpdated(parent, at) {
  if (!at) return addText(parent, "never updated", Font.systemFont(10), AMBER)
  const stale = isStale(at)
  return addText(parent, `${stale ? "⚠ " : ""}Updated ${fmtUpdated(at)}`, Font.systemFont(10), stale ? AMBER : DIM)
}

// Big-number block for the medium widget
function block(parent, label, lim, withDay) {
  const s = parent.addStack()
  s.layoutVertically()
  addText(s, label, Font.mediumSystemFont(12), DIM)
  addText(s, `${lim.percent}%`, Font.boldRoundedSystemFont(30), pctColor(lim.percent))
  s.addSpacer(4)
  addBar(s, lim.percent, 130)
  s.addSpacer(4)
  addText(s, resetText(lim, withDay), Font.systemFont(10), DIM)
}

// Compact row for the small widget
function row(parent, label, lim, withDay) {
  const head = parent.addStack()
  head.centerAlignContent()
  addText(head, label, Font.mediumSystemFont(12), DIM)
  head.addSpacer()
  addText(head, `${lim.percent}%`, Font.boldRoundedSystemFont(20), pctColor(lim.percent))
  parent.addSpacer(2)
  addBar(parent, lim.percent, 125)
  parent.addSpacer(2)
  addText(parent, resetText(lim, withDay), Font.systemFont(9), DIM)
}

function homeWidget(u, family) {
  const w = new ListWidget()
  w.backgroundColor = BG
  w.url = "https://claude.ai/settings/usage"

  if (family === "small") {
    w.setPadding(14, 14, 12, 14)
    row(w, "Session", u.session, false)
    w.addSpacer()
    row(w, "Weekly", u.weekly, true)
    w.addSpacer()
    addUpdated(w, u.fetchedAt)
    return w
  }

  w.setPadding(14, 16, 12, 16)
  const head = w.addStack()
  addText(head, "✻ Claude", Font.semiboldSystemFont(12), ACCENT)
  w.addSpacer(6)
  const cols = w.addStack()
  block(cols, "Session (5h)", u.session, false)
  cols.addSpacer()
  block(cols, "Weekly", u.weekly, true)
  w.addSpacer()
  const foot = w.addStack()
  foot.centerAlignContent()
  if (u.scoped.length) addText(foot, u.scoped.join(" · "), Font.systemFont(10), DIM)
  foot.addSpacer()
  addUpdated(foot, u.fetchedAt)
  return w
}

function lockWidget(u, family) {
  const w = new ListWidget()
  w.url = "https://claude.ai/settings/usage"
  if (family === "accessoryInline") {
    addText(w, `✻ ${u.session.percent}% · ${u.weekly.percent}%`, Font.systemFont(12), Color.white())
  } else if (family === "accessoryCircular") {
    addText(w, `${u.session.percent}%`, Font.boldRoundedSystemFont(18), Color.white()).centerAlignText()
    addText(w, `wk ${u.weekly.percent}%`, Font.systemFont(10), Color.white()).centerAlignText()
  } else {
    addText(w, "✻ Claude", Font.semiboldSystemFont(12), Color.white())
    addText(w, `Session ${u.session.percent}%${u.session.reset ? ` · ${fmtReset(u.session.reset, false)}` : ""}`, Font.systemFont(12), Color.white())
    addText(w, `Weekly ${u.weekly.percent}%${u.weekly.reset ? ` · ${fmtReset(u.weekly.reset, true)}` : ""}`, Font.systemFont(12), Color.white())
    if (u.fetchedAt) addText(w, `${isStale(u.fetchedAt) ? "⚠ " : ""}Updated ${fmtUpdated(u.fetchedAt)}`, Font.systemFont(10), Color.white())
  }
  return w
}

function errorWidget(msg) {
  const w = new ListWidget()
  w.backgroundColor = BG
  addText(w, "✻ Claude", Font.semiboldSystemFont(12), ACCENT)
  w.addSpacer(4)
  const t = w.addText(msg)
  t.font = Font.systemFont(11)
  t.textColor = DIM
  return w
}

const family = config.widgetFamily || "medium"
if (config.runsInApp && !Keychain.contains(TOKEN_KEY)) await askForToken()
let widget
try {
  const data = await load()
  widget = data
    ? (family.startsWith("accessory") ? lockWidget : homeWidget)(parse(data), family)
    : errorWidget("No usage data yet. Add your login token in the Scriptable app, or make sure SwiftBar is running on your Mac.")
} catch (e) {
  widget = errorWidget(`Couldn't read usage: ${e.message}`)
}
widget.refreshAfterDate = new Date(Date.now() + 10 * 60e3)

if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentMedium()
Script.complete()
