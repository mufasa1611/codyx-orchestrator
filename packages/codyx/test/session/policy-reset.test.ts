import { afterEach, describe, expect, test } from "bun:test"
import { GlobalBus, type GlobalEvent } from "@/bus/global"
import { registerLivePolicyResetListener, requestLivePolicyReset } from "@/session/policy-reset"

const unregisters: Array<() => void> = []

afterEach(() => {
  while (unregisters.length > 0) unregisters.pop()?.()
})

function register(listener: () => void | Promise<void>) {
  const unregister = registerLivePolicyResetListener(listener)
  unregisters.push(unregister)
  return unregister
}

describe("live policy reset", () => {
  test("notifies registered listeners and emits a global UI clear event", async () => {
    let resetCount = 0
    register(() => {
      resetCount++
      return ["ses_live"]
    })

    const eventPromise = new Promise<GlobalEvent>((resolve) => {
      const handler = (event: GlobalEvent) => {
        if (event.payload?.type !== "session.policy-ban") return
        GlobalBus.off("event", handler)
        resolve(event)
      }
      GlobalBus.on("event", handler)
    })

    const listenerCount = await requestLivePolicyReset()
    const event = await eventPromise

    expect(listenerCount).toBe(1)
    expect(resetCount).toBe(1)
    expect(event.directory).toBe("global")
    expect(event.payload.properties).toEqual({ sessionID: "ses_live", bannedUntil: 0, count: 0 })
  })

  test("propagates listener failures without hiding them", async () => {
    register(() => {
      throw new Error("reset failed")
    })

    await expect(requestLivePolicyReset()).rejects.toBeInstanceOf(AggregateError)
  })
})
