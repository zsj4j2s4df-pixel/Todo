import { z } from "zod";
const item = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["task", "event", "reminder"]),
  description: z.string().max(5000),
  due_at: z.string(),
  repeat_kind: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
});
const target = {
  id: z.string().uuid(),
  target_title: z.string().max(200),
  expected_updated_at: z.string().datetime({ offset: true }),
};
export const aiProposalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), item }),
  z.object({
    action: z.literal("update"),
    ...target,
    patch: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        due_at: z.string().optional(),
        repeat_kind: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
      })
      .strict(),
  }),
  z.object({ action: z.literal("complete"), ...target, done: z.boolean() }),
  z.object({ action: z.literal("delete"), ...target }),
]);
export type AIProposal = z.infer<typeof aiProposalSchema>;
