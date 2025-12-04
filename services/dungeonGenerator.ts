

import { Tile, GameWorld, Entity, EntityType, Position, ItemType, TileEnv } from '../types';
import { MAP_WIDTH, MAP_HEIGHT, SYMBOLS, COLORS } from '../constants';

// Helper to create a unique ID
const uid = () => Math.random().toString(36).substr(2, 9);

export const generateTown = (): { world: GameWorld; entities: Entity[]; startPos: Position } => {
    const map: Tile[][] = [];
    const entities: Entity[] = [];

    // 1. Fill with Grass
    for (let y = 0; y < MAP_HEIGHT; y++) {
        const row: Tile[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            // Borders are trees (walls)
            const isBorder = x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1;
            row.push({
                x,
                y,
                isWall: isBorder,
                env: isBorder ? 'tree' : 'grass',
                isVisible: false,
                isExplored: false
            });
        }
        map.push(row);
    }

    // 2. Add River
    for (let y = 0; y < MAP_HEIGHT; y++) {
        const x = Math.floor(MAP_WIDTH / 2) + Math.floor(Math.sin(y / 2) * 3);
        if (x > 0 && x < MAP_WIDTH - 1) {
            map[y][x].env = 'water';
            map[y][x].isWall = true; // Blocks movement
            map[y][x+1].env = 'water';
            map[y][x+1].isWall = true;
        }
    }

    // 3. Add Bridges (Wood floor)
    const bridgeY = Math.floor(MAP_HEIGHT / 2);
    for (let x = 0; x < MAP_WIDTH; x++) {
        if (map[bridgeY][x].env === 'water') {
            map[bridgeY][x].env = 'floor'; // Wood bridge
            map[bridgeY][x].isWall = false;
        }
    }

    // 4. Random Trees
    for (let i = 0; i < 40; i++) {
        const rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        if (map[ry][rx].env === 'grass') {
            map[ry][rx].env = 'tree';
            map[ry][rx].isWall = true;
        }
    }

    // 5. Spawn NPCs
    const npcs = [
        { name: "Трактирщик", type: 'MERCHANT', color: COLORS.NPC_MERCHANT, x: 5, y: 5 },
        { name: "Священник", type: 'HEALER', color: COLORS.NPC_HEALER, x: 30, y: 5 },
        { name: "Стражник", type: 'GUARD', color: COLORS.NPC_GUARD, x: 15, y: bridgeY - 2 }
    ];

    npcs.forEach(n => {
        // Clear space for NPC
        map[n.y][n.x].env = 'floor';
        map[n.y][n.x].isWall = false;

        entities.push({
            id: uid(),
            label: n.name[0],
            type: EntityType.NPC,
            name: n.name,
            symbol: SYMBOLS.NPC,
            color: n.color,
            pos: { x: n.x, y: n.y },
            isHostile: false,
            isDead: false,
            inventory: [],
            stats: { hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, strength: 10, gold: 0 },
            npcType: n.type as any,
            nextActionTick: 0
        });
    });

    // 6. Exit to Dungeon
    const ex = Math.floor(MAP_WIDTH / 2);
    const ey = MAP_HEIGHT - 3;
    map[ey][ex].env = 'stone';
    map[ey][ex].isWall = false;

    entities.push({
        id: uid(),
        label: '>',
        type: EntityType.EXIT,
        name: 'Вход в Подземелье',
        symbol: SYMBOLS.EXIT,
        color: COLORS.EXIT,
        pos: { x: ex, y: ey },
        isHostile: false,
        isDead: false,
        inventory: [],
        stats: { hp: 1000, maxHp: 1000, stamina: 0, maxStamina: 0, strength: 0, gold: 0 },
        nextActionTick: 0
    });

    return {
        world: { map, width: MAP_WIDTH, height: MAP_HEIGHT, level: 0, globalTick: 0 },
        entities,
        startPos: { x: 15, y: bridgeY }
    };
};

