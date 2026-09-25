import { z } from "zod";
import { language } from "./http";
import { versionInput } from "./import-http";
const selection = {
  language,
  entryIds: z
    .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .min(1)
    .max(5000)
    .optional(),
};
export const machineInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), ...selection }).strict(),
  z
    .object({
      action: z.literal("apply"),
      ...selection,
      expectedVersion: versionInput,
      confirmed: z.literal(true),
      provider: z.string().min(1).max(64),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve"),
      ...selection,
      expectedVersion: versionInput,
      confirmed: z.literal(true),
    })
    .strict(),
]);
