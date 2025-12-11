import { useCallback, useMemo } from "react";

import {
  CommandAttack,
  CommandTalk,
  CommandInteract,
  GameCommand,
} from "../commands";
import {
  ClientToServerCommand,
  LogType,
  Position,
  Entity,
  Item,
  ClientToServerMovePayload,
  ClientToServerEntityTargetPayload,
  ClientToServerCustomPayload,
} from "../types";

// Константы для типов действий
const ACTION_TYPES = {
  LOGIN: "LOGIN" as const,
  MOVE: "MOVE" as const,
  ATTACK: "ATTACK" as const,
  TALK: "TALK" as const,
  INTERACT: "INTERACT" as const,
  WAIT: "WAIT" as const,
  CUSTOM: "CUSTOM" as const,
};

type CommandHandler<T = any> = (payload: T) => ClientToServerCommand | null;

interface UseCommandSystemProps {
  player: Entity | null;
  activeEntityId: string | null;
  entityRegistry: Map<string, Entity>;
  sendCommand: (command: ClientToServerCommand) => boolean;
  addLog: (
    text: string,
    type: LogType,
    commandData?: { action: string; payload?: any },
    position?: Position,
    playerPosition?: Position,
  ) => void;
}

export const useCommandSystem = ({
  player,
  activeEntityId,
  entityRegistry,
  sendCommand: wsSendCommand,
  addLog,
}: UseCommandSystemProps) => {
  // Маппинг обработчиков команд
  const commandHandlers: Record<
    ClientToServerCommand["action"],
    CommandHandler
  > = useMemo(
    () => ({
      [ACTION_TYPES.LOGIN]: (p: { token: string }) =>
        p.token ? { action: ACTION_TYPES.LOGIN, token: p.token } : null,

      [ACTION_TYPES.MOVE]: (p: ClientToServerMovePayload) => ({
        action: ACTION_TYPES.MOVE,
        payload: { dx: p.dx, dy: p.dy, x: p.x, y: p.y },
      }),

      [ACTION_TYPES.ATTACK]: (p: ClientToServerEntityTargetPayload) =>
        p.targetId
          ? { action: ACTION_TYPES.ATTACK, payload: { targetId: p.targetId } }
          : null,

      [ACTION_TYPES.TALK]: (p: ClientToServerEntityTargetPayload) =>
        p.targetId
          ? { action: ACTION_TYPES.TALK, payload: { targetId: p.targetId } }
          : null,

      [ACTION_TYPES.INTERACT]: (p: ClientToServerEntityTargetPayload) =>
        p.targetId
          ? {
              action: ACTION_TYPES.INTERACT,
              payload: { targetId: p.targetId },
            }
          : null,

      [ACTION_TYPES.WAIT]: () => ({ action: ACTION_TYPES.WAIT, payload: {} }),

      [ACTION_TYPES.CUSTOM]: (p: ClientToServerCustomPayload) => ({
        action: ACTION_TYPES.CUSTOM,
        payload: p,
      }),
    }),
    [],
  );

  /**
   * Создает типизированную команду из action и payload
   */
  const createClientCommand = useCallback(
    (action: string, payload: any): ClientToServerCommand | null => {
      const handler =
        commandHandlers[action as ClientToServerCommand["action"]];
      return handler ? handler(payload) : null;
    },
    [commandHandlers],
  );

  /**
   * Отправляет команду на сервер с валидацией и логированием
   */
  const sendCommand = useCallback(
    (action: string, payload?: any, description?: string) => {
      // Check if it's player's turn (except for non-gameplay commands)
      const nonTurnCommands = ["INSPECT", "TALK"];
      if (
        activeEntityId &&
        player &&
        activeEntityId !== player.id &&
        !nonTurnCommands.includes(action)
      ) {
        addLog("Сейчас не ваш ход — действие отклонено", LogType.INFO);
        return;
      }

      // Создаем типизированную команду
      const command = createClientCommand(action, payload ?? {});
      if (!command) {
        addLog(`Неизвестная команда: ${action}`, LogType.ERROR);
        return;
      }

      // Отправляем через WebSocket
      const success = wsSendCommand(command);
      if (!success) {
        return;
      }

      // Если описание не передано, пытаемся найти команду и взять её описание
      let commandDescription = description;
      if (!commandDescription) {
        const commandMap: Record<string, GameCommand> = {
          ATTACK: CommandAttack,
          TALK: CommandTalk,
          INTERACT: CommandInteract,
        };
        const foundCommand = commandMap[action];
        if (foundCommand) {
          commandDescription = foundCommand.description;
        }
      }

      // Форматируем сообщение лога с поддержкой шаблонов
      let logMessage: string;

      if (commandDescription) {
        logMessage = commandDescription;

        // Замена {targetName} или {target} с кликабельной ссылкой
        if (payload?.targetId) {
          const targetEntity = entityRegistry.get(payload.targetId);
          const targetName = targetEntity
            ? targetEntity.name
            : `ID:${payload.targetId}`;
          const clickableTarget = `<span class="cursor-pointer text-cyan-400 hover:underline" data-entity-id="${payload.targetId}">${targetName}</span>`;
          logMessage = logMessage
            .replace(/\{targetName\}/g, clickableTarget)
            .replace(/\{target\}/g, clickableTarget);
        }

        // Замена {x} и {y}
        if (payload?.x !== undefined) {
          logMessage = logMessage.replace(/\{x\}/g, String(payload.x));
        }
        if (payload?.y !== undefined) {
          logMessage = logMessage.replace(/\{y\}/g, String(payload.y));
        }

        // Замена {position} с кликабельной ссылкой
        if (payload?.x !== undefined && payload?.y !== undefined) {
          const clickablePosition = `<span class="cursor-pointer text-orange-400 hover:underline" data-position-x="${payload.x}" data-position-y="${payload.y}">(${payload.x}, ${payload.y})</span>`;
          logMessage = logMessage.replace(/\{position\}/g, clickablePosition);
        }

        // Замена {text} для речевых команд
        if (payload?.text !== undefined) {
          logMessage = logMessage.replace(/\{text\}/g, String(payload.text));
        }

        // Замена {name} для предметов
        if (payload?.name !== undefined) {
          logMessage = logMessage.replace(/\{name\}/g, String(payload.name));
        }
      } else if (payload?.targetId) {
        const targetEntity = entityRegistry.get(payload.targetId);
        const targetName = targetEntity
          ? targetEntity.name
          : `ID:${payload.targetId}`;
        logMessage = `Вы выполнили ${action} на ${targetName}`;
      } else if (payload?.x !== undefined && payload?.y !== undefined) {
        logMessage = `Вы выполнили ${action} на позицию (${payload.x}, ${payload.y})`;
      } else {
        logMessage = `Вы выполнили ${action}`;
      }

      // Определяем позицию события для лога
      let logPosition: Position | undefined;
      if (payload?.targetId) {
        const targetEntity = entityRegistry.get(payload.targetId);
        if (targetEntity) {
          logPosition = { x: targetEntity.pos.x, y: targetEntity.pos.y };
        }
      } else if (payload?.x !== undefined && payload?.y !== undefined) {
        logPosition = { x: payload.x, y: payload.y };
      }

      // Позиция игрока в момент команды
      const playerPosition = player
        ? { x: player.pos.x, y: player.pos.y }
        : undefined;

      // Сохраняем полные данные команды для отображения JSON
      addLog(
        logMessage,
        LogType.COMMAND,
        { action, payload },
        logPosition,
        playerPosition,
      );
    },
    [
      createClientCommand,
      entityRegistry,
      player,
      activeEntityId,
      addLog,
      wsSendCommand,
    ],
  );

  /**
   * Отправляет текстовую команду (речь)
   */
  const sendTextCommand = useCallback(
    (text: string, type: "SAY" | "WHISPER" | "YELL" = "SAY") => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      sendCommand(type, { text: trimmed });
    },
    [sendCommand],
  );

  /**
   * Обрабатывает использование предмета
   */
  const handleUseItem = useCallback(
    (item: Item, targetEntityId?: string) => {
      if (!player) {
        return;
      }

      if (activeEntityId && activeEntityId !== player.id) {
        addLog("Не ваш ход!", LogType.ERROR);
        return;
      }

      const payload: any = { name: item.name };
      if (targetEntityId) {
        payload.targetId = targetEntityId;
      }

      sendCommand(
        "USE",
        payload,
        `использовали ${item.name}${targetEntityId ? ` на {targetName}` : ""}`,
      );
    },
    [player, activeEntityId, sendCommand, addLog],
  );

  /**
   * Обрабатывает выброс предмета
   */
  const handleDropItem = useCallback(
    (item: Item) => {
      if (!player) {
        return;
      }

      if (activeEntityId && activeEntityId !== player.id) {
        addLog("Не ваш ход!", LogType.ERROR);
        return;
      }

      sendCommand("DROP", { name: item.name }, `бросили ${item.name}`);
    },
    [player, activeEntityId, sendCommand, addLog],
  );

  /**
   * Обрабатывает вход в игру
   */
  const handleLogin = useCallback(
    (entityId: string) => {
      sendCommand("LOGIN", { token: entityId }, `Авторизация как ${entityId}`);
      addLog(`Отправлен запрос на авторизацию: ${entityId}`, LogType.INFO);
    },
    [sendCommand, addLog],
  );

  /**
   * Обрабатывает перемещение игрока
   */
  const handleMovePlayer = useCallback(
    (x: number, y: number) => {
      if (!player) {
        return;
      }

      if (activeEntityId && activeEntityId !== player.id) {
        addLog("Не ваш ход!", LogType.ERROR);
        return;
      }

      const dx = x - player.pos.x;
      const dy = y - player.pos.y;

      sendCommand("MOVE", { dx, dy }, `переместились на (${x}, ${y})`);
    },
    [player, sendCommand, activeEntityId, addLog],
  );

  return {
    sendCommand,
    sendTextCommand,
    handleUseItem,
    handleDropItem,
    handleLogin,
    handleMovePlayer,
  };
};
