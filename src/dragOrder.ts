import { ref } from "vue";

// Drag-to-reorder for a vertical list. Rows are the elements matching `selector`,
// in order, each carrying its id in `data-did`. `onDrop` gets the dragged id and
// the index of the gap it was dropped into (0 = before the first row).
export function useDragOrder(selector: string, onDrop: (id: string, to: number) => void) {
  const drag = ref<{ id: string; to: number } | null>(null);
  let start: { id: string; y: number } | null = null;
  let justDragged = false;

  function move(e: MouseEvent) {
    if (!start) return;
    if (!drag.value && Math.abs(e.clientY - start.y) < 5) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
    let to = els.length;
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    drag.value = { id: start.id, to };
  }
  function up() {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    const d = drag.value;
    start = null; drag.value = null;
    if (!d) return;
    onDrop(d.id, d.to);
    // The click that follows the mouseup of a drag must not open the row.
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
  }
  function down(e: MouseEvent, id: string) {
    if (e.button !== 0) return;
    start = { id, y: e.clientY };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  // Classes for a row: dimmed while dragged, and a line where the drop would land.
  function rowClass(id: string, index: number, count: number) {
    const d = drag.value;
    return { dragging: !!d && d.id === id, "drop-before": !!d && d.to === index, "drop-after": !!d && d.to === count && index === count - 1 };
  }
  return { drag, down, rowClass, wasDrag: () => justDragged };
}
