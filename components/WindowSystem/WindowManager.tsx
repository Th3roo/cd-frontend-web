import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  FC,
} from "react";

import {
  WindowState,
  WindowConfig,
  WindowPosition,
  WindowSize,
  DockedPosition,
  WindowBounds,
} from "./types";
import {
  saveWindowState,
  getStoredWindowState,
  clampPosition,
  applyDefaultLayout,
  resetToDefaultLayout,
} from "./utils";

interface WindowManagerContextType {
  windows: WindowState[];
  openWindow: (config: WindowConfig) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  updateWindowPosition: (id: string, position: WindowPosition) => void;
  updateWindowSize: (id: string, size: WindowSize) => void;
  updateWindowContent: (id: string, content: ReactNode) => void;
  dockWindow: (id: string, position: DockedPosition) => void;
  undockWindow: (id: string) => void;
  getDockedBounds: (position: DockedPosition) => WindowBounds;
  updateMagneticSnap: (id: string, snap: any) => void;
  resetWindowLayout: () => Promise<void>;
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
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  // Load default layout on first mount
  useEffect(() => {
    applyDefaultLayout().then(() => {
      setLayoutLoaded(true);
    });
  }, []);

  // Recalculate magnetic snap positions after all windows are loaded
  useEffect(() => {
    if (!layoutLoaded || windows.length === 0) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    setWindows((prev) => {
      // Topological sort: process windows in order of dependencies
      // Windows without dependencies (no windowId snap) go first
      const windowsById = new Map(prev.map((w) => [w.id, w]));
      const processed = new Set<string>();
      const updatedWindows = new Map<string, WindowState>();

      // Helper function to get dependency depth
      const getDependencyDepth = (
        windowId: string,
        visited = new Set<string>(),
      ): number => {
        if (visited.has(windowId)) {
          return 0;
        } // Circular dependency, treat as depth 0
        visited.add(windowId);

        const window = windowsById.get(windowId);
        if (!window || !window.magneticSnap?.windowId) {
          return 0;
        }

        const targetId = window.magneticSnap.windowId;
        return 1 + getDependencyDepth(targetId, visited);
      };

      // Sort windows by dependency depth
      const sortedWindows = [...prev].sort((a, b) => {
        const depthA = getDependencyDepth(a.id);
        const depthB = getDependencyDepth(b.id);
        return depthA - depthB;
      });

      // Process windows in order
      for (const w of sortedWindows) {
        // Skip docked windows
        if (w.docked !== "none") {
          updatedWindows.set(w.id, w);
          processed.add(w.id);
          continue;
        }

        // Only process windows with magnetic snap
        if (!w.magneticSnap || Object.keys(w.magneticSnap).length === 0) {
          updatedWindows.set(w.id, w);
          processed.add(w.id);
          continue;
        }

        let newX = w.position.x;
        let newY = w.position.y;
        let needsUpdate = false;

        // Handle screen edge snaps
        if (w.magneticSnap.left) {
          newX = 0;
          needsUpdate = true;
        } else if (w.magneticSnap.right) {
          newX = viewportWidth - w.size.width;
          needsUpdate = true;
        }

        if (w.magneticSnap.top) {
          newY = 0;
          needsUpdate = true;
        } else if (w.magneticSnap.bottom) {
          newY = viewportHeight - w.size.height;
          needsUpdate = true;
        }

        // Handle window-to-window snaps
        if (w.magneticSnap.windowId && w.magneticSnap.windowEdge) {
          // Get the already processed target window (or original if not yet processed)
          const targetWindow =
            updatedWindows.get(w.magneticSnap.windowId) ||
            windowsById.get(w.magneticSnap.windowId);

          if (targetWindow) {
            const targetRight =
              targetWindow.position.x + targetWindow.size.width;
            const targetBottom =
              targetWindow.position.y + targetWindow.size.height;

            switch (w.magneticSnap.windowEdge) {
              case "left":
                newX = targetWindow.position.x - w.size.width;
                needsUpdate = true;
                break;
              case "right":
                newX = targetRight;
                needsUpdate = true;
                break;
              case "top":
                newY = targetWindow.position.y - w.size.height;
                needsUpdate = true;
                break;
              case "bottom":
                newY = targetBottom;
                needsUpdate = true;
                break;
            }
          }
        }

        if (needsUpdate) {
          const clampedPosition = clampPosition(
            { x: newX, y: newY },
            w.size.width,
            w.size.height,
          );

          saveWindowState(
            w.id,
            clampedPosition,
            w.size,
            w.isMinimized,
            w.docked,
            w.magneticSnap,
          );

          const updatedWindow = { ...w, position: clampedPosition };
          updatedWindows.set(w.id, updatedWindow);
          processed.add(w.id);
        } else {
          updatedWindows.set(w.id, w);
          processed.add(w.id);
        }
      }

      // Return windows in original order with updated positions
      return prev.map((w) => updatedWindows.get(w.id) || w);
    });
  }, [layoutLoaded, windows.length]);

