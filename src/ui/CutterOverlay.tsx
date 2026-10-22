import { useRef, useState, type PointerEvent } from 'react';

/**
 * The cable cutter: a transparent layer over the diagram. Swiping across
 * cables (or tapping one) marks them; when the finger or mouse is lifted they
 * are cut, all in one step so a single undo brings them back.
 */
export function CutterOverlay({
  onMark,
  onCut,
}: {
  /** Cables currently under the cut line, for highlighting. */
  onMark: (cableIds: string[]) => void;
  onCut: (cableIds: string[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<{ x: number; y: number }[] | null>(null);
  const marked = useRef<string[]>([]);

  /**
   * Cables near a screen point (the overlay itself sits on top, so look through it).
   * Also checks a few points around it: zoomed out, cables are only a few pixels
   * wide, which is hard to hit with a finger.
   */
  const cablesAt = (x: number, y: number) => {
    const r = 10;
    const probes = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    // A cable is drawn with several paths, so the same one can be hit more than once.
    return [
      ...new Set(
        probes
          .flatMap(([dx, dy]) => document.elementsFromPoint(x + dx, y + dy))
          .map((el) => el.closest('.react-flow__edge')?.getAttribute('data-id'))
          .filter((id): id is string => !!id),
      ),
    ];
  };

  const track = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    setPoints((p) => [...(p ?? []), { x: e.clientX - r.left, y: e.clientY - r.top }]);
    const hits = cablesAt(e.clientX, e.clientY).filter((id) => !marked.current.includes(id));
    if (hits.length) {
      marked.current = [...marked.current, ...hits];
      onMark(marked.current);
    }
  };

  return (
    <div
      ref={ref}
      className="chain-overlay cutter-overlay"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        marked.current = [];
        setPoints([]);
        track(e);
      }}
      onPointerMove={(e) => points && track(e)}
      onPointerUp={() => {
        const cut = marked.current;
        marked.current = [];
        setPoints(null);
        onMark([]);
        if (cut.length) onCut(cut);
      }}
      onPointerCancel={() => {
        marked.current = [];
        setPoints(null);
        onMark([]);
      }}
    >
      {points && (
        <svg className="chain-overlay__svg">
          <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
        </svg>
      )}
    </div>
  );
}
