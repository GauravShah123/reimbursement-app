import { useEffect, useRef, useState } from "react";

// Smoothly tweens a displayed number toward a target (e.g. the CAD total).
// Re-targets on every change, so live edits glide instead of jumping.
// Honors prefers-reduced-motion by snapping to the value.
export function useCountUp(target: number, duration = 320): number {
  const [val, setVal] = useState(target);
  const valRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    valRef.current = val;
  });

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      setVal(target);
      return;
    }
    const from = valRef.current;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return val;
}
