import {
  SYMBOLS,
  COLORS,
  STAMINA_COST,
  STAMINA_REGEN,
  PRICES,
  TIME_COST,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../constants";
import { generateDungeon, generateTown } from "../services/dungeonGenerator";
import { evaluateSocialInteraction } from "../services/geminiService";
import {
  GameWorld,
  Entity,
  EntityType,
  GameState,
  Position,
  GameAction,
  GameEvent,
  LogType,
  ItemType,
} from "../types";

export class GameEngine {
  public world: GameWorld | null = null;
  public entities: Entity[] = [];
  public player: Entity | null = null;
  public gameState: GameState = GameState.EXPLORATION;

  // Event History for GM/AI
  private eventHistory: GameEvent[] = [];

  constructor() {}

  public init(level: number, existingPlayer?: Entity): GameEvent[] {
    const events: GameEvent[] = [];

    let result;
    if (level === 0) {
      result = generateTown();
    } else {
      result = generateDungeon(level);
    }

    this.world = result.world;
    this.entities = result.entities;

    if (existingPlayer) {
      this.player = { ...existingPlayer, pos: result.startPos };
    } else {
      this.player = {
        id: "player",
        label: "Я",
        type: EntityType.PLAYER,
        name: "Герой",
        symbol: SYMBOLS.PLAYER,
        color: COLORS.PLAYER,
        pos: result.startPos,
        isHostile: false,
        isDead: false,
        inventory: [],
        stats: {
          hp: 100,
          maxHp: 100,
          stamina: 100,
          maxStamina: 100,
          strength: 10,
          gold: 50,
        },
        nextActionTick: 0,
      };
    }

    this.gameState = level === 0 ? GameState.EXPLORATION : this.gameState;

    events.push({
      type: "LEVEL_CHANGE",
      text:
        level === 0
          ? "Вы прибыли в Тихую Гавань."
          : `Вы спустились на уровень ${level}.`,
      logType: level === 0 ? LogType.INFO : LogType.NARRATIVE,
      data: { level },
    });

    // Initial visibility check
    this.updateVisibility();

    return events;
  }

  // --- MAIN ACTION DISPATCHER ---
  public dispatch(action: GameAction): GameEvent[] {
    if (this.gameState === GameState.GAME_OVER) {
      return [];
    }
    if (!this.player || !this.world) {
      return [];
    }

    const events: GameEvent[] = [];
    let actionCost = 0;

    let playerActed = false;

    // 1. Process Player Choice
    switch (action.type) {
      case "MOVE": {
        const moveResult = this.handleMove(
          action.payload.dx,

          action.payload.dy,
        );

        // If move failed (wall), we don't spend time

        if (moveResult.some((e) => e.logType === LogType.ERROR)) {
          return moveResult;
        }

        events.push(...moveResult);

        // If the move resulted in an immediate attack (bump attack), use ATTACK cost

        const wasAttack = moveResult.some((e) => e.type === "ATTACK");

        actionCost = wasAttack ? TIME_COST.ATTACK_LIGHT : TIME_COST.MOVE;

        playerActed = true;

        break;
      }

      case "ATTACK": {
        const attackResult = this.handleAttack(action.payload.targetId);

        if (attackResult.some((e) => e.logType === LogType.ERROR)) {
          return attackResult;
        }
        events.push(...attackResult);

        actionCost = TIME_COST.ATTACK_LIGHT;

        playerActed = true;

        break;
      }

      case "WAIT":
        events.push(...this.handleWait());
        actionCost = TIME_COST.WAIT;
        playerActed = true;
        break;

      case "PICKUP": {
        const pickResult = this.handlePickup();

        if (pickResult.some((e) => e.logType === LogType.ERROR)) {
          return pickResult;
        }

        events.push(...pickResult);

        actionCost = TIME_COST.INTERACT;

        playerActed = true;

        break;
      }

      case "USE": {
        const useResult = this.handleUse(action.payload.itemName);

        if (useResult.some((e) => e.logType === LogType.ERROR)) {
          return useResult;
        }

        events.push(...useResult);

        actionCost = TIME_COST.USE;

        playerActed = true;

        break;
      }

      case "DESCEND": {
        events.push(...this.handleStairs("down"));

        actionCost = TIME_COST.INTERACT;

        playerActed = true;

        break;
      }

      case "ASCEND": {
        events.push(...this.handleStairs("up"));

        actionCost = TIME_COST.INTERACT;

        playerActed = true;

        break;
      }

      case "BUY": {
        events.push(...this.handleBuy());

        actionCost = TIME_COST.INTERACT;

        playerActed = true;

        break;
      }

      case "HEAL": {
        events.push(...this.handleHeal());

        actionCost = TIME_COST.INTERACT;

        playerActed = true;

        break;
      }

      case "LOOK":
        events.push(this.handleLook());
        // Look is free (usually)
        actionCost = 0;
        playerActed = false;
        break;
      default:
        break;
    }

    // 2. If Player acted, advance time and run Simulation Loop
    if (playerActed && actionCost > 0) {
      const p = this.player!;

      // Apply Stamina Regen (Simple per-turn model preserved for gameplay feel)
      // But scaled to time
      p.stats.stamina = Math.min(
        p.stats.maxStamina,
        p.stats.stamina + (action.type === "WAIT" ? 30 : STAMINA_REGEN),
      );

      // Advance Player Ticket
      p.nextActionTick += actionCost;

      // Run Game Loop until it's Player's turn again
      const loopEvents = this.runGameLoop();
      events.push(...loopEvents);

      // Check Combat State End after everyone moved
      this.checkCombatState(events);
    }

    this.eventHistory.push(...events);
    return events;
  }

  // Метод для обработки социального взаимодействия
  public async handleSocialMove(text: string): Promise<GameEvent[]> {
    const p = this.player!;
    // 1. Найти ближайшего NPC
    const npc =
      this.getNearbyNPC() ||
      this.getVisibleEntities().find((e) => e.isHostile && !e.isDead);

    if (!npc) {
      return [
        { type: "LOG", text: "Вас никто не слышит.", logType: LogType.INFO },
      ];
    }

    const events: GameEvent[] = [];
    events.push({
      type: "LOG",
      text: `Вы: "${text}"`,
      logType: LogType.SPEECH,
    });

    // 2. Сформировать контекст
    const dist = Math.floor(
      Math.sqrt((npc.pos.x - p.pos.x) ** 2 + (npc.pos.y - p.pos.y) ** 2),
    );
    const context = `Расстояние: ${dist} клеток.`;

    // 3. Запрос к ИИ
    const result = await evaluateSocialInteraction(text, npc, context);

    if (!result) {
      events.push({
        type: "LOG",
        text: "NPC не реагирует (ошибка связи с сознанием).",
        logType: LogType.INFO,
      });
      return events;
    }

    // SAFETY CHECK: Если AI вернул success, но забыл reaction
    const reactionText = result.reaction || "...";

    // 4. Применение результата
    events.push({
      type: "LOG",
      text: `${npc.name}: "${reactionText}"`,
      logType: LogType.SPEECH,
    });

    if (result.success && result.newState) {
      // const oldState = npc.aiState; // Unused
      npc.aiState = result.newState as any;

      if (result.newState === "IDLE" && npc.isHostile) {
        npc.isHostile = false;
        events.push({
          type: "GAME_STATE_CHANGE",
          text: `${npc.name} опускает оружие.`,
          logType: LogType.SUCCESS,
        });
      }
      if (result.newState === "FLEEING") {
        events.push({
          type: "LOG",
          text: `${npc.name} бросается наутек!`,
          logType: LogType.SUCCESS,
        });
      }
    } else {
      // Если неудача, но NPC был не враждебен, он может обидеться (опционально)
      events.push({
        type: "LOG",
        text: "Это не подействовало.",
        logType: LogType.INFO,
      });
    }

    // 5. Трата времени
    if (this.gameState === GameState.COMBAT || npc.isHostile) {
      p.nextActionTick += TIME_COST.INTERACT;
      events.push(...this.runGameLoop());
      this.checkCombatState(events);
    }

    this.eventHistory.push(...events);
    return events;
  }

  // --- TIME-BASED GAME LOOP ---
  private runGameLoop(): GameEvent[] {
    const events: GameEvent[] = [];
    const p = this.player!;

    let loops = 0;
    const MAX_LOOPS = 1000; // Safety break

    while (loops <= MAX_LOOPS) {
      // 1. Gather all active entities
      const activeEntities = [p, ...this.entities.filter((e) => !e.isDead)];

      // 2. Sort by nextActionTick (Priority Queue)
      activeEntities.sort((a, b) => a.nextActionTick - b.nextActionTick);

      const nextEntity = activeEntities[0];

      // 3. Advance Global Time
      this.world!.globalTick = nextEntity.nextActionTick;

      // 4. If it's Player's turn, we stop simulation and wait for UI input
      if (nextEntity.id === p.id) {
        break;
      }

      // 5. NPC Turn
      const npcEvents = this.processSingleNPCTurn(nextEntity);
      events.push(...npcEvents);

      // If game over logic triggered inside NPC turn
      if (this.gameState === GameState.GAME_OVER) {
        break;
      }

      loops++;
      if (loops > MAX_LOOPS) {
        console.warn("Infinite Game Loop detected - breaking");
        break;
      }
    }

    return events;
  }

  // --- NPC LOGIC ---
  private processSingleNPCTurn(npc: Entity): GameEvent[] {
    const events: GameEvent[] = [];
    const p = this.player!;

    // Ensure state
    if (!npc.aiState) {
      npc.aiState = npc.isHostile ? "AGGRESSIVE" : "IDLE";
    }

    // --- STATE TRANSITIONS ---

    // Cowardly enemies flee at low HP
    if (npc.aiState === "AGGRESSIVE" && npc.personality === "Cowardly") {
      if (npc.stats.hp < npc.stats.maxHp * 0.3) {
        npc.aiState = "FLEEING";
        events.push({
          type: "LOG",
          text: `${npc.name} визжит: "Пощади! Не убивай!"`,
          logType: LogType.SPEECH,
        });
      }
    }

    // --- STATE EXECUTION ---

    let cost = TIME_COST.WAIT;

    // If dead (double check) or not hostile
    if (npc.isDead || !npc.isHostile) {
      npc.nextActionTick += TIME_COST.WAIT + Math.floor(Math.random() * 50);
      return events;
    }

    if (npc.aiState === "FLEEING") {
      cost = this.handleFlee(npc);
      // Being chased makes them panic (no extra logic needed yet)
    } else if (npc.aiState === "AGGRESSIVE") {
      const dist = Math.sqrt(
        Math.pow(p.pos.x - npc.pos.x, 2) + Math.pow(p.pos.y - npc.pos.y, 2),
      );
      const canSee = this.hasLineOfSight(
        npc.pos.x,
        npc.pos.y,
        p.pos.x,
        p.pos.y,
      );

      if (dist > 15) {
        cost = TIME_COST.WAIT;
      } else if (dist <= 1.5 && canSee) {
        // ATTACK
        const dmg = Math.max(1, npc.stats.strength);
        p.stats.hp -= dmg;
        events.push({
          type: "DAMAGE",
          text: `${npc.name} атакует вас! -${dmg} HP`,
          logType: LogType.COMBAT,
        });
        cost = TIME_COST.ATTACK_LIGHT;

        if (p.stats.hp <= 0) {
          this.gameState = GameState.GAME_OVER;
          events.push({
            type: "DEATH",
            text: "ВЫ ПОГИБЛИ.",
            logType: LogType.ERROR,
          });
        }
      } else if (dist <= 10 && canSee) {
        // MOVE towards player
        cost = this.moveTowards(npc, p.pos.x, p.pos.y);
      } else {
        cost = TIME_COST.WAIT + Math.floor(Math.random() * 50);
      }
    } else {
      // IDLE
      cost = TIME_COST.WAIT + 100;
    }

    npc.nextActionTick += cost;
    return events;
  }

  private moveTowards(npc: Entity, targetX: number, targetY: number): number {
    const dx = targetX - npc.pos.x;
    const dy = targetY - npc.pos.y;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);

    let newX = npc.pos.x;
    let newY = npc.pos.y;

    // Try primary axis
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (!this.isBlocked(npc.pos.x + stepX, npc.pos.y)) {
        newX += stepX;
      } else if (dy !== 0 && !this.isBlocked(npc.pos.x, npc.pos.y + stepY)) {
        newY += stepY;
      }
    } else {
      if (!this.isBlocked(npc.pos.x, npc.pos.y + stepY)) {
        newY += stepY;
      } else if (dx !== 0 && !this.isBlocked(npc.pos.x + stepX, npc.pos.y)) {
        newX += stepX;
      }
    }

    if (newX !== npc.pos.x || newY !== npc.pos.y) {
      npc.pos = { x: newX, y: newY };
      return TIME_COST.MOVE;
    }
    return TIME_COST.WAIT;
  }

  private handleFlee(npc: Entity): number {
    const p = this.player!;
    // Move AWAY from player
    let dx = npc.pos.x - p.pos.x;
    const dy = npc.pos.y - p.pos.y;

    // If standing on same tile (rare), pick random direction
    if (dx === 0 && dy === 0) {
      dx = 1;
    }

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);

    let newX = npc.pos.x;
    let newY = npc.pos.y;

    // Try to move further
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (!this.isBlocked(npc.pos.x + stepX, npc.pos.y)) {
        newX += stepX;
      } else if (dy !== 0 && !this.isBlocked(npc.pos.x, npc.pos.y + stepY)) {
        newY += stepY;
      }
    } else {
      if (!this.isBlocked(npc.pos.x, npc.pos.y + stepY)) {
        newY += stepY;
      } else if (dx !== 0 && !this.isBlocked(npc.pos.x + stepX, npc.pos.y)) {
        newX += stepX;
      }
    }

    if (newX !== npc.pos.x || newY !== npc.pos.y) {
      npc.pos = { x: newX, y: newY };
      return TIME_COST.MOVE;
    }

    return TIME_COST.WAIT; // Cornered or blocked
  }

  // --- HANDLERS ---

  private handleMove(dx: number, dy: number): GameEvent[] {
    const p = this.player!;
    const newX = p.pos.x + dx;
    const newY = p.pos.y + dy;

    if (this.isBlocked(newX, newY)) {
      return [
        { type: "LOG", text: "Путь прегражден.", logType: LogType.ERROR },
      ];
    }

    const hostile = this.getHostileAt(newX, newY);
    if (hostile) {
      // Return attack events but ensure calling function knows it was an attack for time cost
      return this.handleAttack(hostile.id);
    }

    // Stamina Check
    if (this.world!.level > 0 && p.stats.stamina < STAMINA_COST.MOVE) {
      return [{ type: "LOG", text: "Слишком устал!", logType: LogType.ERROR }];
    }

    // Execute Move
    p.pos = { x: newX, y: newY };
    if (this.world!.level > 0) {
      p.stats.stamina -= STAMINA_COST.MOVE;
    }

    this.updateVisibility();

    const events: GameEvent[] = [];
    events.push({
      type: "ENTITY_MOVED",
      text: "",
      logType: LogType.INFO,
      data: { actorId: p.id, x: newX, y: newY },
    });

    // Check floor items
    const item = this.getEntityAt(newX, newY);
    if (item) {
      if (item.type === EntityType.ITEM) {
        events.push({
          type: "LOG",
          text: `Вы видите: ${item.name}.`,
          logType: LogType.INFO,
        });
      } else if (item.type === EntityType.EXIT) {
        const action = item.symbol === SYMBOLS.EXIT ? "спуск" : "наверх";
        events.push({
          type: "LOG",
          text: `${item.name}. Введите '${action}'.`,
          logType: LogType.INFO,
        });
      }
    }

    return events;
  }

  private handleAttack(targetId: string): GameEvent[] {
    const p = this.player!;
    const target = this.entities.find((e) => e.id === targetId);

    if (!target) {
      return [
        { type: "LOG", text: "Цель не найдена.", logType: LogType.ERROR },
      ];
    }
    if (p.stats.stamina < STAMINA_COST.ATTACK) {
      return [
        { type: "LOG", text: "Нет сил на удар!", logType: LogType.ERROR },
      ];
    }

    p.stats.stamina -= STAMINA_COST.ATTACK;

    const damage = Math.max(
      1,
      p.stats.strength + Math.floor(Math.random() * 3),
    );
    target.stats.hp -= damage;

    const events: GameEvent[] = [];
    events.push({
      type: "ATTACK",
      text: `Вы нанесли ${damage} урона по ${target.name}.`,
      logType: LogType.COMBAT,
      data: { damage, targetId },
    });

    if (this.gameState === GameState.EXPLORATION && target.isHostile) {
      this.gameState = GameState.COMBAT;
      events.push({
        type: "GAME_STATE_CHANGE",
        text: "НАЧАЛСЯ БОЙ!",
        logType: LogType.COMBAT,
      });
    }

    if (target.stats.hp <= 0) {
      target.isDead = true;
      target.isHostile = false; // Stop combat
      events.push({
        type: "DEATH",
        text: `${target.name} погибает.`,
        logType: LogType.SUCCESS,
        data: { targetId },
      });
    }

    return events;
  }

  private handleWait(): GameEvent[] {
    return [{ type: "LOG", text: "Вы ждете...", logType: LogType.INFO }];
  }

  private handlePickup(): GameEvent[] {
    const p = this.player!;
    const item = this.entities.find(
      (e) =>
        e.type === EntityType.ITEM &&
        e.pos.x === p.pos.x &&
        e.pos.y === p.pos.y,
    );

    if (!item || !item.itemData) {
      return [
        { type: "LOG", text: "Здесь нечего брать.", logType: LogType.INFO },
      ];
    }

    const data = item.itemData;
    this.entities = this.entities.filter((e) => e.id !== item.id);

    if (data.type === ItemType.GOLD) {
      p.stats.gold += data.value;
      return [
        {
          type: "ITEM_PICKUP",
          text: `Вы нашли ${data.value} золота.`,
          logType: LogType.SUCCESS,
        },
      ];
    } else {
      p.inventory.push(data);
      return [
        {
          type: "ITEM_PICKUP",
          text: `Вы подобрали: ${data.name}.`,
          logType: LogType.SUCCESS,
        },
      ];
    }
  }

  private handleUse(itemName: string): GameEvent[] {
    const p = this.player!;
    const idx = p.inventory.findIndex((i) =>
      i.name.toLowerCase().includes(itemName.toLowerCase()),
    );

    if (idx === -1) {
      return [
        { type: "LOG", text: "Нет такого предмета.", logType: LogType.ERROR },
      ];
    }

    const item = p.inventory[idx];
    if (item.type === ItemType.POTION) {
      p.stats.hp = Math.min(p.stats.maxHp, p.stats.hp + item.value);
      p.inventory.splice(idx, 1);
      return [
        {
          type: "HEAL",
          text: `Вы выпили ${item.name}. +${item.value} HP.`,
          logType: LogType.SUCCESS,
        },
      ];
    }

    return [
      { type: "LOG", text: "Нельзя использовать это.", logType: LogType.ERROR },
    ];
  }

  private handleStairs(dir: "up" | "down"): GameEvent[] {
    const p = this.player!;
    const stairs = this.entities.find(
      (e) =>
        e.type === EntityType.EXIT &&
        e.pos.x === p.pos.x &&
        e.pos.y === p.pos.y,
    );

    if (!stairs) {
      return [
        { type: "LOG", text: "Здесь нет лестницы.", logType: LogType.ERROR },
      ];
    }

    if (dir === "down") {
      if (stairs.symbol === SYMBOLS.EXIT) {
        // Down logic
        return this.init(this.world!.level + 1, p);
      }
      return [
        { type: "LOG", text: "Это лестница вверх.", logType: LogType.ERROR },
      ];
    } else {
      if (stairs.symbol === SYMBOLS.EXIT_UP) {
        // Up logic
        return this.init(Math.max(0, this.world!.level - 1), p);
      }
      return [
        { type: "LOG", text: "Это лестница вниз.", logType: LogType.ERROR },
      ];
    }
  }

  private handleBuy(): GameEvent[] {
    const p = this.player!;
    const merchant = this.getNearbyNPC();
    if (!merchant || merchant.npcType !== "MERCHANT") {
      return [
        { type: "LOG", text: "Здесь нет торговца.", logType: LogType.ERROR },
      ];
    }

    if (p.stats.gold < PRICES.POTION) {
      return [
        { type: "LOG", text: "Не хватает золота.", logType: LogType.ERROR },
      ];
    }

    p.stats.gold -= PRICES.POTION;
    p.inventory.push({
      id: Math.random().toString(),
      name: "Зелье Лечения",
      type: ItemType.POTION,
      value: 20,
      description: "HP +20",
    });

    return [
      {
        type: "TRANSACTION",
        text: "Вы купили зелье.",
        logType: LogType.SUCCESS,
      },
    ];
  }

  private handleHeal(): GameEvent[] {
    const p = this.player!;
    const healer = this.getNearbyNPC();
    if (!healer || healer.npcType !== "HEALER") {
      return [
        { type: "LOG", text: "Здесь нет лекаря.", logType: LogType.ERROR },
      ];
    }

    if (p.stats.gold < PRICES.HEAL) {
      return [
        { type: "LOG", text: "Нужно больше золота.", logType: LogType.ERROR },
      ];
    }

    p.stats.gold -= PRICES.HEAL;
    p.stats.hp = p.stats.maxHp;

    return [
      { type: "HEAL", text: "Ваши раны исцелены.", logType: LogType.SUCCESS },
    ];
  }

  private handleLook(): GameEvent {
    if (this.world?.level === 0) {
      return {
        type: "LOG",
        text: "Вы в городе. Безопасно.",
        logType: LogType.INFO,
      };
    }

    const visible = this.getVisibleEntities();
    if (visible.length === 0) {
      return {
        type: "LOG",
        text: "Осмотр: Темно и пусто.",
        logType: LogType.INFO,
      };
    }

    const names = visible.map((e) => e.name).join(", ");
    return { type: "LOG", text: `Осмотр: ${names}.`, logType: LogType.INFO };
  }

  // --- SYSTEMS ---

  private checkCombatState(events: GameEvent[]) {
    if (this.world?.level === 0) {
      return;
    } // No combat in town

    const visibleHostiles = this.getVisibleEntities().filter(
      (e) => e.isHostile && !e.isDead,
    );

    if (visibleHostiles.length === 0 && this.gameState === GameState.COMBAT) {
      this.gameState = GameState.EXPLORATION;
      events.push({
        type: "GAME_STATE_CHANGE",
        text: "Бой окончен.",
        logType: LogType.INFO,
      });
    }
  }

  private updateVisibility() {
    if (!this.world || !this.player) {
      return;
    }
    const radius = 8;
    const p = this.player.pos;

    // Reset visibility
    this.world.map.forEach((row) =>
      row.forEach((tile) => (tile.isVisible = false)),
    );

    if (this.world.level === 0) {
      // Town is always visible
      this.world.map.forEach((row) =>
        row.forEach((tile) => {
          tile.isVisible = true;
          tile.isExplored = true;
        }),
      );
      return;
    }

    // Raycasting for Dungeon
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          this.castRay(p.x, p.y, p.x + x, p.y + y);
        }
      }
    }
  }

  private castRay(x0: number, y0: number, x1: number, y1: number) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (err !== 0) {
      if (cx >= 0 && cx < MAP_WIDTH && cy >= 0 && cy < MAP_HEIGHT) {
        const tile = this.world!.map[cy][cx];
        tile.isVisible = true;
        tile.isExplored = true;
        if (tile.isWall) {
          break;
        }
      } else {
        break;
      }

      if (cx === x1 && cy === y1) {
        break;
      }
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  // --- HELPERS ---

  public getContextDescription(): string {
    if (this.world?.level === 0) {
      return "Локация: Тихая Гавань. Мирный город.";
    }
    const visible = this.getVisibleEntities();
    if (visible.length === 0) {
      return "Темный коридор подземелья.";
    }

    const details = visible
      .map((e) => {
        let desc = `[${e.label}] ${e.name}`;
        if (e.npcType) {
          desc += ` (Роль: ${e.npcType})`;
        }
        if (e.isHostile) {
          desc += ` (Враг, HP: ${e.stats.hp})`;
        }
        return desc;
      })
      .join(", ");

    return `Вы видите: ${details}`;
  }

  private isBlocked(x: number, y: number): boolean {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) {
      return true;
    }
    const tile = this.world!.map[y][x];
    if (tile.isWall || tile.env === "water") {
      return true;
    }
    // Check if blocked by another entity (unless it's an item/exit)
    const blocker = this.entities.find(
      (e) =>
        e.pos.x === x &&
        e.pos.y === y &&
        !e.isDead &&
        e.type !== EntityType.ITEM &&
        e.type !== EntityType.EXIT,
    );
    return !!blocker;
  }

  private getHostileAt(x: number, y: number): Entity | undefined {
    return this.entities.find(
      (e) => e.pos.x === x && e.pos.y === y && !e.isDead && e.isHostile,
    );
  }

  private getEntityAt(x: number, y: number): Entity | undefined {
    // Priority: Item/Exit
    return this.entities.find(
      (e) =>
        e.pos.x === x &&
        e.pos.y === y &&
        (e.type === EntityType.ITEM || e.type === EntityType.EXIT),
    );
  }

  private getNearbyNPC(): Entity | undefined {
    const p = this.player!;
    return this.entities.find(
      (e) =>
        e.type === EntityType.NPC &&
        Math.abs(e.pos.x - p.pos.x) <= 1.5 &&
        Math.abs(e.pos.y - p.pos.y) <= 1.5,
    );
  }

  private getVisibleEntities(): Entity[] {
    if (!this.player) {
      return [];
    }
    const p = this.player.pos;
    return this.entities.filter(
      (e) =>
        !e.isDead &&
        e.id !== this.player!.id &&
        this.hasLineOfSight(p.x, p.y, e.pos.x, e.pos.y) &&
        Math.sqrt(Math.pow(p.x - e.pos.x, 2) + Math.pow(p.y - e.pos.y, 2)) <= 8,
    );
  }

  private hasLineOfSight(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): boolean {
    // Bresenham's Line
    if (this.world?.level === 0) {
      return true;
    }
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;

    for (let steps = 0; steps < 1000; steps++) {
      if (cx === x1 && cy === y1) {
        return true;
      }
      if (this.world!.map[cy][cx].isWall && (cx !== x0 || cy !== y0)) {
        return false;
      }
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }

      if (e2 < dx) {
        err += dx;

        cy += sy;
      }
    }

    return false;
  }
}
