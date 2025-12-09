import { Sword, MessageCircle, Hand, Search } from "lucide-react";
import { FC, useCallback, useState, useRef, useEffect } from "react";

import { COLORS, SYMBOLS } from "../constants";
import {
  ContextMenuData,
  Entity,
  EntityType,
  GameWorld,
  Position,
  SpeechBubble,
} from "../types";

import { ContextMenu } from "./ContextMenu";
import { RadialMenu } from "./RadialMenu";

const BASE_CELL_SIZE = 50; // Базовый размер клетки в пикселях

interface GameGridProps {
  world: GameWorld;
  entities: Entity[];
  playerPos: Position;
  fovRadius: number;
  zoom: number;
  disableAnimations?: boolean;
  followedEntityId?: string | null;
  speechBubbles?: SpeechBubble[];
  radialMenuOpen?: boolean;
  onMovePlayer?: (x: number, y: number) => void;
  onSelectEntity?: (entityId: string | null) => void;
  onSelectPosition?: (x: number, y: number) => void;
  onFollowEntity?: (entityId: string | null) => void;
  onSendCommand?: (action: string, payload?: any) => void;
  onGoToPathfinding?: (position: Position) => void;
  onContextMenu?: (data: ContextMenuData) => void;
  onRadialMenuChange?: (isOpen: boolean) => void;
  selectedTargetEntityId?: string | null;
  selectedTargetPosition?: Position | null;
  pathfindingTarget?: Position | null;
  currentPath?: Position[];
}

