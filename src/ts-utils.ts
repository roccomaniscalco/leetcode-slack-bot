import { z } from "zod";

export function notNullish<T>(value: T, message = "Value cannot be nullish") {
  return z
    .custom<T>((value) => value != null, { message })
    .transform((value) => value as Exclude<T, null | undefined>)
    .parse(value);
}
