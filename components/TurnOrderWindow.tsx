import React from "react";
import { Entity } from "../types";
import { Users, Sword, User, Heart, Zap, Coins, Shield } from "lucide-react";

interface TurnOrderWindowProps {
  entities: Entity[];
  activeEntityId: string | null;
  playerId: string | null;
}

export const TurnOrderWindow: React.FC<TurnOrderWindowProps> = ({
  entities,
  activeEntityId,
  playerId,
}) => {
  // Sort entities by nextActionTick to create turn order
  const sortedEntities = [...entities].sort(
    (a, b) => a.nextActionTick - b.nextActionTick
  );

  const getEntityIcon = (entity: Entity) => {
    if (entity.id === playerId) {
      return <User size={24} className="text-blue-400" />;
    }
    if (entity.isHostile) {
      return <Sword size={24} className="text-red-400" />;
    }
    return <Users size={24} className="text-green-400" />;
  };

  const getEntityTypeLabel = (entity: Entity) => {
    if (entity.id === playerId) return "Player";
    if (entity.isHostile) return "Hostile";
    if (entity.npcType) return entity.npcType;
    return "NPC";
  };

  const getStatusClass = (entity: Entity) => {
    if (entity.isDead) return "text-gray-500";
    if (entity.id === activeEntityId) return "text-cyan-400";
    if (entity.id === playerId) return "text-blue-400";
    if (entity.isHostile) return "text-red-400";
    return "text-green-400";
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-gray-200">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedEntities.map((entity, index) => (
          <div
            key={entity.id}
            className={`relative bg-neutral-800 border-2 rounded-lg p-4 transition-all ${
              entity.id === activeEntityId
                ? "border-cyan-500 bg-cyan-950/30 shadow-lg shadow-cyan-500/20"
                : entity.id === playerId
                ? "border-blue-500"
                : entity.isHostile
                ? "border-red-600"
                : "border-neutral-700"
            } ${entity.isDead ? "opacity-50" : ""}`}
          >
            {/* Position badge */}
            <div className="absolute -top-2 -left-2 w-8 h-8 bg-neutral-900 border-2 border-neutral-700 rounded-full flex items-center justify-center font-bold text-xs">
              {index + 1}
            </div>

            {/* Active indicator */}
            {entity.id === activeEntityId && (
              <div className="absolute -top-2 -right-2">
                <div className="relative w-6 h-6">
                  <div className="absolute inset-0 bg-cyan-500 rounded-full animate-ping opacity-75" />
                  <div className="absolute inset-0 bg-cyan-500 rounded-full" />
                </div>
              </div>
            )}

            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="flex-shrink-0 w-12 h-12 bg-neutral-900 rounded-full flex items-center justify-center">
                {getEntityIcon(entity)}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-bold text-lg truncate ${getStatusClass(entity)}`}>
                    {entity.name}
                  </h3>
                  <span className="flex-shrink-0 text-xs px-2 py-0.5 bg-neutral-700 rounded">
                    {entity.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400">
                    {getEntityTypeLabel(entity)}
                  </span>
                  {entity.isDead && (
                    <span className="text-xs px-2 py-0.5 bg-red-900/30 text-red-400 rounded border border-red-700">
                      Dead
                    </span>
                  )}
                  {entity.aiState && (
                    <span className="text-xs px-2 py-0.5 bg-neutral-700 text-gray-300 rounded">
                      {entity.aiState}
                    </span>
                  )}
                  {entity.personality && (
                    <span className="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded border border-purple-700">
                      {entity.personality}
                    </span>
                  )}
                </div>

                {/* Stats */}
                {entity.stats && (
                  <div className="space-y-2">
                    {/* HP Bar */}
                    <div className="flex items-center gap-2">
                      <Heart size={14} className="text-red-400 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">HP</span>
                          <span className="font-mono">
                            {entity.stats.hp}/{entity.stats.maxHp}
                          </span>
                        </div>
                        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-300"
                            style={{
                              width: `${(entity.stats.hp / entity.stats.maxHp) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Stamina Bar */}
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-yellow-400 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Stamina</span>
                          <span className="font-mono">
                            {entity.stats.stamina}/{entity.stats.maxStamina}
                          </span>
                        </div>
                        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all duration-300"
                            style={{
                              width: `${(entity.stats.stamina / entity.stats.maxStamina) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Additional stats */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="flex items-center gap-1 text-xs">
                        <Shield size={12} className="text-gray-400" />
                        <span className="text-gray-400">STR:</span>
                        <span className="font-mono font-bold">{entity.stats.strength}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Coins size={12} className="text-yellow-400" />
                        <span className="text-gray-400">Gold:</span>
                        <span className="font-mono font-bold text-yellow-400">
                          {entity.stats.gold}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Turn info */}
                <div className="mt-3 pt-3 border-t border-neutral-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Next Action Tick:</span>
                    <span className="font-mono font-bold text-cyan-400">
                      {entity.nextActionTick}
                    </span>
                  </div>
                </div>

                {/* Position */}
                <div className="mt-2 text-xs text-gray-500">
                  Position: ({entity.pos.x}, {entity.pos.y})
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer with active turn info */}
      {activeEntityId && (
        <div className="border-t border-neutral-800 p-3 bg-neutral-950">
          {activeEntityId === playerId ? (
            <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span>YOUR TURN</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-orange-400">
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
              <span>
                Waiting for{" "}
                {sortedEntities.find((e) => e.id === activeEntityId)?.name || "Unknown"}
                's turn...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
