export type Blueprint = {
  id: string;
  title: string;
  category: "shopping" | "growth" | "support" | "crypto" | "devops";
  summary: string;
  objectiveTemplate: string;
  suggestedMaxCredits: number;
};

export const BLUEPRINTS: Blueprint[] = [
  {
    id: "price-tracker",
    title: "Web Scraper for Price Tracking",
    category: "shopping",
    summary: "Track prices across multiple stores and suggest best-buy options.",
    objectiveTemplate:
      "Scrape 10 target stores for this product, compare price + shipping + return policy, and prepare a ranked purchase recommendation with links.",
    suggestedMaxCredits: 250,
  },
  {
    id: "crypto-portfolio-monitor",
    title: "Crypto Portfolio Monitor",
    category: "crypto",
    summary: "Watch wallet activity and suggest risk-aware portfolio actions.",
    objectiveTemplate:
      "Monitor my Base wallet and summarize notable portfolio changes, yield opportunities, and risk alerts. If a rebalance action is recommended, propose the transaction for signature.",
    suggestedMaxCredits: 300,
  },
  {
    id: "funnel-optimizer",
    title: "Funnel Optimizer",
    category: "growth",
    summary: "Analyze funnel pages and propose high-impact conversion improvements.",
    objectiveTemplate:
      "Analyze my landing page and funnel copy, identify conversion blockers, and generate prioritized CRO tasks with implementation suggestions.",
    suggestedMaxCredits: 220,
  },
  {
    id: "social-growth-bot",
    title: "Social Growth Bot",
    category: "growth",
    summary: "Draft and schedule engagement-oriented social post ideas.",
    objectiveTemplate:
      "Generate a 7-day content plan for my project with post drafts, hooks, and CTA variants. Include A/B post angles and a lightweight review checklist.",
    suggestedMaxCredits: 180,
  },
  {
    id: "support-agent",
    title: "24/7 Support Agent",
    category: "support",
    summary: "Draft support answers grounded in product documentation.",
    objectiveTemplate:
      "Create a support playbook from my docs and prepare high-quality draft replies for common user questions with escalation rules.",
    suggestedMaxCredits: 200,
  },
];
