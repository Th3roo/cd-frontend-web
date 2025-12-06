import { Settings } from "lucide-react";

import { KeyBindingManager } from "../../../commands";
import { WindowConfig } from "../types";

import KeybindingsSettings from "./components/KeybindingsSettings";

export const SETTINGS_WINDOW_ID = "settings";

interface SettingsWindowOptions {
  keyBindingManager: KeyBindingManager;
  resetWindowLayout: () => Promise<void>;
  onOpenCasino: () => void;
}

export const createSettingsWindowConfig = ({
  keyBindingManager,
  resetWindowLayout,
  onOpenCasino,
}: SettingsWindowOptions): WindowConfig => ({
  id: SETTINGS_WINDOW_ID,
  title: "Settings",
  closeable: false,
  minimizable: true,
  resizable: true,
  pinned: true,
  icon: <Settings size={20} />,
  defaultPosition: { x: 400, y: 100 },
  defaultSize: { width: 600, height: 500 },
  content: (
    <KeybindingsSettings
      keyBindingManager={keyBindingManager}
      resetWindowLayout={resetWindowLayout}
      onOpenCasino={onOpenCasino}
    />
  ),
});
