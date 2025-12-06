import {
  Focus,
  Sword,
  MessageCircle,
  Eye,
  Package,
  DollarSign,
  Zap,
  Sparkles,
  Navigation,
} from "lucide-react";
import { FC, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

import { SYMBOLS, COLORS } from "../constants";
import { GameWorld, Entity, Position, EntityType } from "../types";

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
  selectedTargetEntityId?: string | null;
  selectedTargetPosition?: Position | null;
  pathfindingTarget?: Position | null;
  currentPath?: Position[];
}

interface ContextMenu {
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  entities: Entity[];
}

const GameGrid: FC<GameGridProps> = ({
  world,
  entities,
  playerPos,
  zoom,
  followedEntityId = null,
  onMovePlayer,
  onSelectEntity,
  onSelectPosition,
  onFollowEntity,
  onSendCommand,
  onGoToPathfinding,
  selectedTargetEntityId,
  selectedTargetPosition,
  pathfindingTarget,
  currentPath = [],
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedEntity, setDraggedEntity] = useState<Entity | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const CELL_SIZE = BASE_CELL_SIZE * zoom;

  // Закрыть контекстное меню при клике вне его
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [contextMenu]);

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

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        cellX: x,
        cellY: y,
        entities: cellEntities,
      });
    },
    [getEntitiesAt],
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

    // Ключ для анимации - чтобы React понимал что это та же сущность
    const animationKey = `${entity.id}-${entity.pos.x}-${entity.pos.y}`;

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
        className="relative bg-black select-none shadow-2xl shadow-black border-neutral-800"
        style={{
          width: world.width * CELL_SIZE,
          height: world.height * CELL_SIZE,
          display: "grid",
          gridTemplateColumns: `repeat(${world.width}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${world.height}, ${CELL_SIZE}px)`,
          borderWidth: `${Math.max(2, zoom * 2)}px`,
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
      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            data-context-menu
            className="fixed bg-neutral-800 border border-neutral-600 rounded shadow-xl z-50 min-w-48"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="p-2 border-b border-neutral-700 text-xs text-gray-400">
              Клетка ({contextMenu.cellX}, {contextMenu.cellY})
            </div>

            {contextMenu.entities.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-xs text-gray-500 uppercase">
                  Сущности:
                </div>
                {contextMenu.entities.map((entity) => (
                  <div
                    key={entity.id}
                    className="border-b border-neutral-700 last:border-0"
                  >
                    <button
                      className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2"
                      onClick={() => {
                        if (onSelectEntity) {
                          onSelectEntity(entity.id);
                        }
                        setContextMenu(null);
                      }}
                    >
                      <span className={`text-xl ${entity.color}`}>
                        {entity.symbol}
                      </span>
                      <span className="text-sm text-gray-300">
                        {entity.name}
                      </span>
                      {entity.label && (
                        <span className="ml-auto text-xs bg-red-600 px-1 rounded">
                          {entity.label}
                        </span>
                      )}
                    </button>
                    <button
                      className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-cyan-400 flex items-center gap-1.5"
                      onClick={() => {
                        if (onFollowEntity) {
                          onFollowEntity(entity.id);
                        }
                        setContextMenu(null);
                      }}
                    >
                      <Focus className="w-3 h-3" />
                      <span>Следить за {entity.name}</span>
                    </button>

                    <div className="border-t border-neutral-700 mt-1 pt-1">
                      <button
                        className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-red-400 flex items-center gap-1.5"
                        onClick={() => {
                          if (onSendCommand) {
                            onSendCommand("ATTACK", { targetId: entity.id });
                          }
                          setContextMenu(null);
                        }}
                      >
                        <Sword className="w-3 h-3" />
                        <span>Атаковать</span>
                      </button>
                      <button
                        className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-blue-400 flex items-center gap-1.5"
                        onClick={() => {
                          if (onSendCommand) {
                            onSendCommand("TALK", { targetId: entity.id });
                          }
                          setContextMenu(null);
                        }}
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>Поговорить</span>
                      </button>
                      <button
                        className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-yellow-400 flex items-center gap-1.5"
                        onClick={() => {
                          if (onSendCommand) {
                            onSendCommand("INSPECT", { targetId: entity.id });
                          }
                          setContextMenu(null);
                        }}
                      >
                        <Eye className="w-3 h-3" />
                        <span>Осмотреть</span>
                      </button>
                      <button
                        className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-green-400 flex items-center gap-1.5"
                        onClick={() => {
                          if (onSendCommand) {
                            onSendCommand("PICKUP", { targetId: entity.id });
                          }
                          setContextMenu(null);
                        }}
                      >
                        <Package className="w-3 h-3" />
                        <span>Подобрать</span>
                      </button>
                      <button
                        className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-purple-400 flex items-center gap-1.5"
                        onClick={() => {
                          if (onSendCommand) {
                            onSendCommand("TRADE", { targetId: entity.id });
                          }
                          setContextMenu(null);
                        }}
                      >
                        <DollarSign className="w-3 h-3" />
                        <span>Торговать</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {contextMenu.entities.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500 italic">
                Пустая клетка
              </div>
            )}

            <div className="border-t border-neutral-700 py-1">
              <button
                className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-700 text-gray-400"
                onClick={() => {
                  if (onSelectPosition) {
                    onSelectPosition(contextMenu.cellX, contextMenu.cellY);
                  }
                  setContextMenu(null);
                }}
              >
                Выбрать позицию
              </button>
              <button
                className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-green-400 flex items-center gap-1.5"
                onClick={() => {
                  if (onGoToPathfinding) {
                    onGoToPathfinding({
                      x: contextMenu.cellX,
                      y: contextMenu.cellY,
                    });
                  }
                  setContextMenu(null);
                }}
              >
                <Navigation className="w-3 h-3" />
                <span>Перейти к</span>
              </button>
              <button
                className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-cyan-400 flex items-center gap-1.5"
                onClick={() => {
                  if (onSendCommand) {
                    onSendCommand("TELEPORT", {
                      x: contextMenu.cellX,
                      y: contextMenu.cellY,
                    });
                  }
                  setContextMenu(null);
                }}
              >
                <Zap className="w-3 h-3" />
                <span>Телепорт</span>
              </button>
              <button
                className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-purple-400 flex items-center gap-1.5"
                onClick={() => {
                  if (onSendCommand) {
                    onSendCommand("CAST_AREA", {
                      x: contextMenu.cellX,
                      y: contextMenu.cellY,
                    });
                  }
                  setContextMenu(null);
                }}
              >
                <Sparkles className="w-3 h-3" />
                <span>Заклинание на область</span>
              </button>
            </div>
          </div>,
          document.body,
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
