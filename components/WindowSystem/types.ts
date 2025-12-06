export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export type DockedPosition = "none" | "left" | "right";

export type MinimizeBehavior = "hide" | "collapse";

export interface MagneticSnap {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
  windowId?: string; // ID of window this is snapped to
  windowEdge?: "left" | "right" | "top" | "bottom"; // Which edge of target window we're snapped to
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  id: string;
  title: string;
  isMinimized: boolean;
  minimizeBehavior?: MinimizeBehavior;
  isFocused: boolean;
  position: WindowPosition;
  size: WindowSize;
  zIndex: number;
  closeable: boolean;
  minimizable: boolean;
  resizable: boolean;
  resizableX?: boolean;
  resizableY?: boolean;
  showInDock: boolean;
  decorated: boolean;
  pinned?: boolean;
  lockSize?: boolean;
  lockHeight?: boolean;
  dockable?: boolean;
  docked?: DockedPosition;
  beforeDockedState?: { position: WindowPosition; size: WindowSize };
  magneticSnap?: MagneticSnap;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

export interface WindowConfig {
  id: string;
  title: string;
  minimizeBehavior?: MinimizeBehavior;
  closeable?: boolean;
  minimizable?: boolean;
  resizable?: boolean;
  resizableX?: boolean;
  resizableY?: boolean;
  showInDock?: boolean;
  decorated?: boolean;
  pinned?: boolean;
  lockSize?: boolean;
  lockHeight?: boolean;
  dockable?: boolean;
  icon?: React.ReactNode;
  defaultPosition?: WindowPosition;
  defaultSize?: WindowSize;
  content: React.ReactNode;
}

export interface StoredWindowState {
  position: WindowPosition;
  size: WindowSize;
  isMinimized: boolean;
  docked?: DockedPosition;
  magneticSnap?: MagneticSnap;
}

export type WindowsStorage = Record<string, StoredWindowState>;
