import demoJson from "@/data/demo-data.json";

export type DagNode = {
  id: string;
  label: string;
  worker: string;
  x: number;
  y: number;
};

export type DagEdge = { from: string; to: string };

export type ToolActionDemo = {
  id: string;
  tool: string;
  risk: number;
  detail: string;
};

export type Accent = "blue" | "green" | "amber" | "red";

export type CapabilityDemo = {
  id: string;
  title: string;
  summary: string;
  accent: Accent;
};

export type ArchitectureLayer = {
  id: string;
  title: string;
  role: string;
  stack: string;
  accent: Accent;
};

export type PricingTier = {
  id: string;
  name: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
};

export type RoadmapStage = {
  id: string;
  phase: string;
  label: string;
  items: string[];
};

export type FaqItem = {
  id: string;
  q: string;
  a: string;
};

export type DemoData = {
  heroCommand: string;
  mission: { title: string; objective: string };
  heroLogs: string[];
  dag: { nodes: DagNode[]; edges: DagEdge[] };
  toolActions: ToolActionDemo[];
  selfHealSnippet: { fail: string; fix: string; pass: string };
  ceoBriefing: string;
  capabilities: CapabilityDemo[];
  architecture: ArchitectureLayer[];
  pricing: PricingTier[];
  roadmap: RoadmapStage[];
  faq: FaqItem[];
};

export const demoData = demoJson as DemoData;

/** Max allowed risk score (1–10). Actions with risk > maxAllowed are blocked (mirrors platform policy intuition). */
export function isActionAllowed(actionRisk: number, maxAllowedRisk: number): boolean {
  return actionRisk <= maxAllowedRisk;
}
