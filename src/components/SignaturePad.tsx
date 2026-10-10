import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
};

// Canvas signature pad ported from the original sign.js pointer logic.
export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { onInk?: () => void; className?: string }
>(function SignaturePad({ onInk, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hasInk = useRef(false);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);

    function ctx() {
      return canvasRef.current?.getContext("2d") ?? null;
    }

    function fit() {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      const x = c.getContext("2d");
      if (!x) return;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, rect.width, rect.height);
      x.strokeStyle = "#1a1a1a";
      x.lineWidth = 2.25;
      x.lineCap = "round";
      x.lineJoin = "round";
    }

    useEffect(() => {
      fit();
      const c = canvasRef.current;
      if (!c) return;
      const ro = new ResizeObserver(() => {
        fit();
        hasInk.current = false;
      });
      ro.observe(c);
      return () => ro.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => !hasInk.current,
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
      clear: () => {
        fit();
        hasInk.current = false;
      },
    }));

    function pt(e: React.PointerEvent) {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    return (
      <canvas
        ref={canvasRef}
        className={`sigcanvas${className ? ` ${className}` : ""}`}
        aria-label="Draw your signature here"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.preventDefault();
          drawing.current = true;
          last.current = pt(e);
          canvasRef.current?.setPointerCapture(e.pointerId);
          const x = ctx();
          if (x && last.current) {
            x.beginPath();
            x.arc(last.current.x, last.current.y, x.lineWidth / 2, 0, Math.PI * 2);
            x.fill();
          }
          hasInk.current = true;
          onInk?.();
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          e.preventDefault();
          const x = ctx();
          if (!x) return;
          const p = pt(e);
          x.beginPath();
          x.moveTo(last.current.x, last.current.y);
          x.lineTo(p.x, p.y);
          x.stroke();
          last.current = p;
          hasInk.current = true;
          onInk?.();
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          last.current = null;
          try {
            canvasRef.current?.releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }
        }}
      />
    );
  },
);
