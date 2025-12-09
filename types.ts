// TODO: Привести в порядок, учитывая диздок
// https://github.com/Cognitive-Dungeon/cd-techdoc

export enum EntityType {
  PLAYER = "PLAYER",
  ENEMY_GOBLIN = "GOBLIN",
  ENEMY_ORC = "ORC",
  CHEST = "CHEST",
  ITEM = "ITEM",
  EXIT = "EXIT",
  NPC = "NPC",
}

export enum GameState {
  EXPLORATION = "EXPLORATION",
  COMBAT = "COMBAT",
  GAME_OVER = "GAME_OVER",
}

export enum LogType {
  INFO = "INFO",
  COMBAT = "COMBAT",
  NARRATIVE = "NARRATIVE", // AI Generated
  SPEECH = "SPEECH", // User dialogue
  ERROR = "ERROR",
  COMMAND = "COMMAND",
  SUCCESS = "SUCCESS",
}

export interface SpeechBubble {
  id: string;
  entityId: string;
  text: string;
  timestamp: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Stats {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  strength: number;
  gold: number;
}

export enum ItemType {
  POTION = "POTION",
  WEAPON = "WEAPON",
  GOLD = "GOLD",
}

export enum ItemActionType {
  HEAL = "HEAL",
  DAMAGE = "DAMAGE",
  BUFF = "BUFF",
  INSTANT = "INSTANT",
}

export interface ItemAction {
  type: ItemActionType;
  requiresTarget: boolean;
  value?: number;
  description?: string;
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  value: number; // Heal amount or damage or gold amount
  description?: string;
  action?: ItemAction; // Action when item is used
}

export interface Entity {
  id: string;
  label: string; // Visual label for targeting (A, B, C...)
  type: EntityType;
  symbol: string;
  color: string;
  pos: Position;
  stats: Stats;
  inventory: Item[];
  itemData?: Item;
  name: string;
  isHostile: boolean;
  isDead: boolean;
  npcType?: "MERCHANT" | "HEALER" | "GUARD";

  // Time System
  nextActionTick: number;

