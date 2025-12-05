import { FC } from "react";

import { Entity, GameState } from "../types";

interface StatusPanelProps {
  player: Entity;
  gameState: GameState;
  target?: Entity | null;
  globalTick?: number; // Added
}

const ProgressBar: FC<{
  value: number;
  max: number;
  color: string;
  label: string;
}> = ({ value, max, color, label }) => {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs uppercase text-gray-400 mb-1">
        <span>{label}</span>
        <span>
          {Math.floor(value)} / {max}
        </span>
      </div>
      <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const formatTime = (ticks: number) => {
  // 1 tick = 1 minute roughly for display logic, or abstract
  // Let's say 100 ticks = 1 hour
  const totalHours = Math.floor(ticks / 100);
  const day = Math.floor(totalHours / 24) + 1;
  const hour = totalHours % 24;
  const minute = Math.floor((ticks % 100) * 0.6); // 100 ticks -> 60 mins

  return `День ${day}, ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

const StatusPanel: FC<StatusPanelProps> = ({
  player,
  gameState,
  target,
  globalTick = 0,
}) => {
  return (
    <div className="bg-neutral-900 border-b border-neutral-700 p-4 flex justify-between items-center h-24">
      {/* Player Stats */}
      <div className="w-1/3">
        <h2 className="text-cyan-400 font-bold text-sm mb-2 flex items-center gap-2">
          <span>{player.symbol}</span> {player.name}
        </h2>
        <div className="flex gap-4 mb-2 text-xs text-yellow-400 font-bold">
          <span>Золото: {player.stats.gold}g</span>
        </div>
        <div className="flex gap-2 w-full">
          <div className="flex-1">
            <ProgressBar
              value={player.stats.hp}
              max={player.stats.maxHp}
              color="bg-red-500"
              label="HP"
            />
          </div>
          <div className="flex-1">
            <ProgressBar
              value={player.stats.stamina}
              max={player.stats.maxStamina}
              color="bg-yellow-500"
              label="STM"
            />
          </div>
        </div>
      </div>

      {/* Game State Indicator */}
      <div className="flex flex-col items-center">
        <div
          className={`px-4 py-1 rounded border ${gameState === GameState.COMBAT ? "border-red-500 text-red-500 animate-pulse" : "border-green-500 text-green-500"}`}
        >
          {gameState === GameState.COMBAT ? "⚠ БОЙ" : "ИССЛЕДОВАНИЕ"}
        </div>
        <div className="text-xs text-gray-500 mt-2 font-mono">
          {formatTime(globalTick)}
        </div>
      </div>

      {/* Target Stats (if any) */}
      <div className="w-1/3 flex flex-col items-end">
        {target && !target.isDead ? (
          <div className="w-full text-right">
            <h2 className={`font-bold text-sm mb-2 ${target.color}`}>
              {target.name} {target.symbol}
            </h2>
            <ProgressBar
              value={target.stats.hp}
              max={target.stats.maxHp}
              color="bg-purple-600"
              label="Здоровье Врага"
            />
          </div>
        ) : (
          <div className="text-gray-700 text-sm italic">Нет активной цели</div>
        )}
      </div>
    </div>
  );
};

export default StatusPanel;
