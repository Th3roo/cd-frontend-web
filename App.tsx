

import React, { useState, useEffect, useRef } from 'react';
import { 
  GameWorld, Entity, GameState, LogMessage, LogType, EntityType, ItemType, GameAction 
} from './types';
import { SYMBOLS } from './constants';
import { GameEngine } from './engine/GameEngine';
import { parseUserIntent } from './services/geminiService';
import GameGrid from './components/GameGrid';
import GameLog from './components/GameLog';
import StatusPanel from './components/StatusPanel';

const App: React.FC = () => {
  // --- Game Engine Instance ---
  const engineRef = useRef<GameEngine>(new GameEngine());
  
  // --- React Sync State (For Rendering) ---
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [player, setPlayer] = useState<Entity | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]); 
  const [gameState, setGameState] = useState<GameState>(GameState.EXPLORATION);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  
  // UI State
  const [commandInput, setCommandInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);

  // --- Initialization ---
  useEffect(() => {
    // Initialize Engine
    const initialEvents = engineRef.current.init(0); // Start at Town
    syncState();
    processEvents(initialEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Core Sync Logic ---
  const syncState = () => {
    const engine = engineRef.current;
    setWorld({ ...engine.world! }); // Force new obj reference
    setPlayer({ ...engine.player! });
    setEntities([...engine.entities]);
    setGameState(engine.gameState);
  };

  const processEvents = (events: any[]) => {
    
    events.forEach(e => {
       addLog(e.text, e.logType);
       // Auto-set target on attack
       if (e.type === 'ATTACK' && e.data?.targetId) {
          const target = engineRef.current.entities.find(ent => ent.id === e.data.targetId);
          if (target) setTargetLabel(target.label);
       }
       // Clear target on death
       if (e.type === 'DEATH') {
          setTargetLabel(null);
       }
    });
    
    syncState();
  };

  const addLog = (text: string, type: LogType = LogType.INFO) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      text,
      type,
      timestamp: Date.now()
    }]);
  };

  // --- Action Dispatcher ---
  const handleAction = async (action: GameAction) => {
     // Local log for commands
     if (action.type !== 'LOOK' && action.type !== 'WAIT') {
         // Optional: log command echo?
     }

     const events = engineRef.current.dispatch(action);
     processEvents(events);
  };

  // --- Command Parsing ---
  const executeCommand = async (rawCmd: string, isAiParsed = false) => {
    if (gameState === GameState.GAME_OVER) return;

    const cmd = rawCmd.trim();
    if (!cmd) return;

    if (!isAiParsed) {
        addLog(cmd, LogType.COMMAND);
    }

    const parts = cmd.toLowerCase().split(' ');
    const verb = parts[0];
    const args = parts.slice(1);

    // Helper for direction parsing
    const getDir = (s: string) => {
        if (['n', 'north', 'up', 'с', 'север'].includes(s)) return { dx: 0, dy: -1 };
        if (['s', 'south', 'down', 'ю', 'юг'].includes(s)) return { dx: 0, dy: 1 };
        if (['w', 'west', 'left', 'з', 'запад'].includes(s)) return { dx: -1, dy: 0 };
        if (['e', 'east', 'right', 'в', 'восток'].includes(s)) return { dx: 1, dy: 0 };
        return null;
    };

    const dir = getDir(verb) || (args[0] ? getDir(args[0]) : null);

    // --- MAPPING COMMANDS TO ACTIONS ---
    
    if (dir && (['move', 'go', 'идти', 'n', 's', 'e', 'w', 'с', 'ю', 'в', 'з'].includes(verb) || dir)) {
        await handleAction({ type: 'MOVE', payload: dir });
        return;
    }

    switch (verb) {
        case 'attack': case 'атака': case 'удар':
            // Find target by label or closest
            let targetId: string | undefined;
            if (args.length > 0) {
                 const label = args[0].toUpperCase();
                 const t = engineRef.current.entities.find(e => e.label === label && !e.isDead);
                 if (t) targetId = t.id;
            } else {
                 // Auto-target nearest
                 const p = engineRef.current.player!;
                 const t = engineRef.current.entities.find(e => e.isHostile && !e.isDead && Math.abs(e.pos.x - p.pos.x) <= 1.5);
                 if (t) targetId = t.id;
            }
            
            if (targetId) await handleAction({ type: 'ATTACK', payload: { targetId } });
            else addLog("Кого атаковать?", LogType.ERROR);
            break;

        case 'wait': case 'ждать':
            await handleAction({ type: 'WAIT' });
            break;

        case 'get': case 'взять':
            await handleAction({ type: 'PICKUP' });
            break;

        case 'use': case 'пить':
            if (args.length > 0) await handleAction({ type: 'USE', payload: { itemName: args.join(' ') } });
            else addLog("Что использовать?", LogType.ERROR);
            break;

        case 'descend': case 'спуск': case 'вниз':
            await handleAction({ type: 'DESCEND' });
            break;

        case 'ascend': case 'наверх': case 'подняться':
            await handleAction({ type: 'ASCEND' });
            break;
        
        case 'buy': case 'купить':
            await handleAction({ type: 'BUY' });
            break;
            
        case 'heal': case 'лечение':
            await handleAction({ type: 'HEAL' });
            break;

        case 'look': case 'осмотр':
            await handleAction({ type: 'LOOK' });
            break;
        
        case 'say': case 'сказать':
        case 'talk': case 'говорить':
             const text = args.join(' ');
             if (!text) { addLog("Что сказать?", LogType.ERROR); break; }
             
             setAiLoading(true);
             
             // Async call to engine
             const socialEvents = await engineRef.current.handleSocialMove(text);
             processEvents(socialEvents);
             
             setAiLoading(false);
             break;
        
        case 'inv': case 'inventory': case 'инвентарь':
             addLog("=== Инвентарь ===", LogType.INFO);
             player?.inventory.forEach(i => addLog(`- ${i.name}`, LogType.INFO));
             if (player?.inventory.length === 0) addLog("Пусто.", LogType.INFO);
             break;
             
        case 'end': case 'конец':
            // Skip turn
            await handleAction({ type: 'WAIT' });
            break;

        default:
            if (!isAiParsed) {
                handleNaturalLanguage(rawCmd);
            } else {
                addLog(`Неизвестная команда: ${verb}`, LogType.ERROR);
            }
    }
  };

  const handleNaturalLanguage = async (input: string) => {
    setAiLoading(true);
    addLog("...", LogType.INFO);
    
    const context = engineRef.current.getContextDescription();
    const result = await parseUserIntent(input, context);
    
    setAiLoading(false);

    if (!result) {
        addLog("Непонятно.", LogType.INFO);
        return;
    }

    if (result.command) {
        addLog(`(Действие: ${result.command})`, LogType.INFO);
        await executeCommand(result.command, true);
    } else if (result.narrative) {
        addLog(result.narrative, LogType.NARRATIVE);
    }
  };

  // --- UI Helpers ---

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        executeCommand(commandInput);
        setCommandInput("");
    }
  };

  const ShortcutBtn = ({ label, cmd, color = "bg-neutral-800" }: { label: string, cmd: string, color?: string }) => (
      <button onClick={() => executeCommand(cmd)} className={`${color} hover:brightness-110 text-gray-200 text-xs py-2 px-3 rounded font-mono border border-neutral-700`}>{label}</button>
  );

  const getContextShortcuts = () => {
      if (!player) return null;
      const p = player;
      
      const nearbyEnemies = entities.filter(e => e.isHostile && !e.isDead && Math.abs(e.pos.x - p.pos.x) <= 1.5);
      const nearbyNPC = entities.find(e => e.type === EntityType.NPC && Math.abs(e.pos.x - p.pos.x) <= 1.5);
      const itemUnderfoot = entities.find(e => (e.type === EntityType.ITEM || e.type === EntityType.EXIT) && e.pos.x === p.pos.x && e.pos.y === p.pos.y);

      return (
          <div className="flex flex-wrap gap-2 mt-2">
              <ShortcutBtn label="Осмотр" cmd="осмотр" />
              <ShortcutBtn label="Ждать" cmd="ждать" />
              <ShortcutBtn label={`Рюкзак (${p.inventory.length})`} cmd="инвентарь" />
              
              {nearbyNPC && (
                  <>
                    <ShortcutBtn label={`ГОВОРИТЬ (${nearbyNPC.name})`} cmd="говорить" color="bg-blue-900 border-blue-600" />
                    {nearbyNPC.npcType === 'MERCHANT' && <ShortcutBtn label={`КУПИТЬ (50g)`} cmd="купить" color="bg-yellow-900 border-yellow-600" />}
                    {nearbyNPC.npcType === 'HEALER' && <ShortcutBtn label={`ЛЕЧЕНИЕ (20g)`} cmd="лечение" color="bg-pink-900 border-pink-600" />}
                  </>
              )}

              {itemUnderfoot && itemUnderfoot.type === EntityType.ITEM && (
                  <ShortcutBtn label="ВЗЯТЬ" cmd="взять" color="bg-cyan-900 border-cyan-600 font-bold" />
              )}
               {itemUnderfoot && itemUnderfoot.type === EntityType.EXIT && (
                  itemUnderfoot.symbol === SYMBOLS.EXIT 
                  ? <ShortcutBtn label="СПУСК" cmd="спуск" color="bg-cyan-900 border-cyan-600 font-bold" />
                  : <ShortcutBtn label="НАВЕРХ" cmd="наверх" color="bg-cyan-900 border-cyan-600 font-bold" />
              )}
              
              {p.inventory.some(i => i.type === ItemType.POTION) && (
                  <ShortcutBtn label="Пить Зелье" cmd="пить зелье" color="bg-purple-900 border-purple-600" />
              )}

              {nearbyEnemies.map(e => (
                  <ShortcutBtn key={e.id} label={`Атака ${e.label}`} cmd={`атака ${e.label}`} color="bg-red-900 border-red-700"/>
              ))}
          </div>
      );
  };

  if (!world || !player) return <div className="text-white p-10">Загрузка Engine...</div>;

  const currentTarget = targetLabel ? entities.find(e => e.label === targetLabel && !e.isDead) : null;

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-950 overflow-hidden text-gray-300 font-mono">
      <StatusPanel player={player} gameState={gameState} target={currentTarget || undefined} globalTick={world.globalTick} />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-black flex flex-col relative border-r border-neutral-800">
             <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                <GameGrid world={world} entities={[player, ...entities]} playerPos={player.pos} fovRadius={8}/>
             </div>
             <div className="absolute bottom-4 left-4 grid grid-cols-3 gap-1 opacity-50 hover:opacity-100 transition-opacity">
                <div></div><ShortcutBtn label="С" cmd="идти север" /><div></div>
                <ShortcutBtn label="З" cmd="идти запад" /><ShortcutBtn label="WAIT" cmd="ждать" /><ShortcutBtn label="В" cmd="идти восток" />
                <div></div><ShortcutBtn label="Ю" cmd="идти юг" /><div></div>
             </div>
        </div>
        <div className="w-[450px] flex flex-col bg-neutral-900">
          <div className="flex-1 overflow-hidden relative">
             <GameLog logs={logs} />
             {aiLoading && <div className="absolute bottom-2 right-2 text-xs text-cyan-500 animate-pulse bg-black px-2 py-1 rounded border border-cyan-900">... AI Думает ...</div>}
          </div>
          <div className="p-3 bg-neutral-900 border-t border-neutral-800">
              <div className="text-[10px] uppercase text-gray-500 mb-1">Контекстные Действия</div>
              {getContextShortcuts()}
          </div>
          <div className="p-3 bg-neutral-950 border-t border-neutral-800">
             <div className="flex items-center gap-2">
                 <span className="text-cyan-500 font-bold">{'>'}</span>
                 <input autoFocus type="text" value={commandInput} onChange={(e) => setCommandInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Введите команду..." className="flex-1 bg-transparent border-none outline-none text-gray-200 placeholder-gray-700"/>
             </div>
             <div className="text-[10px] text-gray-600 mt-1 flex justify-between">
                <span>{world.level === 0 ? "Город" : `Уровень ${world.level}`}</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;