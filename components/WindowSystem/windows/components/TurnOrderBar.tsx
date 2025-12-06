import React, { useRef, useEffect, useState } from "react";

import { Entity } from "../../../../types";

interface TurnOrderBarProps {
  entities: Entity[];
  activeEntityId: string | null;
  playerId: string | null;
  onEntityClick?: (entityId: string) => void;
}

export const TurnOrderBar: React.FC<TurnOrderBarProps> = ({
  entities,
  activeEntityId,
  playerId,
  onEntityClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Filter out entities without stats or with HP <= 0, then sort by nextActionTick
  const sortedEntities = [...entities]
    .filter((e) => e.stats && e.stats.hp > 0)
    .sort((a, b) => a.nextActionTick - b.nextActionTick);

  // Find active entity index
  const activeIndex = sortedEntities.findIndex((e) => e.id === activeEntityId);

  // Smart scrolling: only scroll if active card is not visible
  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) {return;}

    const CARD_WIDTH = 40;
    const GAP = 8;
    const CARD_TOTAL = CARD_WIDTH + GAP; // 48px per card

    const containerWidth = containerRef.current.clientWidth;
    const activeCardStart = activeIndex * CARD_TOTAL;
    const activeCardEnd = activeCardStart + CARD_WIDTH;

    // Calculate visible range
    const visibleStart = scrollOffset;
    const visibleEnd = scrollOffset + containerWidth;

    // Check if active card is fully visible
    const isFullyVisible =
      activeCardStart >= visibleStart && activeCardEnd <= visibleEnd;

    if (!isFullyVisible) {
      // Scroll to show active card with some context on the left
      // Try to show 2 cards before the active one if possible
      const cardsToShowBefore = 2;
      const preferredStart = Math.max(
        0,
        (activeIndex - cardsToShowBefore) * CARD_TOTAL,
      );

      // Make sure active card is visible
      let newOffset = preferredStart;

      // If the preferred position would hide the active card on the right, adjust
      if (preferredStart + containerWidth < activeCardEnd) {
        newOffset = activeCardEnd - containerWidth;
      }

      setScrollOffset(newOffset);
    }
  }, [activeIndex, activeEntityId]);

  // Calculate scroll offset to center active entity in the ribbon
  // Card width (40px) + gap (8px) = 48px per card
  // const scrollOffset = activeIndex >= 0 ? activeIndex * 48 : 0;

  const getEntitySymbol = (entity: Entity) => {
    return entity.symbol || "?";
  };

  const getEntityColor = (entity: Entity) => {
    return entity.color || "text-gray-400";
  };

  const getEntityClassName = (entity: Entity) => {
    const classes = ["turn-order-card-compact"];
    if (entity.id === activeEntityId) {
      classes.push("active");
    }
    if (entity.id === playerId) {
      classes.push("player");
    }
    if (entity.isDead) {
      classes.push("dead");
    }
    if (entity.isHostile) {
      classes.push("hostile");
    }
    return classes.join(" ");
  };

  const getTooltipText = (entity: Entity) => {
    const parts = [entity.name, `[${entity.label}]`];
    if (entity.stats) {
      parts.push(`HP: ${entity.stats.hp}/${entity.stats.maxHp}`);
    }
    parts.push(`Tick: ${entity.nextActionTick}`);
    return parts.join(" • ");
  };

  return (
    <div className="p-2 bg-neutral-900 rounded-lg border border-neutral-700 shadow-lg">
      <div ref={containerRef} className="turn-order-scroll-container-compact">
        <div
          className="turn-order-cards-compact"
          style={{
            transform: `translateX(-${scrollOffset}px)`,
          }}
        >
          {sortedEntities.map((entity, index) => (
            <div
              key={entity.id}
              className={getEntityClassName(entity)}
              data-turn-index={index}
              title={getTooltipText(entity)}
              onClick={() => onEntityClick?.(entity.id)}
            >
              <div
                className={`card-icon-compact text-xl ${getEntityColor(entity)}`}
              >
                {getEntitySymbol(entity)}
              </div>
              <div className="card-label-compact">{entity.label}</div>
              {entity.stats && (
                <div className="card-hp-compact">
                  <div
                    className="hp-bar-compact"
                    style={{
                      width: `${(entity.stats.hp / entity.stats.maxHp) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
