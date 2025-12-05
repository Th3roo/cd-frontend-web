import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { WindowSystem } from "./components/WindowSystem";

import {
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
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Helper Functions ---
  const addLog = (
    text: string,
    type: LogType = LogType.INFO,
    commandData?: { action: string; payload?: any },
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        text,
        type,
        timestamp: Date.now(),
        commandData,
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

      // Форматируем сообщение лога
      let logMessage: string;

      if (description) {
        // Если есть описание, используем его
        logMessage = `Вы ${description}`;
      } else if (payload?.targetId) {
        // Если есть targetId, ищем сущность по ID
        const targetEntity = entities.find((e) => e.id === payload.targetId);
        const targetName = targetEntity
          ? targetEntity.name
          : `ID:${payload.targetId}`;
        logMessage = `Вы выполнили ${action} на ${targetName}`;
      } else if (payload?.x !== undefined && payload?.y !== undefined) {
        // Если есть позиция x, y
        logMessage = `Вы выполнили ${action} на позицию (${payload.x}, ${payload.y})`;
      } else {
        // Просто показываем действие
        logMessage = `Вы выполнили ${action}`;
      }

      // Сохраняем полные данные команды для отображения JSON
      addLog(logMessage, LogType.COMMAND, { action, payload });
    },
    [entities],
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
          setIsPanning(true);
          setPanStart({
            x: e.clientX - panOffset.x,
            y: e.clientY - panOffset.y,
          });
          e.preventDefault();
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        e.preventDefault();
        setPanOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
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
  }, [isPanning, panStart, panOffset]);

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
            className={`absolute inset-0 overflow-hidden flex items-center justify-center p-4 ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
          >
            {/* Индикатор зума */}
            <div className="absolute top-2 right-2 bg-black/80 text-white px-3 py-1 rounded text-xs font-mono z-50 border border-neutral-600 pointer-events-none">
              Zoom: {(zoom * 100).toFixed(0)}%
            </div>
            <div
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              }}
            >
              <GameGrid
                world={world}
                entities={[player, ...entities]}
                playerPos={player.pos}
                fovRadius={8}
                zoom={zoom}
                onMovePlayer={handleMovePlayer}
                onSelectEntity={handleSelectEntity}
                onSelectPosition={handleSelectPosition}
                selectedTargetEntityId={selectedTargetEntityId}
                selectedTargetPosition={selectedTargetPosition}
              />
            </div>
          </div>
        </div>
        <div className="w-[450px] flex flex-col bg-neutral-900">
          <div className="flex-1 overflow-hidden relative">
            <GameLog logs={logs} />
          </div>
          <div className="p-3 bg-neutral-950 border-t border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-cyan-500 font-bold">{">"}</span>
              <input
                autoFocus
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
