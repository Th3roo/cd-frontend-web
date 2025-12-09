import { FC, useEffect, useRef, useCallback } from "react";

import { KeyBindingManager } from "../../commands";
import {
  Entity,
  LogMessage,
  Position,
  ContextMenuData,
  Item,
} from "../../types";

import { getStoredWindowState } from "./utils";
import Window from "./Window";
import { useWindowManager } from "./WindowManager";
import {
  DOCK_WINDOW_ID,
  createDockWindowConfig,
  SETTINGS_WINDOW_ID,
  createSettingsWindowConfig,
  TURN_ORDER_BAR_WINDOW_ID,
  createTurnOrderBarWindowConfig,
  TURN_ORDER_WINDOW_ID,
  createTurnOrderWindowConfig,
  CASINO_WINDOW_ID,
  createCasinoWindowConfig,
  GAME_LOG_WINDOW_ID,
  createGameLogWindowConfig,
  INVENTORY_WINDOW_ID,
  createInventoryWindowConfig,
  LOGIN_WINDOW_ID,
  createLoginWindowConfig,
} from "./windows";

interface WindowSystemProps {
  keyBindingManager: KeyBindingManager;
  entities?: Entity[];
  activeEntityId?: string | null;
  playerId?: string | null;
  onEntityClick?: (entityId: string) => void;
  logs?: LogMessage[];
  onGoToPosition?: (position: Position) => void;
  onGoToEntity?: (entityId: string) => void;
  onSendCommand?: (text: string, type: "SAY" | "WHISPER" | "YELL") => void;
  onContextMenu?: (data: ContextMenuData) => void;
  splashNotificationsEnabled: boolean;
  onToggleSplashNotifications: (enabled: boolean) => void;
  playerInventory?: Item[];
  onUseItem?: (item: Item, targetEntityId?: string) => void;
  onDropItem?: (item: Item) => void;
  onLogin?: (entityId: string) => void;
  isAuthenticated?: boolean;
  wsConnected?: boolean;
  loginError?: string | null;
}

