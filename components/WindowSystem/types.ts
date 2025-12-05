export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowState {
  id: string;
  title: string;
  isMinimized: boolean;
  isFocused: boolean;
  position: WindowPosition;
  size: WindowSize;
  zIndex: number;
  closeable: boolean;
  minimizable: boolean;
  resizable: boolean;
  showInDock: boolean;
  decorated: boolean;
  pinned?: boolean;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

export interface WindowConfig {
  id: string;
  title: string;
  closeable?: boolean;
  minimizable?: boolean;
  resizable?: boolean;
  showInDock?: boolean;
  decorated?: boolean;
  pinned?: boolean;
  icon?: React.ReactNode;
  defaultPosition?: WindowPosition;
  defaultSize?: WindowSize;
  content: React.ReactNode;
}

export interface StoredWindowState {
  position: WindowPosition;
  size: WindowSize;
  isMinimized: boolean;
}

export type WindowsStorage = Record<string, StoredWindowState>;
