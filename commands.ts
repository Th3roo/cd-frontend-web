/**
 * Command system for key bindings and actions
 *
 * This module provides:
 * - Structured game commands that are sent to the server
 * - Predefined commands for common actions (movement, inventory, etc.)
 * - Key binding management with support for customization
 * - Future extensibility for user-configurable controls
 */

/**
 * Represents a game command that will be sent to the server
 */
export interface GameCommand {
  /** The action type (e.g., "MOVE", "PICKUP", "WAIT") */
  action: string;
  /** Optional payload data for the action (e.g., movement direction) */
  payload?: any;
  /** Human-readable label for settings UI (e.g., "Move Up", "Pick up item") */
  label?: string;
  /** Human-readable description in past tense for logging (e.g., "moved up", "picked up item") */
  description?: string;
  /** Whether this command requires selecting a target entity (adds targetId to payload) */
  requiresEntityTarget?: boolean;
  /** Whether this command requires selecting a target position (adds x, y to payload) */
  requiresPositionTarget?: boolean;
}

// --- Predefined Commands ---

export const CommandUp: GameCommand = {
  action: "MOVE",
  payload: { dx: 0, dy: -1 },
  label: "Move Up",
  description: "Вы пошли наверх",
};

export const CommandDown: GameCommand = {
  action: "MOVE",
  payload: { dx: 0, dy: 1 },
  label: "Move Down",
  description: "Вы пошли вниз",
};

export const CommandLeft: GameCommand = {
  action: "MOVE",
  payload: { dx: -1, dy: 0 },
  label: "Move Left",
  description: "Вы пошли влево",
};

export const CommandRight: GameCommand = {
  action: "MOVE",
  payload: { dx: 1, dy: 0 },
  label: "Move Right",
  description: "Вы пошли направо",
};

export const CommandCustom: GameCommand = {
  action: "CUSTOM",
  payload: {},
  label: "Custom Command",
  description: "Вы выполнили кастомную команду",
  requiresEntityTarget: false,
  requiresPositionTarget: false,
};

// --- Entity Target Commands ---

export const CommandAttack: GameCommand = {
  action: "ATTACK",
  label: "Attack",
  description: "Вы атаковали {targetName}",
  requiresEntityTarget: true,
};

export const CommandTalk: GameCommand = {
  action: "TALK",
  label: "Talk",
  description: "Вы поговорили с {targetName}",
  requiresEntityTarget: true,
};

export const CommandInspect: GameCommand = {
  action: "INSPECT",
  label: "Inspect",
  description: "Вы осмотрели {targetName}",
  requiresEntityTarget: true,
};

export const CommandPickup: GameCommand = {
  action: "PICKUP",
  label: "Pick Up",
  description: "Вы подобрали {targetName}",
  requiresEntityTarget: true,
};

export const CommandInteract: GameCommand = {
  action: "INTERACT",
  label: "Interact",
  description: "Вы взаимодействовали с {targetName}",
  requiresEntityTarget: true,
};

export const CommandTrade: GameCommand = {
  action: "TRADE",
  label: "Trade",
  description: "Вы начали торговлю с {targetName}",
  requiresEntityTarget: true,
};

// --- Position Target Commands ---

export const CommandTeleport: GameCommand = {
  action: "TELEPORT",
  label: "Teleport",
  description: "Вы телепортировались на позицию {position}",
  requiresPositionTarget: true,
};

export const CommandCastArea: GameCommand = {
  action: "CAST_AREA",
  label: "Cast Area Spell",
  description: "Вы применили заклинание на область {position}",
  requiresPositionTarget: true,
};

// --- Inventory Commands ---

// БРОСИТЬ - Drop item from inventory to current location
export const CommandDrop: GameCommand = {
  action: "DROP",
  label: "Drop",
  description: "Вы бросили {name}",
};

// ИСПОЛЬЗОВАТЬ - Use item from inventory
export const CommandUse: GameCommand = {
  action: "USE",
  label: "Use",
  description: "Вы использовали {name}",
};

// --- Speech Commands ---
// TODO: Ждем контракта от бекенда, надо будет переделать. Сейчас просто заглушка

// ГОВОРИТЬ
export const CommandSay: GameCommand = {
  action: "SAY",
  label: "Say",
  description: "Вы сказали: {text}",
};

// ШЕПТАТЬ
export const CommandWhisper: GameCommand = {
  action: "WHISPER",
  label: "Whisper",
  description: "Вы прошептали: {text}",
};

// КРИЧАТЬ
export const CommandYell: GameCommand = {
  action: "YELL",
  label: "Yell",
  description: "Вы крикнули: {text}",
};

// --- Key Bindings Map ---

/**
 * Represents a mapping between a keyboard code and a game command
 */
export type KeyBinding = {
  /** The keyboard code (e.g., "KeyW", "ArrowUp") - layout-independent */
  code: string;
  /** The command to execute when this key is pressed */
  command: GameCommand;
};

/**
 * Default key bindings configuration
 *
 * Supports:
 * - WASD movement
 * - Arrow key movement
 * - Common roguelike actions
 *
 * Can be overridden by loading from localStorage or user settings
 */
