
export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 25;

export const TILE_SIZE = 24; // pixels

// Colors
export const COLORS = {
  WALL: 'text-gray-600',
  FLOOR: 'text-gray-800',
  GRASS: 'text-green-900',
  WATER: 'text-blue-500',
  TREE: 'text-green-600',
  
  PLAYER: 'text-cyan-400',
  GOBLIN: 'text-green-500',
  ORC: 'text-red-600',
  CHEST: 'text-yellow-500',
  
  ITEM_POTION: 'text-purple-400',
  ITEM_GOLD: 'text-yellow-400',
  
  EXIT: 'text-white',
  NPC_MERCHANT: 'text-yellow-200',
  NPC_HEALER: 'text-pink-300',
  NPC_GUARD: 'text-gray-300',
  
  FOG: 'bg-black'
};

export const SYMBOLS = {
  WALL: '#',
  FLOOR: '.',
  GRASS: '"',
  WATER: '≈',
  TREE: '♠',
  
  PLAYER: '@',
  GOBLIN: 'g',
  ORC: 'O',
  CHEST: '?',
  POTION: '!',
  GOLD: '$',
  EXIT: '>',
  EXIT_UP: '<',
  
  NPC: '☺'
};

// Stamina (Legacy, still used for ability check)
export const STAMINA_COST = {
  MOVE: 2,
  ATTACK: 10,
  HEAVY_ATTACK: 20
};

export const STAMINA_REGEN = 5;

// Time System (Ticks)
export const TIME_COST = {
    MOVE: 100,
    ATTACK_LIGHT: 80,
    ATTACK_HEAVY: 150,
    WAIT: 50,
    USE: 100,
    INTERACT: 50
};

// Prices
export const PRICES = {
    POTION: 50,
    HEAL: 20
};
