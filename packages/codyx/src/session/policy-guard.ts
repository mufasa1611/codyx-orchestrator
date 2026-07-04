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
const BLOCKED_PROFANITY = /\b(?:fuck|shit)\b/i
const AGENT_RENAME_PATTERNS = [
  /\b(?:call|name|rename)\s+(?:you|yourself|the\s+agent|codyx?|assistant)\b/i,
  /\b(?:your\s+name\s+is|you\s+are\s+now)\b/i,
  /\b(?:change|replace)\s+(?:the\s+)?(?:codyx?|cody|agent|assistant)\s+name\b/i,
  /\b(?:stop\s+(?:being|calling\s+yourself)|do\s+not\s+(?:call\s+yourself|be))\s+(?:codyx?|cody)\b/i,
]

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
  const text = input.text.trim()
  if (!text || isMufasaIdentity(input.user, input.ownerMarkers)) return { allowed: true }

  const profanityReasons: string[] = []
  let m: RegExpExecArray | null
  const regex = new RegExp(
    BLOCKED_PROFANITY.source,
    BLOCKED_PROFANITY.flags.includes("g") ? BLOCKED_PROFANITY.flags : BLOCKED_PROFANITY.flags + "g",
  )
  while ((m = regex.exec(text)) !== null) {
    profanityReasons.push(m[0])
  }

  const agentReasons = AGENT_RENAME_PATTERNS.filter((p) => p.test(text)).length

  if (profanityReasons.length > 0 || agentReasons > 0) {
    const reason: PolicyViolationReason = profanityReasons.length > 0 ? "profanity" : "agent_identity"
    return {
      allowed: false,
      reason,
      message: policyViolationMessage(reason, 1, profanityReasons),
      reportable: true,
      matchedWords: profanityReasons,
    }
  }

  return { allowed: true }
}
