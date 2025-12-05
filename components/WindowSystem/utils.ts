import {
  WindowsStorage,
  StoredWindowState,
  WindowPosition,
  WindowSize,
} from "./types";

const STORAGE_KEY = "cd-window-system";

export const loadWindowsState = (): WindowsStorage => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load windows state from localStorage:", error);
  }
  return {};
};

export const saveWindowsState = (state: WindowsStorage): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save windows state to localStorage:", error);
  }
};

export const saveWindowState = (
  windowId: string,
  position: WindowPosition,
  size: WindowSize,
  isMinimized: boolean,
): void => {
  const currentState = loadWindowsState();
  currentState[windowId] = {
    position,
    size,
    isMinimized,
  };
  saveWindowsState(currentState);
};

export const getStoredWindowState = (
  windowId: string,
): StoredWindowState | null => {
  const state = loadWindowsState();
  return state[windowId] || null;
};

export const removeWindowState = (windowId: string): void => {
  const currentState = loadWindowsState();
  delete currentState[windowId];
  saveWindowsState(currentState);
};

export const clampPosition = (
  position: WindowPosition,
  windowWidth: number,
  windowHeight: number,
): WindowPosition => {
  // Получаем размеры вьюпорта
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Вычисляем границы для позиции окна
  // Окно должно полностью оставаться в пределах вьюпорта
  const minX = 0;
  const maxX = Math.max(0, viewportWidth - windowWidth);

  const minY = 0;
  const maxY = Math.max(0, viewportHeight - windowHeight);

  // Ограничиваем позицию окна в этих пределах
  const clampedX = Math.max(minX, Math.min(position.x, maxX));
  const clampedY = Math.max(minY, Math.min(position.y, maxY));

  return {
    x: clampedX,
    y: clampedY,
  };
};
