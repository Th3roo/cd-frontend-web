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
import { FC, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ContextMenuData, Position } from "../types";

interface ContextMenuProps {
  data: ContextMenuData;
  onClose: () => void;
  onSelectEntity?: (entityId: string | null) => void;
  onFollowEntity?: (entityId: string | null) => void;
  onSendCommand?: (action: string, payload?: any) => void;
  onSelectPosition?: (x: number, y: number) => void;
  onGoToPathfinding?: (position: Position) => void;
}

export const ContextMenu: FC<ContextMenuProps> = ({
  data,
  onClose,
  onSelectEntity,
  onFollowEntity,
  onSendCommand,
  onSelectPosition,
  onGoToPathfinding,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: data.x, top: data.y });

  // Adjust position to keep menu within viewport bounds
  useEffect(() => {
    if (!menuRef.current) {
      return;
    }

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = data.x;
    let top = data.y;

    // Check if menu goes beyond right edge
    if (left + menuRect.width > viewportWidth) {
      left = viewportWidth - menuRect.width - 10; // 10px padding from edge
    }

    // Check if menu goes beyond bottom edge
    if (top + menuRect.height > viewportHeight) {
      top = viewportHeight - menuRect.height - 10; // 10px padding from edge
    }

    // Check if menu goes beyond left edge
    if (left < 0) {
      left = 10; // 10px padding from edge
    }

    // Check if menu goes beyond top edge
    if (top < 0) {
      top = 10; // 10px padding from edge
    }

    setPosition({ left, top });
  }, [data.x, data.y]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-context-menu
      className="fixed bg-neutral-800 border border-neutral-600 rounded shadow-xl z-[9999] min-w-48"
      style={{ left: position.left, top: position.top }}
    >
      <div className="p-2 border-b border-neutral-700 text-xs text-gray-400">
        Клетка ({data.cellX}, {data.cellY})
      </div>

      {data.entities.length > 0 && (
        <div className="py-1">
          <div className="px-3 py-1 text-xs text-gray-500 uppercase">
            Сущности:
          </div>
          {data.entities.map((entity) => (
            <div
              key={entity.id}
              className="border-b border-neutral-700 last:border-0"
            >
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-neutral-700 flex items-center gap-2"
                onMouseDown={() => {
                  if (onSelectEntity) {
                    onSelectEntity(entity.id);
                  }
                  onClose();
                }}
              >
                <span className={`text-xl ${entity.color}`}>
                  {entity.symbol}
                </span>
                <span className="text-sm text-gray-300">{entity.name}</span>
                {entity.label && (
                  <span className="ml-auto text-xs bg-red-600 px-1 rounded">
                    {entity.label}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-cyan-400 flex items-center gap-1.5"
                onMouseDown={() => {
                  if (onFollowEntity) {
                    onFollowEntity(entity.id);
                  }
                  onClose();
                }}
              >
                <Focus className="w-3 h-3" />
                <span>Следить за {entity.name}</span>
              </button>

              <div className="border-t border-neutral-700 mt-1 pt-1">
                <button
                  type="button"
                  className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-red-400 flex items-center gap-1.5"
                  onMouseDown={() => {
                    if (onSendCommand) {
                      onSendCommand("ATTACK", { targetId: entity.id });
                    }
                    onClose();
                  }}
                >
                  <Sword className="w-3 h-3" />
                  <span>Атаковать</span>
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-blue-400 flex items-center gap-1.5"
                  onMouseDown={() => {
                    if (onSendCommand) {
                      onSendCommand("TALK", { targetId: entity.id });
                    }
                    onClose();
                  }}
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>Поговорить</span>
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-yellow-400 flex items-center gap-1.5"
                  onMouseDown={() => {
                    if (onSendCommand) {
                      onSendCommand("INSPECT", { targetId: entity.id });
                    }
                    onClose();
                  }}
                >
                  <Eye className="w-3 h-3" />
                  <span>Осмотреть</span>
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-green-400 flex items-center gap-1.5"
                  onMouseDown={() => {
                    if (onSendCommand) {
                      onSendCommand("PICKUP", { targetId: entity.id });
                    }
                    onClose();
                  }}
                >
                  <Package className="w-3 h-3" />
                  <span>Подобрать</span>
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-purple-400 flex items-center gap-1.5"
                  onMouseDown={() => {
                    if (onSendCommand) {
                      onSendCommand("TRADE", { targetId: entity.id });
                    }
                    onClose();
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

      {data.entities.length === 0 && (
        <div className="px-3 py-2 text-sm text-gray-500 italic">
          Пустая клетка
        </div>
      )}

      <div className="border-t border-neutral-700 py-1">
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-xs hover:bg-neutral-700 text-gray-400"
          onMouseDown={() => {
            if (onSelectPosition) {
              onSelectPosition(data.cellX, data.cellY);
            }
            onClose();
          }}
        >
          Выбрать позицию
        </button>
        <button
          type="button"
          className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-green-400 flex items-center gap-1.5"
          onMouseDown={() => {
            if (onGoToPathfinding) {
              onGoToPathfinding({
                x: data.cellX,
                y: data.cellY,
              });
            }
            onClose();
          }}
        >
          <Navigation className="w-3 h-3" />
          <span>Перейти к</span>
        </button>
        <button
          type="button"
          className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-cyan-400 flex items-center gap-1.5"
          onMouseDown={() => {
            if (onSendCommand) {
              onSendCommand("TELEPORT", {
                x: data.cellX,
                y: data.cellY,
              });
            }
            onClose();
          }}
        >
          <Zap className="w-3 h-3" />
          <span>Телепорт</span>
        </button>
        <button
          type="button"
          className="w-full px-3 py-1 text-left text-xs hover:bg-neutral-700 text-purple-400 flex items-center gap-1.5"
          onMouseDown={() => {
            if (onSendCommand) {
              onSendCommand("CAST_AREA", {
                x: data.cellX,
                y: data.cellY,
              });
            }
            onClose();
          }}
        >
          <Sparkles className="w-3 h-3" />
          <span>Заклинание на область</span>
        </button>
      </div>
    </div>,
    document.body,
  );
};
