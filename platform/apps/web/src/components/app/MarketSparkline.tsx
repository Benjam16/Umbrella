"use client";

import type { MissionEvent, PriceTick } from "@/lib/marketplace";

type Props = {
  spark: PriceTick[];
  missions: MissionEvent[];
  width?: number;
  height?: number;
  /** Visual intent: green for positive momentum, red for negative. */
  tone?: "up" | "down";
  /** Optional hover callback with the t/price under the cursor. */
  onHover?: (tick: PriceTick | null) => void;
};

/**
 * Inline SVG sparkline with two overlays:
 *   1. A price line + gradient fill (the market).
 *   2. "Mission complete" dots placed at the spark tick nearest each event —
 *      this is the "Proof of Work" overlay that makes labor correlation
 *      visible at a glance.
 *
 * Intentionally dependency-free. recharts would bloat the bundle and the v4
 * labor story benefits from the harder edges of hand-drawn SVG.
 */
export function MarketSparkline({
  spark,
  missions,
  width = 260,
  height = 68,
  tone = "up",
  onHover,
}: Props) {
  if (spark.length < 2) return <div style={{ width, height }} />;

  const minP = Math.min(...spark.map((s) => s.price));
  const maxP = Math.max(...spark.map((s) => s.price));
  const minT = spark[0].t;
  const maxT = spark[spark.length - 1].t;
  const pad = 4;
  const xr = width - pad * 2;
  const yr = height - pad * 2;
  const span = maxP - minP || maxP || 1;

  const x = (t: number) => pad + ((t - minT) / (maxT - minT || 1)) * xr;
  const y = (p: number) => pad + (1 - (p - minP) / span) * yr;

  const path = spark
    .map((s, i) => `${i === 0 ? "M" : "L"} ${x(s.t).toFixed(2)} ${y(s.price).toFixed(2)}`)
    .join(" ");
  const area = `${path} L ${x(maxT).toFixed(2)} ${height - pad} L ${x(minT).toFixed(2)} ${height - pad} Z`;

  const stroke = tone === "down" ? "#fb7185" : "#22d3a6";
  const fillTop = tone === "down" ? "rgba(251,113,133,0.28)" : "rgba(34,211,166,0.28)";

  const missionDots = missions
    .filter((m) => m.ts >= minT && m.ts <= maxT)
    .map((m) => {
      // Snap the mission to the nearest spark tick so the dot lands on the
      // actual drawn line, not some interpolated gap.
      let nearest = spark[0];
      for (const s of spark) {
        if (Math.abs(s.t - m.ts) < Math.abs(nearest.t - m.ts)) nearest = s;
      }
      return { m, x: x(nearest.t), y: y(nearest.price) };
    });

  return (
    <svg
      role="img"
      aria-label="agent token price and mission completions, 24h"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      onPointerLeave={() => onHover?.(null)}
      onPointerMove={(e) => {
        if (!onHover) return;
        const rect = (e.target as SVGElement).closest("svg")!.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const relT =
          ((Math.max(pad, Math.min(width - pad, px)) - pad) / xr) * (maxT - minT) + minT;
        let nearest = spark[0];
        for (const s of spark) {
          if (Math.abs(s.t - relT) < Math.abs(nearest.t - relT)) nearest = s;
        }
        onHover(nearest);
      }}
    >
      <defs>
        <linearGradient id={`spark-fill-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} />
          <stop offset="100%" stopColor="rgba(7,8,12,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-fill-${tone})`} />
      <path d={path} stroke={stroke} strokeWidth={1.25} fill="none" strokeLinejoin="round" />
      {missionDots.map((d, i) => (
        <g key={i}>
          <circle cx={d.x} cy={d.y} r={4} fill="#22d3a6" opacity={0.18} />
          <circle cx={d.x} cy={d.y} r={1.8} fill="#22d3a6">
            <title>{`${d.m.label} · +$${d.m.revenueUsd.toFixed(2)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
