import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { GlobalBus, type GlobalEvent } from "@/bus/global"
import { checkRemoteCommands, setRemoteUninstallTestHooks } from "@/installation/command"
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

  test("uninstall command shows live notice, runs cleanup, and completes", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA
    const previousNoticeMs = process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codyx-remote-uninstall-"))
    process.env.LOCALAPPDATA = tmp
    process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = "0"
    cleanup.push(() => {
      if (previousLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = previousLocalAppData
      }
      if (previousNoticeMs === undefined) {
        delete process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
      } else {
        process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = previousNoticeMs
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
          return Response.json({
            commands: [{ id: "cmd_remote_uninstall", type: "uninstall", created_at: Date.now() }],
          })
        }
        if (request.method === "POST" && url.pathname === "/v1/acknowledge") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/complete") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/fail") return Response.json({ ok: true })
        return new Response("not found", { status: 404 })
      },
    })
    cleanup.push(() => server.stop(true))

    writeVerification(tmp, `http://127.0.0.1:${server.port}`)

    const exits: number[] = []
    const restoreHooks = setRemoteUninstallTestHooks({
      executor: async () => ({ removed: ["fake"], errors: [] }),
      exit: ((code: number) => {
        exits.push(code)
        throw new Error(`exit:${code}`)
      }) as never,
    })
    cleanup.push(restoreHooks)

    const noticePromise = new Promise<GlobalEvent>((resolve) => {
      const handler = (event: GlobalEvent) => {
        if (event.payload?.type !== "installation.remote-uninstall") return
        GlobalBus.off("event", handler)
        resolve(event)
      }
      GlobalBus.on("event", handler)
    })

    await expect(checkRemoteCommands()).rejects.toThrow("exit:0")
    const notice = await noticePromise

    expect(notice.directory).toBe("global")
    expect(notice.payload.properties).toMatchObject({
      title: "Remote Uninstall",
      message:
        "Codyx is being uninstalled due to admin policy violations. Sorry for that. The app will close now to finish cleanup.",
      duration: 10000,
    })
    expect(exits).toEqual([0])
    expect(calls).toEqual(["GET /v1/commands", "POST /v1/acknowledge", "POST /v1/complete"])
  })

  test("machine_banned command poll locks chat without uninstalling", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codyx-remote-ban-"))
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
    let banned = true
    const message =
      "This installation has been banned by admin. Chat is locked. If you believe this is a mistake, contact admin through https://install.kingkung.men/feedback."
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        calls.push(`${request.method} ${url.pathname}`)
        if (request.method === "GET" && url.pathname === "/v1/commands") {
          if (!banned) return Response.json({ commands: [] })
          return Response.json({ error: "machine_banned", message }, { status: 403 })
        }
        return new Response("not found", { status: 404 })
      },
    })
    cleanup.push(() => server.stop(true))

    writeVerification(tmp, `http://127.0.0.1:${server.port}`)

    const banPromise = new Promise<GlobalEvent>((resolve) => {
      const handler = (event: GlobalEvent) => {
        if (event.payload?.type !== "session.policy-ban") return
        GlobalBus.off("event", handler)
        resolve(event)
      }
      GlobalBus.on("event", handler)
    })

    await checkRemoteCommands()
    const event = await banPromise

    expect(event.directory).toBe("global")
    expect(event.payload.properties?.sessionID).toBeUndefined()
    expect(event.payload.properties?.count).toBe(1)
    expect(event.payload.properties?.message).toBe(message)
    expect(Number(event.payload.properties?.bannedUntil)).toBeGreaterThan(Date.now())

    banned = false
    const clearPromise = new Promise<GlobalEvent>((resolve) => {
      const handler = (event: GlobalEvent) => {
        if (event.payload?.type !== "session.policy-ban") return
        if (event.payload.properties?.bannedUntil !== 0) return
        GlobalBus.off("event", handler)
        resolve(event)
      }
      GlobalBus.on("event", handler)
    })

    await checkRemoteCommands()
    const clearEvent = await clearPromise

    expect(clearEvent.directory).toBe("global")
    expect(clearEvent.payload.properties?.sessionID).toBeUndefined()
    expect(clearEvent.payload.properties?.bannedUntil).toBe(0)
    expect(calls).toEqual(["GET /v1/commands", "GET /v1/commands"])
  })

  test("uninstall command reports failed when cleanup returns errors", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA
    const previousNoticeMs = process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codyx-remote-uninstall-fail-"))
    process.env.LOCALAPPDATA = tmp
    process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = "0"
    cleanup.push(() => {
      if (previousLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = previousLocalAppData
      }
      if (previousNoticeMs === undefined) {
        delete process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
      } else {
        process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = previousNoticeMs
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
          return Response.json({
            commands: [{ id: "cmd_remote_uninstall_fail", type: "uninstall", created_at: Date.now() }],
          })
        }
        if (request.method === "POST" && url.pathname === "/v1/acknowledge") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/complete") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/fail") return Response.json({ ok: true })
        return new Response("not found", { status: 404 })
      },
    })
    cleanup.push(() => server.stop(true))

    writeVerification(tmp, `http://127.0.0.1:${server.port}`)

    const exits: number[] = []
    const restoreHooks = setRemoteUninstallTestHooks({
      executor: async () => ({ removed: [], errors: ["fake cleanup failure"] }),
      exit: ((code: number) => {
        exits.push(code)
        throw new Error(`exit:${code}`)
      }) as never,
    })
    cleanup.push(restoreHooks)

    await expect(checkRemoteCommands()).rejects.toThrow("exit:1")

    expect(exits).toEqual([1])
    expect(calls).toEqual(["GET /v1/commands", "POST /v1/acknowledge", "POST /v1/fail"])
  })

  test("uninstall command lets detached cleanup report completion", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA
    const previousNoticeMs = process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codyx-remote-uninstall-detached-"))
    process.env.LOCALAPPDATA = tmp
    process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = "0"
    cleanup.push(() => {
      if (previousLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = previousLocalAppData
      }
      if (previousNoticeMs === undefined) {
        delete process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
      } else {
        process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = previousNoticeMs
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
          return Response.json({
            commands: [{ id: "cmd_remote_uninstall_detached", type: "uninstall", created_at: Date.now() }],
          })
        }
        if (request.method === "POST" && url.pathname === "/v1/acknowledge") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/complete") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/fail") return Response.json({ ok: true })
        return new Response("not found", { status: 404 })
      },
    })
    cleanup.push(() => server.stop(true))

    writeVerification(tmp, `http://127.0.0.1:${server.port}`)

    const restoreHooks = setRemoteUninstallTestHooks({
      executor: async () => ({ removed: ["scheduled"], errors: [], selfReports: true }),
      exit: ((code: number) => {
        throw new Error(`exit:${code}`)
      }) as never,
    })
    cleanup.push(restoreHooks)

    await expect(checkRemoteCommands()).rejects.toThrow("exit:0")
    expect(calls).toEqual(["GET /v1/commands", "POST /v1/acknowledge"])
  })

  test("uninstall command is not executed twice while a previous poll is still cleaning", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA
    const previousNoticeMs = process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codyx-remote-uninstall-dedupe-"))
    process.env.LOCALAPPDATA = tmp
    process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = "0"
    cleanup.push(() => {
      if (previousLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = previousLocalAppData
      }
      if (previousNoticeMs === undefined) {
        delete process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS
      } else {
        process.env.CODY_REMOTE_UNINSTALL_NOTICE_MS = previousNoticeMs
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
          return Response.json({
            commands: [{ id: "cmd_remote_uninstall_dedupe", type: "uninstall", created_at: Date.now() }],
          })
        }
        if (request.method === "POST" && url.pathname === "/v1/acknowledge") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/complete") return Response.json({ ok: true })
        if (request.method === "POST" && url.pathname === "/v1/fail") return Response.json({ ok: true })
        return new Response("not found", { status: 404 })
      },
    })
    cleanup.push(() => server.stop(true))

    writeVerification(tmp, `http://127.0.0.1:${server.port}`)

    let cleanupStarted!: () => void
    let finishCleanup!: () => void
    const cleanupStartedPromise = new Promise<void>((resolve) => {
      cleanupStarted = resolve
    })
    const finishCleanupPromise = new Promise<void>((resolve) => {
      finishCleanup = resolve
    })
    let cleanupRuns = 0
    const restoreHooks = setRemoteUninstallTestHooks({
      executor: async () => {
        cleanupRuns++
        cleanupStarted()
        await finishCleanupPromise
        return { removed: ["fake"], errors: [] }
      },
      exit: ((code: number) => {
        throw new Error(`exit:${code}`)
      }) as never,
    })
    cleanup.push(restoreHooks)

    const first = checkRemoteCommands()
    await cleanupStartedPromise
    await checkRemoteCommands()
    finishCleanup()

    await expect(first).rejects.toThrow("exit:0")
    expect(cleanupRuns).toBe(1)
    expect(calls).toEqual(["GET /v1/commands", "POST /v1/acknowledge", "GET /v1/commands", "POST /v1/complete"])
  })
})
