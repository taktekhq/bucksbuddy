import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion, useMotionValue, type PanInfo } from "framer-motion";
import { Trash2 } from "lucide-react";

// Swipe a row left to reveal a Delete action — same mechanic as the main
// HistoryList, but delete-only (no edit). The content must be opaque so the
// action stays hidden until revealed.
const ACTION_W = 76; // px revealed
const AUTO_RESET_MS = 2000; // close an open row if no action is taken

export function SwipeToDelete({
  onDelete,
  className = "",
  deleteColor = "#FF3B30",
  children,
}: {
  onDelete: () => void;
  className?: string;
  deleteColor?: string;
  children: ReactNode;
}) {
  const x = useMotionValue(0);
  const moved = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearResetTimer() {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }

  function snapTo(target: number) {
    animate(x, target, { type: "tween", duration: 0.16, ease: [0.2, 0, 0, 1] });
    clearResetTimer();
    if (target !== 0) {
      resetTimer.current = setTimeout(() => snapTo(0), AUTO_RESET_MS);
    }
  }

  useEffect(() => clearResetTimer, []);

  function onDragEnd(_: unknown, info: PanInfo) {
    const projected = x.get() + info.velocity.x * 0.08;
    if (projected <= -ACTION_W / 2) snapTo(-ACTION_W);
    else snapTo(0);
  }

  function onContentClick() {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (x.get() !== 0) snapTo(0);
  }

  return (
    <div className="relative overflow-hidden rounded-card">
      {/* Delete revealed by swiping left. */}
      <button
        type="button"
        aria-label="Delete"
        onClick={() => {
          snapTo(0);
          onDelete();
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center text-white"
        style={{ width: ACTION_W, backgroundColor: deleteColor }}
      >
        <Trash2 className="h-5 w-5" strokeWidth={2} />
      </button>

      <motion.div
        drag="x"
        dragConstraints={{ left: -ACTION_W, right: 0 }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragStart={clearResetTimer}
        onDrag={(_, info) => {
          if (Math.abs(info.offset.x) > 6) moved.current = true;
        }}
        onDragEnd={onDragEnd}
        onClick={onContentClick}
        style={{ x }}
        className={`relative ${className}`}
      >
        {children}
      </motion.div>
    </div>
  );
}
