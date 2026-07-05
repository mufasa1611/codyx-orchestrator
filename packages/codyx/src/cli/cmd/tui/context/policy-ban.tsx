import { createContext, useContext, createSignal, onCleanup } from "solid-js"

type BanState = {
  bannedUntil: number
  sessionID?: string
  count?: number
  maxWarnings?: number
  message?: string
}

type PolicyBanContextValue = {
  ban: (state: BanState) => void
  isBanned: (sessionID?: string) => boolean
  secondsLeft: () => number
  current: () => BanState | null
}

const PolicyBanContext = createContext<PolicyBanContextValue>()

export function PolicyBanProvider(props: { children: any }) {
  const [banState, setBanState] = createSignal<BanState | null>(null)
  const [secondsLeft, setSecondsLeft] = createSignal(0)

  let interval: ReturnType<typeof setInterval> | undefined

  function startCountdown(until: number) {
    if (interval) clearInterval(interval)
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        interval = undefined
        setBanState(null)
      }
    }
    tick()
    interval = setInterval(tick, 1000)
  }

  onCleanup(() => {
    if (interval) clearInterval(interval)
  })

  const ctx: PolicyBanContextValue = {
    ban(state) {
      if (Date.now() >= state.bannedUntil) {
        if (!state.sessionID || banState()?.sessionID === state.sessionID) {
          if (interval) clearInterval(interval)
          interval = undefined
          setSecondsLeft(0)
          setBanState(null)
        }
        return
      }
      setBanState(state)
      startCountdown(state.bannedUntil)
    },
    isBanned(sessionID) {
      const s = banState()
      if (!s) return false
      if (sessionID && s.sessionID && s.sessionID !== sessionID) return false
      return Date.now() < s.bannedUntil
    },
    secondsLeft,
    current: banState,
  }

  return <PolicyBanContext.Provider value={ctx}>{props.children}</PolicyBanContext.Provider>
}

export function usePolicyBan() {
  const ctx = useContext(PolicyBanContext)
  if (!ctx) throw new Error("usePolicyBan must be used inside PolicyBanProvider")
  return ctx
}
