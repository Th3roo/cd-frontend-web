import { useState, useRef, useEffect, useMemo, useCallback } from "react";

import {
  GameWorld,
  Entity,
  LogMessage,
  GameState,
  LogType,
  Position,
  SpeechBubble,
} from "../types";

export const useGameState = () => {
  // --- React State (For Rendering) ---
  const [world, setWorld] = useState<GameWorld | null>(null);
  const worldRef = useRef<GameWorld | null>(null);

  const [player, setPlayer] = useState<Entity | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);

  const [logs, setLogs] = useState<LogMessage[]>(() => {
    // Initial build info log
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

  const [gameState] = useState<GameState>(GameState.EXPLORATION);
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [speechBubbles, setSpeechBubbles] = useState<SpeechBubble[]>([]);

  // Keep worldRef in sync with latest world
  useEffect(() => {
    worldRef.current = world;
  }, [world]);

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

  /**
   * Добавляет лог с поддержкой речевых пузырей
   */
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

  /**
   * Обрабатывает сообщения от сервера
   */
  const handleServerMessage = useCallback(
    (msg: any) => {
      // Handle INIT/UPDATE payloads from server
      if (msg?.type === "INIT" || msg?.type === "UPDATE") {
        // Update world from grid and map
        if (msg.grid && Array.isArray(msg.map)) {
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
        }

        // Handle entities
        if (Array.isArray(msg.entities)) {
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
              setPlayer(playerEntity);
            } else {
              console.warn(
                "[useGameState] Player entity not found for myEntityId:",
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
    },
    [addLog],
  );

  return {
    world,
    setWorld,
    worldRef,
    player,
    setPlayer,
    entities,
    setEntities,
    logs,
    setLogs,
    gameState,
    activeEntityId,
    setActiveEntityId,
    speechBubbles,
    setSpeechBubbles,
    entityRegistry,
    entityRegistryRef,
    addLog,
    handleServerMessage,
  };
};
