import { Focus, Navigation } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import {
  CommandAttack,
  CommandTalk,
  CommandInteract,
  GameCommand,
  KeyBindingManager,
  DEFAULT_KEY_BINDINGS,
} from "./commands";
import { ContextMenu } from "./components/ContextMenu";
import GameGrid from "./components/GameGrid";
import {
  SplashNotification,
  useSplashNotifications,
} from "./components/SplashNotification";
import StatusPanel from "./components/StatusPanel";
import { WindowManagerProvider, WindowSystem } from "./components/WindowSystem";
import {
  ClientToServerCommand,
  serializeClientCommand,
  GameWorld,
  Entity,
  GameState,
  LogMessage,
  LogType,
  Position,
  ContextMenuData,
  SpeechBubble,
  Item,
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
  const worldRef = useRef<GameWorld | null>(null);
  const [player, setPlayer] = useState<Entity | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>(() => {
    // Начальное сообщение с информацией о билде
    const buildDate = new Date(__BUILD_TIME__).toLocaleString("ru-RU");
    return [
      {
        id: "build-info",
        text: `Build: ${__GIT_COMMIT__} (${__GIT_BRANCH__}) от ${buildDate}`,
        type: LogType.INFO,
        timestamp: Date.now(),
      },
    ];
  });
  const [gameState, setGameState] = useState<GameState>(GameState.EXPLORATION);
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const prevActiveEntityIdRef = useRef<string | null>(null);

  // UI State
  const [selectedTargetEntityId, setSelectedTargetEntityId] = useState<
    string | null
  >(null);
  const [selectedTargetPosition, setSelectedTargetPosition] =
    useState<Position | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [followedEntityId, setFollowedEntityId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [speechBubbles, setSpeechBubbles] = useState<SpeechBubble[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isAuthenticatedRef = useRef(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const followInitializedRef = useRef(false);
  const zoomTimeoutRef = useRef<number | null>(null);
  // Сохраняем начальное состояние для зума (чтобы точка под курсором не дрейфовала)
  const zoomStartRef = useRef<{
    zoom: number;
    offset: { x: number; y: number };
    mouseX: number;
    mouseY: number;
  } | null>(null);
  // Флаг первого срабатывания ResizeObserver (для отложенной инициализации)
  const containerReadyRef = useRef(false);
  // Отложенная инициализация следования (ждём готовности контейнера)
  const pendingFollowIdRef = useRef<string | null>(null);
  // Триггер для пересчёта cameraOffset при ресайзе (просто счётчик)
  const [resizeTrigger, setResizeTrigger] = useState(0);

  // UI Settings
  const [splashNotificationsEnabled, setSplashNotificationsEnabled] = useState(
    () => {
      const saved = localStorage.getItem("splashNotificationsEnabled");
      const value = saved !== null ? JSON.parse(saved) : true;
      return value;
    },
  );

  // Splash Notifications
  const {
    notifications: splashNotifications,
    showNotification: showSplashNotification,
    removeNotification: removeSplashNotification,
  } = useSplashNotifications();

  const handleToggleSplashNotifications = useCallback((enabled: boolean) => {
    setSplashNotificationsEnabled(enabled);
    localStorage.setItem("splashNotificationsEnabled", JSON.stringify(enabled));
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Блокируем зум страницы, оставляя только зум игрового поля
      e.preventDefault();
      e.stopPropagation();

      // Позиция мыши относительно контейнера
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Сохраняем начальное состояние при первом событии зума
      if (!zoomStartRef.current) {
        // Вычисляем актуальный offset камеры (учитывая режим следования)
        let currentOffset = panOffset;
        if (followedEntityId && containerRef.current) {
          const followedEntity =
            entityRegistryRef.current.get(followedEntityId);
          if (followedEntity) {
            const CELL_SIZE = 50 * zoom;
            const containerWidth = containerRef.current.clientWidth;
            const containerHeight = containerRef.current.clientHeight;
            const entityPixelX =
              followedEntity.pos.x * CELL_SIZE + CELL_SIZE / 2;
            const entityPixelY =
              followedEntity.pos.y * CELL_SIZE + CELL_SIZE / 2;
            currentOffset = {
              x: containerWidth / 2 - entityPixelX,
              y: containerHeight / 2 - entityPixelY,
            };
          }
          // Отключаем следование при зуме
          setFollowedEntityId(null);
        }

        zoomStartRef.current = {
          zoom,
          offset: currentOffset,
          mouseX,
          mouseY,
        };
      }

      if (zoomTimeoutRef.current) {
        window.clearTimeout(zoomTimeoutRef.current);
      }
      setIsZooming(true);

      setZoom((prevZoom) => {
        const delta = e.ctrlKey
          ? -e.deltaY / 100
          : e.deltaY > 0
            ? -ZOOM_STEP
            : ZOOM_STEP;
        const newZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, prevZoom + delta),
        );

        // Используем сохранённое начальное состояние для расчётов
        const startState = zoomStartRef.current!;
        const worldX =
          (startState.mouseX - startState.offset.x) / startState.zoom;
        const worldY =
          (startState.mouseY - startState.offset.y) / startState.zoom;

        // Новый offset, чтобы эта же точка осталась под курсором
        const newOffsetX = startState.mouseX - worldX * newZoom;
        const newOffsetY = startState.mouseY - worldY * newZoom;

        setPanOffset({ x: newOffsetX, y: newOffsetY });

        return newZoom;
      });

      zoomTimeoutRef.current = window.setTimeout(() => {
        setIsZooming(false);
        zoomStartRef.current = null; // Сбрасываем начальное состояние
      }, 150);
    },
    [followedEntityId, panOffset, zoom],
  );

  useEffect(() => {
    const preventPageZoom = (e: WheelEvent) => {
      if (!containerRef.current || !e.ctrlKey) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const isInside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isInside) {
        e.preventDefault();
      }
    };

    window.addEventListener("wheel", preventPageZoom, {
      passive: false,
      capture: true,
    });
    return () =>
      window.removeEventListener("wheel", preventPageZoom, { capture: true });
  }, []);

  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        window.clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);

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

  // Ref для доступа к текущему entityRegistry без создания зависимости
  const entityRegistryRef = useRef(entityRegistry);
  useEffect(() => {
    entityRegistryRef.current = entityRegistry;
  }, [entityRegistry]);

  // --- Helper Functions ---
  const addLog = useCallback(
    (
      text: string,
      type: LogType = LogType.INFO,
      commandData?: { action: string; payload?: any },
      position?: Position,
      playerPosition?: Position,
    ) => {
      const logId = `log-${Date.now()}-${Math.random()}`;

      setLogs((prev) => [
        ...prev,
        {
          id: logId,
          text,
          type,
          timestamp: Date.now(),
          commandData,
          position,
          playerPosition,
        },
      ]);

      // Create speech bubble for SPEECH type messages
      if (type === LogType.SPEECH) {
        // Parse entity name from text (format: "EntityName: 'speech text'")
        const match = text.match(/^(.+?):\s*["""'](.+?)["""']$/);
        if (match) {
          const speakerName = match[1].trim();
          const speechText = match[2].trim();

          // Find entity by name using ref to avoid dependency cycle
          const speaker = [...entityRegistryRef.current.values()].find(
            (e) => e.name === speakerName,
          );

          if (speaker) {
            const bubbleId = `bubble-${Date.now()}-${Math.random()}`;
            setSpeechBubbles((prev) => [
              ...prev,
              {
                id: bubbleId,
                entityId: speaker.id,
                text: speechText,
                timestamp: Date.now(),
              },
            ]);

            // Remove speech bubble after 5 seconds
            setTimeout(() => {
              setSpeechBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
            }, 5000);
          }
        }
      }
    },
    [],
  );

  // --- WebSocket: Connect to Server ---
  useEffect(() => {
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 3000;

    const connect = () => {
      // Используем относительный путь для работы через Vite proxy
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("[App] WebSocket connected");
        setIsConnected(true);
        setIsReconnecting(false);
        setReconnectAttempt(0);
        setLoginError(null);
        reconnectAttempts = 0;
        addLog("Connected to server", LogType.INFO);
      };

      ws.onmessage = (evt) => {
        try {
          // TODO: Handle structured server messages with schema (https://github.com/Cognitive-Dungeon/cd-frontend-web/issues/2)
          console.log("[App] WS message received:", evt.data);
          const msg = JSON.parse(evt.data);

          // Handle error responses from server
          if (msg?.error) {
            console.log("[App] Server error:", msg.error);
            addLog(`Server error: ${msg.error}`, LogType.ERROR);
            // If error during login (like "Entity not found"), reset authentication
            if (
              msg.error.includes("Entity not found") ||
              msg.error.includes("not found")
            ) {
              console.log("[App] Login error - resetting authentication");
              setIsAuthenticated(false);
              isAuthenticatedRef.current = false;
              setLoginError(msg.error);
            }
          }

          // Handle INIT/UPDATE payloads from server
          if (msg?.type === "INIT" || msg?.type === "UPDATE") {
            console.log("[App] Received UPDATE", {
              tick: msg.tick,
              myEntityId: msg.myEntityId,
              activeEntityId: msg.activeEntityId,
              gridSize: msg.grid ? `${msg.grid.w}x${msg.grid.h}` : "none",
              mapTiles: msg.map?.length,
              entitiesCount: msg.entities?.length,
            });
            // Update world from grid and map
            if (msg.grid && Array.isArray(msg.map)) {
              console.log("[App] Building world from grid and map");
              const newWorld: GameWorld = {
                width: msg.grid.w,
                height: msg.grid.h,
                level: worldRef.current?.level ?? 1,
                globalTick: msg.tick ?? 0,
                map: [],
              };

              // Initialize empty map
              for (let y = 0; y < newWorld.height; y++) {
                newWorld.map[y] = [];
                for (let x = 0; x < newWorld.width; x++) {
                  newWorld.map[y][x] = {
                    x,
                    y,
                    isWall: true,
                    env: "stone",
                    isVisible: false,
                    isExplored: false,
                  };
                }
              }

              // Update tiles from server
              msg.map.forEach((tileView: any) => {
                if (
                  tileView.y >= 0 &&
                  tileView.y < newWorld.height &&
                  tileView.x >= 0 &&
                  tileView.x < newWorld.width
                ) {
                  newWorld.map[tileView.y][tileView.x] = {
                    x: tileView.x,
                    y: tileView.y,
                    isWall: tileView.isWall ?? false,
                    env: tileView.isWall ? "stone" : "floor",
                    isVisible: tileView.isVisible ?? false,
                    isExplored: tileView.isExplored ?? false,
                  };
                }
              });

              setWorld(newWorld);
              worldRef.current = newWorld;
              console.log("[App] World updated", {
                width: newWorld.width,
                height: newWorld.height,
                tick: newWorld.globalTick,
              });
            }

            // Handle entities
            if (Array.isArray(msg.entities)) {
              console.log("[App] Processing entities", {
                count: msg.entities.length,
                myEntityId: msg.myEntityId,
              });
              const normalizedEntities = msg.entities.map((entity: any) => {
                const normalized: any = {
                  id: entity.id,
                  type: entity.type,
                  name: entity.name,
                  pos: entity.pos,
                  symbol: entity.render?.symbol ?? "?",
                  color: entity.render?.color ?? "#ffffff",
                  label: entity.render?.label ?? "",
                  inventory: [],
                  isHostile: entity.type !== "PLAYER" && entity.type !== "NPC",
                  isDead: entity.stats?.isDead ?? false,
                  nextActionTick: 0,
                  stats: {
                    hp: entity.stats?.hp ?? 0,
                    maxHp: entity.stats?.maxHp ?? 0,
                    stamina: entity.stats?.stamina ?? 0,
                    maxStamina: entity.stats?.maxStamina ?? 0,
                    strength: entity.stats?.strength ?? 0,
                    gold: entity.stats?.gold ?? 0,
                  },
                };
                return normalized;
              });

              // Find player entity by myEntityId
              if (msg.myEntityId) {
                const playerEntity = normalizedEntities.find(
                  (e: any) => e.id === msg.myEntityId,
                );
                if (playerEntity) {
                  console.log("[App] Player entity found", {
                    id: playerEntity.id,
                    name: playerEntity.name,
                    pos: playerEntity.pos,
                  });
                  setPlayer(playerEntity);
                  // Инициализируем следование за игроком только один раз
                  if (!followInitializedRef.current) {
                    pendingFollowIdRef.current = playerEntity.id;
                    followInitializedRef.current = true;
                  }
                } else {
                  console.warn(
                    "[App] Player entity not found for myEntityId:",
                    msg.myEntityId,
                  );
                }

                // Set other entities (excluding player)
                const otherEntities = normalizedEntities.filter(
                  (e: any) => e.id !== msg.myEntityId,
                );
                setEntities(otherEntities);
              } else {
                setEntities(normalizedEntities);
              }
            }

            // Update active entity
            if (msg.activeEntityId !== undefined) {
              setActiveEntityId(msg.activeEntityId);
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
        } catch (error) {
          console.error("WebSocket parse error:", error);
          addLog(`WS parse error: ${error}`, LogType.ERROR);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        addLog("WS error - check console for details", LogType.ERROR);
      };

      ws.onclose = (event) => {
        const wasAuthenticated = isAuthenticatedRef.current;
        console.log("[App] WebSocket closed", {
          code: event.code,
          wasAuthenticated,
        });
        setIsConnected(false);
        setIsAuthenticated(false);
        isAuthenticatedRef.current = false;

        addLog(`Disconnected from server (${event.code})`, LogType.INFO);

        // If we weren't authenticated yet, try to reconnect
        if (!wasAuthenticated && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(
            `[App] Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
          );
          setIsReconnecting(true);
          setReconnectAttempt(reconnectAttempts);
          addLog(
            `Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
            LogType.INFO,
          );
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else if (!wasAuthenticated) {
          console.error(
            `[App] Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
          );
          setIsReconnecting(false);
          addLog(
            `Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
            LogType.ERROR,
          );
        } else {
          console.log("[App] Disconnected after authentication - no reconnect");
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      try {
        if (socketRef.current) {
          socketRef.current.close();
        }
      } catch (e) {
        console.error(e);
      }
      socketRef.current = null;
    };
  }, [addLog]);

  /**
   * Создает типизированную команду из action и payload
   *
   * @param action - Тип действия команды
   * @param payload - Payload команды
   * @returns Типизированная команда или null, если команда невалидна
   */
  // TODO: Refactor this
  const createClientCommand = useCallback(
    (action: string, payload: any): ClientToServerCommand | null => {
      switch (action) {
        case "LOGIN":
          if (!payload.token) {
            return null;
          }
          return {
            action: "LOGIN",
            token: payload.token,
          };

        case "MOVE":
          return {
            action: "MOVE",
            payload: {
              dx: payload.dx,
              dy: payload.dy,
              x: payload.x,
              y: payload.y,
            },
          };

        case "ATTACK":
          if (!payload.targetId) {
            return null;
          }
          return {
            action: "ATTACK",
            payload: { targetId: payload.targetId },
          };

        case "TALK":
          if (!payload.targetId) {
            return null;
          }
          return {
            action: "TALK",
            payload: { targetId: payload.targetId },
          };

        case "INTERACT":
          if (!payload.targetId) {
            return null;
          }
          return {
            action: "INTERACT",
            payload: { targetId: payload.targetId },
          };

        case "WAIT":
          return {
            action: "WAIT",
            payload: {},
          };

        case "CUSTOM":
          return {
            action: "CUSTOM",
            payload: payload,
          };

        default:
          return null;
      }
    },
    [],
  );

  const sendCommand = useCallback(
    (action: string, payload?: any, description?: string) => {
      if (
        !socketRef.current ||
        socketRef.current.readyState !== WebSocket.OPEN
      ) {
        addLog("Not connected to server", LogType.ERROR);
        return;
      }

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

      // Создаем типизированную команду и сериализуем её
      const command = createClientCommand(action, payload ?? {});
      if (!command) {
        addLog(`Неизвестная команда: ${action}`, LogType.ERROR);
        return;
      }

      const serialized = serializeClientCommand(command);
      socketRef.current.send(serialized);

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

        // Замена {text} для речевых команд
        if (payload?.text !== undefined) {
          logMessage = logMessage.replace(/\{text\}/g, String(payload.text));
        }

        // Замена {name} для предметов (inventory)
        if (payload?.name !== undefined) {
          logMessage = logMessage.replace(/\{name\}/g, String(payload.name));
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
    [createClientCommand, entityRegistry, player, activeEntityId, addLog],
  );

  // TODO: Ждем контракта от бекенда, надо будет переделать. Сейчас просто заглушка
  const sendTextCommand = useCallback(
    (text: string, type: "SAY" | "WHISPER" | "YELL" = "SAY") => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      // Отправляем команду с типом речи (SAY/WHISPER/YELL) и текстом в payload
      sendCommand(type, { text: trimmed });
    },
    [sendCommand],
  );

  // TODO: Implement server synchronization for inventory actions
  const handleUseItem = useCallback(
    (item: Item, targetEntityId?: string) => {
      if (!player) {
        return;
      }

      // Check if it's player's turn
      if (activeEntityId && activeEntityId !== player.id) {
        addLog("Не ваш ход!", LogType.ERROR);
        return;
      }

      // Build payload
      const payload: any = { name: item.name };
      if (targetEntityId) {
        payload.targetId = targetEntityId;
      }

      // Send USE command to server
      sendCommand(
        "USE",
        payload,
        `использовали ${item.name}${targetEntityId ? ` на {targetName}` : ""}`,
      );
    },
    [player, activeEntityId, sendCommand, addLog],
  );

  // TODO: Implement server synchronization for inventory actions
  const handleDropItem = useCallback(
    (item: Item) => {
      if (!player) {
        return;
      }

      // Check if it's player's turn
      if (activeEntityId && activeEntityId !== player.id) {
        addLog("Не ваш ход!", LogType.ERROR);
        return;
      }

      // Send DROP command to server
      sendCommand("DROP", { name: item.name }, `бросили ${item.name}`);
    },
    [player, activeEntityId, sendCommand, addLog],
  );

  const handleLogin = useCallback(
    (entityId: string) => {
      console.log("[App] handleLogin called", { entityId });
      // Clear previous login error
      setLoginError(null);
      sendCommand("LOGIN", { token: entityId }, `Авторизация как ${entityId}`);
      addLog(`Отправлен запрос на авторизацию: ${entityId}`, LogType.INFO);
      // Set authenticated immediately on login send
      console.log("[App] Setting isAuthenticated = true");
      setIsAuthenticated(true);
      isAuthenticatedRef.current = true;
    },
    [sendCommand, addLog, setLoginError, setIsAuthenticated],
  );

  const handleMovePlayer = useCallback(
    (x: number, y: number) => {
      if (!player) {
        return;
      }

      // Check if it's player's turn
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

  const handleSelectEntity = useCallback((entityId: string | null) => {
    setSelectedTargetEntityId(entityId);
  }, []);

  const handleSelectPosition = useCallback((x: number, y: number) => {
    setSelectedTargetPosition({ x, y });
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
        //const borderOffset = Math.max(2, zoom * 2);
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
      if (!entity) {
        return;
      }

      // Выделяем сущность как цель
      setSelectedTargetEntityId(entityId);
      // Выделяем её позицию
      setSelectedTargetPosition({ x: entity.pos.x, y: entity.pos.y });
      // Отключаем следование и перемещаем камеру к сущности
      setFollowedEntityId(null);

      if (world && containerRef.current) {
        const CELL_SIZE = 50 * zoom;

        const entityPixelX = entity.pos.x * CELL_SIZE + CELL_SIZE / 2;
        const entityPixelY = entity.pos.y * CELL_SIZE + CELL_SIZE / 2;

        const offsetX = containerRef.current.clientWidth / 2 - entityPixelX;
        const offsetY = containerRef.current.clientHeight / 2 - entityPixelY;

        setPanOffset({ x: offsetX, y: offsetY });
      }
    },
    [entityRegistry, world, zoom],
  );

  const handleGoToPathfinding = useCallback(
    (targetPos: Position) => {
      if (!player || !world) {
        return;
      }

      // Check if it's player's turn
      if (activeEntityId && activeEntityId !== player.id) {
        addLog("Сейчас не ваш ход — маршрут не построен", LogType.INFO);
        return;
      }

      // Stop any existing pathfinding
      if (pathfindingTimeoutRef.current) {
        clearTimeout(pathfindingTimeoutRef.current);
        pathfindingTimeoutRef.current = null;
      }
      setWaitingForMoveResponse(false);
      lastCommandedPosRef.current = null;

      // Find path
      const path = findPath(player.pos, targetPos, world);

      if (!path || path.length === 0) {
        addLog(
          `Не удалось найти путь к <span class="cursor-pointer text-orange-400 hover:underline" data-position-x="${targetPos.x}" data-position-y="${targetPos.y}">(${targetPos.x}, ${targetPos.y})</span>`,
          LogType.ERROR,
          undefined,
          { x: player.pos.x, y: player.pos.y },
        );
        return;
      }

      // Set pathfinding state
      setPathfindingTarget(targetPos);
      setCurrentPath([player.pos, ...path]);
      setIsPathfinding(true);
      setSelectedTargetPosition(targetPos);

      addLog(
        `Начинаем движение к <span class="cursor-pointer text-orange-400 hover:underline" data-position-x="${targetPos.x}" data-position-y="${targetPos.y}">(${targetPos.x}, ${targetPos.y})</span>, длина пути: ${path.length}`,
        LogType.INFO,
        undefined,
        targetPos,
        { x: player.pos.x, y: player.pos.y },
      );
    },
    [player, world, activeEntityId, addLog],
  );

  const handleFollowEntity = useCallback((entityId: string | null) => {
    // При включении следования — триггерим пересчёт cameraOffset
    if (entityId) {
      setResizeTrigger((prev) => prev + 1);
    }
    setFollowedEntityId(entityId);
  }, []);

  const handleContextMenu = useCallback((data: ContextMenuData) => {
    setContextMenu(data);
  }, []);

  // Pathfinding execution loop - send next move command
  useEffect(() => {
    if (!isPathfinding || currentPath.length <= 1 || !player || !world) {
      return;
    }

    // Pause pathfinding if it's not player's turn (don't clear the path, just wait)
    if (activeEntityId && activeEntityId !== player.id) {
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
    setTimeout(() => {
      sendCommand(
        "MOVE",
        { dx, dy },
        `пошли на (${nextStep.x}, ${nextStep.y})`,
      );

      // Mark that we're waiting for server response
      setWaitingForMoveResponse(true);
      lastCommandedPosRef.current = nextStep;
    }, 0);

    // TODO: В будущем будем ждать нашего хода (turn-based система). ПОКА НЕ РЕАЛИЗОВАНО
    // Set timeout as fallback in case server doesn't respond
    pathfindingTimeoutRef.current = setTimeout(() => {
      if (player) {
        addLog(
          `Таймаут ожидания ответа сервера. Остановка пути.`,
          LogType.ERROR,
          undefined,
          { x: player.pos.x, y: player.pos.y },
        );
      }
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
    player,
    world,
    sendCommand,
    activeEntityId,
    addLog,
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
      setTimeout(() => {
        setCurrentPath((prev) => prev.slice(1));
        setWaitingForMoveResponse(false);
        lastCommandedPosRef.current = null;
      }, 0);
    } else {
      // Check if player position changed but not to expected position
      // This means server blocked the move
      const prevPos = currentPath[0];
      if (
        prevPos &&
        (currentPos.x !== prevPos.x || currentPos.y !== prevPos.y)
      ) {
        // Position changed but not to where we expected - server moved us elsewhere
        setTimeout(() => {
          addLog(
            `Сервер переместил на неожиданную позицию (${currentPos.x}, ${currentPos.y}). Остановка пути.`,
            LogType.ERROR,
            undefined,
            { x: currentPos.x, y: currentPos.y },
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
        }, 0);
      }
    }
  }, [
    player?.pos.x,
    player?.pos.y,
    player,
    waitingForMoveResponse,
    currentPath,
    addLog,
  ]);

  // Stop pathfinding when reached target
  useEffect(() => {
    if (!isPathfinding || !player || !pathfindingTarget) {
      return;
    }

    if (
      player.pos.x === pathfindingTarget.x &&
      player.pos.y === pathfindingTarget.y
    ) {
      setTimeout(() => {
        addLog(
          `Достигли цели <span class="cursor-pointer text-orange-400 hover:underline" data-position-x="${pathfindingTarget.x}" data-position-y="${pathfindingTarget.y}">(${pathfindingTarget.x}, ${pathfindingTarget.y})</span>`,
          LogType.SUCCESS,
          undefined,
          pathfindingTarget,
          { x: player.pos.x, y: player.pos.y },
        );
        setIsPathfinding(false);
        setCurrentPath([]);
        setPathfindingTarget(null);
      }, 0);
    }
  }, [
    player?.pos.x,
    player?.pos.y,
    player,
    isPathfinding,
    pathfindingTarget,
    addLog,
  ]);

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

      // Ignore if target is within the chat/log area (user might be interacting with text)
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

  // Обработка панорамирования (drag to pan)
  useEffect(() => {
    let hasMoved = false;
    let animationFrameId: number | null = null;
    let pendingPanOffset: { x: number; y: number } | null = null;

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
          // Убираем фокус с активного элемента (например, поля ввода чата) при клике на карту
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }

          hasMoved = false;
          setIsPanning(true);
          setContextMenu(null); // Close context menu when panning starts

          // Если включено следование, вычисляем текущий offset камеры
          let currentOffset = panOffset;
          if (followedEntityId && world) {
            const followedEntity = entityRegistry.get(followedEntityId);
            if (followedEntity && containerRef.current) {
              const containerWidth = containerRef.current.clientWidth;
              const containerHeight = containerRef.current.clientHeight;
              const CELL_SIZE = 50 * zoom;
              //const borderOffset = Math.max(2, zoom * 2);
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

        // Store pending offset instead of updating immediately
        pendingPanOffset = {
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        };

        // Use requestAnimationFrame for smooth updates
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(() => {
            if (pendingPanOffset) {
              setPanOffset(pendingPanOffset);
              pendingPanOffset = null;
            }
            animationFrameId = null;
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      hasMoved = false;

      // Cancel any pending animation frame
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      // Apply final pending offset
      if (pendingPanOffset) {
        setPanOffset(pendingPanOffset);
        pendingPanOffset = null;
      }
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

      // Cancel animation frame on cleanup
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
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

  // Update container dimensions when they change
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        // Просто триггерим пересчёт — ref уже содержит актуальные размеры
        setResizeTrigger((prev) => prev + 1);

        // При первом получении реальных размеров — инициализируем отложенное следование
        if (!containerReadyRef.current) {
          const width = containerRef.current.clientWidth;
          const height = containerRef.current.clientHeight;
          if (width > 0 && height > 0) {
            containerReadyRef.current = true;
            if (pendingFollowIdRef.current) {
              setFollowedEntityId(pendingFollowIdRef.current);
              pendingFollowIdRef.current = null;
            }
          }
        }
      }
    };

    // Use ResizeObserver to track container size changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Вычисляем offset для центрирования на отслеживаемой сущности
  const cameraOffset = useMemo(() => {
    if (!followedEntityId || !world || !player || !containerRef.current) {
      return panOffset;
    }

    const followedEntity = entityRegistry.get(followedEntityId);
    if (!followedEntity) {
      return panOffset;
    }

    const CELL_SIZE = 50 * zoom;

    // Используем размеры контейнера напрямую из ref (resizeTrigger гарантирует пересчёт)
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Позиция отслеживаемой сущности в пикселях относительно сетки
    const entityPixelX = followedEntity.pos.x * CELL_SIZE + CELL_SIZE / 2;
    const entityPixelY = followedEntity.pos.y * CELL_SIZE + CELL_SIZE / 2;

    // Вычисляем offset, чтобы сущность была в центре контейнера
    const offsetX = containerWidth / 2 - entityPixelX;
    const offsetY = containerHeight / 2 - entityPixelY;

    return { x: offsetX, y: offsetY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    followedEntityId,
    world,
    player,
    entityRegistry,
    panOffset,
    zoom,
    resizeTrigger,
  ]);

  // Show "Ваш ход" notification when turn changes to player
  useEffect(() => {
    if (
      splashNotificationsEnabled &&
      activeEntityId &&
      player &&
      activeEntityId === player.id &&
      prevActiveEntityIdRef.current !== player.id
    ) {
      showSplashNotification("Ваш ход");
    }
    prevActiveEntityIdRef.current = activeEntityId;
  }, [
    activeEntityId,
    player,
    showSplashNotification,
    splashNotificationsEnabled,
  ]);

  const selectedTarget = selectedTargetEntityId
    ? entities.find((e) => e.id === selectedTargetEntityId)
    : null;

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-950 overflow-hidden text-gray-300 font-mono">
      {/* Индикатор подключения */}
      {!isConnected && !isReconnecting && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
          <span className="font-semibold">Подключение к серверу...</span>
        </div>
      )}

      {/* Индикатор переподключения */}
      {isReconnecting && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
          <span className="font-semibold">
            Переподключение... (попытка {reconnectAttempt}/10)
          </span>
        </div>
      )}

      {player && (
        <StatusPanel
          player={player}
          gameState={gameState}
          globalTick={world?.globalTick ?? 0}
          target={selectedTarget}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-black flex flex-col relative border-r border-neutral-800">
          <div
            ref={containerRef}
            className={`absolute inset-0 overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            onWheel={handleWheel}
          >
            {/* Сообщение ожидания данных */}
            {(!world || !player) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-gray-400 text-xl mb-4">
                    Ожидание данных от сервера...
                  </div>
                  <div className="text-gray-600 text-sm">
                    Подключитесь к серверу для начала игры
                  </div>
                </div>
              </div>
            )}

            {/* Индикатор зума и переключатель следования */}
            {world && player && (
              <div className="absolute top-2 right-2 flex flex-col gap-2 z-50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoom(1);
                  }}
                  className="bg-black/80 text-white px-3 py-1 rounded text-xs font-mono border border-neutral-600 hover:border-cyan-400 hover:text-cyan-200 transition-colors"
                >
                  Zoom: {(zoom * 100).toFixed(0)}%
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (followedEntityId) {
                      // Вычисляем и сохраняем текущий offset камеры перед выходом из режима следования
                      if (containerRef.current && world) {
                        const followedEntity =
                          entityRegistry.get(followedEntityId);

                        if (followedEntity) {
                          const containerWidth =
                            containerRef.current.clientWidth;
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
                      // При включении следования — триггерим пересчёт cameraOffset
                      setResizeTrigger((prev) => prev + 1);
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
            )}

            {world && player && (
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
                  disableAnimations={isZooming}
                  followedEntityId={followedEntityId}
                  speechBubbles={speechBubbles}
                  onMovePlayer={handleMovePlayer}
                  onSelectEntity={handleSelectEntity}
                  onSelectPosition={handleSelectPosition}
                  onFollowEntity={handleFollowEntity}
                  onSendCommand={sendCommand}
                  onGoToPathfinding={handleGoToPathfinding}
                  onContextMenu={handleContextMenu}
                  selectedTargetEntityId={selectedTargetEntityId}
                  selectedTargetPosition={selectedTargetPosition}
                  pathfindingTarget={pathfindingTarget}
                  currentPath={currentPath}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <WindowManagerProvider>
        <WindowSystem
          keyBindingManager={keyBindingManager}
          entities={player ? [player, ...entities] : entities}
          activeEntityId={activeEntityId}
          playerId={player?.id ?? null}
          onEntityClick={handleGoToEntity}
          logs={logs}
          onGoToPosition={handleGoToPosition}
          onGoToEntity={handleGoToEntity}
          onSendCommand={sendTextCommand}
          onContextMenu={handleContextMenu}
          splashNotificationsEnabled={splashNotificationsEnabled}
          onToggleSplashNotifications={handleToggleSplashNotifications}
          playerInventory={player?.inventory ?? []}
          onUseItem={handleUseItem}
          onDropItem={handleDropItem}
          onLogin={handleLogin}
          isAuthenticated={isAuthenticated}
          wsConnected={isConnected}
          loginError={loginError}
        />
      </WindowManagerProvider>

      {contextMenu && (
        <ContextMenu
          data={contextMenu}
          onClose={() => setContextMenu(null)}
          onSelectEntity={handleSelectEntity}
          onFollowEntity={handleFollowEntity}
          onSendCommand={sendCommand}
          onSelectPosition={handleSelectPosition}
          onGoToPathfinding={handleGoToPathfinding}
        />
      )}

      {/* Splash Notifications */}
      {splashNotifications.map((notification) => (
        <SplashNotification
          key={notification.id}
          notification={notification}
          onComplete={removeSplashNotification}
        />
      ))}
    </div>
  );
};

export default App;
