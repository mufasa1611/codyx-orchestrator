import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { GlobalBus, type GlobalEvent } from "@/bus/global"
import { checkRemoteCommands } from "@/installation/command"
import { registerLivePolicyResetListener } from "@/session/policy-reset"

let cleanup: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (cleanup.length > 0) {
    await cleanup.pop()?.()
  }
})

function writeVerification(root: string, serverUrl: string) {
  const dir = path.join(root, "codyx-installer")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, "verification.json"),
    JSON.stringify({
      version: 1,
      install_id: "install_remote_reset",
      receipt: "receipt_remote_reset",
      expires_at: Date.now() + 60_000,
      server_url: serverUrl,
    }),
    "utf8",
  )
}

describe("remote commands", () => {
  test("policy_reset command resets live policy state and completes the command", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codyx-remote-command-"))
    process.env.LOCALAPPDATA = tmp
    cleanup.push(() => {
      if (previousLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = previousLocalAppData
      }
      fs.rmSync(tmp, { recursive: true, force: true })
    })

    const calls: string[] = []
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        calls.push(`${request.method} ${url.pathname}`)
        if (request.method === "GET" && url.pathname === "/v1/commands") {
          expect(url.searchParams.get("install_id")).toBe("install_remote_reset")
          expect(url.searchParams.get("receipt")).toBe("receipt_remote_reset")
          return Response.json({
            commands: [{ id: "cmd_policy_reset", type: "policy_reset", created_at: Date.now() }],
          })
        }
        if (request.method === "POST" && url.pathname === "/v1/acknowledge") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/complete") return Response.json({ ok: true })
        return new Response("not found", { status: 404 })
      },
    })
    cleanup.push(() => server.stop(true))

    writeVerification(tmp, `http://127.0.0.1:${server.port}`)

    const unregister = registerLivePolicyResetListener(() => ["ses_remote_reset"])
    cleanup.push(unregister)

    const eventPromise = new Promise<GlobalEvent>((resolve) => {
      const handler = (event: GlobalEvent) => {
        if (event.payload?.type !== "session.policy-ban") return
        if (event.payload.properties?.sessionID !== "ses_remote_reset") return
        GlobalBus.off("event", handler)
        resolve(event)
      }
      GlobalBus.on("event", handler)
    })

    await checkRemoteCommands()
    const event = await eventPromise

    expect(event.directory).toBe("global")
    expect(event.payload.properties).toEqual({ sessionID: "ses_remote_reset", bannedUntil: 0, count: 0 })
    expect(calls).toEqual(["GET /v1/commands", "POST /v1/acknowledge", "POST /v1/complete"])
  })
})
