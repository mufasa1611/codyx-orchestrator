import { createContext, useContext, type ParentProps, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "@tui/context/theme"
import { useTerminalDimensions } from "@opentui/solid"
import { EmptyBorder } from "../component/border"
import { TextAttributes } from "@opentui/core"
import { Schema } from "effect"
import { TuiEvent } from "../event"

type ToastInput = Schema.Codec.Encoded<typeof TuiEvent.ToastShow.properties>
export type ToastOptions = Schema.Schema.Type<typeof TuiEvent.ToastShow.properties>

const decodeToastOptions = Schema.decodeUnknownSync(TuiEvent.ToastShow.properties)

export function Toast() {
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <Show when={toast.currentToast}>
      {(current) => {
        const nearPrompt = () => current().variant === "warning"
        const variantIcon = () => {
          switch (current().variant) {
            case "warning":
              return "⚠️  "
            case "error":
              return "❌  "
            case "success":
              return "✨  "
            default:
              return "💡  "
          }
        }
        const defaultTitle = () => {
          switch (current().variant) {
            case "warning":
              return "WARNING"
            case "error":
              return "ERROR"
            case "success":
              return "SUCCESS"
            default:
              return "INFO"
          }
        }

        return (
          <box
            position="absolute"
            justifyContent="center"
            alignItems="flex-start"
            top={nearPrompt() ? undefined : 2}
            bottom={nearPrompt() ? 3 : undefined}
            right={2}
            maxWidth={Math.min(60, dimensions().width - 6)}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            backgroundColor={theme.backgroundPanel}
            borderColor={theme[current().variant]}
            border={["left"]}
            customBorderChars={{
              ...EmptyBorder,
              vertical: "▌",
            }}
          >
            <text attributes={TextAttributes.BOLD} marginBottom={1} fg={theme[current().variant]}>
              {variantIcon()}
              {current().title || defaultTitle()}
            </text>
            <text fg={theme.text} wrapMode="word" width="100%">
              {current().message}
            </text>
          </box>
        )
      }}
    </Show>
  )
}

function init() {
  const [store, setStore] = createStore({
    currentToast: null as ToastOptions | null,
  })

  let timeoutHandle: NodeJS.Timeout | null = null

  const toast = {
    show(options: ToastInput) {
      const toastOptions = decodeToastOptions(options)
      setStore("currentToast", toastOptions)
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if (toastOptions.duration && toastOptions.duration > 0) {
        timeoutHandle = setTimeout(() => {
          setStore("currentToast", null)
        }, toastOptions.duration).unref()
      }
    },
    dismiss() {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
      setStore("currentToast", null)
    },
    error: (err: any) => {
      if (err instanceof Error)
        return toast.show({
          variant: "error",
          message: err.message,
        })
      toast.show({
        variant: "error",
        message: "An unknown error has occurred",
      })
    },
    get currentToast(): ToastOptions | null {
      return store.currentToast
    },
  }
  return toast
}

export type ToastContext = ReturnType<typeof init>

const ctx = createContext<ToastContext>()

export function ToastProvider(props: ParentProps) {
  const value = init()
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useToast() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return value
}
