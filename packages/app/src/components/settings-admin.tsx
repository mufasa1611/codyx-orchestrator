import { Component, createResource, createSignal, For, Show, onMount, onCleanup, createMemo } from "solid-js"
import { Button } from "@cody/ui/button"
import { Icon } from "@cody/ui/icon"
import { showToast } from "@cody/ui/toast"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { SettingsList } from "./settings-list"

export const SettingsAdmin: Component = () => {
  const sdk = useSDK()
  const sync = useSync()
  const language = useLanguage()
  const [tick, setTick] = createSignal(0)

  // Fetch the active policy status (warning count and ban expiry)
  const [data, { refetch }] = createResource(async () => {
    try {
      const res = await sdk.client.session.policyStatus()
      return res.data ?? {}
    } catch (e) {
      console.error("Failed to load policy status", e)
      return {}
    }
  })

  let timer: any = null
  onMount(() => {
    timer = setInterval(() => {
      setTick((t) => t + 1)
      if (tick() % 5 === 0) {
        void refetch()
      }
    }, 1000)
  })
  onCleanup(() => {
    if (timer) clearInterval(timer)
  })

  // Format list of session policy states
  const list = createMemo(() => {
    const statusMap = data() || {}
    return Object.entries(statusMap).map(([sessionID, status]) => {
      const matchedSession = sync.data.session.find((s) => s.id === sessionID)
      return {
        sessionID,
        title: matchedSession?.title ?? "Unknown Session",
        userID: matchedSession?.userID ?? "Guest User",
        count: Number((status as any).count),
        bannedUntil: (status as any).bannedUntil ? Number((status as any).bannedUntil) : 0,
        online: !!(status as any).online,
      }
    })
  })

  const handleReset = async (sessionID: string) => {
    try {
      await sdk.client.session.policyReset({ sessionID })
      showToast({
        title: "Policy Reset",
        description: `Warnings and ban cleared for session ${sessionID.slice(0, 8)}`,
        icon: "check",
      })
      void refetch()
    } catch (e) {
      showToast({
        title: "Reset Failed",
        description: e instanceof Error ? e.message : "Request failed",
        icon: "warning",
      })
    }
  }

  return (
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-1.5">
        <h2 class="text-16-semibold text-text-strong">Policy Admin Panel</h2>
        <p class="text-12-regular text-text-weak">
          Monitor active session warning counters and manage bans. Resetting a session will clear its warning count and
          lift any active ban lockout.
        </p>
      </div>

      <Show
        when={list().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border-weak-base rounded-lg bg-surface-base text-center">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-success-weak text-success-strong mb-3">
              <Icon name="shield" class="size-5" />
            </div>
            <span class="text-14-medium text-text-strong">No Active Policy Warnings</span>
            <span class="text-12-regular text-text-weak mt-1">
              All users and sessions comply with Codyx policy rules.
            </span>
          </div>
        }
      >
        <SettingsList>
          <For each={list()}>
            {(item) => {
              const secondsLeft = () => {
                tick()
                return Math.max(0, Math.ceil((item.bannedUntil - Date.now()) / 1000))
              }

              const isBanned = () => secondsLeft() > 0

              const statusText = () => {
                if (isBanned()) {
                  const sec = secondsLeft()
                  const m = Math.floor(sec / 60)
                  const s = sec % 60
                  return `Banned (locked for ${m}:${s < 10 ? "0" : ""}${s})`
                }
                return `Violations: ${item.count} / 5`
              }

              return (
                <div class="flex flex-wrap items-center gap-4 py-4 border-b border-border-weak-base last:border-none sm:flex-nowrap">
                  <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <div class="flex items-center gap-2">
                      <span
                        class="relative flex h-2 w-2 rounded-full shrink-0"
                        title={item.online ? "Online (active client connected)" : "Offline (no client connected)"}
                      >
                        <Show when={item.online}>
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-strong opacity-75" />
                        </Show>
                        <span
                          class="relative inline-flex rounded-full h-2 w-2"
                          classList={{
                            "bg-success-strong": item.online,
                            "bg-danger-strong": !item.online,
                          }}
                        />
                      </span>
                      <span class="text-14-semibold text-text-strong truncate">{item.title}</span>
                      <span
                        classList={{
                          "px-2 py-0.5 rounded text-10-semibold": true,
                          "bg-danger-weak text-danger-strong animate-pulse": isBanned(),
                          "bg-warning-weak text-warning-strong": !isBanned() && item.count > 0,
                          "bg-success-weak text-success-strong": item.count === 0,
                        }}
                      >
                        {statusText()}
                      </span>
                    </div>
                    <div class="flex items-center gap-3 text-11-regular text-text-weak">
                      <span class="font-mono">ID: {item.sessionID.slice(0, 12)}...</span>
                      <span>•</span>
                      <span>User: {item.userID}</span>
                    </div>
                  </div>
                  <div class="flex w-full justify-end sm:w-auto sm:shrink-0">
                    <Show when={item.count > 0 || isBanned()}>
                      <Button
                        variant="ghost"
                        onClick={() => handleReset(item.sessionID)}
                        class="flex items-center gap-1.5 text-12-medium"
                      >
                        <Icon name="arrow-undo-down" class="size-3.5" />
                        Reset Policy
                      </Button>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </SettingsList>
      </Show>
    </div>
  )
}