  const getDockedBounds = useCallback(
    (position: DockedPosition): WindowBounds => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      switch (position) {
        case "left":
          return {
            x: 0,
            y: 0,
            width: viewportWidth / 2,
            height: viewportHeight,
          };
        case "right":
          return {
            x: viewportWidth / 2,
            y: 0,
            width: viewportWidth / 2,
            height: viewportHeight,
          };
        case "none":
        default:
          return { x: 0, y: 0, width: 0, height: 0 };
      }
    },
    [],
  );

  // Обработчик изменения размера вьюпорта
  useEffect(() => {
    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      setWindows((prev) =>
        prev.map((w) => {
          // Update docked windows to new viewport size
          if (w.docked !== "none") {
            const bounds = getDockedBounds(w.docked);
            return {
              ...w,
              position: { x: bounds.x, y: bounds.y },
              size: { width: bounds.width, height: bounds.height },
            };
          }

          // For non-docked windows with magnetic snap, recalculate position
          if (w.magneticSnap && Object.keys(w.magneticSnap).length > 0) {
            let newX = w.position.x;
            let newY = w.position.y;

            // Handle screen edge snaps
            if (w.magneticSnap.left) {
              newX = 0;
            } else if (w.magneticSnap.right) {
              newX = viewportWidth - w.size.width;
            }

            if (w.magneticSnap.top) {
              newY = 0;
            } else if (w.magneticSnap.bottom) {
              newY = viewportHeight - w.size.height;
            }

            // Handle window-to-window snaps
            if (w.magneticSnap.windowId && w.magneticSnap.windowEdge) {
              const targetWindow = prev.find(
                (tw) => tw.id === w.magneticSnap?.windowId,
              );
              if (targetWindow) {
                // Recalculate position relative to target window based on stored edge
                const targetRight =
                  targetWindow.position.x + targetWindow.size.width;
                const targetBottom =
                  targetWindow.position.y + targetWindow.size.height;

                switch (w.magneticSnap.windowEdge) {
                  case "left":
                    // Snapped to left edge of target (we are to the left of target)
                    newX = targetWindow.position.x - w.size.width;
                    break;
                  case "right":
                    // Snapped to right edge of target (we are to the right of target)
                    newX = targetRight;
                    break;
                  case "top":
                    // Snapped to top edge of target (we are above target)
                    newY = targetWindow.position.y - w.size.height;
                    break;
                  case "bottom":
                    // Snapped to bottom edge of target (we are below target)
                    newY = targetBottom;
                    break;
                }
              }
            }

            // Clamp to viewport bounds
            const clampedPosition = clampPosition(
              { x: newX, y: newY },
              w.size.width,
              w.size.height,
            );

            if (
              clampedPosition.x !== w.position.x ||
              clampedPosition.y !== w.position.y
            ) {
              saveWindowState(
                w.id,
                clampedPosition,
                w.size,
                w.isMinimized,
                w.docked,
                w.magneticSnap,
              );
              return { ...w, position: clampedPosition };
            }
          } else {
            // Non-snapped windows: just clamp to viewport
            const clampedPosition = clampPosition(
              w.position,
              w.size.width,
              w.size.height,
            );

            if (
              clampedPosition.x !== w.position.x ||
              clampedPosition.y !== w.position.y
            ) {
              saveWindowState(
                w.id,
                clampedPosition,
                w.size,
                w.isMinimized,
                w.docked,
                w.magneticSnap,
              );
              return { ...w, position: clampedPosition };
            }
          }

          return w;
        }),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [getDockedBounds]);

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

        // Restore docked and magneticSnap state from storage
        const restoredDocked = stored?.docked ?? "none";
        const restoredMagneticSnap = stored?.magneticSnap ?? {};
        const defaultPosition: WindowPosition = config.defaultPosition || {
          x: 100,
          y: 100,
        };
        const defaultSize: WindowSize = config.defaultSize || {
          width: 400,
          height: 300,
        };

        // Для окон с lockSize всегда используем defaultSize, игнорируем localStorage
        // Для окон с lockHeight блокируем только высоту
        const position = stored?.position || defaultPosition;
        const size =
          config.lockSize === true
            ? defaultSize
            : config.lockHeight === true && stored?.size
              ? { width: stored.size.width, height: defaultSize.height }
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
          minimizeBehavior: config.minimizeBehavior,
          isFocused: true,
          position: clampedPosition,
          size,
          zIndex: nextZIndex,
          closeable: config.closeable ?? true,
          minimizable: config.minimizable ?? true,
          resizable: config.resizable ?? true,
          resizableX: config.resizableX ?? config.resizable ?? true,
          resizableY: config.resizableY ?? config.resizable ?? true,
          showInDock: config.showInDock ?? true,
          decorated: config.decorated ?? true,
          pinned: config.pinned ?? false,
          lockSize: config.lockSize ?? false,
          lockHeight: config.lockHeight ?? false,
          dockable: config.dockable ?? true,
          docked: restoredDocked,
          beforeDockedState: undefined,
          magneticSnap: restoredMagneticSnap,
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
          saveWindowState(
            id,
            w.position,
            w.size,
            true,
            w.docked,
            w.magneticSnap,
          );
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
            saveWindowState(
              id,
              w.position,
              w.size,
              false,
              w.docked,
              w.magneticSnap,
            );
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
            saveWindowState(
              id,
              clampedPosition,
              w.size,
              w.isMinimized,
              w.docked,
              w.magneticSnap,
            );
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
          saveWindowState(
            id,
            w.position,
            size,
            w.isMinimized,
            w.docked,
            w.magneticSnap,
          );
          return { ...w, size };
        }
        return w;
      }),
    );
  }, []);

  const updateWindowContent = useCallback((id: string, content: ReactNode) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          return { ...w, content };
        }
        return w;
      }),
    );
  }, []);

  const undockWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id && w.docked !== "none" && w.beforeDockedState) {
          const updated = {
            ...w,
            docked: "none" as DockedPosition,
            position: w.beforeDockedState.position,
            size: w.beforeDockedState.size,
            beforeDockedState: undefined,
          };
          // Save the undocked state
          saveWindowState(
            w.id,
            w.beforeDockedState.position,
            w.beforeDockedState.size,
            w.isMinimized,
            "none",
            w.magneticSnap,
          );
          return updated;
        }
        return w;
      }),
    );
  }, []);

  const dockWindow = useCallback(
    (id: string, position: DockedPosition) => {
      if (position === "none") {
        undockWindow(id);
        return;
      }

      setWindows((prev) =>
        prev.map((w) => {
          if (w.id === id && w.dockable !== false) {
            const bounds = getDockedBounds(position);
            const updated = {
              ...w,
              docked: position,
              beforeDockedState:
                w.docked === "none"
                  ? { position: w.position, size: w.size }
                  : w.beforeDockedState,
              position: { x: bounds.x, y: bounds.y },
              size: { width: bounds.width, height: bounds.height },
            };
            // Save the docked state
            saveWindowState(
              w.id,
              { x: bounds.x, y: bounds.y },
              { width: bounds.width, height: bounds.height },
              w.isMinimized,
              position,
              w.magneticSnap,
            );
            return updated;
          }
          return w;
        }),
      );
    },
    [getDockedBounds, undockWindow],
  );

  const updateMagneticSnap = useCallback((id: string, snap: any) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === id) {
          return { ...w, magneticSnap: snap };
        }
        return w;
      }),
    );
  }, []);

  const resetWindowLayout = useCallback(async () => {
    const success = await resetToDefaultLayout();
    if (success) {
      // Force reload to apply new layout
      window.location.reload();
    }
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
    updateWindowContent,
    dockWindow,
    undockWindow,
    getDockedBounds,
    updateMagneticSnap,
    resetWindowLayout,
  };

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
};
