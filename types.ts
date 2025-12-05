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

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  value: number; // Heal amount or damage or gold amount
  description?: string;
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
}

export interface GameWorld {
  map: Tile[][];
  width: number;
  height: number;
  level: number;
  globalTick: number;
}