export const generateDungeon = (level: number = 1): { world: GameWorld; entities: Entity[]; startPos: Position } => {
  const map: Tile[][] = [];
  const entities: Entity[] = [];

  // 1. Initialize filled map
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      row.push({
        x,
        y,
        isWall: true,
        env: 'stone',
        isVisible: false,
        isExplored: false
      });
    }
    map.push(row);
  }

  // 2. Simple Room Generation
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  const maxRooms = 8;
  const minSize = 4;
  const maxSize = 10;

  for (let i = 0; i < maxRooms; i++) {
    const w = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
    const h = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
    const x = Math.floor(Math.random() * (MAP_WIDTH - w - 2)) + 1;
    const y = Math.floor(Math.random() * (MAP_HEIGHT - h - 2)) + 1;

    const newRoom = { x, y, w, h };

    const intersect = rooms.some(r => 
      !(r.x + r.w < newRoom.x || r.x > newRoom.x + newRoom.w || r.y + r.h < newRoom.y || r.y > newRoom.y + newRoom.h)
    );

    if (!intersect) {
      rooms.push(newRoom);
      for (let ry = newRoom.y; ry < newRoom.y + newRoom.h; ry++) {
        for (let rx = newRoom.x; rx < newRoom.x + newRoom.w; rx++) {
          map[ry][rx].isWall = false;
          map[ry][rx].env = 'floor';
        }
      }
    }
  }

  // 3. Connect rooms
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];
    const c1 = { x: Math.floor(r1.x + r1.w / 2), y: Math.floor(r1.y + r1.h / 2) };
    const c2 = { x: Math.floor(r2.x + r2.w / 2), y: Math.floor(r2.y + r2.h / 2) };

    let currX = c1.x;
    let currY = c1.y;

    while (currX !== c2.x) {
      currX += currX < c2.x ? 1 : -1;
      map[currY][currX].isWall = false;
      map[currY][currX].env = 'floor';
    }
    while (currY !== c2.y) {
      currY += currY < c2.y ? 1 : -1;
      map[currY][currX].isWall = false;
      map[currY][currX].env = 'floor';
    }
  }

  const startRoom = rooms[0];
  const startPos = { 
    x: Math.floor(startRoom.x + startRoom.w / 2), 
    y: Math.floor(startRoom.y + startRoom.h / 2) 
  };

  // Add Stairs UP at start position
  entities.push({
      id: uid(), label: '<', type: EntityType.EXIT, name: 'Лестница вверх', symbol: SYMBOLS.EXIT_UP, color: COLORS.EXIT, pos: { ...startPos },
      isHostile: false, isDead: false, inventory: [], stats: { hp: 1000, maxHp: 1000, stamina: 0, maxStamina: 0, strength: 0, gold: 0 },
      nextActionTick: 0
  });

  const labels = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'; 
  let labelIndex = 0;

  rooms.slice(1).forEach(room => {
    const cx = Math.floor(room.x + room.w / 2);
    const cy = Math.floor(room.y + room.h / 2);
    
    // --- Enemy Spawn ---
    const isOrc = Math.random() > 0.7 || level > 3;
    const label = labels[labelIndex % labels.length];
    labelIndex++;

    entities.push({
      id: uid(),
      label: label,
      type: isOrc ? EntityType.ENEMY_ORC : EntityType.ENEMY_GOBLIN,
      name: isOrc ? "Свирепый Орк" : "Хитрый Гоблин",
      symbol: isOrc ? SYMBOLS.ORC : SYMBOLS.GOBLIN,
      color: isOrc ? COLORS.ORC : COLORS.GOBLIN,
      pos: { x: cx, y: cy },
      isHostile: true,
      isDead: false,
      inventory: [],
      personality: isOrc ? 'Furious' : 'Cowardly',
      aiState: 'AGGRESSIVE',
      stats: {
        hp: (isOrc ? 30 : 15) + (level * 2),
        maxHp: (isOrc ? 30 : 15) + (level * 2),
        stamina: 20,
        maxStamina: 20,
        strength: (isOrc ? 5 : 2) + Math.floor(level / 2),
        gold: Math.floor(Math.random() * 10 * level) // Enemies carry gold
      },
      nextActionTick: 0
    });

    // --- Item / Gold Spawn ---
    if (Math.random() > 0.3) {
      const rx = Math.floor(Math.random() * (room.w - 2)) + room.x + 1;
      const ry = Math.floor(Math.random() * (room.h - 2)) + room.y + 1;
      
      const occupied = entities.some(e => e.pos.x === rx && e.pos.y === ry);
      
      if (!occupied) {
        const isGold = Math.random() > 0.5;
        
        if (isGold) {
            const goldAmount = Math.floor(Math.random() * 20) + 10;
            entities.push({
                id: uid(), label: '', type: EntityType.ITEM, name: 'Мешочек золота', symbol: SYMBOLS.GOLD, color: COLORS.ITEM_GOLD, pos: { x: rx, y: ry },
                isHostile: false, isDead: false, inventory: [], stats: { hp:0, maxHp:0, stamina:0, maxStamina:0, strength:0, gold:0 },
                itemData: { id: uid(), name: 'Золото', type: ItemType.GOLD, value: goldAmount },
                nextActionTick: 0
            });
        } else {
            entities.push({
                id: uid(), label: '', type: EntityType.ITEM, name: 'Зелье Лечения', symbol: SYMBOLS.POTION, color: COLORS.ITEM_POTION, pos: { x: rx, y: ry },
                isHostile: false, isDead: false, inventory: [], stats: { hp:0, maxHp:0, stamina:0, maxStamina:0, strength:0, gold:0 },
                itemData: { id: uid(), name: 'Зелье Лечения', type: ItemType.POTION, value: 20, description: 'Восстанавливает 20 HP' },
                nextActionTick: 0
            });
        }
      }
    }
  });

  const lastRoom = rooms[rooms.length - 1];
  const ex = Math.floor(lastRoom.x + lastRoom.w / 2);
  const ey = Math.floor(lastRoom.y + lastRoom.h / 2);
  
  const exitIndex = entities.findIndex(e => e.pos.x === ex && e.pos.y === ey);
  if (exitIndex > -1) entities.splice(exitIndex, 1);

  entities.push({
      id: uid(), label: '>', type: EntityType.EXIT, name: 'Лестница вниз', symbol: SYMBOLS.EXIT, color: COLORS.EXIT, pos: { x: ex, y: ey },
      isHostile: false, isDead: false, inventory: [], stats: { hp: 1000, maxHp: 1000, stamina: 0, maxStamina: 0, strength: 0, gold: 0 },
      nextActionTick: 0
  });

  return {
    world: { map, width: MAP_WIDTH, height: MAP_HEIGHT, level, globalTick: 0 },
    entities,
    startPos
  };
};