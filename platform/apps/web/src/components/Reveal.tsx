"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Vertical travel distance in px (kept small to avoid layout churn). */
  offset?: number;
  /** How long the element stays fully visible in the middle of its travel. */
  plateau?: "short" | "normal" | "long";
};

const PLATEAU_STOPS: Record<NonNullable<Props["plateau"]>, [number, number, number, number]> = {
  short: [0.0, 0.2, 0.8, 1.0],
  normal: [0.0, 0.18, 0.85, 1.0],
  long: [0.0, 0.12, 0.9, 1.0],
};

/**
 * Scroll-linked reveal.
 * Instead of toggling between "in view" / "out of view" (which flickers at the
 * boundary and re-rasterizes text when you use a blur filter), this maps the
 * element's own scroll progress to opacity + translateY. Purely GPU-composited,
 * no blur, no hysteresis — so text never glitches while you scroll.
 */
export function Reveal({
  children,
  className,
  offset = 16,
  plateau = "normal",
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const stops = PLATEAU_STOPS[plateau];
  const opacity = useTransform(scrollYProgress, stops, [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, stops, [offset, 0, 0, -offset]);

  if (reduce) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      style={{ opacity, y, willChange: "opacity, transform" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
