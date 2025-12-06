import { FC, useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  CommandAttack,
  CommandCastArea,
  CommandCustom,
  CommandDown,
  CommandInspect,
  CommandLeft,
  CommandPickup,
  CommandRight,
  CommandTalk,
  CommandTeleport,
  CommandTrade,
  CommandUp,
  GameCommand,
  KeyBindingManager,
} from "../../../../commands";

interface KeybindingsSettingsProps {
  keyBindingManager: KeyBindingManager;
  resetWindowLayout?: () => Promise<void>;
  onOpenCasino?: () => void;
}

interface KeyBindingRow {
  id: string;
  code: string;
  command: GameCommand | null;
  isEditing: boolean;
}

// Список доступных команд для выбора
const AVAILABLE_COMMANDS: GameCommand[] = [
  CommandUp,
  CommandDown,
  CommandLeft,
  CommandRight,
  CommandAttack,
  CommandTalk,
  CommandInspect,
  CommandPickup,
  CommandTrade,
  CommandTeleport,
  CommandCastArea,
  CommandCustom,
  // TODO: Добавить возможность перетащить из инвентаря сущность и назначить
];

// Функция для сравнения команд (учитывает action и payload)
const commandsEqual = (
  cmd1: GameCommand | null,
  cmd2: GameCommand,
): boolean => {
  if (!cmd1) {
    return false;
  }
  if (cmd1.action !== cmd2.action) {
    return false;
  }
  // Для кастомных команд не сравниваем, так как каждая уникальна
  if (cmd1.action === "CUSTOM" || cmd2.action === "CUSTOM") {
    return false;
  }
  // Сравниваем payload через JSON (простое глубокое сравнение)
  return JSON.stringify(cmd1.payload) === JSON.stringify(cmd2.payload);
};

