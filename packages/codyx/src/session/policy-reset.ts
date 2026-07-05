import { GlobalBus } from "@/bus/global"
import { Identifier } from "@/id/id"

type ResetListener = () => void | Promise<void>

const listeners = new Set<ResetListener>()

export function registerLivePolicyResetListener(listener: ResetListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function requestLivePolicyReset() {
  const results = await Promise.allSettled([...listeners].map(async (listener) => listener()))
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "One or more live policy reset listeners failed.",
    )
  }

  GlobalBus.emit("event", {
    payload: {
      id: Identifier.create("evt", "ascending"),
      type: "session.policy-ban",
      properties: {
        bannedUntil: 0,
        count: 0,
      },
    },
  })

  return results.length
}