  // AI & Narrative
  personality?: "Cowardly" | "Furious";
  aiState?: "IDLE" | "AGGRESSIVE" | "FLEEING";
}

export type TileEnv = "stone" | "grass" | "water" | "tree" | "floor";

export interface Tile {
  x: number;
  y: number;
  isWall: boolean;
  env: TileEnv;
  isVisible: boolean;
  isExplored: boolean;
}

export interface LogMessage {
  id: string;
  text: string;
  type: LogType;
  timestamp: number;
  position?: Position; // Position of the event (target/action location)
  playerPosition?: Position; // Position of player when command was executed
  commandData?: {
    action: string;
    payload?: any;
  };
}

export interface ContextMenuData {
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  entities: Entity[];
}

export interface GameWorld {
  map: Tile[][];
  width: number;
  height: number;
  level: number;
  globalTick: number;
}

// ============================================================================
// Server Protocol Types (Server -> Client)
// ============================================================================
// Типы для общения с сервером согласно протоколу Server -> Client (Updates)
// https://github.com/Cognitive-Dungeon/cd-techdoc

/**
 * Метаданные о размере игровой карты (Server -> Client)
 */
export interface ServerToClientGridMeta {
  /** Ширина карты в тайлах */
  w: number;
  /** Высота карты в тайлах */
  h: number;
}

/**
 * Вид тайла карты, видимый клиенту (Server -> Client)
 */
export interface ServerToClientTileView {
  /** Координата X тайла */
  x: number;
  /** Координата Y тайла */
  y: number;
  /** Символ для отображения (e.g., `.` для пола, `#` для стены) */
  symbol: string;
  /** Цвет символа (e.g., `#333333`) */
  color: string;
  /** `true`, если тайл является непроходимой стеной */
  isWall: boolean;
  /** `true`, если тайл находится в текущем поле зрения */
  isVisible: boolean;
  /** `true`, если сущность когда-либо видела этот тайл (для "тумана войны") */
  isExplored: boolean;
}

/**
 * Характеристики сущности (Server -> Client)
 */
export interface ServerToClientStatsView {
  /** Текущее здоровье */
  hp: number;
  /** Максимальное здоровье */
  maxHp: number;
  /** Выносливость (опционально) */
  stamina?: number;
  /** Максимальная выносливость (опционально) */
  maxStamina?: number;
  /** Золото (опционально) */
  gold?: number;
  /** Сила (опционально) */
  strength?: number;
  /** `true`, если сущность мертва */
  isDead: boolean;
}

/**
 * Данные для отображения сущности (Server -> Client)
 */
export interface ServerToClientEntityRender {
  /** Символ для отображения */
  symbol: string;
  /** Цвет символа */
  color: string;
}

/**
 * Вид сущности, видимый клиенту (Server -> Client)
 */
export interface ServerToClientEntityView {
  /** Уникальный идентификатор сущности */
  id: string;
  /** Тип сущности (`PLAYER`, `ENEMY`, `NPC`, `ITEM`) */
  type: string;
  /** Имя (e.g., "Герой", "Хитрый Гоблин") */
  name: string;
  /** Координаты сущности */
  pos: Position;
  /** Данные для отображения */
  render: ServerToClientEntityRender;
  /** Характеристики сущности (опционально) */
  stats?: ServerToClientStatsView;
}

/**
 * Тип лога для стилизации (Server -> Client)
 */
export type ServerToClientLogType = "INFO" | "COMBAT" | "SPEECH" | "ERROR";

/**
 * Запись в игровом логе (Server -> Client)
 */
export interface ServerToClientLogEntry {
  /** Уникальный ID */
  id: string;
  /** Текст сообщения */
  text: string;
  /** Тип лога для стилизации: `INFO`, `COMBAT`, `SPEECH`, `ERROR` */
  type: ServerToClientLogType;
  /** Время создания сообщения (Unix milliseconds) */
  timestamp: number;
}

// ============================================================================
// Client Protocol Types (Client -> Server)
// ============================================================================
// Типы для общения с сервером согласно протоколу Client -> Server (Commands)
// https://github.com/Cognitive-Dungeon/cd-techdoc

/**
 * Payload для команды перемещения (Client -> Server)
 */
export interface ClientToServerMovePayload {
  /** Смещение по оси X (-1, 0, 1) */
  dx?: number;
  /** Смещение по оси Y (-1, 0, 1) */
  dy?: number;
  /** Абсолютная координата X (альтернатива dx/dy) */
  x?: number;
  /** Абсолютная координата Y (альтернатива dx/dy) */
  y?: number;
}

/**
 * Payload для команд, требующих цель-сущность (Client -> Server)
 */
export interface ClientToServerEntityTargetPayload {
  /** ID целевой сущности */
  targetId: string;
}

/**
 * Payload для команд, требующих целевую позицию (Client -> Server)
 */
export interface ClientToServerPositionTargetPayload {
  /** Координата X целевой позиции */
  x: number;
  /** Координата Y целевой позиции */
  y: number;
}

/**
 * Payload для команд использования предметов (Client -> Server)
 */
export interface ClientToServerUsePayload {
  /** Название предмета */
  name: string;
  /** Опциональный ID целевой сущности */
  targetId?: string;
}

/**
 * Payload для команд выброса предметов (Client -> Server)
 */
export interface ClientToServerDropPayload {
  /** Название предмета */
  name: string;
}

/**
 * Payload для текстовых команд (Client -> Server)
 */
export interface ClientToServerTextPayload {
  /** Текст сообщения */
  text: string;
}

/**
 * Payload для кастомных команд (Client -> Server)
 */
export interface ClientToServerCustomPayload {
  [key: string]: any;
}

/**
 * Типы действий команд (Client -> Server)
 */
export type ClientToServerAction =
  | "LOGIN"
  | "MOVE"
  | "ATTACK"
  | "TALK"
  | "INTERACT"
  | "WAIT"
  | "CUSTOM";

/**
 * Команда от клиента к серверу (Client -> Server)
 *
 * Дискриминированный union тип на основе action для типобезопасности payload
 */
export type ClientToServerCommand =
  | {
      action: "LOGIN";
      token: string;
    }
  | {
      action: "MOVE";
      payload: ClientToServerMovePayload;
    }
  | {
      action: "ATTACK" | "TALK" | "INTERACT";
      payload: ClientToServerEntityTargetPayload;
    }
  | {
      action: "WAIT";
      payload?: Record<string, never> | null;
    }
  | {
      action: "CUSTOM";
      payload: ClientToServerCustomPayload;
    };

/**
 * Сериализует команду клиента в JSON строку для отправки по WebSocket
 *
 * @param command - Команда для отправки
 * @returns JSON строка, готовкая для отправки через WebSocket.send()
 *
 * @example
 * ```typescript
 * // LOGIN command
 * const loginCommand: ClientToServerCommand = {
 *   action: "LOGIN",
 *   token: "player-entity-id"
 * };
 * socket.send(serializeClientCommand(loginCommand));
 * // Отправляет: {"action":"LOGIN","token":"player-entity-id"}
 *
 * // MOVE command
 * const moveCommand: ClientToServerCommand = {
 *   action: "MOVE",
 *   payload: { dx: 0, dy: -1 }
 * };
 * socket.send(serializeClientCommand(moveCommand));
 * // Отправляет: {"action":"MOVE","payload":{"dx":0,"dy":-1}}
 * ```
 */
export function serializeClientCommand(command: ClientToServerCommand): string {
  return JSON.stringify(command);
}

/**
 * Основной контейнер ответа сервера (Server -> Client)
 *
 * Сервер отправляет клиенту единственный тип сообщения — `ServerToClientUpdate`,
 * который содержит полный снимок игрового состояния.
 */
export interface ServerToClientUpdate {
  /** Тип сообщения. На данный момент всегда `"UPDATE"` */
  type: "UPDATE";
  /** Текущее глобальное время в игре */
  tick: number;
  /** ID сущности, которой управляет данный клиент */
  myEntityId: string;
  /**
   * ID сущности, чей ход сейчас.
   * Если `activeEntityId === myEntityId`, фронтенд должен разрешить игроку ввод.
   */
  activeEntityId: string;
  /** Объект с метаданными о размере карты */
  grid: ServerToClientGridMeta;
  /** Массив всех видимых и исследованных клиентом тайлов */
  map: ServerToClientTileView[];
  /** Массив всех видимых клиентом сущностей */
  entities: ServerToClientEntityView[];
  /** Массив новых игровых сообщений */
  logs: ServerToClientLogEntry[];
}
