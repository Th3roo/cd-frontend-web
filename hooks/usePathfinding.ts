import { useState, useRef, useCallback, useEffect } from "react";

import { Position, Entity, GameWorld, LogType } from "../types";
import { findPath } from "../utils/pathfinding";

interface UsePathfindingProps {
  player: Entity | null;
  world: GameWorld | null;
  activeEntityId: string | null;
  addLog: (
    text: string,
    type: LogType,
    commandData?: any,
    position?: Position,
    playerPosition?: Position,
  ) => void;
  sendCommand: (action: string, payload?: any, description?: string) => void;
}

export const usePathfinding = ({
  player,
  world,
  activeEntityId,
  addLog,
  sendCommand,
}: UsePathfindingProps) => {
  const [pathfindingTarget, setPathfindingTarget] = useState<Position | null>(
    null,
  );
  const [currentPath, setCurrentPath] = useState<Position[]>([]);
  const [isPathfinding, setIsPathfinding] = useState(false);
  const [waitingForMoveResponse, setWaitingForMoveResponse] = useState(false);
  const pathfindingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCommandedPosRef = useRef<Position | null>(null);

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

  const stopPathfinding = useCallback(() => {
    if (pathfindingTimeoutRef.current) {
      clearTimeout(pathfindingTimeoutRef.current);
      pathfindingTimeoutRef.current = null;
    }
    setIsPathfinding(false);
    setCurrentPath([]);
    setPathfindingTarget(null);
    setWaitingForMoveResponse(false);
    lastCommandedPosRef.current = null;
  }, []);

  // Pathfinding execution loop - send next move command
  useEffect(() => {
    if (!isPathfinding || currentPath.length <= 1 || !player || !world) {
      return;
    }

    // Pause pathfinding if it's not player's turn
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
      stopPathfinding();
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
    stopPathfinding,
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
      const prevPos = currentPath[0];
      if (
        prevPos &&
        (currentPos.x !== prevPos.x || currentPos.y !== prevPos.y)
      ) {
        // Position changed but not to where we expected
        setTimeout(() => {
          addLog(
            `Сервер переместил на неожиданную позицию (${currentPos.x}, ${currentPos.y}). Остановка пути.`,
            LogType.ERROR,
            undefined,
            { x: currentPos.x, y: currentPos.y },
          );
          stopPathfinding();
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
    stopPathfinding,
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
        stopPathfinding();
      }, 0);
    }
  }, [
    player?.pos.x,
    player?.pos.y,
    player,
    isPathfinding,
    pathfindingTarget,
    addLog,
    stopPathfinding,
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

  return {
    pathfindingTarget,
    currentPath,
    isPathfinding,
    handleGoToPathfinding,
    stopPathfinding,
  };
};