const WindowSystem: FC<WindowSystemProps> = ({
  keyBindingManager,
  entities = [],
  activeEntityId = null,
  playerId = null,
  onEntityClick,
  logs = [],
  onGoToPosition,
  onGoToEntity,
  onSendCommand,
  onContextMenu,
  splashNotificationsEnabled,
  onToggleSplashNotifications,
  playerInventory = [],
  onUseItem,
  onDropItem,
  onLogin,
  isAuthenticated = false,
  wsConnected = false,
  loginError = null,
}) => {
  const {
    windows,
    openWindow,
    closeWindow,
    minimizeWindow,
    restoreWindow,
    updateWindowContent,
    resetWindowLayout,
  } = useWindowManager();
  const turnOrderBarInitializedRef = useRef(false);
  const loginWindowClosedRef = useRef(false);

  const handleOpenCasino = useCallback(() => {
    openWindow(
      createCasinoWindowConfig({
        onClose: () => closeWindow(CASINO_WINDOW_ID),
      }),
    );
  }, [openWindow, closeWindow]);

  // Автоматически открываем Dock и Settings при монтировании
  useEffect(() => {
    console.log("[WindowSystem] useEffect triggered", {
      windowsCount: windows.length,
      hasOnLogin: !!onLogin,
      isAuthenticated,
      wsConnected,
      loginError,
    });
    const dockExists = windows.some((w) => w.id === DOCK_WINDOW_ID);
    if (!dockExists) {
      openWindow(createDockWindowConfig());
    }

    const settingsExists = windows.some((w) => w.id === SETTINGS_WINDOW_ID);
    if (!settingsExists) {
      openWindow(
        createSettingsWindowConfig({
          keyBindingManager,
          resetWindowLayout,
          onOpenCasino: handleOpenCasino,
          splashNotificationsEnabled,
          onToggleSplashNotifications,
        }),
      );

      const stored = getStoredWindowState(SETTINGS_WINDOW_ID);
      if (!stored) {
        setTimeout(() => {
          minimizeWindow(SETTINGS_WINDOW_ID);
        }, 0);
      }
    }

    const gameLogExists = windows.some((w) => w.id === GAME_LOG_WINDOW_ID);
    if (!gameLogExists) {
      openWindow(
        createGameLogWindowConfig({
          logs,
          onGoToPosition,
          onGoToEntity,
          onSendCommand,
        }),
      );
    }

    const inventoryExists = windows.some((w) => w.id === INVENTORY_WINDOW_ID);
    if (!inventoryExists) {
      openWindow(
        createInventoryWindowConfig({
          items: playerInventory,
          onUseItem,
          onDropItem,
        }),
      );
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

      openWindow(
        createTurnOrderBarWindowConfig({
          entities,
          activeEntityId,
          playerId,
          onEntityClick,
          onContextMenu,
        }),
      );
    }

    // Always open login window when not authenticated
    if (onLogin && !isAuthenticated) {
      const loginExists = windows.some((w) => w.id === LOGIN_WINDOW_ID);
      const loginWindow = windows.find((w) => w.id === LOGIN_WINDOW_ID);
      console.log("[WindowSystem] Login window check:", {
        onLogin: !!onLogin,
        isAuthenticated,
        loginExists,
        willOpen: !loginExists,
        loginWindowState: loginWindow
          ? {
              id: loginWindow.id,
              isMinimized: loginWindow.isMinimized,
              isFocused: loginWindow.isFocused,
              closeable: loginWindow.closeable,
              showInDock: loginWindow.showInDock,
              position: loginWindow.position,
              size: loginWindow.size,
            }
          : "NOT FOUND",
      });
      if (!loginExists) {
        console.log("[WindowSystem] Opening login window");
        openWindow(
          createLoginWindowConfig({
            onConnect: onLogin,
            isConnected: isAuthenticated,
            wsConnected,
            loginError,
          }),
        );
      } else if (loginWindow?.isMinimized) {
        console.log(
          "[WindowSystem] Login window exists but is minimized - restoring",
        );
        restoreWindow(LOGIN_WINDOW_ID);
      } else {
        console.log("[WindowSystem] Login window already exists and visible", {
          isMinimized: loginWindow?.isMinimized,
          isFocused: loginWindow?.isFocused,
        });
      }
    } else {
      console.log("[WindowSystem] Skipping login window:", {
        hasOnLogin: !!onLogin,
        isAuthenticated,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    windows,
    openWindow,
    minimizeWindow,
    entities,
    activeEntityId,
    playerId,
    onEntityClick,
    handleOpenCasino,
    keyBindingManager,
    resetWindowLayout,
    logs,
    onGoToPosition,
    onGoToEntity,
    onSendCommand,
    onContextMenu,
    playerInventory,
    onUseItem,
    onDropItem,
    splashNotificationsEnabled,
    onToggleSplashNotifications,
    onLogin,
    isAuthenticated,
    wsConnected,
    loginError,
    // restoreWindow is stable from context, safe to use without dependency
  ]);

  // Update TurnOrderBar content when entities or turn data changes
  useEffect(() => {
    if (entities.length > 0) {
      const barConfig = createTurnOrderBarWindowConfig({
        entities,
        activeEntityId,
        playerId,
        onEntityClick,
        onContextMenu,
      });
      updateWindowContent(TURN_ORDER_BAR_WINDOW_ID, barConfig.content);
    }
  }, [
    entities,
    activeEntityId,
    playerId,
    onEntityClick,
    updateWindowContent,
    onContextMenu,
  ]);

  // Update Settings window content when splash notifications setting changes
  useEffect(() => {
    const settingsConfig = createSettingsWindowConfig({
      keyBindingManager,
      resetWindowLayout,
      onOpenCasino: handleOpenCasino,
      splashNotificationsEnabled,
      onToggleSplashNotifications,
    });
    updateWindowContent(SETTINGS_WINDOW_ID, settingsConfig.content);
  }, [
    splashNotificationsEnabled,
    onToggleSplashNotifications,
    keyBindingManager,
    resetWindowLayout,
    handleOpenCasino,
    updateWindowContent,
  ]);

  // Update TurnOrderWindow content when entities or turn data changes
  useEffect(() => {
    if (entities.length > 0) {
      const orderConfig = createTurnOrderWindowConfig({
        entities,
        activeEntityId,
        playerId,
      });
      updateWindowContent(TURN_ORDER_WINDOW_ID, orderConfig.content);
    }
  }, [entities, activeEntityId, playerId, updateWindowContent]);

  // Update GameLogWindow content when logs change
  useEffect(() => {
    const logConfig = createGameLogWindowConfig({
      logs,
      onGoToPosition,
      onGoToEntity,
      onSendCommand,
    });
    updateWindowContent(GAME_LOG_WINDOW_ID, logConfig.content);
  }, [logs, onGoToPosition, onGoToEntity, onSendCommand, updateWindowContent]);

  // Update InventoryWindow content when player inventory changes
  useEffect(() => {
    const inventoryConfig = createInventoryWindowConfig({
      items: playerInventory,
      onUseItem,
      onDropItem,
    });
    updateWindowContent(INVENTORY_WINDOW_ID, inventoryConfig.content);
  }, [playerInventory, onUseItem, onDropItem, updateWindowContent]);

  // Update LoginWindow content when connection state changes
  useEffect(() => {
    if (onLogin) {
      const loginConfig = createLoginWindowConfig({
        onConnect: onLogin,
        isConnected: isAuthenticated,
        wsConnected,
        loginError,
      });
      updateWindowContent(LOGIN_WINDOW_ID, loginConfig.content);
    }
  }, [isAuthenticated, wsConnected, loginError, onLogin, updateWindowContent]);

  // Auto-close login window after successful authentication
  useEffect(() => {
    console.log("[WindowSystem] Auth check for auto-close:", {
      isAuthenticated,
      loginWindowClosedRef: loginWindowClosedRef.current,
    });
    if (isAuthenticated && !loginWindowClosedRef.current) {
      console.log("[WindowSystem] Scheduling login window close in 2s");
      loginWindowClosedRef.current = true;
      // Wait a bit to show the success message, then close
      setTimeout(() => {
        console.log("[WindowSystem] Closing login window");
        closeWindow(LOGIN_WINDOW_ID);
      }, 2000);
    }
  }, [isAuthenticated, closeWindow]);

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
