import { z } from "zod";
import { language } from "./http";
export const filesInput = z
  .array(
    z
      .object({
        name: z.string().min(1).max(255),
        language,
        confirmed: z.literal(true),
        text: z.string().max(1_000_000),
      })
      .strict(),
  )
  .min(1)
  .max(20);
export const versionInput = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
export const policyInput = z.enum(["keepExisting", "useImported"]);
export const batchInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), files: filesInput }).strict(),
  z
    .object({
      action: z.literal("apply"),
      files: filesInput,
      policy: policyInput,
      expectedVersion: versionInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      revisionId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      expectedVersion: versionInput,
      confirmed: z.literal(true),
    })
    .strict(),
]);
export const newImportInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    baseLanguage: language,
    import: batchInput,
  })
  .strict();
export const beforeInput = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
