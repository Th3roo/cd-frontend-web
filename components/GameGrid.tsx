import { FC } from "react";

import { SYMBOLS, COLORS, TILE_SIZE } from "../constants";
import { GameWorld, Entity, Position, EntityType } from "../types";

interface GameGridProps {
  world: GameWorld;
  entities: Entity[];
  playerPos: Position;
  fovRadius: number;
}

const GameGrid: FC<GameGridProps> = ({ world, entities, playerPos }) => {
  const getEntitiesAt = (x: number, y: number) => {
    return entities
      .filter((e) => e.pos.x === x && e.pos.y === y && !e.isDead)
      .sort((a, b) => {
        const order = {
          [EntityType.EXIT]: 1,
          [EntityType.ITEM]: 2,
          [EntityType.NPC]: 3,
          [EntityType.ENEMY_GOBLIN]: 4,
          [EntityType.ENEMY_ORC]: 4,
          [EntityType.CHEST]: 4,
          [EntityType.PLAYER]: 10,
        };
        return (order[a.type] || 0) - (order[b.type] || 0);
      });
  };

  return (
    <div
      className="relative bg-black select-none shadow-2xl shadow-black"
      style={{
        width: world.width * TILE_SIZE,
        height: world.height * TILE_SIZE,
        display: "grid",
        gridTemplateColumns: `repeat(${world.width}, ${TILE_SIZE}px)`,
        gridTemplateRows: `repeat(${world.height}, ${TILE_SIZE}px)`,
      }}
    >
      {world.map.flatMap((row, y) =>
        row.map((tile, x) => {
          const stack = getEntitiesAt(x, y);
          const topEntity = stack.length > 0 ? stack[stack.length - 1] : null;

          const dist = Math.sqrt(
            Math.pow(x - playerPos.x, 2) + Math.pow(y - playerPos.y, 2),
          );
          const isVisible = world.level === 0 ? true : dist <= 8; // Town is always visible
          const isExplored = tile.isExplored || isVisible;

          let content = " ";
          let colorClass = "";
          let bgClass = "bg-neutral-900";

          if (!isExplored) {
            return <div key={`${x}-${y}`} className="bg-black" />;
          }

          if (isVisible) {
            if (topEntity) {
              content = topEntity.symbol;
              colorClass = topEntity.color;
              if (topEntity.type === EntityType.PLAYER) {
                colorClass = `${COLORS.PLAYER} font-bold animate-pulse`;
              }
            } else {
              // Environment Rendering
              if (tile.env === "grass") {
                content = SYMBOLS.GRASS;
                colorClass = COLORS.GRASS;
                bgClass = "bg-green-950/20";
              } else if (tile.env === "water") {
                content = SYMBOLS.WATER;
                colorClass = COLORS.WATER;
                bgClass = "bg-blue-900/20";
              } else if (tile.env === "tree") {
                content = SYMBOLS.TREE;
                colorClass = COLORS.TREE;
              } else {
                content = tile.isWall ? SYMBOLS.WALL : SYMBOLS.FLOOR;
                colorClass = tile.isWall ? COLORS.WALL : COLORS.FLOOR;
              }
            }
          } else {
            // Explored but out of sight (Memory)
            if (tile.env === "grass") {
              content = SYMBOLS.GRASS;
            } else if (tile.env === "water") {
              content = SYMBOLS.WATER;
            } else if (tile.env === "tree") {
              content = SYMBOLS.TREE;
            } else {
              content = tile.isWall ? SYMBOLS.WALL : SYMBOLS.FLOOR;
            }
            colorClass = "text-gray-800";
          }

          return (
            <div
              key={`${x}-${y}`}
              className={`flex items-center justify-center text-lg leading-none ${bgClass} ${colorClass} relative group`}
              style={{ width: TILE_SIZE, height: TILE_SIZE }}
            >
              {content}

              {isVisible && topEntity && topEntity.isHostile && (
                <div className="absolute -top-1 -right-1 bg-neutral-800 text-white text-[9px] px-1 rounded border border-neutral-600 font-bold z-10">
                  {topEntity.label}
                </div>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
};

export default GameGrid;
