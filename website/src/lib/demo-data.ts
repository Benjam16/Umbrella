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

export type DemoData = {
  heroCommand: string;
  mission: { title: string; objective: string };
  heroLogs: string[];
  dag: { nodes: DagNode[]; edges: DagEdge[] };
  toolActions: ToolActionDemo[];
  selfHealSnippet: { fail: string; fix: string; pass: string };
  ceoBriefing: string;
};

export const demoData = demoJson as DemoData;

/** Max allowed risk score (1–10). Actions with risk > maxAllowed are blocked (mirrors platform policy intuition). */
export function isActionAllowed(actionRisk: number, maxAllowedRisk: number): boolean {
  return actionRisk <= maxAllowedRisk;
}
