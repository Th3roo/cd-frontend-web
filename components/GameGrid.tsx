import { FC, useCallback, useState } from "react";

import { COLORS, SYMBOLS } from "../constants";
import {
  ContextMenuData,
  Entity,
  EntityType,
  GameWorld,
  Position,
} from "../types";

import { ContextMenu } from "./ContextMenu";

const BASE_CELL_SIZE = 50; // Базовый размер клетки в пикселях

interface GameGridProps {
  world: GameWorld;
  entities: Entity[];
  playerPos: Position;
  fovRadius: number;
  zoom: number;
  followedEntityId?: string | null;
  onMovePlayer?: (x: number, y: number) => void;
  onSelectEntity?: (entityId: string | null) => void;
  onSelectPosition?: (x: number, y: number) => void;
  onFollowEntity?: (entityId: string | null) => void;
  onSendCommand?: (action: string, payload?: any) => void;
  onGoToPathfinding?: (position: Position) => void;
  onContextMenu?: (data: ContextMenuData) => void;
  selectedTargetEntityId?: string | null;
  selectedTargetPosition?: Position | null;
  pathfindingTarget?: Position | null;
  currentPath?: Position[];
}

const GameGrid: FC<GameGridProps> = ({
  world,
  entities,
  zoom,
  followedEntityId = null,
  onMovePlayer,
  onSelectEntity,
  onSelectPosition,
  onFollowEntity,
  onSendCommand,
  onGoToPathfinding,
  onContextMenu,
  selectedTargetEntityId,
  selectedTargetPosition,
  pathfindingTarget,
  currentPath = [],
}) => {
  const [localContextMenu, setLocalContextMenu] =
    useState<ContextMenuData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedEntity, setDraggedEntity] = useState<Entity | null>(null);

  const CELL_SIZE = BASE_CELL_SIZE * zoom;

  const getEntitiesAt = useCallback(
    (x: number, y: number) => {
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
    },
    [entities],
  );

  const handleCellClick = useCallback(
    (x: number, y: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const cellEntities = getEntitiesAt(x, y);

      // Выбор позиции
      if (onSelectPosition) {
        onSelectPosition(x, y);
      }

      // Выбор сущности (если есть)
      if (cellEntities.length > 0 && onSelectEntity) {
        // Выбираем верхнюю сущность
        const topEntity = cellEntities[cellEntities.length - 1];
        onSelectEntity(topEntity.id);
      } else if (onSelectEntity) {
        onSelectEntity(null);
      }
    },
    [onSelectEntity, onSelectPosition, getEntitiesAt],
  );

  const handleContextMenu = useCallback(
    (x: number, y: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const cellEntities = getEntitiesAt(x, y);

      const data = {
        x: e.clientX,
        y: e.clientY,
        cellX: x,
        cellY: y,
        entities: cellEntities,
      };

      if (onContextMenu) {
        onContextMenu(data);
      } else {
        setLocalContextMenu(data);
      }
    },
    [getEntitiesAt, onContextMenu],
  );

  const handleDragStart = useCallback((entity: Entity, e: React.DragEvent) => {
    if (entity.type !== EntityType.PLAYER) {
      e.preventDefault();
      return;
    }

    setIsDragging(true);
    setDraggedEntity(entity);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (x: number, y: number, e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (!draggedEntity || draggedEntity.type !== EntityType.PLAYER) {
        return;
      }

      const tile = world.map[y]?.[x];
      if (!tile || tile.isWall) {
        return;
      }

      // Перемещаем игрока
      if (onMovePlayer) {
        onMovePlayer(x, y);
      }

      setDraggedEntity(null);
    },
    [draggedEntity, world, onMovePlayer],
  );

  const renderEntity = (entity: Entity, index: number, total: number) => {
    const isPlayer = entity.type === EntityType.PLAYER;

    // Позиционирование для двух сущностей в клетке
    const position =
      total === 1
        ? "center"
        : index === 0
          ? "top-left"
          : index === 1
            ? "bottom-right"
            : "center";

    let positionClass = "";
    const padding = Math.max(2, zoom * 2);
    if (position === "top-left") {
      positionClass = `absolute`;
    } else if (position === "bottom-right") {
      positionClass = `absolute`;
    }
    const positionStyle =
      position === "top-left"
        ? { top: `${padding}px`, left: `${padding}px` }
        : position === "bottom-right"
          ? { bottom: `${padding}px`, right: `${padding}px` }
          : {};

    return (
      <div
        key={entity.id}
        className={`${positionClass} flex flex-col items-center justify-center ${
          isPlayer ? "cursor-move" : ""
        }`}
        style={positionStyle}
        draggable={isPlayer}
        onDragStart={(e) => handleDragStart(entity, e)}
      >
        {/* Символ сущности */}
        <div
          className={`leading-none ${entity.color} ${
            isPlayer ? "font-bold animate-pulse" : ""
          }`}
          style={{ fontSize: `${zoom * 24}px` }}
        >
          {entity.symbol}
        </div>

        {/* Имя сущности */}
        <div
          className="text-white bg-black/70 rounded max-w-full truncate"
          style={{
            fontSize: `${zoom * 10}px`,
            padding: `${zoom * 1}px ${zoom * 4}px`,
            marginTop: `${zoom * 2}px`,
          }}
        >
          {entity.name}
        </div>

        {/* Лейбл для враждебных */}
        {entity.isHostile && entity.label && (
          <div
            className="absolute bg-red-600 text-white rounded font-bold border border-red-400"
            style={{
              top: `${-zoom * 2}px`,
              right: `${-zoom * 2}px`,
              fontSize: `${zoom * 10}px`,
              padding: `${zoom * 1}px ${zoom * 3}px`,
            }}
          >
            {entity.label}
          </div>
        )}

        {/* HP бар для враждебных */}
        {entity.isHostile && entity.stats && (
          <div className="w-full" style={{ marginTop: `${zoom * 2}px` }}>
            <div
              className="bg-gray-700 rounded-full overflow-hidden"
              style={{ height: `${zoom * 3}px` }}
            >
              <div
                className="h-full bg-red-500 transition-all"
                style={{
                  width: `${(entity.stats.hp / entity.stats.maxHp) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCell = (x: number, y: number) => {
    const tile = world.map[y]?.[x];
    if (!tile) {
      return null;
    }

    const cellEntities = getEntitiesAt(x, y);
    const isVisible = true; // Всегда видимо - туман войны отключен

    const isSelectedPosition =
      selectedTargetPosition?.x === x && selectedTargetPosition?.y === y;
    const isPathfindingTarget =
      pathfindingTarget?.x === x && pathfindingTarget?.y === y;
    const isOnPath = currentPath.some((pos) => pos.x === x && pos.y === y);

    let bgClass = "bg-neutral-900";
    let floorSymbol = SYMBOLS.FLOOR;
    let floorColor = COLORS.FLOOR;

    // Фон клетки
    if (tile.env === "grass") {
      bgClass = "bg-green-950/40";
      floorSymbol = SYMBOLS.GRASS;
      floorColor = COLORS.GRASS;
    } else if (tile.env === "water") {
      bgClass = "bg-blue-900/40";
      floorSymbol = SYMBOLS.WATER;
      floorColor = COLORS.WATER;
    } else if (tile.env === "tree") {
      bgClass = "bg-green-900/40";
      floorSymbol = SYMBOLS.TREE;
      floorColor = COLORS.TREE;
    } else if (tile.isWall) {
      bgClass = "bg-neutral-800";
      floorSymbol = SYMBOLS.WALL;
      floorColor = COLORS.WALL;
    }

    return (
      <div
        key={`${x}-${y}`}
        className={`relative border-neutral-700 ${bgClass} flex items-center justify-center cursor-pointer hover:bg-neutral-700/50 transition-colors group`}
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          borderWidth: `${Math.max(1, zoom * 1)}px`,
        }}
        onClick={(e) => handleCellClick(x, y, e)}
        onContextMenu={(e) => handleContextMenu(x, y, e)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(x, y, e)}
      >
        {/* Координаты клетки */}
        <div
          className="absolute text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            top: `${zoom * 2}px`,
            left: `${zoom * 2}px`,
            fontSize: `${zoom * 8}px`,
          }}
        >
          {x},{y}
        </div>

        {/* Выделение выбранной позиции */}
        {isSelectedPosition && (
          <div
            className={`absolute rounded-lg pointer-events-none z-20 ${
              cellEntities.some((e) => e.id === selectedTargetEntityId)
                ? "border-cyan-400"
                : "border-orange-500"
            }`}
            style={{
              borderWidth: `${Math.max(1, zoom * 2)}px`,
              inset: `${-Math.max(2, zoom * 2)}px`,
            }}
          />
        )}

        {/* Выделение цели pathfinding */}
        {isPathfindingTarget && (
          <div
            className="absolute rounded-lg pointer-events-none z-20 border-green-500 animate-pulse"
            style={{
              borderWidth: `${Math.max(2, zoom * 3)}px`,
              inset: `${-Math.max(3, zoom * 3)}px`,
            }}
          />
        )}

        {/* Подсветка пути */}
        {isOnPath && !isPathfindingTarget && (
          <div className="absolute inset-0 bg-green-400/20 pointer-events-none z-10" />
        )}

        {/* Фон/пол клетки */}
        <div
          className={`absolute inset-0 flex items-center justify-center ${floorColor} opacity-20`}
          style={{ fontSize: `${zoom * 32}px` }}
        >
          {floorSymbol}
        </div>

        {/* Индикатор если больше 2 сущностей */}
        {isVisible && cellEntities.length > 2 && (
          <div
            className="absolute bg-yellow-600 text-white rounded font-bold"
            style={{
              bottom: `${zoom * 2}px`,
              right: `${zoom * 2}px`,
              fontSize: `${zoom * 10}px`,
              padding: `${zoom * 1}px ${zoom * 3}px`,
            }}
          >
            +{cellEntities.length - 2}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Сетка */}
      <div
        className="relative bg-black select-none shadow-2xl shadow-black border-neutral-800 box-content"
        style={{
          width: world.width * CELL_SIZE,
          height: world.height * CELL_SIZE,
          display: "grid",
          gridTemplateColumns: `repeat(${world.width}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${world.height}, ${CELL_SIZE}px)`,
          borderWidth: `${Math.max(2, zoom * 2)}px`,
          transform: `translate(-${Math.max(2, zoom * 2)}px, -${Math.max(2, zoom * 2)}px)`,
        }}
      >
        {world.map.flatMap((row, y) => row.map((_, x) => renderCell(x, y)))}
      </div>

      {/* Анимированный слой для сущностей */}
      <div
        className="absolute top-0 left-0 pointer-events-none"
        style={{
          width: world.width * CELL_SIZE,
          height: world.height * CELL_SIZE,
        }}
      >
        {entities
          .filter((e) => !e.isDead)
          .map((entity) => {
            const cellEntities = getEntitiesAt(entity.pos.x, entity.pos.y);
            const entityIndex = cellEntities.findIndex(
              (e) => e.id === entity.id,
            );
            const totalInCell = cellEntities.length;

            // Отключаем анимацию для отслеживаемой сущности
            const isFollowedEntity = entity.id === followedEntityId;
            const shouldAnimate = !isFollowedEntity || !followedEntityId;

            return (
              <div
                key={entity.id}
                className="absolute pointer-events-none"
                style={{
                  left: entity.pos.x * CELL_SIZE,
                  top: entity.pos.y * CELL_SIZE,
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  transition: shouldAnimate
                    ? "left 0.3s ease-out, top 0.3s ease-out"
                    : "none",
                }}
              >
                {renderEntity(entity, entityIndex, totalInCell)}
              </div>
            );
          })}
      </div>

      {/* Контекстное меню */}
      {localContextMenu && (
        <ContextMenu
          data={localContextMenu}
          onClose={() => setLocalContextMenu(null)}
          onSelectEntity={onSelectEntity}
          onFollowEntity={onFollowEntity}
          onSendCommand={onSendCommand}
          onSelectPosition={onSelectPosition}
          onGoToPathfinding={onGoToPathfinding}
        />
      )}

      {/* Индикатор перетаскивания */}
      {isDragging && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50 text-sm font-semibold">
          Перетащите игрока в новую клетку
        </div>
      )}
    </div>
  );
};

export default GameGrid;
