import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Focus, Navigation } from "lucide-react";
import { WindowSystem } from "./components/WindowSystem";

import {
  CommandAttack,
  CommandCastArea,
  CommandInspect,
  CommandPickup,
  CommandTalk,
  CommandTeleport,
  CommandTrade,
  GameCommand,
  KeyBindingManager,
  DEFAULT_KEY_BINDINGS,
} from "./commands";
import GameGrid from "./components/GameGrid";
import GameLog from "./components/GameLog";
import StatusPanel from "./components/StatusPanel";
import {
  GameWorld,
  Entity,
  GameState,
  LogMessage,
  LogType,
  Position,
} from "./types";
import { findPath } from "./utils/pathfinding";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

const App: React.FC = () => {
  const socketRef = useRef<WebSocket | null>(null);
  const keyBindingManager = useMemo(() => {
    const manager = new KeyBindingManager(DEFAULT_KEY_BINDINGS);
    // Загружаем сохраненные настройки из localStorage
    manager.loadFromLocalStorage();
    return manager;
  }, []);

  // --- React State (For Rendering) ---
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [player, setPlayer] = useState<Entity | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [gameState, setGameState] = useState<GameState>(GameState.EXPLORATION);
  const [logs, setLogs] = useState<LogMessage[]>([]);

  // UI State
  const [commandInput, setCommandInput] = useState("");
  const [selectedTargetEntityId, setSelectedTargetEntityId] = useState<
    string | null
  >(null);
  const [selectedTargetPosition, setSelectedTargetPosition] =
    useState<Position | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [followedEntityId, setFollowedEntityId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerPosKey, setPlayerPosKey] = useState<string>("");
  const followInitializedRef = useRef(false);

  // Pathfinding state
  const [pathfindingTarget, setPathfindingTarget] = useState<Position | null>(
    null,
  );
  const [currentPath, setCurrentPath] = useState<Position[]>([]);
  const [isPathfinding, setIsPathfinding] = useState(false);
  const [waitingForMoveResponse, setWaitingForMoveResponse] = useState(false);
  const pathfindingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCommandedPosRef = useRef<Position | null>(null);

  // Единый регистр всех сущностей (включая игрока)
  const entityRegistry = useMemo(() => {
    const registry = new Map<string, Entity>();
    if (player) {
      registry.set(player.id, player);
    }
    entities.forEach((entity) => {
      registry.set(entity.id, entity);
    });
    return registry;
  }, [player, entities]);

  // --- Helper Functions ---
  const addLog = (
    text: string,
    type: LogType = LogType.INFO,
    commandData?: { action: string; payload?: any },
    position?: Position,
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        text,
        type,
        timestamp: Date.now(),
        commandData,
        position,
      },
    ]);
  };

  // --- WebSocket: Connect to Server ---
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080/ws");
    socketRef.current = ws;

    ws.onopen = () => {
      addLog("Connected to server", LogType.INFO);
    };

    ws.onmessage = (evt) => {
      try {
        // TODO: Handle structured server messages with schema (https://github.com/Cognitive-Dungeon/cd-frontend-web/issues/2)
        // console.log("WS raw:", evt.data);
        const msg = JSON.parse(evt.data);

        // Handle INIT/UPDATE payloads from server
        if (msg?.type === "INIT" || msg?.type === "UPDATE") {
          if (msg.world) {
            setWorld(msg.world);
          }
          if (msg.player) {
            const normalizedPlayer = {
              ...msg.player,
              inventory: msg.player.inventory ?? [],
            };
            setPlayer(normalizedPlayer);
            // Инициализируем следование за игроком только один раз при первой загрузке
            if (!followInitializedRef.current && normalizedPlayer.id) {
              setFollowedEntityId(normalizedPlayer.id);
              followInitializedRef.current = true;
            }
          }
          if (Array.isArray(msg.entities)) {
            setEntities(msg.entities);
          }
          if (msg.gameState) {
            setGameState(msg.gameState);
          }
        }

        // Process logs array from server
        if (Array.isArray(msg?.logs)) {
          const typeMap: Record<string, LogType> = {
            INFO: LogType.INFO,
            ERROR: LogType.ERROR,
            COMMAND: LogType.COMMAND,
            NARRATIVE: LogType.NARRATIVE,
            COMBAT: LogType.COMBAT,
            SPEECH: LogType.SPEECH,
          };

          msg.logs.forEach((entry: any) => {
            if (
              entry &&
              typeof entry === "object" &&
              typeof entry.text === "string"
            ) {
              const t = typeMap[entry.type] ?? LogType.INFO;
              addLog(entry.text, t);
            } else if (typeof entry === "string") {
              addLog(entry, LogType.INFO);
            }
          });
        }
      } catch {
        addLog("WS parse error", LogType.ERROR);
      }
    };

    ws.onerror = () => {
      addLog("WS error", LogType.ERROR);
    };

    ws.onclose = () => {
      addLog("Disconnected from server", LogType.INFO);
    };

    return () => {
      try {
        ws.close();
      } catch (e) {
        console.error(e);
      }
      socketRef.current = null;
    };
  }, []);

  const sendCommand = useCallback(
    (action: string, payload?: any, description?: string) => {
      if (
        !socketRef.current ||
        socketRef.current.readyState !== WebSocket.OPEN
      ) {
        addLog("No connection to server", LogType.ERROR);
        return;
      }

      const message: GameCommand = {
        action,
        payload,
      };

      socketRef.current.send(JSON.stringify(message));

      // Если описание не передано, пытаемся найти команду и взять её описание
      let commandDescription = description;
      if (!commandDescription) {
        const commandMap: Record<string, GameCommand> = {
          ATTACK: CommandAttack,
          TALK: CommandTalk,
          INSPECT: CommandInspect,
          PICKUP: CommandPickup,
          TRADE: CommandTrade,
          TELEPORT: CommandTeleport,
          CAST_AREA: CommandCastArea,
        };
        const foundCommand = commandMap[action];
        if (foundCommand) {
          commandDescription = foundCommand.description;
        }
      }

      // Форматируем сообщение лога с поддержкой шаблонов
      let logMessage: string;

      if (commandDescription) {
        // Поддержка шаблонов в описании
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
      } else if (payload?.targetId) {
        // Fallback если нет описания
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

      // Определяем позицию для лога
      let logPosition: Position | undefined;
      if (payload?.targetId) {
        const targetEntity = entityRegistry.get(payload.targetId);
        if (targetEntity) {
          logPosition = { x: targetEntity.pos.x, y: targetEntity.pos.y };
        }
      } else if (payload?.x !== undefined && payload?.y !== undefined) {
        logPosition = { x: payload.x, y: payload.y };
      } else if (player) {
        logPosition = { x: player.pos.x, y: player.pos.y };
      }

      // Сохраняем полные данные команды для отображения JSON
      addLog(logMessage, LogType.COMMAND, { action, payload }, logPosition);
    },
    [entityRegistry, player],
  );

  const sendTextCommand = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    sendCommand("TEXT", { text: trimmed });
    setCommandInput("");
  };

  const handleMovePlayer = useCallback(
    (x: number, y: number) => {
      if (!player) {
        return;
      }

      const dx = x - player.pos.x;
      const dy = y - player.pos.y;

      sendCommand("MOVE", { dx, dy }, `переместились на (${x}, ${y})`);
    },
    [player, sendCommand],
  );

  const handleSelectEntity = useCallback((entityId: string | null) => {
    setSelectedTargetEntityId(entityId);
    if (entityId) {
      console.log("Выбрана сущность:", entityId);
    }
  }, []);

  const handleSelectPosition = useCallback((x: number, y: number) => {
    setSelectedTargetPosition({ x, y });
    console.log("Выбрана позиция:", x, y);
  }, []);

  const handleGoToPosition = useCallback(
    (position: Position) => {
      // Выделяем позицию как цель
      setSelectedTargetPosition(position);
      // Отключаем следование и перемещаем камеру к позиции
      setFollowedEntityId(null);

      if (containerRef.current && world) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const CELL_SIZE = 50 * zoom;
        const positionPixelX = position.x * CELL_SIZE + CELL_SIZE / 2;
        const positionPixelY = position.y * CELL_SIZE + CELL_SIZE / 2;
        const offsetX = containerWidth / 2 - positionPixelX;
        const offsetY = containerHeight / 2 - positionPixelY;
        setPanOffset({ x: offsetX, y: offsetY });
      }
    },
    [world, zoom],
  );

  const handleGoToEntity = useCallback(
    (entityId: string) => {
      const entity = entityRegistry.get(entityId);
      if (!entity) return;

      // Выделяем сущность как цель
      setSelectedTargetEntityId(entityId);
      // Выделяем её позицию
      setSelectedTargetPosition({ x: entity.pos.x, y: entity.pos.y });
      // Отключаем следование и перемещаем камеру к сущности
      setFollowedEntityId(null);

      if (containerRef.current && world) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const CELL_SIZE = 50 * zoom;
        const entityPixelX = entity.pos.x * CELL_SIZE + CELL_SIZE / 2;
        const entityPixelY = entity.pos.y * CELL_SIZE + CELL_SIZE / 2;
        const offsetX = containerWidth / 2 - entityPixelX;
        const offsetY = containerHeight / 2 - entityPixelY;
        setPanOffset({ x: offsetX, y: offsetY });
      }
    },
    [entityRegistry, world, zoom],
  );

  const handleGoToPathfinding = useCallback(
    (targetPos: Position) => {
      if (!player || !world) return;

      // Stop any existing pathfinding
      if (pathfindingTimeoutRef.current) {
        clearTimeout(pathfindingTimeoutRef.current);
        pathfindingTimeoutRef.current = null;
      }

      // Find path
      const path = findPath(player.pos, targetPos, world);

      if (!path || path.length === 0) {
        addLog(
          `Не удалось найти путь к <span class="cursor-pointer text-orange-400 hover:underline" data-position-x="${targetPos.x}" data-position-y="${targetPos.y}">(${targetPos.x}, ${targetPos.y})</span>`,
          LogType.ERROR,
          undefined,
          targetPos,
        );
        return;
      }

      // Set pathfinding state
      setPathfindingTarget(targetPos);
      setCurrentPath([player.pos, ...path]);
      setIsPathfinding(true);
      setSelectedTargetPosition(targetPos);

      addLog(
        `Начинаем движение к (${targetPos.x}, ${targetPos.y}), длина пути: ${path.length}`,
        LogType.INFO,
      );
    },
    [player, world],
  );

  const handleFollowEntity = useCallback((entityId: string | null) => {
    setFollowedEntityId(entityId);
    if (entityId) {
      console.log("Следим за сущностью:", entityId);
    }
  }, []);

  // Pathfinding execution loop - send next move command
  useEffect(() => {
    if (!isPathfinding || currentPath.length <= 1 || !player || !world) {
      return;
    }

    // Don't send next command if we're waiting for response
    if (waitingForMoveResponse) {
      return;
    }

    const currentPlayerPos = player.pos;
    const nextStep = currentPath[1]; // Index 0 is current position

    // Calculate movement delta
    const dx = nextStep.x - currentPlayerPos.x;
    const dy = nextStep.y - currentPlayerPos.y;

    // Send move command
    sendCommand("MOVE", { dx, dy }, `пошли на (${nextStep.x}, ${nextStep.y})`);

    // Mark that we're waiting for server response
    setWaitingForMoveResponse(true);
    lastCommandedPosRef.current = nextStep;

    // TODO: В будущем будем ждать нашего хода (turn-based система). ПОКА НЕ РЕАЛИЗОВАНО
    // Set timeout as fallback in case server doesn't respond
    pathfindingTimeoutRef.current = setTimeout(() => {
      addLog(`Таймаут ожидания ответа сервера. Остановка пути.`, LogType.ERROR);
      setIsPathfinding(false);
      setCurrentPath([]);
      setPathfindingTarget(null);
      setWaitingForMoveResponse(false);
      lastCommandedPosRef.current = null;
    }, 2000); // 2 second timeout
  }, [
    isPathfinding,
    currentPath,
    waitingForMoveResponse,
    player?.pos.x,
    player?.pos.y,
    world,
    sendCommand,
  ]);

  // Check server response - did player move to expected position?
  useEffect(() => {
    if (!waitingForMoveResponse || !lastCommandedPosRef.current || !player) {
      return;
    }

    const commandedPos = lastCommandedPosRef.current;
    const currentPos = player.pos;

    // Check if player moved to the commanded position
    if (currentPos.x === commandedPos.x && currentPos.y === commandedPos.y) {
      // Success! Player moved to expected position
      // Clear timeout
      if (pathfindingTimeoutRef.current) {
        clearTimeout(pathfindingTimeoutRef.current);
        pathfindingTimeoutRef.current = null;
      }

      // Remove completed step from path
      setCurrentPath((prev) => prev.slice(1));
      setWaitingForMoveResponse(false);
      lastCommandedPosRef.current = null;
    } else {
      // Check if player position changed but not to expected position
      // This means server blocked the move
      const prevPos = currentPath[0];
      if (
        prevPos &&
        (currentPos.x !== prevPos.x || currentPos.y !== prevPos.y)
      ) {
        // Position changed but not to where we expected - server moved us elsewhere
        addLog(
          `Сервер переместил на неожиданную позицию (${currentPos.x}, ${currentPos.y}). Остановка пути.`,
          LogType.ERROR,
        );
        if (pathfindingTimeoutRef.current) {
          clearTimeout(pathfindingTimeoutRef.current);
          pathfindingTimeoutRef.current = null;
        }
        setIsPathfinding(false);
        setCurrentPath([]);
        setPathfindingTarget(null);
        setWaitingForMoveResponse(false);
        lastCommandedPosRef.current = null;
      }
    }
  }, [player?.pos.x, player?.pos.y, waitingForMoveResponse, currentPath]);

  // Stop pathfinding when reached target
  useEffect(() => {
    if (!isPathfinding || !player || !pathfindingTarget) return;

    if (
      player.pos.x === pathfindingTarget.x &&
      player.pos.y === pathfindingTarget.y
    ) {
      addLog(
        `Достигли цели (${pathfindingTarget.x}, ${pathfindingTarget.y})`,
        LogType.SUCCESS,
      );
      setIsPathfinding(false);
      setCurrentPath([]);
      setPathfindingTarget(null);
    }
  }, [player?.pos.x, player?.pos.y, isPathfinding, pathfindingTarget]);

  // Cleanup pathfinding timeout on unmount
  useEffect(() => {
    return () => {
      if (pathfindingTimeoutRef.current) {
        clearTimeout(pathfindingTimeoutRef.current);
      }
      setWaitingForMoveResponse(false);
      lastCommandedPosRef.current = null;
    };
  }, []);

  // --- UI Handlers ---
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      sendTextCommand(commandInput);
    }
  };

  // Global key handler for game controls
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const command = keyBindingManager.getCommand(e.code);
      if (command) {
        e.preventDefault();

        // Проверяем, требует ли команда выбор цели
        let payload = command.payload || {};

        // Если требуется выбор сущности, добавляем targetId
        if (command.requiresEntityTarget && selectedTargetEntityId) {
          payload = {
            ...payload,
            targetId: selectedTargetEntityId,
          };
        }

        // Если требуется выбор позиции, добавляем x, y
        if (command.requiresPositionTarget && selectedTargetPosition) {
          payload = {
            ...payload,
            x: selectedTargetPosition.x,
            y: selectedTargetPosition.y,
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
    selectedTargetEntityId,
    selectedTargetPosition,
  ]);

  // Обработка зума колесиком мыши
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        e.preventDefault();

        setZoom((prevZoom) => {
          const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
          return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
        });
      }
    };

    const containerElement = containerRef.current;
    if (containerElement) {
      containerElement.addEventListener("wheel", handleWheel, {
        passive: false,
      });
      return () => containerElement.removeEventListener("wheel", handleWheel);
    }
  }, []);

  // Обработка панорамирования (drag to pan)
  useEffect(() => {
    let hasMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && containerRef.current) {
        // Проверяем, что клик не на окне (Window)
        const target = e.target as HTMLElement;
        if (
          target.closest("[data-window]") ||
          target.closest("[data-window-header]")
        ) {
          return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          hasMoved = false;
          setIsPanning(true);

          // Если включено следование, вычисляем текущий offset камеры
          let currentOffset = panOffset;
          if (followedEntityId && world) {
            const followedEntity = entityRegistry.get(followedEntityId);
            if (followedEntity && containerRef.current) {
              const containerWidth = containerRef.current.clientWidth;
              const containerHeight = containerRef.current.clientHeight;
              const CELL_SIZE = 50 * zoom;
              const entityPixelX =
                followedEntity.pos.x * CELL_SIZE + CELL_SIZE / 2;
              const entityPixelY =
                followedEntity.pos.y * CELL_SIZE + CELL_SIZE / 2;
              currentOffset = {
                x: containerWidth / 2 - entityPixelX,
                y: containerHeight / 2 - entityPixelY,
              };
            }
          }

          setPanStart({
            x: e.clientX - currentOffset.x,
            y: e.clientY - currentOffset.y,
          });
          e.preventDefault();
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        hasMoved = true;
        // Отключаем следование только при реальном перемещении
        if (followedEntityId && hasMoved) {
          setFollowedEntityId(null);
        }
        e.preventDefault();
        setPanOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      hasMoved = false;
    };

    document.addEventListener("mousedown", handleMouseDown);
    if (isPanning) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isPanning,
    panStart,
    panOffset,
    followedEntityId,
    entityRegistry,
    world,
    zoom,
  ]);

  // Обновляем ключ позиции при изменении позиции отслеживаемой сущности
  useEffect(() => {
    if (followedEntityId) {
      const followedEntity = entityRegistry.get(followedEntityId);

      if (followedEntity) {
        const newPosKey = `${followedEntity.pos.x},${followedEntity.pos.y}`;
        if (newPosKey !== playerPosKey) {
          setPlayerPosKey(newPosKey);
        }
      }
    }
  }, [entityRegistry, followedEntityId, playerPosKey]);

  // Вычисляем offset для центрирования на отслеживаемой сущности
  const cameraOffset =
    followedEntityId && containerRef.current && world && player
      ? (() => {
          // Определяем, за какой сущностью следим
          const followedEntity = entityRegistry.get(followedEntityId);

          if (!followedEntity) return panOffset;

          const container = containerRef.current;
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight;

          const CELL_SIZE = 50 * zoom;

          // Позиция отслеживаемой сущности в пикселях относительно сетки
          const entityPixelX = followedEntity.pos.x * CELL_SIZE + CELL_SIZE / 2;
          const entityPixelY = followedEntity.pos.y * CELL_SIZE + CELL_SIZE / 2;

          // Вычисляем offset, чтобы сущность была в центре контейнера
          const offsetX = containerWidth / 2 - entityPixelX;
          const offsetY = containerHeight / 2 - entityPixelY;

          return { x: offsetX, y: offsetY };
        })()
      : panOffset;

  if (!world || !player) {
    return <div className="text-white p-10">Connecting to server...</div>;
  }

  const selectedTarget = selectedTargetEntityId
    ? entities.find((e) => e.id === selectedTargetEntityId)
    : null;

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-950 overflow-hidden text-gray-300 font-mono">
      <StatusPanel
        player={player}
        gameState={gameState}
        globalTick={world.globalTick}
        target={selectedTarget}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-black flex flex-col relative border-r border-neutral-800">
          <div
            ref={containerRef}
            className={`absolute inset-0 overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
          >
            {/* Индикатор зума и переключатель следования */}
            <div className="absolute top-2 right-2 flex flex-col gap-2 z-50">
              <div className="bg-black/80 text-white px-3 py-1 rounded text-xs font-mono border border-neutral-600 pointer-events-none">
                Zoom: {(zoom * 100).toFixed(0)}%
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (followedEntityId) {
                    // Вычисляем и сохраняем текущий offset камеры перед выходом из режима следования
                    if (containerRef.current && world) {
                      const followedEntity =
                        entityRegistry.get(followedEntityId);

                      if (followedEntity) {
                        const containerWidth = containerRef.current.clientWidth;
                        const containerHeight =
                          containerRef.current.clientHeight;
                        const CELL_SIZE = 50 * zoom;
                        const entityPixelX =
                          followedEntity.pos.x * CELL_SIZE + CELL_SIZE / 2;
                        const entityPixelY =
                          followedEntity.pos.y * CELL_SIZE + CELL_SIZE / 2;
                        const offsetX = containerWidth / 2 - entityPixelX;
                        const offsetY = containerHeight / 2 - entityPixelY;
                        setPanOffset({ x: offsetX, y: offsetY });
                      }
                    }
                    setFollowedEntityId(null);
                  } else {
                    setFollowedEntityId(player?.id || null);
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`px-3 py-1 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                  followedEntityId
                    ? "bg-cyan-600/80 text-white border-cyan-500"
                    : "bg-black/80 text-gray-400 border-neutral-600"
                }`}
              >
                {followedEntityId ? (
                  followedEntityId === player?.id ? (
                    <>
                      <Focus className="w-3 h-3" />
                      <span>Следовать</span>
                    </>
                  ) : (
                    <>
                      <Focus className="w-3 h-3" />
                      <span>
                        Следую за{" "}
                        {entityRegistry.get(followedEntityId)?.name ||
                          "сущностью"}
                      </span>
                    </>
                  )
                ) : (
                  <>
                    <Navigation className="w-3 h-3" />
                    <span>Свободно</span>
                  </>
                )}
              </button>
            </div>
            <div
              className="absolute top-0 left-0"
              style={{
                transform: `translate(${cameraOffset.x}px, ${cameraOffset.y}px)`,
                transition: followedEntityId
                  ? "transform 0.3s ease-out"
                  : "none",
              }}
            >
              <GameGrid
                world={world}
                entities={[player, ...entities]}
                playerPos={player.pos}
                fovRadius={8}
                zoom={zoom}
                followedEntityId={followedEntityId}
                onMovePlayer={handleMovePlayer}
                onSelectEntity={handleSelectEntity}
                onSelectPosition={handleSelectPosition}
                onFollowEntity={handleFollowEntity}
                onSendCommand={sendCommand}
                onGoToPathfinding={handleGoToPathfinding}
                selectedTargetEntityId={selectedTargetEntityId}
                selectedTargetPosition={selectedTargetPosition}
                pathfindingTarget={pathfindingTarget}
                currentPath={currentPath}
              />
            </div>
          </div>
        </div>
        <div className="w-[450px] flex flex-col bg-neutral-900">
          <div className="flex-1 overflow-hidden relative">
            <GameLog
              logs={logs}
              onGoToPosition={handleGoToPosition}
              onGoToEntity={handleGoToEntity}
            />
          </div>
          <div className="p-3 bg-neutral-950 border-t border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-cyan-500 font-bold">{">"}</span>
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter command..."
                className="flex-1 bg-transparent border-none outline-none text-gray-200 placeholder-gray-700"
              />
            </div>
            <div className="text-[10px] text-gray-600 mt-1 flex justify-between">
              <span>{world.level === 0 ? "Town" : `Level ${world.level}`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Window System */}
      <WindowSystem keyBindingManager={keyBindingManager} />
    </div>
  );
};

export default App;
