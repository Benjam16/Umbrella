import { z } from "zod";
export * from "./blueprints.js";

export const devSignupRequestSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "operator", "analyst"]).optional(),
});

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(100_000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(100),
  mode: z.enum(["auto", "manual"]).optional().default("auto"),
  requestedModel: z.string().min(1).max(64).optional(),
  maxCredits: z.number().int().positive().max(100_000).optional(),
});

export type DevSignupRequest = z.infer<typeof devSignupRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Flat credits per chat when the API has no `UMBRELLA_INFERENCE_URL` (stub mode). */
export const DEFAULT_CHAT_CREDIT_COST = 10;

export const plannerTaskTypeSchema = z.enum([
  "ANALYSIS",
  "CODE_CHANGE",
  "COMMAND",
  "SCRAPE",
  "TRANSACTION",
  "VERIFY",
]);

export const plannerWorkerSchema = z.enum([
  "SUPERVISOR",
  "CODER_WORKER",
  "SCRAPER_WORKER",
  "AUDITOR_WORKER",
  "CRO_WORKER",
]);

export const scrapeTargetSchema = z.object({
  url: z.string().url(),
  goal: z.string().min(1).max(300),
  fields: z.array(z.string().min(1).max(120)).max(40).default([]),
  maxItems: z.number().int().min(1).max(500).default(25),
});

export const transactionProposalSchema = z.object({
  chainId: z.number().int().positive(),
  to: z.string().min(2),
  from: z.string().min(2).optional(),
  data: z.string().optional(),
  value: z.string().optional(),
  gas: z.string().optional(),
  description: z.string().min(1).max(280),
});

export const plannedTaskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(1000),
  type: plannerTaskTypeSchema,
  worker: plannerWorkerSchema,
  dependsOn: z.array(z.string().min(1).max(64)).max(20).default([]),
  scrape: scrapeTargetSchema.optional(),
  transaction: transactionProposalSchema.optional(),
});

export const plannerOutputSchema = z.object({
  supervisorSummary: z.string().min(1).max(1000).optional(),
  reasoningTrace: z.string().min(1).max(3000).optional(),
  tasks: z.array(plannedTaskSchema).min(1).max(50),
});

export type PlannerTaskType = z.infer<typeof plannerTaskTypeSchema>;
export type PlannerWorker = z.infer<typeof plannerWorkerSchema>;
export type ScrapeTarget = z.infer<typeof scrapeTargetSchema>;
export type TransactionProposal = z.infer<typeof transactionProposalSchema>;
export type PlannedTask = z.infer<typeof plannedTaskSchema>;
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
