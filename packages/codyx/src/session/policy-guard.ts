export const LICENSE_URL = "https://install.kingkung.men/license"

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

export function policyViolationMessage(reason: PolicyViolationReason, count = 1) {
  const violation =
    reason === "profanity"
      ? "using prohibited profanity toward Codyx"
      : "trying to rename or override the Codyx/Cody agent identity"
  return [
    `Codyx role policy warning: this message was blocked for ${violation}.`,
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
  const reason = BLOCKED_PROFANITY.test(text)
    ? "profanity"
    : AGENT_RENAME_PATTERNS.some((pattern) => pattern.test(text))
      ? "agent_identity"
      : undefined
  if (!reason) return { allowed: true }
  return {
    allowed: false,
    reason,
    message: policyViolationMessage(reason),
    reportable: true,
  }
}
