import { useState, useEffect, useCallback } from "react";

import { KeyBindingManager } from "../commands";
import { Position, ContextMenuData } from "../types";

interface UseInputHandlingProps {
  keyBindingManager: KeyBindingManager;
  selectedTargetEntityId: string | null;
  selectedTargetPosition: Position | null;
  radialMenuOpen: boolean;
  contextMenu: ContextMenuData | null;
  sendCommand: (action: string, payload?: any, description?: string) => void;
  setRadialMenuOpen: (open: boolean) => void;
  setContextMenu: (data: ContextMenuData | null) => void;
}

export const useInputHandling = ({
  keyBindingManager,
  selectedTargetEntityId,
  selectedTargetPosition,
  radialMenuOpen,
  contextMenu,
  sendCommand,
  setRadialMenuOpen,
  setContextMenu,
}: UseInputHandlingProps) => {
  const [selectedTargetEntityIdState, setSelectedTargetEntityId] = useState<
    string | null
  >(selectedTargetEntityId);
  const [selectedTargetPositionState, setSelectedTargetPosition] =
    useState<Position | null>(selectedTargetPosition);

  // Sync external state with internal state
  useEffect(() => {
    setSelectedTargetEntityId(selectedTargetEntityId);
  }, [selectedTargetEntityId]);

  useEffect(() => {
    setSelectedTargetPosition(selectedTargetPosition);
  }, [selectedTargetPosition]);

  /**
   * Обработчик выбора сущности
   */
  const handleSelectEntity = useCallback((entityId: string | null) => {
    setSelectedTargetEntityId(entityId);
  }, []);

  /**
   * Обработчик выбора позиции
   */
  const handleSelectPosition = useCallback((x: number, y: number) => {
    setSelectedTargetPosition({ x, y });
  }, []);

  /**
   * Обработчик контекстного меню
   */
  const handleContextMenu = useCallback(
    (data: ContextMenuData) => {
      setContextMenu(data);
    },
    [setContextMenu],
  );

  /**
   * Global Escape key handler - closes radial menu and context menu
   */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return;
      }

      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      e.preventDefault();

      // Priority 1: Close radial menu
      if (radialMenuOpen) {
        setRadialMenuOpen(false);
        e.stopImmediatePropagation();
        return;
      }

      // Priority 2: Close context menu
      if (contextMenu) {
        setContextMenu(null);
        e.stopImmediatePropagation();
        return;
      }
    };

    window.addEventListener("keydown", handleEscape, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleEscape, { capture: true });
    };
  }, [radialMenuOpen, contextMenu, setRadialMenuOpen, setContextMenu]);

  /**
   * Global key handler for game controls
   */
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ignore if target is within the chat/log area
      const target = e.target as HTMLElement;
      if (target && target.closest(".game-log-container")) {
        return;
      }

      const command = keyBindingManager.getCommand(e.code);
      if (command) {
        e.preventDefault();

        // Проверяем, требует ли команда выбор цели
        let payload = command.payload || {};

        // Если требуется выбор сущности, добавляем targetId
        if (command.requiresEntityTarget && selectedTargetEntityIdState) {
          payload = {
            ...payload,
            targetId: selectedTargetEntityIdState,
          };
        }

        // Если требуется выбор позиции, добавляем x, y
        if (command.requiresPositionTarget && selectedTargetPositionState) {
          payload = {
            ...payload,
            x: selectedTargetPositionState.x,
            y: selectedTargetPositionState.y,
          };
        }

        sendCommand(command.action, payload, command.description);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [
    sendCommand,
    keyBindingManager,
    selectedTargetEntityIdState,
    selectedTargetPositionState,
  ]);

  return {
    selectedTargetEntityId: selectedTargetEntityIdState,
    selectedTargetPosition: selectedTargetPositionState,
    handleSelectEntity,
    handleSelectPosition,
    handleContextMenu,
  };
};
