import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  FC,
} from "react";

import { WindowState, WindowConfig, WindowPosition, WindowSize } from "./types";
import { saveWindowState, getStoredWindowState, clampPosition } from "./utils";

interface WindowManagerContextType {
  windows: WindowState[];
  openWindow: (config: WindowConfig) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  updateWindowPosition: (id: string, position: WindowPosition) => void;
  updateWindowSize: (id: string, size: WindowSize) => void;
}

const WindowManagerContext = createContext<WindowManagerContextType | null>(
  null,
);

export const useWindowManager = () => {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error(
      "useWindowManager must be used within WindowManagerProvider",
    );
  }
  return context;
};

interface WindowManagerProviderProps {
  children: ReactNode;
}

export const WindowManagerProvider: FC<WindowManagerProviderProps> = ({
  children,
}) => {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [nextZIndex, setNextZIndex] = useState(1000);

  // Обработчик изменения размера вьюпорта
  useEffect(() => {
    const handleResize = () => {
      setWindows((prev) =>
        prev.map((w) => {
          const clampedPosition = clampPosition(
            w.position,
            w.size.width,
            w.size.height,
          );
          // Обновляем позицию только если она изменилась
          if (
            clampedPosition.x !== w.position.x ||
            clampedPosition.y !== w.position.y
          ) {
            saveWindowState(w.id, clampedPosition, w.size, w.isMinimized);
            return { ...w, position: clampedPosition };
          }
          return w;
        }),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const openWindow = useCallback(
    (config: WindowConfig) => {
      setWindows((prev) => {
        // Проверяем, не открыто ли уже окно с таким id
        const existing = prev.find((w) => w.id === config.id);
        if (existing) {
          // Если окно уже открыто, просто фокусируемся на нем
          return prev.map((w) =>
            w.id === config.id
              ? {
                  ...w,
                  isFocused: true,
                  isMinimized: false,
                  zIndex: nextZIndex,
                }
              : { ...w, isFocused: false },
          );
        }

        // Загружаем сохраненное состояние или используем defaults
        const stored = getStoredWindowState(config.id);
        const defaultPosition: WindowPosition = config.defaultPosition || {
          x: 100,
          y: 100,
        };
        const defaultSize: WindowSize = config.defaultSize || {
          width: 400,
          height: 300,
        };

        // Для system-dock всегда используем defaultSize, игнорируем localStorage
        const position = stored?.position || defaultPosition;
        const size =
          config.id === "system-dock"
            ? defaultSize
            : stored?.size || defaultSize;
        const isMinimized = stored?.isMinimized || false;

        const clampedPosition = clampPosition(
          position,
          size.width,
          size.height,
        );

        const newWindow: WindowState = {
          id: config.id,
          title: config.title,
          isMinimized,
          isFocused: true,
          position: clampedPosition,
          size,
          zIndex: nextZIndex,
          closeable: config.closeable ?? true,
          minimizable: config.minimizable ?? true,
          resizable: config.resizable ?? true,
          showInDock: config.showInDock ?? true,
          decorated: config.decorated ?? true,
          pinned: config.pinned ?? false,
          icon: config.icon,
          content: config.content,
        };

        setNextZIndex((z) => z + 1);

        // Снимаем фокус со всех остальных окон
        return [...prev.map((w) => ({ ...w, isFocused: false })), newWindow];
      });
    },
    [nextZIndex],
  );

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const focusWindow = useCallback(
    (id: string) => {
      setWindows((prev) => {
        const window = prev.find((w) => w.id === id);
        if (!window) {
          return prev;
        }

        setNextZIndex((z) => z + 1);

        return prev.map((w) =>
          w.id === id
            ? { ...w, isFocused: true, zIndex: nextZIndex }
            : { ...w, isFocused: false },
        );
      });
    },
    [nextZIndex],
  );

  const minimizeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          const updated = { ...w, isMinimized: true, isFocused: false };
          saveWindowState(id, w.position, w.size, true);
          return updated;
        }
        return w;
      }),
    );
  }, []);

  const restoreWindow = useCallback(
    (id: string) => {
      setWindows((prev) => {
        setNextZIndex((z) => z + 1);

        return prev.map((w) => {
          if (w.id === id) {
            const updated = {
              ...w,
              isMinimized: false,
              isFocused: true,
              zIndex: nextZIndex,
            };
            saveWindowState(id, w.position, w.size, false);
            return updated;
          }
          return { ...w, isFocused: false };
        });
      });
    },
    [nextZIndex],
  );

  const updateWindowPosition = useCallback(
    (id: string, position: WindowPosition) => {
      setWindows((prev) =>
        prev.map((w) => {
          if (w.id === id) {
            const clampedPosition = clampPosition(
              position,
              w.size.width,
              w.size.height,
            );
            saveWindowState(id, clampedPosition, w.size, w.isMinimized);
            return { ...w, position: clampedPosition };
          }
          return w;
        }),
      );
    },
    [],
  );

  const updateWindowSize = useCallback((id: string, size: WindowSize) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          saveWindowState(id, w.position, size, w.isMinimized);
          return { ...w, size };
        }
        return w;
      }),
    );
  }, []);

  const value: WindowManagerContextType = {
    windows,
    openWindow,
    closeWindow,
    focusWindow,
    minimizeWindow,
    restoreWindow,
    updateWindowPosition,
    updateWindowSize,
  };

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
};
