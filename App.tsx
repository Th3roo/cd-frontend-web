import { useState, useEffect, useRef } from "react";

import GameGrid from "./components/GameGrid";
import GameLog from "./components/GameLog";
import StatusPanel from "./components/StatusPanel";
import { GameWorld, Entity, GameState, LogMessage, LogType } from "./types";

const App: React.FC = () => {
  const socketRef = useRef<WebSocket | null>(null);

  // --- React State (For Rendering) ---
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [player, setPlayer] = useState<Entity | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [gameState, setGameState] = useState<GameState>(GameState.EXPLORATION);
  const [logs, setLogs] = useState<LogMessage[]>([]);

  // UI State
  const [commandInput, setCommandInput] = useState("");

  // --- Helper Functions ---
  const addLog = (text: string, type: LogType = LogType.INFO) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        text,
        type,
        timestamp: Date.now(),
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

  const sendCommand = (command: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      addLog("No connection to server", LogType.ERROR);
      return;
    }

    // TODO: Сделать прием в функцию sendCommand уже облекта сообщения,
    // а здесь просто разобрать его в json и отправить
    const message = {
      type: command,
    };

    socketRef.current.send(JSON.stringify(message));
    addLog(command, LogType.COMMAND);
    setCommandInput("");
  };

  // --- UI Handlers ---
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      sendCommand(commandInput);
    }
  };

  if (!world || !player) {
    return <div className="text-white p-10">Connecting to server...</div>;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-950 overflow-hidden text-gray-300 font-mono">
      <StatusPanel
        player={player}
        gameState={gameState}
        globalTick={world.globalTick}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-black flex flex-col relative border-r border-neutral-800">
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <GameGrid
              world={world}
              entities={[player, ...entities]}
              playerPos={player.pos}
              fovRadius={8}
            />
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
    </div>
  );
};

export default App;
