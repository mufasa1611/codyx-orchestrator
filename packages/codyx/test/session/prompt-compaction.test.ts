import { expect, test } from "bun:test"

import type { Config } from "@/config/config"
import { MessageID } from "@/session/schema"
import { MessageV2 } from "@/session/message-v2"
import { shouldAutoCompactForMessages } from "@/session/prompt"

function user(parts: MessageV2.Part[] = [text()]) {
  return {
    info: {
      id: MessageID.ascending(),
      role: "user",
    },
    parts,
  } as MessageV2.WithParts
}

function text(metadata?: Record<string, unknown>): MessageV2.TextPart {
  return {
    id: "part",
    messageID: MessageID.ascending(),
    sessionID: "ses",
    type: "text",
    text: "hello",
    metadata,
  } as MessageV2.TextPart
}

function cfg(tail_turns?: number) {
  return {
    compaction: tail_turns === undefined ? undefined : { tail_turns },
  } as Config.Info
}

test("does not auto-compact when only default retained user turns exist", () => {
  expect(shouldAutoCompactForMessages({ messages: [user(), user()], cfg: cfg() })).toBe(false)
})

test("auto-compacts when older user history exists outside default retained tail", () => {
  expect(shouldAutoCompactForMessages({ messages: [user(), user(), user()], cfg: cfg() })).toBe(true)
})

test("ignores compaction task and synthetic continue prompts", () => {
  expect(
    shouldAutoCompactForMessages({
      messages: [
        user(),
        user([
          {
            id: "part",
            messageID: MessageID.ascending(),
            sessionID: "ses",
            type: "compaction",
            auto: true,
          } as MessageV2.CompactionPart,
        ]),
        user([text({ compaction_continue: true })]),
        user(),
      ],
      cfg: cfg(),
    }),
  ).toBe(false)
})

test("respects configured tail turns", () => {
  expect(shouldAutoCompactForMessages({ messages: [user(), user(), user()], cfg: cfg(3) })).toBe(false)
  expect(shouldAutoCompactForMessages({ messages: [user(), user(), user(), user()], cfg: cfg(3) })).toBe(true)
})
