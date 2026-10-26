"use client";

/*
 * Decorative 3D background: floating PDF sheets that drift, tilt and spin as
 * the page scrolls. Pure CSS 3D + one passive scroll listener (rAF-throttled).
 * It is aria-hidden, ignores the pointer, and is static for users who prefer
 * reduced motion.
 */

import { useEffect, useRef } from "react";

type Sheet = {
  left: string; top: string; w: number; rot: number; tiltX: number; tiltY: number;
  speed: number; spin: number; delay: number; mobile?: boolean; label: string;
};

const SHEETS: Sheet[] = [
  { left: "3%", top: "6%", w: 150, rot: -14, tiltX: 18, tiltY: -24, speed: -0.16, spin: 0.035, delay: 0, mobile: true, label: "PDF" },
  { left: "86%", top: "10%", w: 130, rot: 12, tiltX: 14, tiltY: 28, speed: -0.24, spin: -0.04, delay: -2, mobile: true, label: "PDF" },
  { left: "90%", top: "46%", w: 170, rot: -8, tiltX: 20, tiltY: -30, speed: -0.12, spin: 0.03, delay: -4, label: "PDF" },
  { left: "1%", top: "52%", w: 140, rot: 10, tiltX: 12, tiltY: 26, speed: -0.2, spin: -0.03, delay: -1, label: "PDF" },
  { left: "78%", top: "78%", w: 120, rot: 16, tiltX: 16, tiltY: -22, speed: -0.3, spin: 0.05, delay: -3, mobile: true, label: "PDF" },
  { left: "10%", top: "86%", w: 160, rot: -12, tiltX: 14, tiltY: 20, speed: -0.1, spin: -0.035, delay: -5, label: "PDF" },
];

export default function PdfBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      el.style.setProperty("--sy", String(Math.round(window.scrollY)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="pdfbg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span className="pdfbg-orb pdfbg-orb-a" />
      <span className="pdfbg-orb pdfbg-orb-b" />
      {SHEETS.map((s, i) => (
        <div
          key={i}
          className={`pdfbg-pos ${s.mobile ? "" : "hidden md:block"}`}
          style={{
            left: s.left, top: s.top, width: s.w,
            ["--speed" as string]: s.speed, ["--spin" as string]: s.spin,
            ["--rot" as string]: `${s.rot}deg`, ["--tx" as string]: `${s.tiltX}deg`, ["--ty" as string]: `${s.tiltY}deg`,
          }}
        >
          <div className="pdfbg-float" style={{ animationDelay: `${s.delay}s` }}>
            <div className="pdfbg-sheet">
              <span className="pdfbg-badge">{s.label}</span>
              <i /><i /><i /><i className="short" />
              <b />
              <i /><i className="short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
