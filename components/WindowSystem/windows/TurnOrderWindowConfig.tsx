import { Users } from "lucide-react";

import { Entity } from "../../../types";
import { WindowConfig } from "../types";

import { TurnOrderWindow } from "./components/TurnOrderWindow";

export const TURN_ORDER_WINDOW_ID = "turn-order";

interface TurnOrderWindowOptions {
  entities: Entity[];
  activeEntityId: string | null;
  playerId: string | null;
}

export const createTurnOrderWindowConfig = ({
  entities,
  activeEntityId,
  playerId,
}: TurnOrderWindowOptions): WindowConfig => ({
  id: TURN_ORDER_WINDOW_ID,
  title: "Turn Order",
  closeable: true,
  minimizable: true,
  resizable: true,
  showInDock: true,
  icon: <Users size={20} />,
  defaultPosition: { x: 100, y: 100 },
  defaultSize: { width: 400, height: 600 },
  content: (
    <TurnOrderWindow
      entities={entities}
      activeEntityId={activeEntityId}
      playerId={playerId}
    />
  ),
});
