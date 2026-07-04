import { Schema } from "effect"

export class ApiNotFoundError extends Schema.ErrorClass<ApiNotFoundError>("NotFoundError")(
  {
    name: Schema.Literal("NotFoundError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 404 },
) {}

export function notFound(message: string) {
  return new ApiNotFoundError({
    name: "NotFoundError",
    data: { message },
  })
}

export class ApiPolicyBanError extends Schema.ErrorClass<ApiPolicyBanError>("PolicyBanError")(
  {
    name: Schema.Literal("PolicyBanError"),
    data: Schema.Struct({
      message: Schema.String,
      bannedUntil: Schema.Number,
      count: Schema.Number,
    }),
  },
  { httpApiStatus: 403 },
) {}

export function policyBan(message: string, bannedUntil: number, count: number) {
  return new ApiPolicyBanError({
    name: "PolicyBanError",
    data: { message, bannedUntil, count },
  })
}
