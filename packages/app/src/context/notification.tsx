import { createStore, reconcile } from "solid-js/store"
import { batch, createEffect, createMemo, onCleanup, createSignal, onMount } from "solid-js"
import { useParams } from "@solidjs/router"
import { createSimpleContext } from "@cody/ui/context"
import { useGlobalSDK } from "./global-sdk"
import { useGlobalSync } from "./global-sync"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { Binary } from "@cody/core/util/binary"
import { base64Encode } from "@cody/core/util/encode"
import { decode64 } from "@/utils/base64"
import { EventSessionError } from "@cody/sdk/v2"
import { Persist, persisted } from "@/utils/persist"
import { playSoundById } from "@/utils/sound"
import { showToast, toaster } from "@cody/ui/toast"

const POLICY_VIOLATION_NOTICE_PREFIX = "Codyx policy notice:"

function policyViolationToastMessageFromText(message: string) {
  const idx = message.indexOf(POLICY_VIOLATION_NOTICE_PREFIX)
  if (idx < 0) return
  const lines = message
    .slice(idx + POLICY_VIOLATION_NOTICE_PREFIX.length)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const first = lines[0]
  if (!first) return
  const warning = lines.find((line) => /^This is warning \d+ of \d+\./.test(line))
  return warning ? `${first} ${warning}` : first
}

type NotificationBase = {
  directory?: string
  session?: string
  metadata?: unknown
  time: number
  viewed: boolean
}

type TurnCompleteNotification = NotificationBase & {
  type: "turn-complete"
}

type ErrorNotification = NotificationBase & {
  type: "error"
  error: EventSessionError["properties"]["error"]
}

export type Notification = TurnCompleteNotification | ErrorNotification

type NotificationIndex = {
  session: {
    all: Record<string, Notification[]>
    unseen: Record<string, Notification[]>
    unseenCount: Record<string, number>
    unseenHasError: Record<string, boolean>
  }
  project: {
    all: Record<string, Notification[]>
    unseen: Record<string, Notification[]>
    unseenCount: Record<string, number>
    unseenHasError: Record<string, boolean>
  }
}

const MAX_NOTIFICATIONS = 500
const NOTIFICATION_TTL_MS = 1000 * 60 * 60 * 24 * 30

function pruneNotifications(list: Notification[]) {
  const cutoff = Date.now() - NOTIFICATION_TTL_MS
  const pruned = list.filter((n) => n.time >= cutoff)
  if (pruned.length <= MAX_NOTIFICATIONS) return pruned
  return pruned.slice(pruned.length - MAX_NOTIFICATIONS)
}

function createNotificationIndex(): NotificationIndex {
  return {
    session: {
      all: {},
      unseen: {},
      unseenCount: {},
      unseenHasError: {},
    },
    project: {
      all: {},
      unseen: {},
      unseenCount: {},
      unseenHasError: {},
    },
  }
}

function buildNotificationIndex(list: Notification[]) {
  const index = createNotificationIndex()

  list.forEach((notification) => {
    if (notification.session) {
      const all = index.session.all[notification.session] ?? []
      index.session.all[notification.session] = [...all, notification]
      if (!notification.viewed) {
        const unseen = index.session.unseen[notification.session] ?? []
        index.session.unseen[notification.session] = [...unseen, notification]
        index.session.unseenCount[notification.session] = unseen.length + 1
        if (notification.type === "error") index.session.unseenHasError[notification.session] = true
      }
    }

    if (notification.directory) {
      const all = index.project.all[notification.directory] ?? []
      index.project.all[notification.directory] = [...all, notification]
      if (!notification.viewed) {
        const unseen = index.project.unseen[notification.directory] ?? []
        index.project.unseen[notification.directory] = [...unseen, notification]
        index.project.unseenCount[notification.directory] = unseen.length + 1
        if (notification.type === "error") index.project.unseenHasError[notification.directory] = true
      }
    }
  })

  return index
}

