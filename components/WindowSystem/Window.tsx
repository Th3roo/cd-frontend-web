import { useRef, useState, useEffect, FC } from "react";

import { WindowState, DockedPosition } from "./types";
import { useWindowManager } from "./WindowManager";

interface WindowProps {
  window: WindowState;
}

const Window: FC<WindowProps> = ({ window }) => {
  const {
    closeWindow,
    focusWindow,
    minimizeWindow,
    updateWindowPosition,
    updateWindowSize,
    windows,
    dockWindow,
    undockWindow,
    updateMagneticSnap,
  } = useWindowManager();
  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({
    width: 0,
    height: 0,
    mouseX: 0,
    mouseY: 0,
  });
  const [snapZone, setSnapZone] = useState<DockedPosition>("none");

  const SNAP_THRESHOLD = 20;
  const MAGNETIC_THRESHOLD = 10;

  const handleMouseDown = (e: React.MouseEvent) => {
    // Для неоформленных окон - перетаскивание работает везде
    // Для оформленных - игнорируем клики по кнопкам
    if (window.decorated && (e.target as HTMLElement).closest("button")) {
      return;
    }

    focusWindow(window.id);

    if (window.docked !== "none" && window.dockable !== false) {
      undockWindow(window.id);
    }

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - window.position.x,
      y: e.clientY - window.position.y,
    });
  };

  const detectSnapZone = (mouseX: number, mouseY: number): DockedPosition => {
    if (!window.dockable) {return "none";}

    const viewportWidth = globalThis.innerWidth;

    if (mouseX < SNAP_THRESHOLD) {
      return "left";
    } else if (mouseX > viewportWidth - SNAP_THRESHOLD) {
      return "right";
    }

    return "none";
  };

  const applyMagneticSnap = (
    x: number,
    y: number,
  ): { x: number; y: number } => {
    if (!window.dockable) {return { x, y };}

    let newX = x;
    let newY = y;
    const viewportWidth = globalThis.innerWidth;
    const viewportHeight = globalThis.innerHeight;

    const magneticSnap: any = {};
    let snappedToWindow: string | undefined;

    // Snap to screen edges
    if (Math.abs(x) < MAGNETIC_THRESHOLD) {
      newX = 0;
      magneticSnap.left = true;
    } else if (
      Math.abs(x + window.size.width - viewportWidth) < MAGNETIC_THRESHOLD
    ) {
      newX = viewportWidth - window.size.width;
      magneticSnap.right = true;
    }

    if (Math.abs(y) < MAGNETIC_THRESHOLD) {
      newY = 0;
      magneticSnap.top = true;
    } else if (
      Math.abs(y + window.size.height - viewportHeight) < MAGNETIC_THRESHOLD
    ) {
      newY = viewportHeight - window.size.height;
      magneticSnap.bottom = true;
    }

    // Snap to other windows
    windows.forEach((otherWindow) => {
      if (otherWindow.id === window.id || otherWindow.isMinimized) {return;}

      const otherRight = otherWindow.position.x + otherWindow.size.width;
      const otherBottom = otherWindow.position.y + otherWindow.size.height;
      const thisRight = x + window.size.width;
      const thisBottom = y + window.size.height;

      const verticalOverlap = !(
        y > otherBottom || thisBottom < otherWindow.position.y
      );
      if (verticalOverlap) {
        if (Math.abs(thisRight - otherWindow.position.x) < MAGNETIC_THRESHOLD) {
          newX = otherWindow.position.x - window.size.width;
          snappedToWindow = otherWindow.id;
          magneticSnap.windowEdge = "left";
        }
        if (Math.abs(x - otherRight) < MAGNETIC_THRESHOLD) {
          newX = otherRight;
          snappedToWindow = otherWindow.id;
          magneticSnap.windowEdge = "right";
        }
      }

      const horizontalOverlap = !(
        x > otherRight || thisRight < otherWindow.position.x
      );
      if (horizontalOverlap) {
        if (
          Math.abs(thisBottom - otherWindow.position.y) < MAGNETIC_THRESHOLD
        ) {
          newY = otherWindow.position.y - window.size.height;
          snappedToWindow = otherWindow.id;
          magneticSnap.windowEdge = "top";
        }
        if (Math.abs(y - otherBottom) < MAGNETIC_THRESHOLD) {
          newY = otherBottom;
          snappedToWindow = otherWindow.id;
          magneticSnap.windowEdge = "bottom";
        }
      }
    });

    // Update magnetic snap state
    if (Object.keys(magneticSnap).length > 0 || snappedToWindow) {
      if (snappedToWindow) {
        magneticSnap.windowId = snappedToWindow;
      }
      updateMagneticSnap(window.id, magneticSnap);
    } else {
      updateMagneticSnap(window.id, {});
    }

    return { x: newX, y: newY };
  };

  useEffect(() => {
    if (!isDragging) {
      setSnapZone("none");
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      const zone = detectSnapZone(e.clientX, e.clientY);
      setSnapZone(zone);

      const snapped = applyMagneticSnap(newX, newY);
      updateWindowPosition(window.id, { x: snapped.x, y: snapped.y });
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);

      const zone = detectSnapZone(e.clientX, e.clientY);
      if (zone !== "none" && window.dockable !== false) {
        dockWindow(window.id, zone);
      }

      setSnapZone("none");
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    dragOffset,
    window.id,
    window.dockable,
    window.size.width,
    window.size.height,
    updateWindowPosition,
    dockWindow,
    updateMagneticSnap,
    windows,
  ]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (!window.resizable && !window.resizableX && !window.resizableY) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      width: window.size.width,
      height: window.size.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
    });
  };

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStart.mouseX;
      const deltaY = e.clientY - resizeStart.mouseY;

      const newWidth =
        window.resizableX !== false
          ? Math.max(200, resizeStart.width + deltaX)
          : resizeStart.width;
      const newHeight =
        window.resizableY !== false
          ? Math.max(150, resizeStart.height + deltaY)
          : resizeStart.height;

      updateWindowSize(window.id, { width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, resizeStart, window.id, updateWindowSize]);

  if (window.isMinimized) {
    return null;
  }

  return (
    <>
      {isDragging && snapZone !== "none" && (
        <div className="fixed inset-0 pointer-events-none z-[9998]">
          {snapZone === "left" && (
            <div
              className="absolute bg-cyan-500/30 border-2 border-cyan-400 transition-all duration-200"
              style={{
                left: 0,
                top: 0,
                width: `${globalThis.innerWidth / 2}px`,
                height: `${globalThis.innerHeight}px`,
              }}
            >
              <div className="flex items-center justify-center h-full">
                <div className="bg-cyan-500/50 px-6 py-3 rounded-lg backdrop-blur-sm">
                  <span className="text-white font-bold text-lg uppercase tracking-wide">
                    Left
                  </span>
                </div>
              </div>
            </div>
          )}
          {snapZone === "right" && (
            <div
              className="absolute bg-cyan-500/30 border-2 border-cyan-400 transition-all duration-200"
              style={{
                left: `${globalThis.innerWidth / 2}px`,
                top: 0,
                width: `${globalThis.innerWidth / 2}px`,
                height: `${globalThis.innerHeight}px`,
              }}
            >
              <div className="flex items-center justify-center h-full">
                <div className="bg-cyan-500/50 px-6 py-3 rounded-lg backdrop-blur-sm">
                  <span className="text-white font-bold text-lg uppercase tracking-wide">
                    Right
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        ref={windowRef}
        data-window
        className={`absolute overflow-hidden transition-all ${
          window.docked !== "none" ? "duration-300" : "duration-0"
        } ${
          window.decorated
            ? `bg-neutral-900 border rounded-lg shadow-2xl ${
                window.isFocused ? "border-gray-500" : "border-neutral-700"
              }`
            : "bg-transparent"
        }`}
        style={{
          left: `${window.position.x}px`,
          top: `${window.position.y}px`,
          width: `${window.size.width}px`,
          height: `${window.size.height}px`,
          zIndex: window.zIndex,
          cursor: isDragging
            ? "grabbing"
            : window.decorated
              ? "default"
              : "grab",
        }}
        onMouseDown={(e) => {
          if (!window.decorated) {
            handleMouseDown(e);
          } else {
            focusWindow(window.id);
          }
        }}
      >
        {/* Заголовок окна (только если decorated === true) */}
        {window.decorated && (
          <div
            data-window-header
            className={`flex items-center justify-between px-3 py-2 border-b select-none ${
              window.isFocused
                ? "bg-neutral-800 border-neutral-700"
                : "bg-neutral-850 border-neutral-750"
            }`}
            onMouseDown={handleMouseDown}
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
          >
            <span className="text-sm font-medium text-gray-300">
              {window.title}
            </span>
            <div className="flex items-center gap-1">
              {/* Кнопка свернуть (только если minimizable === true) */}
              {window.minimizable && (
                <button
                  onClick={() => minimizeWindow(window.id)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-700 transition-colors"
                  title="Minimize"
                >
                  <svg
                    className="w-3 h-3 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 12H4"
                    />
                  </svg>
                </button>
              )}
              {/* Кнопка закрыть (только если closeable === true) */}
              {window.closeable && (
                <button
                  onClick={() => closeWindow(window.id)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-600 transition-colors"
                  title="Close"
                >
                  <svg
                    className="w-3 h-3 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Содержимое окна */}
        <div
          className={`w-full overflow-auto ${
            window.decorated ? "h-[calc(100%-40px)] bg-neutral-900" : "h-full"
          }`}
        >
          {window.content}
        </div>

        {/* Resize handle (только если resizable или resizableX/resizableY === true) */}
        {(window.resizable || window.resizableX || window.resizableY) && (
          <div
            onMouseDown={handleResizeMouseDown}
            className={`absolute bottom-0 right-0 w-5 h-5 group ${
              window.resizableX && window.resizableY
                ? "cursor-nwse-resize"
                : window.resizableX
                  ? "cursor-ew-resize"
                  : "cursor-ns-resize"
            }`}
            style={{ zIndex: 10 }}
            title="Изменить размер"
          >
            <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-gray-500 group-hover:border-gray-300 transition-colors opacity-60 group-hover:opacity-100" />
            <div className="absolute bottom-2 right-2 w-2 h-2 border-r-2 border-b-2 border-gray-500 group-hover:border-gray-300 transition-colors opacity-40 group-hover:opacity-80" />
          </div>
        )}
      </div>
    </>
  );
};

export default Window;
