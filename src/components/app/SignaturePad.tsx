"use client";

import { useEffect, useRef } from "react";

/**
 * Finger signature box. Calls onChange with a compact SVG path ("M x y L x y ...")
 * in a 300x120 coordinate space, or "" when cleared.
 */
export default function SignaturePad({ onChange }: { onChange: (path: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const path = useRef<string[]>([]);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#3d2c29";
  }, []);

  function point(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }
  const scaled = (p: { x: number; y: number; w: number; h: number }) =>
    `${Math.round((p.x / p.w) * 300)} ${Math.round((p.y / p.h) * 120)}`;

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    path.current.push(`M ${scaled(p)}`);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    path.current.push(`L ${scaled(p)}`);
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(path.current.join(" "));
  }
  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    path.current = [];
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={canvas}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Signature box. Sign with your finger."
        className="h-32 w-full touch-none rounded-2xl border-2 border-dashed border-line bg-cream"
      />
      <div className="mt-1 flex justify-between text-xs text-ink-soft">
        <span>Sign with your finger</span>
        <button type="button" onClick={clear} className="font-semibold text-peach-dark">Clear</button>
      </div>
    </div>
  );
}

export function SignatureView({ path, className = "" }: { path: string | null; className?: string }) {
  if (!path) return null;
  return (
    <svg viewBox="0 0 300 120" className={className} aria-label="Signature">
      <path d={path} fill="none" stroke="#3d2c29" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