const KeybindingsSettings: FC<KeybindingsSettingsProps> = ({
  keyBindingManager,
  resetWindowLayout,
  onOpenCasino,
}) => {
  const [activeTab, setActiveTab] = useState<"keybindings" | "windows">(
    "keybindings",
  );
  const [bindings, setBindings] = useState<KeyBindingRow[]>(() => {
    // Инициализируем state сразу при создании
    const currentBindings = keyBindingManager.getAllBindings();
    const rows: KeyBindingRow[] = [];

    currentBindings.forEach((command, code) => {
      rows.push({
        id: `${code}-${command.action}`,
        code,
        command,
        isEditing: false,
      });
    });

    return rows;
  });
  const [capturingKeyFor, setCapturingKeyFor] = useState<string | null>(null);
  const [editingCustomCommand, setEditingCustomCommand] = useState<
    string | null
  >(null);
  const [customAction, setCustomAction] = useState("");
  const [customPayload, setCustomPayload] = useState("");
  const [requiresEntityTarget, setRequiresEntityTarget] = useState(false);
  const [requiresPositionTarget, setRequiresPositionTarget] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleAddBinding = () => {
    const newRow: KeyBindingRow = {
      id: `new-${Date.now()}`,
      code: "",
      command: null,
      isEditing: true,
    };
    setBindings([...bindings, newRow]);
  };

  const handleRemoveBinding = (id: string, code: string) => {
    if (code) {
      keyBindingManager.removeBinding(code);
      keyBindingManager.saveToLocalStorage();
    }
    setBindings((prev) => prev.filter((b) => b.id !== id));
  };

  const handleStartCapture = (id: string) => {
    setCapturingKeyFor(id);
  };

  const handleCommandChange = (id: string, commandIndex: number) => {
    const command = AVAILABLE_COMMANDS[commandIndex];

    // Если выбрана кастомная команда, открываем режим редактирования
    if (command.action === "CUSTOM") {
      setEditingCustomCommand(id);
      const binding = bindings.find((b) => b.id === id);
      if (binding?.command && binding.command.action === "CUSTOM") {
        setCustomAction(binding.command.action);
        setRequiresEntityTarget(binding.command.requiresEntityTarget || false);
        setRequiresPositionTarget(
          binding.command.requiresPositionTarget || false,
        );
        setCustomPayload(
          JSON.stringify(binding.command.payload || {}, null, 2),
        );
      } else {
        setCustomAction("");
        setCustomPayload("{}");
        setRequiresEntityTarget(false);
        setRequiresPositionTarget(false);
      }
      return;
    }

    setBindings((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          const updated = { ...b, command };
          // Если есть и клавиша и команда - сохраняем
          if (b.code && command) {
            keyBindingManager.setBinding(b.code, command);
            keyBindingManager.saveToLocalStorage();
          }
          return updated;
        }
        return b;
      }),
    );
  };

  const handleSaveCustomCommand = (id: string) => {
    try {
      const payload = JSON.parse(customPayload);

      const customCommand: GameCommand = {
        action: customAction,
        payload,
        label: `Custom: ${customAction}`,
        description: `выполнили ${customAction}`,
        requiresEntityTarget: requiresEntityTarget,
        requiresPositionTarget: requiresPositionTarget,
      };

      setBindings((prev) =>
        prev.map((b) => {
          if (b.id === id) {
            const updated = { ...b, command: customCommand };
            // Если есть и клавиша и команда - сохраняем
            if (b.code) {
              keyBindingManager.setBinding(b.code, customCommand);
              keyBindingManager.saveToLocalStorage();
            }
            return updated;
          }
          return b;
        }),
      );

      setEditingCustomCommand(null);
      setCustomAction("");
      setCustomPayload("");
      setRequiresEntityTarget(false);
      setRequiresPositionTarget(false);
    } catch {
      alert("Ошибка в JSON payload. Проверьте формат.");
    }
  };

  const handleCancelCustomCommand = () => {
    setEditingCustomCommand(null);
    setCustomAction("");
    setCustomPayload("");
    setRequiresEntityTarget(false);
    setRequiresPositionTarget(false);
  };

  const handleSaveAllBindings = () => {
    keyBindingManager.saveToLocalStorage();
    setSaveMessage("Настройки сохранены!");
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleResetToDefaults = () => {
    if (
      !confirm(
        "Вы уверены, что хотите сбросить все настройки клавиш на значения по умолчанию?",
      )
    ) {
      return;
    }

    // Сбрасываем на defaults
    keyBindingManager.resetToDefaults();

    // Обновляем UI
    const currentBindings = keyBindingManager.getAllBindings();
    const rows: KeyBindingRow[] = [];

    currentBindings.forEach((command, code) => {
      rows.push({
        id: `${code}-${command.action}`,
        code,
        command,
        isEditing: false,
      });
    });

    setBindings(rows);
    setSaveMessage("Настройки сброшены на значения по умолчанию");
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // Обработчик нажатия клавиши для захвата
  useEffect(() => {
    if (!capturingKeyFor) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const code = e.code;

      setBindings((prev) =>
        prev.map((b) => {
          if (b.id === capturingKeyFor) {
            const updated = { ...b, code, isEditing: false };
            // Если есть и клавиша и команда - сохраняем
            if (code && b.command) {
              keyBindingManager.setBinding(code, b.command);
              keyBindingManager.saveToLocalStorage();
            }
            return updated;
          }
          return b;
        }),
      );

      setCapturingKeyFor(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [capturingKeyFor, keyBindingManager]);

  const formatKeyCode = (code: string): string => {
    if (!code) {
      return "Нажмите клавишу...";
    }
    // Форматируем код клавиши для читаемости
    return code.replace("Key", "").replace("Arrow", "").replace("Digit", "");
  };

  return (
    <div className="flex h-full text-gray-300">
      {/* Sidebar with tabs */}
      <div className="w-48 bg-neutral-900 border-r border-neutral-700 p-2 flex flex-col gap-1">
        <button
          onClick={() => setActiveTab("keybindings")}
          className={`px-4 py-2 rounded text-left transition-colors ${
            activeTab === "keybindings"
              ? "bg-neutral-700 text-white"
              : "text-gray-400 hover:bg-neutral-800 hover:text-gray-300"
          }`}
        >
          Управление
        </button>
        <button
          onClick={() => setActiveTab("windows")}
          className={`px-4 py-2 rounded text-left transition-colors ${
            activeTab === "windows"
              ? "bg-neutral-700 text-white"
              : "text-gray-400 hover:bg-neutral-800 hover:text-gray-300"
          }`}
        >
          Система окон
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeTab === "keybindings" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Настройка клавиш</h2>
              <div className="flex items-center gap-2">
                {saveMessage && (
                  <span className="text-sm text-green-400 animate-pulse">
                    {saveMessage}
                  </span>
                )}
                <button
                  onClick={handleResetToDefaults}
                  className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 rounded transition-colors text-sm"
                  title="Сбросить на значения по умолчанию"
                >
                  Сбросить
                </button>
                <button
                  onClick={handleSaveAllBindings}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 border border-blue-500 rounded transition-colors text-sm font-semibold"
                  title="Сохранить все изменения"
                >
                  Сохранить
                </button>
              </div>
            </div>

            <div className="mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-700">
                      <th className="text-left py-2 px-2">Клавиша</th>
                      <th className="text-left py-2 px-2">Команда</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bindings.map((binding) => (
                      <tr
                        key={binding.id}
                        className="border-b border-neutral-800 hover:bg-neutral-800/50"
                      >
                        <td className="py-2 px-2">
                          <button
                            onClick={() => handleStartCapture(binding.id)}
                            className={`px-3 py-1 rounded border transition-colors ${
                              capturingKeyFor === binding.id
                                ? "border-yellow-500 bg-yellow-500/20 text-yellow-300"
                                : "border-neutral-600 bg-neutral-800 hover:bg-neutral-700"
                            }`}
                          >
                            {capturingKeyFor === binding.id
                              ? "Нажмите клавишу..."
                              : formatKeyCode(binding.code)}
                          </button>
                        </td>
                        <td className="py-2 px-2">
                          {editingCustomCommand === binding.id ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Action (например: ATTACK)"
                                value={customAction}
                                onChange={(e) =>
                                  setCustomAction(e.target.value)
                                }
                                className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-gray-300 text-sm focus:outline-none focus:border-gray-500"
                              />
                              <textarea
                                placeholder='Payload JSON (например: {"target": "enemy"})'
                                value={customPayload}
                                onChange={(e) =>
                                  setCustomPayload(e.target.value)
                                }
                                rows={3}
                                className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-gray-300 text-sm font-mono focus:outline-none focus:border-gray-500"
                              />
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`requires-entity-${binding.id}`}
                                    checked={requiresEntityTarget}
                                    onChange={(e) =>
                                      setRequiresEntityTarget(e.target.checked)
                                    }
                                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-500"
                                  />
                                  <label
                                    htmlFor={`requires-entity-${binding.id}`}
                                    className="text-sm text-gray-300"
                                  >
                                    Требует выбор Сущности (targetId)
                                  </label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`requires-position-${binding.id}`}
                                    checked={requiresPositionTarget}
                                    onChange={(e) =>
                                      setRequiresPositionTarget(
                                        e.target.checked,
                                      )
                                    }
                                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-500"
                                  />
                                  <label
                                    htmlFor={`requires-position-${binding.id}`}
                                    className="text-sm text-gray-300"
                                  >
                                    Требует выбор Позиции (x, y)
                                  </label>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleSaveCustomCommand(binding.id)
                                  }
                                  className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs text-white"
                                >
                                  Сохранить
                                </button>
                                <button
                                  onClick={handleCancelCustomCommand}
                                  className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs text-gray-300"
                                >
                                  Отмена
                                </button>
                              </div>
                            </div>
                          ) : binding.command &&
                            !AVAILABLE_COMMANDS.some((c) =>
                              commandsEqual(binding.command, c),
                            ) ? (
                            <div className="text-sm">
                              <div className="font-semibold text-purple-400">
                                Custom: {binding.command.action}
                              </div>
                              <div className="text-xs text-gray-400 mt-1 font-mono">
                                {JSON.stringify(binding.command.payload)}
                              </div>
                              {(binding.command.requiresEntityTarget ||
                                binding.command.requiresPositionTarget) && (
                                <div className="text-xs text-yellow-400 mt-1">
                                  {binding.command.requiresEntityTarget &&
                                    "⚠ Требует выбор сущности"}
                                  {binding.command.requiresEntityTarget &&
                                    binding.command.requiresPositionTarget &&
                                    " • "}
                                  {binding.command.requiresPositionTarget &&
                                    "⚠ Требует выбор позиции"}
                                </div>
                              )}
                              <button
                                onClick={() => {
                                  setEditingCustomCommand(binding.id);
                                  setCustomAction(
                                    binding.command?.action || "",
                                  );
                                  setRequiresEntityTarget(
                                    binding.command?.requiresEntityTarget ||
                                      false,
                                  );
                                  setRequiresPositionTarget(
                                    binding.command?.requiresPositionTarget ||
                                      false,
                                  );
                                  setCustomPayload(
                                    JSON.stringify(
                                      binding.command?.payload || {},
                                      null,
                                      2,
                                    ),
                                  );
                                }}
                                className="mt-1 text-xs text-blue-400 hover:text-blue-300 underline"
                              >
                                Редактировать
                              </button>
                            </div>
                          ) : (
                            <select
                              value={
                                binding.command
                                  ? AVAILABLE_COMMANDS.findIndex((c) =>
                                      commandsEqual(binding.command, c),
                                    )
                                  : -1
                              }
                              onChange={(e) =>
                                handleCommandChange(
                                  binding.id,
                                  parseInt(e.target.value),
                                )
                              }
                              className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-gray-300 hover:bg-neutral-700 focus:outline-none focus:border-gray-500"
                            >
                              <option value={-1} disabled>
                                Выберите команду...
                              </option>
                              {AVAILABLE_COMMANDS.map((cmd, idx) => (
                                <option key={idx} value={idx}>
                                  {cmd.label || cmd.action}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <button
                            onClick={() =>
                              handleRemoveBinding(binding.id, binding.code)
                            }
                            className="p-1 rounded hover:bg-red-600/20 text-red-400 hover:text-red-300 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleAddBinding}
                className="mt-3 flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded transition-colors text-sm"
              >
                <Plus size={16} />
                Добавить привязку
              </button>
            </div>

            <div className="mt-6 p-3 bg-neutral-800/50 border border-neutral-700 rounded text-xs text-gray-400">
              <p className="font-semibold mb-1">Примечание:</p>
              <p>• Нажмите на поле клавиши, затем нажмите нужную клавишу</p>
              <p>• Выберите команду из выпадающего списка</p>
              <p>
                • Для кастомных команд выберите &ldquo;Custom Command&rdquo; и
                заполните:
              </p>
              <p className="ml-4">
                - Action: тип команды (например: ATTACK, USE)
              </p>
              <p className="ml-4">- Payload: данные в формате JSON</p>
              <p className="ml-4">
                - Требует выбор Сущности: добавит targetId в payload
              </p>
              <p className="ml-4">
                - Требует выбор Позиции: добавит x, y в payload
              </p>
              <p className="mt-2">
                • Изменения сохраняются автоматически, но можно нажать
                &ldquo;Сохранить&rdquo; для гарантии
              </p>
              <p className="mt-2 text-yellow-500">
                TODO: Добавить возможность перетащить из инвентаря сущность и
                назначить
              </p>
            </div>
          </>
        )}

        {activeTab === "windows" && (
          <>
            <h2 className="text-lg font-bold mb-4">Система окон</h2>

            {resetWindowLayout && (
              <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded mb-4">
                <h3 className="text-md font-semibold mb-2">
                  Расположение окон
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  Сбросить расположение всех окон к значениям по умолчанию
                </p>
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        "Сбросить расположение окон к значениям по умолчанию? Страница будет перезагружена.",
                      )
                    ) {
                      await resetWindowLayout();
                    }
                  }}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 border border-orange-500 rounded transition-colors text-sm font-semibold"
                >
                  Сбросить расположение окон
                </button>
              </div>
            )}

            {onOpenCasino && (
              <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded">
                <h3 className="text-md font-semibold mb-2">Gacha</h3>
                <p className="text-sm text-gray-400 mb-3">
                  Покрути баннер чтобы выбить новую собачку!
                </p>
                <button
                  onClick={onOpenCasino}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 border border-red-500 rounded transition-colors text-sm font-semibold"
                >
                  Крутить баннер!
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default KeybindingsSettings;
