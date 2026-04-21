"use client";

import { useEffect, useRef } from "react";

/**
 * Thin, diagonal rain streaks drawn on a fixed canvas, matching the angle of
 * the Umbrella mark. Pure cosmetic atmosphere — non-interactive, respects
 * prefers-reduced-motion, and pauses when the tab is backgrounded.
 */
export function RainOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    if (prefersReduce?.matches) return;

    type Drop = {
      x: number;
      y: number;
      len: number;
      speed: number;
      opacity: number;
    };

    const DX = 0.28;
    const DY = 1;
    let drops: Drop[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;

    function seed() {
      const count = Math.round((width * height) / 22000);
      drops = Array.from({ length: count }, () => ({
        x: Math.random() * (width + 200) - 100,
        y: Math.random() * height,
        len: 8 + Math.random() * 22,
        speed: 2.4 + Math.random() * 4.2,
        opacity: 0.06 + Math.random() * 0.18,
      }));
    }

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function tick() {
      if (!running || !ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineWidth = 1;
      for (const d of drops) {
        ctx.strokeStyle = `rgba(200, 215, 235, ${d.opacity})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + DX * d.len, d.y + DY * d.len);
        ctx.stroke();
        d.x += DX * d.speed;
        d.y += DY * d.speed;
        if (d.y > height + 24 || d.x > width + 24) {
          d.y = -24 - Math.random() * 40;
          d.x = Math.random() * (width + 200) - 200;
        }
      }
      raf = window.requestAnimationFrame(tick);
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        window.cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = window.requestAnimationFrame(tick);
      }
    }

    resize();
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] opacity-80 mix-blend-screen"
    />
  );
}