const GameGrid: FC<GameGridProps> = ({
  world,
  entities,
  zoom,
  disableAnimations = false,
  followedEntityId = null,
  speechBubbles = [],
  radialMenuOpen = false,
  onMovePlayer,
  onSelectEntity,
  onSelectPosition,
  onFollowEntity,
  onSendCommand,
  onGoToPathfinding,
  onContextMenu,
  onRadialMenuChange,
  selectedTargetEntityId,
  selectedTargetPosition,
  pathfindingTarget,
  currentPath = [],
}) => {
  const [localContextMenu, setLocalContextMenu] =
    useState<ContextMenuData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedEntity, setDraggedEntity] = useState<Entity | null>(null);
  const [visibleCells, setVisibleCells] = useState<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>({ minX: 0, maxX: world.width, minY: 0, maxY: world.height });

  // Radial menu state
  const [radialMenu, setRadialMenu] = useState<{
    entity: Entity;
    x: number;
    y: number;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  const CELL_SIZE = BASE_CELL_SIZE * zoom;

  // Calculate visible cells based on viewport
  useEffect(() => {
    const updateVisibleCells = () => {
      if (!gridRef.current) {
        return;
      }

      const container = gridRef.current.parentElement;
      if (!container) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const gridRect = gridRef.current.getBoundingClientRect();

      // Calculate visible area in grid coordinates
      const offsetX = containerRect.left - gridRect.left;
      const offsetY = containerRect.top - gridRect.top;

      // Add buffer to render cells slightly outside viewport
      const buffer = 2;

      const minX = Math.max(0, Math.floor(-offsetX / CELL_SIZE) - buffer);
      const maxX = Math.min(
        world.width,
        Math.ceil((containerRect.width - offsetX) / CELL_SIZE) + buffer,
      );
      const minY = Math.max(0, Math.floor(-offsetY / CELL_SIZE) - buffer);
      const maxY = Math.min(
        world.height,
        Math.ceil((containerRect.height - offsetY) / CELL_SIZE) + buffer,
      );

      setVisibleCells({ minX, maxX, minY, maxY });
    };

    updateVisibleCells();

    // Update on scroll or resize
    const container = gridRef.current?.parentElement;
    if (container) {
      container.addEventListener("scroll", updateVisibleCells);
      window.addEventListener("resize", updateVisibleCells);

      return () => {
        container.removeEventListener("scroll", updateVisibleCells);
        window.removeEventListener("resize", updateVisibleCells);
      };
    }
  }, [CELL_SIZE, world.width, world.height]);

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

      // Check if clicking on already selected position with entities
      const isAlreadySelected =
        selectedTargetPosition?.x === x && selectedTargetPosition?.y === y;

      if (isAlreadySelected && cellEntities.length > 0) {
        // Open radial menu for the top entity
        const topEntity = cellEntities[cellEntities.length - 1];

        // Get cell position accounting for all transforms (camera offset, etc)
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();

        setRadialMenu({
          entity: topEntity,
          x: rect.left,
          y: rect.top,
        });
        if (onRadialMenuChange) {
          onRadialMenuChange(true);
        }
        return;
      }

      // Close radial menu if clicking elsewhere
      if (radialMenu) {
        setRadialMenu(null);
        if (onRadialMenuChange) {
          onRadialMenuChange(false);
        }
      }

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
    [
      onSelectEntity,
      onSelectPosition,
      getEntitiesAt,
      selectedTargetPosition,
      radialMenu,
      onRadialMenuChange,
    ],
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

  // Radial menu handlers
  const handleRadialAction = useCallback(
    (actionId: string, entity: Entity) => {
      if (!onSendCommand) {
        return;
      }

      switch (actionId) {
        case "attack":
          onSendCommand("ATTACK", { targetId: entity.id });
          break;
        case "talk":
          onSendCommand("TALK", { targetId: entity.id });
          break;
        case "interact":
          onSendCommand("INTERACT", { targetId: entity.id });
          break;
        case "inspect":
          // For inspection, we can select the entity
          if (onSelectEntity) {
            onSelectEntity(entity.id);
          }
          break;
      }

      // Close radial menu after action
      setRadialMenu(null);
      if (onRadialMenuChange) {
        onRadialMenuChange(false);
      }
    },
    [onSendCommand, onSelectEntity, onRadialMenuChange],
  );

  const getRadialMenuActions = useCallback((entity: Entity) => {
    const actions = [];

    // Attack action for hostile entities
    if (entity.isHostile) {
      actions.push({
        id: "attack",
        icon: Sword,
        label: "Атаковать",
        color: "#dc2626",
      });
    }

    // Talk action for NPCs
    if (entity.type === EntityType.NPC) {
      actions.push({
        id: "talk",
        icon: MessageCircle,
        label: "Поговорить",
        color: "#3b82f6",
      });
    }

    // Interact action for chests and items
    if (
      entity.type === EntityType.CHEST ||
      entity.type === EntityType.ITEM ||
      entity.type === EntityType.EXIT
    ) {
      actions.push({
        id: "interact",
        icon: Hand,
        label: "Взаимодействовать",
        color: "#10b981",
      });
    }

    // Inspect action for all entities (except player)
    if (entity.type !== EntityType.PLAYER) {
      actions.push({
        id: "inspect",
        icon: Search,
        label: "Осмотреть",
        color: "#8b5cf6",
      });
    }

    return actions;
  }, []);

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
    // Skip rendering cells outside viewport
    if (
      x < visibleCells.minX ||
      x >= visibleCells.maxX ||
      y < visibleCells.minY ||
      y >= visibleCells.maxY
    ) {
      return (
        <div
          key={`${x}-${y}`}
          style={{
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
        />
      );
    }

    const tile = world.map[y]?.[x];
    if (!tile) {
      return null;
    }

    const cellEntities = getEntitiesAt(x, y);
    const isVisible = tile.isVisible;
    const isExplored = tile.isExplored;

    const isSelectedPosition =
      selectedTargetPosition?.x === x && selectedTargetPosition?.y === y;
    const isPathfindingTarget =
      pathfindingTarget?.x === x && pathfindingTarget?.y === y;
    const isOnPath = currentPath.some((pos) => pos.x === x && pos.y === y);

    // Determine visibility classes
    let visibilityClass = "";
    if (!isVisible && !isExplored) {
      // Unexplored - completely dark
      visibilityClass = "bg-black";
    } else if (!isVisible && isExplored) {
      // Explored but not visible - dimmed
      visibilityClass = "opacity-40 grayscale";
    }

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
        className={`relative border-neutral-700 ${bgClass} ${visibilityClass} flex items-center justify-center cursor-pointer hover:bg-neutral-700/50 transition-colors group`}
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
        {/* Unexplored overlay - completely black */}
        {!isVisible && !isExplored && (
          <div className="absolute inset-0 bg-black pointer-events-none z-30" />
        )}

        {/* Координаты клетки */}
        {isVisible && (
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
        )}

        {/* Выделение выбранной позиции */}
        {isSelectedPosition && isVisible && (
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
        {isPathfindingTarget && isVisible && (
          <div
            className="absolute rounded-lg pointer-events-none z-20 border-green-500 animate-pulse"
            style={{
              borderWidth: `${Math.max(2, zoom * 3)}px`,
              inset: `${-Math.max(3, zoom * 3)}px`,
            }}
          />
        )}

        {/* Подсветка пути */}
        {isOnPath && !isPathfindingTarget && isVisible && (
          <div className="absolute inset-0 bg-green-400/20 pointer-events-none z-10" />
        )}

        {/* Фон/пол клетки */}
        {(isVisible || isExplored) && (
          <div
            className={`absolute inset-0 flex items-center justify-center ${floorColor}`}
            style={{
              fontSize: `${zoom * 32}px`,
              opacity: isVisible ? 0.2 : 0.1,
            }}
          >
            {floorSymbol}
          </div>
        )}

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
        ref={gridRef}
        className="relative bg-black select-none shadow-2xl shadow-black border-neutral-800 box-content"
        style={{
          width: world.width * CELL_SIZE,
          height: world.height * CELL_SIZE,
          display: "grid",
          gridTemplateColumns: `repeat(${world.width}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${world.height}, ${CELL_SIZE}px)`,
          borderWidth: `${Math.max(2, zoom * 2)}px`,
          transform: `translate(-${Math.max(2, zoom * 2)}px, -${Math.max(2, zoom * 2)}px)`,
          backgroundColor: "#050608",
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
          boxShadow: "inset 0 0 30px rgba(0, 0, 0, 0.45)",
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
          transform: `translate(-${Math.max(2, zoom * 2)}px, -${Math.max(2, zoom * 2)}px)`,
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

            // Only render entities on visible tiles
            const tile = world.map[entity.pos.y]?.[entity.pos.x];
            if (!tile || !tile.isVisible) {
              return null;
            }

            // Отключаем анимацию для отслеживаемой сущности
            const isFollowedEntity = entity.id === followedEntityId;
            const shouldAnimate =
              !disableAnimations && (!isFollowedEntity || !followedEntityId);

            // Find speech bubble for this entity
            const bubble = speechBubbles.find((b) => b.entityId === entity.id);

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
                {bubble && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 pointer-events-none speech-bubble z-50"
                    style={{
                      bottom: `${CELL_SIZE + 8}px`,
                      maxWidth: `${CELL_SIZE * 5}px`,
                      minWidth: `${CELL_SIZE * 2}px`,
                    }}
                  >
                    <div className="relative bg-white text-neutral-900 text-xs rounded-xl px-3 py-1.5 shadow-2xl border-2 border-neutral-800/20">
                      <div className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-sans font-medium leading-tight">
                        {bubble.text.length > 60
                          ? bubble.text.substring(0, 60) + "..."
                          : bubble.text}
                      </div>
                      {/* Speech bubble tail */}
                      <div
                        className="absolute left-1/2 -translate-x-1/2"
                        style={{
                          bottom: "-8px",
                        }}
                      >
                        <div
                          style={{
                            width: 0,
                            height: 0,
                            borderLeft: "8px solid transparent",
                            borderRight: "8px solid transparent",
                            borderTop: "8px solid rgba(0, 0, 0, 0.2)",
                          }}
                        />
                        <div
                          className="absolute left-1/2 -translate-x-1/2"
                          style={{
                            bottom: "1px",
                            width: 0,
                            height: 0,
                            borderLeft: "7px solid transparent",
                            borderRight: "7px solid transparent",
                            borderTop: "7px solid white",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
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

      {/* Радиальное меню быстрых действий */}
      {radialMenu && (
        <RadialMenu
          x={radialMenu.x}
          y={radialMenu.y}
          entity={radialMenu.entity}
          actions={getRadialMenuActions(radialMenu.entity)}
          onAction={handleRadialAction}
          onClose={() => {
            setRadialMenu(null);
            if (onRadialMenuChange) {
              onRadialMenuChange(false);
            }
          }}
          cellSize={CELL_SIZE}
          zoom={zoom}
        />
      )}

      {/* Close radial menu if external prop changes */}
      {!radialMenuOpen &&
        radialMenu &&
        (() => {
          setRadialMenu(null);
          return null;
        })()}

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
