import { Settings, Users } from "lucide-react";
import { FC, useEffect, useRef } from "react";

import Dock from "./Dock";
import { useWindowManager } from "./WindowManager";
import { getStoredWindowState } from "./utils";
import Window from "./Window";
import KeybindingsSettings from "../KeybindingsSettings";
import { TurnOrderWindow } from "../TurnOrderWindow";
import { TurnOrderBar } from "../TurnOrderBar";
import { KeyBindingManager } from "../../commands";
import { Entity } from "../../types";

const DOCK_WINDOW_ID = "system-dock";
const SETTINGS_WINDOW_ID = "settings";
const TURN_ORDER_WINDOW_ID = "turn-order";
const TURN_ORDER_BAR_WINDOW_ID = "turn-order-bar";

interface WindowSystemProps {
  keyBindingManager: KeyBindingManager;
  entities?: Entity[];
  activeEntityId?: string | null;
  playerId?: string | null;
  onEntityClick?: (entityId: string) => void;
}

const WindowSystem: FC<WindowSystemProps> = ({
  keyBindingManager,
  entities = [],
  activeEntityId = null,
  playerId = null,
  onEntityClick,
}) => {
  const { windows, openWindow, minimizeWindow, updateWindowContent } =
    useWindowManager();
  const turnOrderBarInitializedRef = useRef(false);

  // Автоматически открываем Dock и Settings при монтировании
  useEffect(() => {
    const dockExists = windows.some((w) => w.id === DOCK_WINDOW_ID);
    if (!dockExists) {
      openWindow({
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
    }

    const settingsExists = windows.some((w) => w.id === SETTINGS_WINDOW_ID);
    if (!settingsExists) {
      openWindow({
        id: SETTINGS_WINDOW_ID,
        title: "Settings",
        closeable: false,
        minimizable: true,
        resizable: true,
        pinned: true,
        icon: <Settings size={20} />,
        defaultPosition: { x: 400, y: 100 },
        defaultSize: { width: 450, height: 350 },
        content: <KeybindingsSettings keyBindingManager={keyBindingManager} />,
      });

      const stored = getStoredWindowState(SETTINGS_WINDOW_ID);
      if (!stored) {
        setTimeout(() => {
          minimizeWindow(SETTINGS_WINDOW_ID);
        }, 0);
      }
    }

    const turnOrderBarExists = windows.some(
      (w) => w.id === TURN_ORDER_BAR_WINDOW_ID,
    );
    if (
      !turnOrderBarExists &&
      entities.length > 0 &&
      !turnOrderBarInitializedRef.current
    ) {
      turnOrderBarInitializedRef.current = true;

      openWindow({
        id: TURN_ORDER_BAR_WINDOW_ID,
        title: "Turn Order Bar",
        closeable: false,
        minimizable: false,
        resizable: false,
        resizableX: true,
        resizableY: false,
        showInDock: false,
        decorated: false,
        lockHeight: true,
        defaultPosition: { x: 450, y: 10 },
        defaultSize: { width: window.innerWidth - 900, height: 50 },
        content: (
          <TurnOrderBar
            entities={entities}
            activeEntityId={activeEntityId}
            playerId={playerId}
            onEntityClick={onEntityClick}
          />
        ),
      });
    }
  }, [
    windows,
    openWindow,
    minimizeWindow,
    entities,
    activeEntityId,
    playerId,
    onEntityClick,
  ]);

  // Update TurnOrderBar content when entities or turn data changes
  useEffect(() => {
    if (entities.length > 0) {
      updateWindowContent(
        TURN_ORDER_BAR_WINDOW_ID,
        <TurnOrderBar
          entities={entities}
          activeEntityId={activeEntityId}
          playerId={playerId}
          onEntityClick={onEntityClick}
        />,
      );
    }
  }, [entities, activeEntityId, playerId, onEntityClick, updateWindowContent]);

  // Update TurnOrderWindow content when entities or turn data changes
  useEffect(() => {
    if (entities.length > 0) {
      updateWindowContent(
        TURN_ORDER_WINDOW_ID,
        <TurnOrderWindow
          entities={entities}
          activeEntityId={activeEntityId}
          playerId={playerId}
        />,
      );
    }
  }, [entities, activeEntityId, playerId, updateWindowContent]);

  return (
    <>
      {/* Render all windows */}
      {windows.map((window) => (
        <Window key={window.id} window={window} />
      ))}
    </>
  );
};

export default WindowSystem;