export const DEFAULT_KEY_BINDINGS: KeyBinding[] = [
  // WASD Movement (using KeyboardEvent.code for layout independence)
  { code: "KeyW", command: CommandUp },
  { code: "KeyA", command: CommandLeft },
  { code: "KeyS", command: CommandDown },
  { code: "KeyD", command: CommandRight },

  // Arrow Keys Movement
  { code: "ArrowUp", command: CommandUp },
  { code: "ArrowLeft", command: CommandLeft },
  { code: "ArrowDown", command: CommandDown },
  { code: "ArrowRight", command: CommandRight },

  // Entity Target Commands
  { code: "KeyF", command: CommandAttack },
  { code: "KeyT", command: CommandTalk },
  { code: "KeyE", command: CommandInspect },
  { code: "KeyG", command: CommandPickup },
  { code: "KeyR", command: CommandTrade },

  // Position Target Commands
  { code: "KeyV", command: CommandTeleport },
  { code: "KeyC", command: CommandCastArea },
];

/**
 * Manages key bindings and command mappings
 *
 * Features:
 * - Lookup commands by key press
 * - Update/remove bindings dynamically
 * - Persist settings to localStorage
 * - Support for future settings UI
 *
 * @example
 * ```typescript
 * const manager = new KeyBindingManager();
 * const command = manager.getCommand('KeyW'); // Returns CommandUp
 * manager.setBinding('KeyQ', CommandWait); // Rebind Q to wait
 * manager.saveToLocalStorage(); // Persist changes
 * ```
 */
export class KeyBindingManager {
  private bindings: Map<string, GameCommand>;

  constructor(bindingList: KeyBinding[] = DEFAULT_KEY_BINDINGS) {
    this.bindings = new Map();
    this.loadBindings(bindingList);
  }

  /**
   * Load bindings from a list into the internal map
   */
  private loadBindings(bindingList: KeyBinding[]) {
    bindingList.forEach((binding) => {
      this.bindings.set(binding.code, binding.command);
    });
  }

  /**
   * Get the command associated with a key press
   * @param code - The keyboard code (e.g., "KeyW", "ArrowUp")
   * @returns The associated command, or undefined if not bound
   */
  getCommand(code: string): GameCommand | undefined {
    return this.bindings.get(code);
  }

  /**
   * Check if a key is currently bound
   * @param code - The keyboard code to check
   * @returns True if the key has a binding
   */
  hasBinding(code: string): boolean {
    return this.bindings.has(code);
  }

  /**
   * Update or create a key binding
   * @param code - The keyboard code to bind
   * @param command - The command to execute
   */
  setBinding(code: string, command: GameCommand): void {
    this.bindings.set(code, command);
  }

  /**
   * Remove a key binding
   * @param code - The keyboard code to unbind
   */
  removeBinding(code: string): void {
    this.bindings.delete(code);
  }

  /**
   * Get all current bindings as a map
   * @returns A copy of the bindings map (for settings UI)
   */
  getAllBindings(): Map<string, GameCommand> {
    return new Map(this.bindings);
  }

  /**
   * Get all bindings formatted for settings UI
   * @returns Array of bindings with code, command action, and label
   */
  getAllBindingsForUI(): Array<{
    code: string;
    action: string;
    label: string;
  }> {
    const result: Array<{ code: string; action: string; label: string }> = [];
    this.bindings.forEach((command, code) => {
      result.push({
        code,
        action: command.action,
        label: command.label || command.action,
      });
    });
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Save current bindings to browser localStorage
   * Allows persistence across sessions
   */
  saveToLocalStorage(): void {
    const bindingsArray = Array.from(this.bindings.entries()).map(
      ([code, command]) => ({ code, command }),
    );
    localStorage.setItem("keyBindings", JSON.stringify(bindingsArray));
  }

  /**
   * Load bindings from browser localStorage
   * If no saved bindings exist, keeps current bindings unchanged
   */
  loadFromLocalStorage(): void {
    const saved = localStorage.getItem("keyBindings");
    if (saved) {
      try {
        const bindingsArray = JSON.parse(saved);
        this.bindings.clear();
        bindingsArray.forEach(
          ({ code, command }: { code: string; command: GameCommand }) => {
            this.bindings.set(code, command);
          },
        );
      } catch (error) {
        console.error("Failed to load key bindings from localStorage:", error);
      }
    }
  }

  /**
   * Reset bindings to default configuration
   * Clears current bindings and reloads defaults
   */
  resetToDefaults(): void {
    this.bindings.clear();
    this.loadBindings(DEFAULT_KEY_BINDINGS);
    localStorage.removeItem("keyBindings");
  }

  // --- Example: Creating Custom Commands ---
  // You can extend the command system by creating new commands:
  //
  // export const CommandAttack: GameCommand = {
  //   action: "ATTACK",
  //   payload: { targetType: "nearest" },
  //   label: "Attack nearest enemy",
  //   description: "атаковали ближайшего врага"
  // };
  //
  // export const CommandUsePotion: GameCommand = {
  //   action: "USE",
  //   payload: { itemType: "POTION" },
  //   label: "Use health potion",
  //   description: "использовали зелье здоровья"
  // };
  //
  // Then add them to key bindings:
  // { code: "KeyF", command: CommandAttack }
  // { code: "KeyH", command: CommandUsePotion }
}
