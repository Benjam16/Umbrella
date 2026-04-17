import { BLUEPRINTS } from "@umbrella/shared";
import { store } from "../store.js";

export type MissionBlueprint = {
  id: string;
  name: string;
  description: string;
  initialMission: string;
  suggestedMaxCredits: number;
  category: "shopping" | "growth" | "support" | "crypto" | "devops";
  suggestedFilenames: string[];
  mintedFromRunId?: string;
  mintedAt?: string;
  icon?: string;
  missionVariables?: string[];
};

const mappedFromShared: MissionBlueprint[] = BLUEPRINTS.map((bp) => ({
  id: bp.id,
  name: bp.title,
  description: bp.summary,
  initialMission: bp.objectiveTemplate,
  suggestedMaxCredits: bp.suggestedMaxCredits,
  category: bp.category,
  suggestedFilenames: [`${bp.id}-report`, `${bp.id}-insights`, `${bp.id}-strategy`],
}));

const marketResearchToStrategy: MissionBlueprint = {
  id: "market-research-to-strategy",
  name: "Market Research to Strategy",
  description:
    "Scrape competitors in parallel, synthesize differentiation, and draft a marketing strategy file.",
  initialMission:
    "Run a Competitor Intelligence mission.\n" +
    "1) Scrape these competitor URLs in parallel: https://example.com/pricing, https://example.org/pricing, https://example.net/pricing.\n" +
    "2) Compare value props, pricing, CTA, and onboarding friction. Produce a Competitive Advantage JSON.\n" +
    "3) Create marketing/STRATEGY.md with messaging, offer, and launch plan to beat competitors.",
  suggestedMaxCredits: 320,
  category: "growth",
  suggestedFilenames: [
    "competitor-1-pricing-snapshot",
    "competitor-2-pricing-snapshot",
    "competitor-3-pricing-snapshot",
    "competitive-advantage-json",
    "go-to-market-strategy",
  ],
};

export function listMissionBlueprints(userId: string): MissionBlueprint[] {
  const minted = store.listMintedBlueprintsByUser(userId).map((bp) => ({
    id: bp.id,
    name: bp.name,
    description: bp.description,
    initialMission: bp.initialMission,
    suggestedMaxCredits: bp.suggestedMaxCredits,
    category: bp.category,
    suggestedFilenames: bp.suggestedFilenames,
    mintedFromRunId: bp.sourceRunId,
    mintedAt: bp.createdAt,
    icon: bp.icon,
    missionVariables: bp.missionVariables,
  }));
  return [...minted, marketResearchToStrategy, ...mappedFromShared];
}
