import Dock from "../Dock";
import { WindowConfig } from "../types";

export const DOCK_WINDOW_ID = "system-dock";

export const createDockWindowConfig = (): WindowConfig => ({
  id: DOCK_WINDOW_ID,
  title: "Dock",
  closeable: false,
  minimizable: false,
  resizable: false,
  showInDock: false,
  decorated: false,
  lockSize: true,
  defaultPosition: { x: 20, y: window.innerHeight - 80 },
  defaultSize: { width: 400, height: 54 },
  content: <Dock />,
});
