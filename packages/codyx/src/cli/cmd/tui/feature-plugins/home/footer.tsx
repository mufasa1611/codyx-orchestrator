import type { TuiPlugin, TuiPluginApi } from "@cody/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, createSignal, onCleanup, Match, Show, Switch } from "solid-js"
import { Global } from "@cody/core/global"
import { RGBA } from "@opentui/core"
import { Link } from "@tui/ui/link"
import path from "path"
import os from "os"
import fs from "fs"

const id = "internal:home-footer"

function Directory(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const dir = createMemo(() => {
    const dir = props.api.state.path.directory || process.cwd()
    const out = dir.replace(Global.Path.home, "~")
    const branch = props.api.state.vcs?.branch
    if (branch) return out + ":" + branch
    return out
  })

  return <text fg={theme().textMuted}>{dir()}</text>
}

function Mcp(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.mcp())
  const has = createMemo(() => list().length > 0)
  const err = createMemo(() => list().some((item) => item.status === "failed"))
  const count = createMemo(() => list().filter((item) => item.status === "connected").length)

  return (
    <Show when={has()}>
      <box gap={1} flexDirection="row" flexShrink={0}>
        <text fg={theme().text}>
          <Switch>
            <Match when={err()}>
              <span style={{ fg: theme().error }}>⊙ </span>
            </Match>
            <Match when={true}>
              <span style={{ fg: count() > 0 ? theme().success : theme().textMuted }}>⊙ </span>
            </Match>
          </Switch>
          {count()} MCP
        </text>
        <text fg={theme().textMuted}>/status</text>
      </box>
    </Show>
  )
}

function Version(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current

  return (
    <box flexShrink={0}>
      <text fg={theme().textMuted}>{props.api.app.version}</text>
    </box>
  )
}

function Feedback(props: { api: TuiPluginApi }) {
  const feedbackUrl = createMemo(() => {
    const candidates = [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "codyx-installer", "verification.json") : "",
      path.join(os.homedir(), "Library", "Application Support", "codyx-installer", "verification.json"),
      path.join(
        process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
        "codyx-installer",
        "verification.json",
      ),
    ]
    for (const filePath of candidates) {
      if (!filePath) continue
      try {
        const raw = fs
          .readFileSync(filePath, "utf8")
          .replace(/^\uFEFF/, "")
          .trim()
        if (!raw) continue
        const data = JSON.parse(raw) as { install_id?: string }
        if (data.install_id)
          return `https://install.kingkung.men/feedback?install_id=${encodeURIComponent(data.install_id)}`
      } catch {
        continue
      }
    }
    return "https://install.kingkung.men/feedback"
  })

  const feedbackText = "Send your feedback - "
  const feedbackChars = [...feedbackText]
  const shineWidth = 4
  const maxOffset = feedbackChars.length - shineWidth
  const [shine, setShine] = createSignal({ offset: maxOffset, dir: -1 })
  const shineTimer = setInterval(() => {
    setShine((prev) => {
      const next = prev.offset + prev.dir
      if (next <= 0) return { offset: 0, dir: 1 }
      if (next >= maxOffset) return { offset: maxOffset, dir: -1 }
      return { offset: next, dir: prev.dir }
    })
  }, 100)
  onCleanup(() => clearInterval(shineTimer))

  const textParts = createMemo(() => {
    const offset = shine().offset
    return {
      left: feedbackChars.slice(0, offset).join(""),
      middle: feedbackChars.slice(offset, offset + shineWidth).join(""),
      right: feedbackChars.slice(offset + shineWidth).join(""),
    }
  })

  return (
    <Link href={feedbackUrl()}>
      <span style={{ fg: RGBA.fromHex("#ffffff") }}>{textParts().left}</span>
      <span style={{ fg: RGBA.fromHex("#ff4444") }}>{textParts().middle}</span>
      <span style={{ fg: RGBA.fromHex("#ffffff") }}>{textParts().right}</span>
      <span style={{ fg: RGBA.fromHex("#58a6ff") }}>click here</span>
    </Link>
  )
}

function View(props: { api: TuiPluginApi }) {
  return (
    <box
      width="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="row"
      flexShrink={0}
      gap={2}
    >
      <Directory api={props.api} />
      <Mcp api={props.api} />
      <box flexGrow={1} />
      <Feedback api={props.api} />
      <box flexGrow={1} />
      <Version api={props.api} />
    </box>
  )
}

function SessionFooterView(props: { api: TuiPluginApi }) {
  return (
    <box width="100%" alignItems="center" flexShrink={0}>
      <box maxWidth={75} alignItems="center">
        <Feedback api={props.api} />
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      home_footer() {
        return <View api={api} />
      },
      session_footer() {
        return <SessionFooterView api={api} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
