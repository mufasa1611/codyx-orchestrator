import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Miniflare } from "miniflare"

const code = "246810"
const adminSecret = "admin-test-secret"
const receiptSecret = "receipt-test-secret"
const otpSecret = "otp-test-secret"
let worker: Miniflare

type DispatchRequestInit = NonNullable<Parameters<Miniflare["dispatchFetch"]>[1]>
type TestRequestInit = Omit<DispatchRequestInit, "headers"> & {
  headers?: Record<string, string>
}

function request(path: string, init?: TestRequestInit) {
  return worker.dispatchFetch(`https://install.test${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": crypto.randomUUID(),
      ...init?.headers,
    },
  })
}

function admin(path: string, init?: TestRequestInit) {
  return request(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminSecret}`,
      ...init?.headers,
    },
  })
}

function challengeBody(installId = crypto.randomUUID(), email = `${crypto.randomUUID()}@example.com`) {
  return {
    install_id: installId,
    display_name: "Installer User",
    email,
    installer_version: "1.14.41",
    platform: "windows",
  }
}

async function createChallenge(body = challengeBody()) {
  const response = await request("/v1/challenges", {
    method: "POST",
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(201)
  return {
    body,
    response: (await response.json()) as { challenge_id: string },
  }
}

async function verifyChallenge(challengeId: string, value = code) {
  return request(`/v1/challenges/${challengeId}/verify`, {
    method: "POST",
    body: JSON.stringify({ code: value }),
  })
}

beforeAll(async () => {
  worker = new Miniflare({
    modules: true,
    scriptPath: ".test-dist/index.js",
    compatibilityDate: "2026-06-13",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: {
      InstallerVerificationDatabase: "installer-verification-test",
    },
    bindings: {
      INSTALLER_ENVIRONMENT: "test",
      INSTALLER_SENDER: "Codyx Installer <installer@verification.kingkung.men>",
      INSTALLER_PRIVACY_EMAIL: "privacy@kingkung.men",
      INSTALLER_MAILGUN_API_BASE: "https://api.eu.mailgun.net",
      INSTALLER_MAILGUN_DOMAIN: "verification.kingkung.men",
      INSTALLER_TEST_CODE: code,
      INSTALLER_RECEIPT_SECRET: receiptSecret,
      INSTALLER_OTP_PEPPER: otpSecret,
      INSTALLER_ADMIN_SECRET: adminSecret,
      INSTALLER_MAILGUN_SENDING_KEY: "test-sending-key",
    },
  })
})

afterAll(async () => {
  await worker.dispose()
})

describe("installer verification service", () => {
  test("publishes its health and privacy disclosures", async () => {
    const health = await request("/health")
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ healthy: true, environment: "test" })

    const privacy = await request("/privacy")
    expect(privacy.status).toBe(200)
    const notice = await privacy.text()
    expect(notice).toContain("not independently verified")
    expect(notice).toContain("privacy@kingkung.men")
    expect(notice).toContain("never</strong> used for marketing")
    expect(notice).toContain("operational registration notice")
    expect(notice).toContain("Verification codes are <strong>never</strong> included")

    const license = await request("/license")
    expect(license.status).toBe(200)
    const terms = await license.text()
    expect(terms).toContain("Moderation, role protection")
    expect(terms).toContain("abusive/prohibited profanity")
    expect(terms).toContain("machine ban")

    const admin = await request("/admin")
    expect(admin.status).toBe(200)
    const adminHtml = await admin.text()
    expect(adminHtml).toContain("Remove User Record")
    expect(adminHtml).toContain("confirmRemove")
    expect(adminHtml).toContain('method: "DELETE"')
  })

  test("serves and stores feedback", async () => {
    const page = await request("/feedback?name=Test%20User&email=test%40example.com")
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain("Send Feedback")
    expect(html).toContain("Test User")
    expect(html).toContain("test@example.com")
    expect(html).toContain('name="name" maxlength="100" placeholder="Your name" required')
    expect(html).toContain('name="email" maxlength="254" placeholder="you@example.com" required')

    const response = await request("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        message: "The TUI feedback link works.",
      }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ status: "ok" })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const feedback = await db
      .prepare("SELECT display_name, email, message FROM feedback WHERE email = ?")
      .bind("test@example.com")
      .first<{ display_name: string; email: string; message: string }>()
    expect(feedback).toMatchObject({
      display_name: "Test User",
      email: "test@example.com",
      message: "The TUI feedback link works.",
    })
  })

  test("requires feedback name and email", async () => {
    const missingName = await request("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({
        name: "",
        email: "test@example.com",
        message: "This should not submit.",
      }),
    })
    expect(missingName.status).toBe(400)
    expect((await missingName.json()) as { error: string }).toMatchObject({ error: "invalid_request" })

    const missingEmail = await request("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({
        name: "Test User",
        email: "",
        message: "This should not submit.",
      }),
    })
    expect(missingEmail.status).toBe(400)
    expect((await missingEmail.json()) as { error: string }).toMatchObject({ error: "invalid_request" })
  })

  test("issues a receipt, validates it, and prevents challenge replay", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    expect(verified.status).toBe(200)
    const result = (await verified.json()) as { receipt: string }

    const valid = await request("/v1/receipts/validate", {
      method: "POST",
      body: JSON.stringify({
        install_id: created.body.install_id,
        receipt: result.receipt,
        installer_version: "1.14.42",
        platform: "windows",
        machine_id: "machine-after-install",
      }),
    })
    expect(valid.status).toBe(200)
    expect((await valid.json()) as { valid: boolean }).toMatchObject({ valid: true })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const registration = await db
      .prepare("SELECT machine_id FROM registration WHERE install_id = ?")
      .bind(created.body.install_id)
      .first<{ machine_id: string }>()
    expect(registration?.machine_id).toBe("machine-after-install")

    const replay = await verifyChallenge(created.response.challenge_id)
    expect(replay.status).toBe(409)
    expect((await replay.json()) as { error: string }).toMatchObject({
      error: "challenge_already_verified",
    })
  })

  test("expires codes and enforces five attempts", async () => {
    const expired = await createChallenge()
    const db = await worker.getD1Database("InstallerVerificationDatabase")
    await db
      .prepare("UPDATE challenge SET expires_at = ? WHERE id = ?")
      .bind(Date.now() - 1, expired.response.challenge_id)
      .run()
    const expiredResponse = await verifyChallenge(expired.response.challenge_id)
    expect(expiredResponse.status).toBe(409)
    expect((await expiredResponse.json()) as { error: string }).toMatchObject({ error: "code_expired" })

    const attempted = await createChallenge()
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await verifyChallenge(attempted.response.challenge_id, "000000")
      expect(response.status).toBe(409)
      expect((await response.json()) as { error: string }).toMatchObject({ error: "incorrect_code" })
    }
    const fifth = await verifyChallenge(attempted.response.challenge_id, "000000")
    expect(fifth.status).toBe(429)
    expect((await fifth.json()) as { error: string }).toMatchObject({ error: "attempts_exhausted" })
    expect((await verifyChallenge(attempted.response.challenge_id)).status).toBe(429)
  })

  test("enforces resend cooldown and per-email send limits", async () => {
    const email = `${crypto.randomUUID()}@example.com`
    const created = await createChallenge(challengeBody(crypto.randomUUID(), email))
    const tooSoon = await request(`/v1/challenges/${created.response.challenge_id}/resend`, {
      method: "POST",
    })
    expect(tooSoon.status).toBe(429)
    expect((await tooSoon.json()) as { error: string }).toMatchObject({ error: "resend_too_soon" })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    for (let send = 1; send < 5; send++) {
      await db
        .prepare("UPDATE challenge SET last_sent_at = ? WHERE id = ?")
        .bind(Date.now() - 61_000, created.response.challenge_id)
        .run()
      const resent = await request(`/v1/challenges/${created.response.challenge_id}/resend`, {
        method: "POST",
      })
      expect(resent.status).toBe(200)
    }
    await db
      .prepare("UPDATE challenge SET last_sent_at = ? WHERE id = ?")
      .bind(Date.now() - 61_000, created.response.challenge_id)
      .run()
    const limited = await request(`/v1/challenges/${created.response.challenge_id}/resend`, {
      method: "POST",
    })
    expect(limited.status).toBe(429)
    expect((await limited.json()) as { error: string }).toMatchObject({ error: "email_rate_limited" })
  })

  test("enforces the email send limit under concurrent requests", async () => {
    const email = `${crypto.randomUUID()}@example.com`
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        request("/v1/challenges", {
          method: "POST",
          body: JSON.stringify(challengeBody(crypto.randomUUID(), email)),
        }),
      ),
    )
    expect(responses.filter((response) => response.status === 201)).toHaveLength(5)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1)
  })

  test("exports registrations and removal deletes installer database records", async () => {
    const machineId = `machine-${crypto.randomUUID()}`
    const created = await createChallenge(Object.assign(challengeBody(), { machine_id: machineId }))
    const verified = await verifyChallenge(created.response.challenge_id)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    expect((await request("/v1/admin/installations?format=json")).status).toBe(401)
    const exported = await admin("/v1/admin/installations?format=csv")
    expect(exported.status).toBe(200)
    expect(await exported.text()).toContain(created.body.email)

    const uninstall = await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, { method: "POST" })
    expect(uninstall.status).toBe(201)
    const ban = await admin(`/v1/admin/installations/${created.body.install_id}/ban`, { method: "POST" })
    expect(ban.status).toBe(200)

    const deleted = await admin(`/v1/admin/installations/${created.body.install_id}`, {
      method: "DELETE",
    })
    expect(deleted.status).toBe(204)
    const validation = await request("/v1/receipts/validate", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt }),
    })
    expect(await validation.json()).toEqual({ valid: false })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const counts = await db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM registration WHERE install_id = ?) AS registrations,
          (SELECT COUNT(*) FROM challenge WHERE install_id = ?) AS challenges,
          (SELECT COUNT(*) FROM receipt WHERE install_id = ?) AS receipts,
          (SELECT COUNT(*) FROM revocation WHERE install_id = ?) AS revocations,
          (SELECT COUNT(*) FROM remote_command WHERE install_id = ?) AS commands,
          (SELECT COUNT(*) FROM banned_machine WHERE machine_id = ?) AS machine_bans`,
      )
      .bind(
        created.body.install_id,
        created.body.install_id,
        created.body.install_id,
        created.body.install_id,
        created.body.install_id,
        machineId,
      )
      .first<Record<string, number>>()
    expect(counts).toMatchObject({
      registrations: 0,
      challenges: 0,
      receipts: 0,
      revocations: 0,
      commands: 0,
      machine_bans: 0,
    })
  })

  test("rejects expired receipts and cleanup removes retained data", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    const receipt = ((await verified.json()) as { receipt: string }).receipt
    const db = await worker.getD1Database("InstallerVerificationDatabase")
    await db
      .prepare("UPDATE receipt SET expires_at = ? WHERE install_id = ?")
      .bind(Date.now() - 1, created.body.install_id)
      .run()
    const expired = await request("/v1/receipts/validate", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt }),
    })
    expect(await expired.json()).toEqual({ valid: false })

    await db
      .prepare("UPDATE registration SET retain_until = ? WHERE install_id = ?")
      .bind(Date.now() - 1, created.body.install_id)
      .run()
    const cleaned = await admin("/internal/cleanup", { method: "POST" })
    expect(cleaned.status).toBe(200)
    const registration = await db
      .prepare("SELECT install_id FROM registration WHERE install_id = ?")
      .bind(created.body.install_id)
      .first()
    expect(registration).toBeNull()
  })

  test("applies the per-IP service rate limit", async () => {
    const ip = "203.0.113.10"
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        request("/v1/receipts/validate", {
          method: "POST",
          headers: { "CF-Connecting-IP": ip },
          body: JSON.stringify({
            install_id: crypto.randomUUID(),
            receipt: "invalid.receipt",
          }),
        }),
      ),
    )
    expect(responses.filter((response) => response.status === 200)).toHaveLength(10)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1)
  })

  test("admin creates remote uninstall command for a verified installation", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    expect(verified.status).toBe(200)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    const uninstall = await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, {
      method: "POST",
    })
    expect(uninstall.status).toBe(201)
    const body = (await uninstall.json()) as { command_id: string }
    expect(body.command_id).toBeDefined()
    expect(typeof body.command_id).toBe("string")

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const command = await db
      .prepare("SELECT id, type, status FROM remote_command WHERE id = ?")
      .bind(body.command_id)
      .first()
    expect(command).not.toBeNull()
    expect((command as any).type).toBe("uninstall")
    expect((command as any).status).toBe("pending")
  })

  test("admin resets policy counters and creates a policy reset command", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    expect(verified.status).toBe(200)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    await db
      .prepare("UPDATE registration SET policy_violations_count = 2, policy_banned_until = ? WHERE install_id = ?")
      .bind(Date.now() + 60_000, created.body.install_id)
      .run()

    const reset = await admin(`/v1/admin/installations/${created.body.install_id}/policy-reset`, { method: "POST" })
    expect(reset.status).toBe(200)
    const resetBody = (await reset.json()) as { success: boolean; command_id: string }
    expect(resetBody.success).toBe(true)
    expect(resetBody.command_id).toBeDefined()

    const registration = await db
      .prepare("SELECT policy_violations_count, policy_banned_until FROM registration WHERE install_id = ?")
      .bind(created.body.install_id)
      .first()
    expect((registration as any).policy_violations_count).toBe(0)
    expect((registration as any).policy_banned_until).toBe(0)

    const command = await db
      .prepare("SELECT id, type, status FROM remote_command WHERE id = ?")
      .bind(resetBody.command_id)
      .first()
    expect((command as any).type).toBe("policy_reset")
    expect((command as any).status).toBe("pending")

    const poll = await request(
      `/v1/commands?install_id=${created.body.install_id}&receipt=${encodeURIComponent(receipt)}`,
    )
    expect(poll.status).toBe(200)
    const pollBody = (await poll.json()) as { commands: Array<{ id: string; type: string; created_at: number }> }
    expect(pollBody.commands).toHaveLength(1)
    expect(pollBody.commands[0]).toMatchObject({ id: resetBody.command_id, type: "policy_reset" })
    expect(typeof pollBody.commands[0].created_at).toBe("number")

    const dashboard = await admin("/v1/admin/installations?format=json")
    const dashboardBody = (await dashboard.json()) as {
      installations: Array<{
        install_id: string
        command_status: string | null
        policy_violations_count: number
        policy_banned_until: number
      }>
    }
    const row = dashboardBody.installations.find((item) => item.install_id === created.body.install_id)
    expect(row).toMatchObject({
      command_status: null,
      policy_violations_count: 0,
      policy_banned_until: 0,
    })
  })

  test("admin dashboard clears expired policy bans", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    expect(verified.status).toBe(200)

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    await db
      .prepare("UPDATE registration SET policy_violations_count = 2, policy_banned_until = ? WHERE install_id = ?")
      .bind(Date.now() - 1_000, created.body.install_id)
      .run()

    const dashboard = await admin("/v1/admin/installations?format=json")
    expect(dashboard.status).toBe(200)
    const body = (await dashboard.json()) as {
      installations: Array<{ install_id: string; policy_violations_count: number; policy_banned_until: number }>
    }
    const row = body.installations.find((item) => item.install_id === created.body.install_id)
    expect(row).toMatchObject({
      policy_violations_count: 0,
      policy_banned_until: 0,
    })
  })

  test("policy reset commands do not block later uninstall commands", async () => {
    const machineId = `machine-${crypto.randomUUID()}`
    const created = await createChallenge(Object.assign(challengeBody(), { machine_id: machineId }))
    const verified = await verifyChallenge(created.response.challenge_id)
    expect(verified.status).toBe(200)

    const reset = await admin(`/v1/admin/installations/${created.body.install_id}/policy-reset`, { method: "POST" })
    expect(reset.status).toBe(200)

    const ban = await admin(`/v1/admin/installations/${created.body.install_id}/ban`, { method: "POST" })
    expect(ban.status).toBe(200)
    expect((await ban.json()) as { banned: boolean }).toMatchObject({ banned: true })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const commands = await db
      .prepare("SELECT type FROM remote_command WHERE install_id = ? ORDER BY created_at ASC")
      .bind(created.body.install_id)
      .all<{ type: string }>()
    expect(commands.results.map((command) => command.type)).toEqual(["policy_reset"])

    const uninstall = await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, { method: "POST" })
    expect(uninstall.status).toBe(201)

    const commandsAfterUninstall = await db
      .prepare("SELECT type FROM remote_command WHERE install_id = ? ORDER BY created_at ASC")
      .bind(created.body.install_id)
      .all<{ type: string }>()
    expect(commandsAfterUninstall.results.map((command) => command.type)).toEqual(["policy_reset", "uninstall"])
  })

  test("admin bans and unbans a verified machine", async () => {
    const machineId = `machine-${crypto.randomUUID()}`
    const created = await createChallenge(Object.assign(challengeBody(), { machine_id: machineId }))
    const verified = await verifyChallenge(created.response.challenge_id)
    expect(verified.status).toBe(200)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    const ban = await admin(`/v1/admin/installations/${created.body.install_id}/ban`, { method: "POST" })
    expect(ban.status).toBe(200)
    expect((await ban.json()) as { banned: boolean; uninstall_triggered?: boolean }).toMatchObject({
      banned: true,
    })

    const exported = await admin("/v1/admin/installations?format=json")
    const body = (await exported.json()) as { installations: Array<{ install_id: string; is_banned: boolean }> }
    expect(body.installations.find((row) => row.install_id === created.body.install_id)?.is_banned).toBe(true)

    const blocked = await request("/v1/challenges", {
      method: "POST",
      body: JSON.stringify(Object.assign(challengeBody(), { machine_id: machineId })),
    })
    expect(blocked.status).toBe(403)
    expect((await blocked.json()) as { error: string; message: string }).toMatchObject({
      error: "machine_banned",
      message: "You are banned as a result of your bad behaviors which violate the license rules you have accepted.",
    })

    const poll = await request(
      `/v1/commands?install_id=${created.body.install_id}&receipt=${encodeURIComponent(receipt)}`,
    )
    expect(poll.status).toBe(403)
    expect((await poll.json()) as { error: string; message: string }).toMatchObject({
      error: "machine_banned",
      message:
        "This installation has been banned by admin. Chat is locked. If you believe this is a mistake, contact admin through https://install.kingkung.men/feedback.",
    })

    const unban = await admin(`/v1/admin/installations/${created.body.install_id}/unban`, { method: "POST" })
    expect(unban.status).toBe(200)
    expect((await unban.json()) as { unbanned: boolean }).toMatchObject({ unbanned: true })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const command = await db
      .prepare(
        "SELECT status FROM remote_command WHERE install_id = ? AND type = 'uninstall' ORDER BY created_at DESC LIMIT 1",
      )
      .bind(created.body.install_id)
      .first<{ status: string }>()
    expect(command).toBeNull()

    const allowed = await request("/v1/challenges", {
      method: "POST",
      body: JSON.stringify(Object.assign(challengeBody(), { machine_id: machineId })),
    })
    expect(allowed.status).toBe(201)
  })

  test("client polls and finds pending remote command", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, { method: "POST" })

    const poll = await request(
      `/v1/commands?install_id=${created.body.install_id}&receipt=${encodeURIComponent(receipt)}`,
    )
    expect(poll.status).toBe(200)
    const body = (await poll.json()) as { commands: Array<{ id: string; type: string }> }
    expect(body.commands).toHaveLength(1)
    expect(body.commands[0].type).toBe("uninstall")
  })

  test("client acknowledges and completes remote command", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    const uninstall = await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, { method: "POST" })
    const { command_id } = (await uninstall.json()) as { command_id: string }

    const ack = await request("/v1/acknowledge", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt, command_id }),
    })
    expect(ack.status).toBe(200)
    expect((await ack.json()) as { status: string }).toMatchObject({ status: "acknowledged" })

    const complete = await request("/v1/complete", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt, command_id }),
    })
    expect(complete.status).toBe(200)
    expect((await complete.json()) as { status: string }).toMatchObject({ status: "completed" })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const command = await db
      .prepare("SELECT status, acknowledged_at, completed_at FROM remote_command WHERE id = ?")
      .bind(command_id)
      .first()
    expect((command as any).status).toBe("completed")
    expect((command as any).acknowledged_at).not.toBeNull()
    expect((command as any).completed_at).not.toBeNull()
  })

  test("client can retry an acknowledged remote command that did not complete", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    const uninstall = await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, { method: "POST" })
    const { command_id } = (await uninstall.json()) as { command_id: string }

    await request("/v1/acknowledge", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt, command_id }),
    })

    const poll = await request(
      `/v1/commands?install_id=${created.body.install_id}&receipt=${encodeURIComponent(receipt)}`,
    )
    expect(poll.status).toBe(200)
    const body = (await poll.json()) as { commands: Array<{ id: string; type: string }> }
    expect(body.commands).toHaveLength(1)
    expect(body.commands[0]).toMatchObject({ id: command_id, type: "uninstall" })
  })

  test("no pending commands after acknowledge and complete cycle", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    const uninstall = await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, { method: "POST" })
    const { command_id } = (await uninstall.json()) as { command_id: string }

    await request("/v1/acknowledge", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt, command_id }),
    })
    await request("/v1/complete", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt, command_id }),
    })

    const poll = await request(
      `/v1/commands?install_id=${created.body.install_id}&receipt=${encodeURIComponent(receipt)}`,
    )
    const body = (await poll.json()) as { commands: Array<unknown> }
    expect(body.commands).toHaveLength(0)
  })

  test("client can mark a remote command as failed", async () => {
    const created = await createChallenge()
    const verified = await verifyChallenge(created.response.challenge_id)
    const receipt = ((await verified.json()) as { receipt: string }).receipt

    const uninstall = await admin(`/v1/admin/installations/${created.body.install_id}/uninstall`, { method: "POST" })
    const { command_id } = (await uninstall.json()) as { command_id: string }

    await request("/v1/acknowledge", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt, command_id }),
    })

    const failed = await request("/v1/fail", {
      method: "POST",
      body: JSON.stringify({ install_id: created.body.install_id, receipt, command_id }),
    })
    expect(failed.status).toBe(200)
    expect((await failed.json()) as { status: string }).toMatchObject({ status: "failed" })

    const db = await worker.getD1Database("InstallerVerificationDatabase")
    const command = await db
      .prepare("SELECT status, completed_at FROM remote_command WHERE id = ?")
      .bind(command_id)
      .first()
    expect((command as any).status).toBe("failed")
    expect((command as any).completed_at).not.toBeNull()
  })

  test("unauthenticated requests for remote commands are rejected", async () => {
    const installId = crypto.randomUUID()
    const receipt = "invalid.receipt.token"
    const commandId = crypto.randomUUID()

    const list = await request(`/v1/commands?install_id=${installId}&receipt=${receipt}`)
    expect(list.status).toBe(401)

    const ack = await request("/v1/acknowledge", {
      method: "POST",
      body: JSON.stringify({ install_id: installId, receipt, command_id: commandId }),
    })
    expect(ack.status).toBe(401)

    const complete = await request("/v1/complete", {
      method: "POST",
      body: JSON.stringify({ install_id: installId, receipt, command_id: commandId }),
    })
    expect(complete.status).toBe(401)

    const fail = await request("/v1/fail", {
      method: "POST",
      body: JSON.stringify({ install_id: installId, receipt, command_id: commandId }),
    })
    expect(fail.status).toBe(401)

    const unauthenticated = await request(`/v1/admin/installations/${installId}/uninstall`, { method: "POST" })
    expect(unauthenticated.status).toBe(401)
  })
})
