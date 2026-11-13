// PROTOTYPE — throwaway floating variant switcher. Hidden in production builds.
import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  children,
}: {
  variants: { key: string; name: string }[];
  current: string;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = variants[(idx + delta + variants.length) % variants.length];
    const params = new URLSearchParams(location.search);
    params.set("variant", next.key);
    navigate(`${location.pathname}?${params}`, { replace: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-fuchsia-500 bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10" title="Previous (←)">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-44 text-center font-mono">
        {variants[idx].key} ({variants[idx].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10" title="Next (→)">
        <ChevronRight className="size-4" />
      </button>
      {children && <div className="flex items-center gap-2 border-l border-white/20 pl-2">{children}</div>}
    </div>
  );
}
