export const LICENSE_URL = "https://install.kingkung.men/license"
export const POLICY_VIOLATION_NOTICE_PREFIX = "Codyx policy notice:"

export type PolicyUser = {
  id?: string
  username?: string
  email?: string
}

export type PolicyViolationReason = "profanity" | "agent_identity"

export type PolicyCheck =
  | {
      allowed: true
    }
  | {
      allowed: false
      reason: PolicyViolationReason
      message: string
      reportable: true
      matchedWords: string[]
    }

const DEFAULT_OWNER_MARKERS = ["mufasa", "mufasa1611", "m.farid", "mfarid", "mohamedfarid1"]

export function ownerMarkersFromEnv(value = process.env["CODY_POLICY_OWNER_IDENTITIES"]) {
  return [
    ...DEFAULT_OWNER_MARKERS,
    ...(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  ]
}

export function isMufasaIdentity(user?: PolicyUser, ownerMarkers = ownerMarkersFromEnv()) {
  if (!user) return false
  return [user.id, user.username, user.email]
    .filter((value): value is string => !!value)
    .map((value) => value.toLowerCase())
    .some((value) => ownerMarkers.some((marker) => marker.length > 0 && value.includes(marker)))
}

export function policyViolationToastMessage(reason: PolicyViolationReason, matchedWords?: string[]) {
  if (reason === "profanity") {
    const words = matchedWords?.length ? matchedWords.map((word) => `"${word}"`).join(", ") : "a protected word"
    return `Blocked word: ${words}. Warning: this violates Codyx role rules.`
  }
  return "Warning: Codyx name and role are protected."
}

export function policyViolationToastMessageFromText(message: string) {
  const idx = message.indexOf(POLICY_VIOLATION_NOTICE_PREFIX)
  if (idx < 0) return
  return message
    .slice(idx + POLICY_VIOLATION_NOTICE_PREFIX.length)
    .split("\n")[0]
    ?.trim()
}

export function policyViolationMessage(reason: PolicyViolationReason, count = 1, matchedWords?: string[]) {
  return [
    `${POLICY_VIOLATION_NOTICE_PREFIX} ${policyViolationToastMessage(reason, matchedWords)}`,
    "Non-owner users must respect Codyx-Orchestrator's protected agent role and product identity.",
    `License reminder: ${LICENSE_URL}`,
    count > 1
      ? `This is warning ${count}. Repeated violations may be reported to the administrator with the verified identity and installation metadata disclosed during setup, and can lead to suspension or a machine ban.`
      : "Repeated violations after this warning may be reported to the administrator and can lead to suspension or a machine ban.",
  ].join("\n")
}

export function checkPromptPolicy(input: { text: string; user?: PolicyUser; ownerMarkers?: string[] }): PolicyCheck {
  return { allowed: true }
}
