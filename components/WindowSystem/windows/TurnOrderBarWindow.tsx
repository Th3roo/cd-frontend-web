import { ContextMenuData, Entity } from "../../../types";
import { WindowConfig } from "../types";

import { TurnOrderBar } from "./components/TurnOrderBar";

export const TURN_ORDER_BAR_WINDOW_ID = "turn-order-bar";

interface TurnOrderBarWindowOptions {
  entities: Entity[];
  activeEntityId: string | null;
  playerId: string | null;
  onEntityClick?: (entityId: string) => void;
  onContextMenu?: (data: ContextMenuData) => void;
}

export const createTurnOrderBarWindowConfig = ({
  entities,
  activeEntityId,
  playerId,
  onEntityClick,
  onContextMenu,
}: TurnOrderBarWindowOptions): WindowConfig => ({
  id: TURN_ORDER_BAR_WINDOW_ID,
  title: "Turn Order Bar",
  closeable: false,
  minimizable: false,
  resizable: false,
  resizableX: true,
  resizableY: false,
  showInDock: false,
  decorated: false,
  lockHeight: true,
  defaultPosition: { x: 450, y: 10 },
  defaultSize: { width: window.innerWidth - 900, height: 60 },
  content: (
    <TurnOrderBar
      entities={entities}
      activeEntityId={activeEntityId}
      playerId={playerId}
      onEntityClick={onEntityClick}
      onContextMenu={onContextMenu}
    />
  ),
});
