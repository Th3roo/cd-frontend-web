import { useRef, useState, useEffect, FC } from "react";

import { WindowState } from "./types";
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

  const handleMouseDown = (e: React.MouseEvent) => {
    // Для неоформленных окон - перетаскивание работает везде
    // Для оформленных - игнорируем клики по кнопкам
    if (window.decorated && (e.target as HTMLElement).closest("button")) {
      return;
    }

    focusWindow(window.id);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - window.position.x,
      y: e.clientY - window.position.y,
    });
  };

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      updateWindowPosition(window.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset, window.id, updateWindowPosition]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (!window.resizable) {
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

      const newWidth = Math.max(200, resizeStart.width + deltaX);
      const newHeight = Math.max(150, resizeStart.height + deltaY);

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
    <div
      ref={windowRef}
      data-window
      className={`absolute overflow-hidden ${
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
        cursor: isDragging ? "grabbing" : window.decorated ? "default" : "grab",
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

      {/* Resize handle (только если resizable === true и decorated === true) */}
      {window.resizable && window.decorated && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize group"
          style={{ zIndex: 10 }}
          title="Изменить размер"
        >
          <div className="absolute bottom-1 right-1 w-4 h-4 border-r-2 border-b-2 border-gray-500 group-hover:border-gray-300 transition-colors opacity-60 group-hover:opacity-100" />
          <div className="absolute bottom-2 right-2 w-2 h-2 border-r-2 border-b-2 border-gray-500 group-hover:border-gray-300 transition-colors opacity-40 group-hover:opacity-80" />
        </div>
      )}
    </div>
  );
};

export default Window;
