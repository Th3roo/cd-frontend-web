import React, { useEffect, useRef } from 'react';
import { LogMessage, LogType } from '../types';

interface GameLogProps {
  logs: LogMessage[];
}

const GameLog: React.FC<GameLogProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogColor = (type: LogType) => {
    switch (type) {
      case LogType.COMBAT: return 'text-red-400';
      case LogType.NARRATIVE: return 'text-purple-400 italic';
      case LogType.SPEECH: return 'text-yellow-300';
      case LogType.ERROR: return 'text-red-600 font-bold';
      case LogType.COMMAND: return 'text-cyan-600 font-bold';
      case LogType.INFO: default: return 'text-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 border-l border-neutral-800 p-4 font-mono text-sm overflow-hidden">
      <div className="mb-2 text-xs text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-1">
        Журнал Приключений
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {logs.map((log) => (
          <div key={log.id} className={`${getLogColor(log.type)} break-words leading-tight`}>
            {log.type !== LogType.COMMAND && (
                <span className="opacity-30 mr-2 text-xs select-none">
                [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}]
                </span>
            )}
            {log.type === LogType.NARRATIVE && <span className="mr-1">◈</span>}
            {log.type === LogType.COMMAND && <span className="mr-2 text-gray-600">{'>'}</span>}
            {log.type === LogType.SPEECH && <span className="mr-2">💬</span>}
            {log.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default GameLog;