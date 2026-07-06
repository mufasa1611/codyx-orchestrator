import { describe, expect, test } from "bun:test"
import { isLocalServerUrl, resolveServerList, ServerConnection } from "./server"

describe("isLocalServerUrl", () => {
  test("recognizes localhost, IPv4, and IPv6 loopback server URLs", () => {
    expect(isLocalServerUrl("http://localhost:4096")).toBe(true)
    expect(isLocalServerUrl("http://127.0.0.1:4096")).toBe(true)
    expect(isLocalServerUrl("http://[::1]:4096")).toBe(true)
  })

  test("does not treat network hosts as local", () => {
    expect(isLocalServerUrl("http://192.168.1.30:4096")).toBe(false)
    expect(isLocalServerUrl("https://example.com")).toBe(false)
  })
})

describe("resolveServerList", () => {
  test("lets startup auth_token credentials override a persisted same-url server", () => {
    const list = resolveServerList({
      stored: [{ url: "https://server.example.test" }],
      props: [
        {
          type: "http",
          authToken: true,
          http: {
            url: "https://server.example.test",
            username: "cody",
            password: "secret",
          },
        },
      ],
    })

    expect(list).toHaveLength(1)
    expect(list[0]?.type).toBe("http")
    expect(list[0]?.http).toEqual({
      url: "https://server.example.test",
      username: "cody",
      password: "secret",
    })
    expect(list[0]?.type === "http" ? list[0].authToken : false).toBe(true)
    expect(ServerConnection.key(list[0]!) as string).toBe("https://server.example.test")
  })

  test("keeps persisted credentials when startup has no auth_token", () => {
    const list = resolveServerList({
      stored: [
        {
          url: "https://server.example.test",
          username: "cody",
          password: "saved",
        },
      ],
      props: [{ type: "http", http: { url: "https://server.example.test" } }],
    })

    expect(list).toHaveLength(1)
    expect(list[0]?.type).toBe("http")
    expect(list[0]?.http).toEqual({
      url: "https://server.example.test",
      username: "cody",
      password: "saved",
    })
    expect(list[0]?.type === "http" ? list[0].authToken : true).toBeUndefined()
  })
})
