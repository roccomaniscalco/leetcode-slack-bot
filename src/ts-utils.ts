import { z } from "zod";

export function notNullish<T>(value: T, message = "Value cannot be nullish") {
  return z
    .custom<T>((value) => value != null, { message })
    .transform((value) => value as Exclude<T, null | undefined>)
    .parse(value);
}

export function isRejected(
  input: PromiseSettledResult<unknown>
): input is PromiseRejectedResult {
  return input.status === "rejected";
  
}

export function isFulfilled<T>(
  input: PromiseSettledResult<T>
): input is PromiseFulfilledResult<T> {
  return input.status === "fulfilled";
}
