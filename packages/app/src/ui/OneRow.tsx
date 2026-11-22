import { useLayoutEffect, useRef, useState } from "react";

/** A pill narrower than this isn't worth showing cut short: it's left off instead. */
const MIN_PILL = 72;
const GAP = 8;

/**
 * Pills in one row, never more (#114): as many as fit, in order; the last one that only partly fits
 * is cut short with an ellipsis, or left off when there's too little room to read it. Each pill's full
 * name stays its title and accessible name.
 */
export function OneRow<T>({ items, name, onPick, label }: { items: T[]; name: (x: T) => string; onPick: (x: T) => void; label: string }) {
  const row = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ count: number; lastMax?: number }>({ count: items.length });
  const names = items.map(name).join("\n");

  useLayoutEffect(() => {
    const measure = () => {
      const width = row.current?.clientWidth ?? 0;
      const widths = [...(ruler.current?.children ?? [])].map((c) => (c as HTMLElement).offsetWidth);
      let used = 0;
      let count = 0;
      for (const w of widths) {
        const next = used + (count ? GAP : 0) + w;
        if (next <= width) { used = next; count++; continue; }
        // Partly fits: cut it short if what's left is enough to read.
        const left = width - used - (count ? GAP : 0);
        setFit(left >= MIN_PILL || count === 0 ? { count: count + 1, lastMax: Math.max(left, 0) } : { count });
        return;
      }
      setFit({ count });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (row.current) ro.observe(row.current);
    return () => ro.disconnect();
  }, [names]);

  return (
    <div className="onerow" ref={row} role="group" aria-label={label}>
      <div className="onerow-ruler" ref={ruler} aria-hidden="true">
        {items.map((x, i) => <span key={i} className="chip">{name(x)}</span>)}
      </div>
      {items.slice(0, fit.count).map((x, i) => (
        <button key={i} type="button" className="chip" title={name(x)} aria-label={name(x)} onClick={() => onPick(x)}
          style={i === fit.count - 1 && fit.lastMax !== undefined ? { maxWidth: fit.lastMax } : undefined}>
          <span className="chip-text">{name(x)}</span>
        </button>
      ))}
    </div>
  );
}