export const { use: useNotification, provider: NotificationProvider } = createSimpleContext({
  name: "Notification",
  init: () => {
    const params = useParams()
    const globalSDK = useGlobalSDK()
    const globalSync = useGlobalSync()
    const platform = usePlatform()
    const settings = useSettings()
    const language = useLanguage()

    const empty: Notification[] = []

    const currentDirectory = createMemo(() => {
      return decode64(params.dir)
    })

    const currentSession = createMemo(() => params.id)

    const [store, setStore, _, ready] = persisted(
      Persist.global("notification", ["notification.v1"]),
      createStore({
        list: [] as Notification[],
      }),
    )
    const [index, setIndex] = createStore<NotificationIndex>(buildNotificationIndex(store.list))

    const meta = { pruned: false, disposed: false }

    const [policyBans, setPolicyBans] = createSignal<Record<string, number>>({})
    const [banCounts, setBanCounts] = createSignal<Record<string, number>>({})
    const [banMaxWarnings, setBanMaxWarnings] = createSignal<Record<string, number>>({})
    const [tick, setTick] = createSignal(0)
    let banTimer: any = null
    onMount(() => {
      banTimer = setInterval(() => setTick((t) => t + 1), 1000)
    })
    onCleanup(() => {
      if (banTimer) clearInterval(banTimer)
    })

    const isBanned = (sessionID?: string) => {
      tick()
      if (!sessionID) return false
      const bans = policyBans()
      const until = bans[sessionID]
      if (!until) return false
      return Date.now() < until
    }

    const [banReasons, setBanReasons] = createSignal<Record<string, string>>({})

    const banSecondsLeft = (sessionID?: string) => {
      tick()
      if (!sessionID) return 0
      const bans = policyBans()
      const until = bans[sessionID]
      if (!until) return 0
      return Math.max(0, Math.ceil((until - Date.now()) / 1000))
    }

    const setSessionBan = (
      sessionID: string,
      bannedUntil: number,
      reason?: string,
      count?: number,
      maxWarnings?: number,
    ) => {
      if (Date.now() >= bannedUntil) {
        setPolicyBans((prev) => {
          const next = { ...prev }
          delete next[sessionID]
          return next
        })
        setBanCounts((prev) => {
          const next = { ...prev }
          delete next[sessionID]
          return next
        })
        setBanMaxWarnings((prev) => {
          const next = { ...prev }
          delete next[sessionID]
          return next
        })
        setBanReasons((prev) => {
          const next = { ...prev }
          delete next[sessionID]
          return next
        })
        return
      }
      setPolicyBans((prev) => ({ ...prev, [sessionID]: bannedUntil }))
      if (count !== undefined) {
        setBanCounts((prev) => ({ ...prev, [sessionID]: count }))
      }
      if (maxWarnings !== undefined) {
        setBanMaxWarnings((prev) => ({ ...prev, [sessionID]: maxWarnings }))
      }
      if (reason) {
        setBanReasons((prev) => ({ ...prev, [sessionID]: reason }))
      }
    }

    let activeToastId: any = null
    createEffect(() => {
      const activeSession = currentSession()
      const banned = activeSession ? isBanned(activeSession) : false
      if (banned && activeSession) {
        if (activeToastId === null) {
          // Capture a stable reference to activeSession for use inside the toast accessor
          const sessionForToast = activeSession
          activeToastId = showToast({
            title: "BAN",
            description: (
              <span>
                {(() => {
                  const sec = banSecondsLeft(sessionForToast)
                  const m = Math.floor(sec / 60)
                  const s = sec % 60
                  const count = banCounts()[sessionForToast]
                  const maxWarnings = banMaxWarnings()[sessionForToast]
                  const customReason = banReasons()[sessionForToast]
                  const reason = customReason ? `${customReason} ` : ""
                  const warning =
                    !customReason && count ? `Warning ${count}${maxWarnings ? ` of ${maxWarnings}` : ""}. ` : ""
                  return `${reason}${warning}Chat locked for ${m}:${s < 10 ? "0" : ""}${s}`
                })()}
              </span>
            ),
            icon: "warning",
            persistent: true,
          })
        }
      } else {
        if (activeToastId !== null) {
          toaster.dismiss(activeToastId)
          activeToastId = null
        }
      }
    })

    const updateUnseen = (scope: "session" | "project", key: string, unseen: Notification[]) => {
      setIndex(scope, "unseen", key, unseen)
      setIndex(scope, "unseenCount", key, unseen.length)
      setIndex(
        scope,
        "unseenHasError",
        key,
        unseen.some((notification) => notification.type === "error"),
      )
    }

    const appendToIndex = (notification: Notification) => {
      if (notification.session) {
        setIndex("session", "all", notification.session, (all = []) => [...all, notification])
        if (!notification.viewed) {
          setIndex("session", "unseen", notification.session, (unseen = []) => [...unseen, notification])
          setIndex("session", "unseenCount", notification.session, (count = 0) => count + 1)
          if (notification.type === "error") setIndex("session", "unseenHasError", notification.session, true)
        }
      }

      if (notification.directory) {
        setIndex("project", "all", notification.directory, (all = []) => [...all, notification])
        if (!notification.viewed) {
          setIndex("project", "unseen", notification.directory, (unseen = []) => [...unseen, notification])
          setIndex("project", "unseenCount", notification.directory, (count = 0) => count + 1)
          if (notification.type === "error") setIndex("project", "unseenHasError", notification.directory, true)
        }
      }
    }

    const removeFromIndex = (notification: Notification) => {
      if (notification.session) {
        setIndex("session", "all", notification.session, (all = []) => all.filter((n) => n !== notification))
        if (!notification.viewed) {
          const unseen = (index.session.unseen[notification.session] ?? empty).filter((n) => n !== notification)
          updateUnseen("session", notification.session, unseen)
        }
      }

      if (notification.directory) {
        setIndex("project", "all", notification.directory, (all = []) => all.filter((n) => n !== notification))
        if (!notification.viewed) {
          const unseen = (index.project.unseen[notification.directory] ?? empty).filter((n) => n !== notification)
          updateUnseen("project", notification.directory, unseen)
        }
      }
    }

    createEffect(() => {
      if (!ready()) return
      if (meta.pruned) return
      meta.pruned = true
      const list = pruneNotifications(store.list)
      batch(() => {
        setStore("list", list)
        setIndex(reconcile(buildNotificationIndex(list), { merge: false }))
      })
    })

    const append = (notification: Notification) => {
      const list = pruneNotifications([...store.list, notification])
      const keep = new Set(list)
      const removed = store.list.filter((n) => !keep.has(n))

      batch(() => {
        if (keep.has(notification)) appendToIndex(notification)
        removed.forEach((n) => removeFromIndex(n))
        setStore("list", list)
      })
    }

    const lookup = async (directory: string, sessionID?: string) => {
      if (!sessionID) return undefined
      const [syncStore] = globalSync.child(directory, { bootstrap: false })
      const match = Binary.search(syncStore.session, sessionID, (s) => s.id)
      if (match.found) return syncStore.session[match.index]
      return globalSDK.client.session
        .get({ directory, sessionID })
        .then((x) => x.data)
        .catch(() => undefined)
    }

    const viewedInCurrentSession = (directory: string, sessionID?: string) => {
      const activeDirectory = currentDirectory()
      const activeSession = currentSession()
      if (!activeDirectory) return false
      if (!activeSession) return false
      if (!sessionID) return false
      if (directory !== activeDirectory) return false
      return sessionID === activeSession
    }

    const handleSessionIdle = (directory: string, event: { properties: { sessionID?: string } }, time: number) => {
      const sessionID = event.properties.sessionID
      void lookup(directory, sessionID).then((session) => {
        if (meta.disposed) return
        if (!session) return
        if (session.parentID) return

        if (settings.sounds.agentEnabled()) {
          void playSoundById(settings.sounds.agent())
        }

        append({
          directory,
          time,
          viewed: viewedInCurrentSession(directory, sessionID),
          type: "turn-complete",
          session: sessionID,
        })

        const href = `/${base64Encode(directory)}/session/${sessionID}`
        if (settings.notifications.agent()) {
          void platform.notify(language.t("notification.session.responseReady.title"), session.title ?? sessionID, href)
        }
      })
    }

    const handleSessionError = (
      directory: string,
      event: { properties: { sessionID?: string; error?: EventSessionError["properties"]["error"] } },
      time: number,
    ) => {
      const sessionID = event.properties.sessionID
      void lookup(directory, sessionID).then((session) => {
        if (meta.disposed) return
        if (session?.parentID) return

        if (settings.sounds.errorsEnabled()) {
          void playSoundById(settings.sounds.errors())
        }

        const error = "error" in event.properties ? event.properties.error : undefined
        const errMsg =
          typeof error === "string"
            ? error
            : error && typeof error === "object"
              ? "data" in error &&
                error.data &&
                typeof error.data === "object" &&
                "message" in error.data &&
                typeof error.data.message === "string"
                ? error.data.message
                : "message" in error && typeof error.message === "string"
                  ? error.message
                  : ""
              : ""

        const toastMsg = policyViolationToastMessageFromText(errMsg)
        if (toastMsg) {
          showToast({
            description: toastMsg || errMsg,
            icon: "warning",
            duration: 4000,
          })
          return
        }

        append({
          directory,
          time,
          viewed: viewedInCurrentSession(directory, sessionID),
          type: "error",
          session: sessionID ?? "global",
          error,
        })
        const description =
          session?.title ??
          (typeof error === "string" ? error : language.t("notification.session.error.fallbackDescription"))
        const href = sessionID ? `/${base64Encode(directory)}/session/${sessionID}` : `/${base64Encode(directory)}`
        if (settings.notifications.errors()) {
          void platform.notify(language.t("notification.session.error.title"), description, href)
        }
      })
    }

    const unsub = globalSDK.event.listen((e) => {
      const event = e.details
      if (event.type !== "session.idle" && event.type !== "session.error" && event.type !== "session.policy-ban") return

      const directory = e.name
      const time = Date.now()
      if (event.type === "session.idle") {
        handleSessionIdle(directory, event, time)
        return
      }
      if (event.type === "session.policy-ban") {
        const sessionID = event.properties.sessionID
        const bannedUntil = Number(event.properties.bannedUntil)
        const message =
          "message" in event.properties && typeof event.properties.message === "string"
            ? event.properties.message
            : undefined
        const count =
          "count" in event.properties && typeof event.properties.count === "number" ? event.properties.count : undefined
        const maxWarnings =
          "maxWarnings" in event.properties && typeof event.properties.maxWarnings === "number"
            ? event.properties.maxWarnings
            : undefined
        if (sessionID) {
          setSessionBan(sessionID, bannedUntil, message, count, maxWarnings)
        } else if (Date.now() >= bannedUntil) {
          setPolicyBans({})
          setBanCounts({})
          setBanMaxWarnings({})
          setBanReasons({})
        }
        return
      }
      handleSessionError(directory, event, time)
    })
    onCleanup(() => {
      meta.disposed = true
      unsub()
    })

    return {
      ready,
      isBanned,
      banSecondsLeft,
      setSessionBan,
      session: {
        all(session: string) {
          return index.session.all[session] ?? empty
        },
        unseen(session: string) {
          return index.session.unseen[session] ?? empty
        },
        unseenCount(session: string) {
          return index.session.unseenCount[session] ?? 0
        },
        unseenHasError(session: string) {
          return index.session.unseenHasError[session] ?? false
        },
        markViewed(session: string) {
          const unseen = index.session.unseen[session] ?? empty
          if (!unseen.length) return

          const projects = [
            ...new Set(unseen.flatMap((notification) => (notification.directory ? [notification.directory] : []))),
          ]
          batch(() => {
            setStore("list", (n) => n.session === session && !n.viewed, "viewed", true)
            updateUnseen("session", session, [])
            projects.forEach((directory) => {
              const next = (index.project.unseen[directory] ?? empty).filter(
                (notification) => notification.session !== session,
              )
              updateUnseen("project", directory, next)
            })
          })
        },
      },
      project: {
        all(directory: string) {
          return index.project.all[directory] ?? empty
        },
        unseen(directory: string) {
          return index.project.unseen[directory] ?? empty
        },
        unseenCount(directory: string) {
          return index.project.unseenCount[directory] ?? 0
        },
        unseenHasError(directory: string) {
          return index.project.unseenHasError[directory] ?? false
        },
        markViewed(directory: string) {
          const unseen = index.project.unseen[directory] ?? empty
          if (!unseen.length) return

          const sessions = [
            ...new Set(unseen.flatMap((notification) => (notification.session ? [notification.session] : []))),
          ]
          batch(() => {
            setStore("list", (n) => n.directory === directory && !n.viewed, "viewed", true)
            updateUnseen("project", directory, [])
            sessions.forEach((session) => {
              const next = (index.session.unseen[session] ?? empty).filter(
                (notification) => notification.directory !== directory,
              )
              updateUnseen("session", session, next)
            })
          })
        },
      },
    }
  },
})
