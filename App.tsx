import { Focus, Navigation } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import { KeyBindingManager, DEFAULT_KEY_BINDINGS } from "./commands";
import { ContextMenu } from "./components/ContextMenu";
import GameGrid from "./components/GameGrid";
import {
  SplashNotification,
  useSplashNotifications,
} from "./components/SplashNotification";
import StatusPanel from "./components/StatusPanel";
import { WindowManagerProvider, WindowSystem } from "./components/WindowSystem";
import {
  useGameState,
  useWebSocket,
  useCamera,
  usePathfinding,
  useCommandSystem,
  useInputHandling,
} from "./hooks";
import { ContextMenuData } from "./types";

const App: React.FC = () => {
  const keyBindingManager = useMemo(() => {
    const manager = new KeyBindingManager(DEFAULT_KEY_BINDINGS);
    manager.loadFromLocalStorage();
    return manager;
  }, []);

  // Game state hook
  const {
    world,
    player,
    entities,
    logs,
    gameState,
    activeEntityId,
    speechBubbles,
    entityRegistry,
    addLog,
    handleServerMessage,
  } = useGameState();

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [reconnectAttempt] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // UI State
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);
  const [radialMenuOpen, setRadialMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevActiveEntityIdRef = useRef<string | null>(null);

  // UI Settings
  const [splashNotificationsEnabled, setSplashNotificationsEnabled] = useState(
    () => {
      const saved = localStorage.getItem("splashNotificationsEnabled");
      const value = saved !== null ? JSON.parse(saved) : true;
      return value;
    },
  );

  // Splash Notifications
  const {
    notifications: splashNotifications,
    showNotification: showSplashNotification,
    removeNotification: removeSplashNotification,
  } = useSplashNotifications();

  const handleToggleSplashNotifications = useCallback((enabled: boolean) => {
    setSplashNotificationsEnabled(enabled);
    localStorage.setItem("splashNotificationsEnabled", JSON.stringify(enabled));
  }, []);

  // WebSocket hook
  const { sendCommand: wsSendCommand, setAuthenticated } = useWebSocket({
    onMessage: handleServerMessage,
    onConnectionChange: setIsConnected,
    onAuthenticationChange: (authenticated) => {
      setIsAuthenticated(authenticated);
      setAuthenticated(authenticated);
    },
    onReconnectChange: setIsReconnecting,
    onLoginError: setLoginError,
    addLog,
  });

  // Camera hook
  const {
    zoom,
    isZooming,
    isPanning,
    followedEntityId,
    cameraOffset,
    handleWheel,
    goToPosition,
    goToEntity,
    followEntity,
    resetZoom,
    toggleFollow,
  } = useCamera({
    world,
    player,
    entityRegistry,
    containerRef,
    onPanningChange: (panning) => {
      if (panning) {
        setContextMenu(null);
      }
    },
  });

  // Command system hook
  const {
    sendCommand,
    sendTextCommand,
    handleUseItem,
    handleDropItem,
    handleLogin: commandLogin,
    handleMovePlayer,
  } = useCommandSystem({
    player,
    activeEntityId,
    entityRegistry,
    sendCommand: wsSendCommand,
    addLog,
  });

  // Pathfinding hook
  const { pathfindingTarget, currentPath, handleGoToPathfinding } =
    usePathfinding({
      player,
      world,
      activeEntityId,
      addLog,
      sendCommand,
    });

  // Input handling hook
  const {
    selectedTargetEntityId,
    selectedTargetPosition,
    handleSelectEntity,
    handleSelectPosition,
    handleContextMenu,
  } = useInputHandling({
    keyBindingManager,
    selectedTargetEntityId: null,
    selectedTargetPosition: null,
    radialMenuOpen,
    contextMenu,
    sendCommand,
    setRadialMenuOpen,
    setContextMenu,
  });

  // Handle login with authentication state update
  const handleLogin = useCallback(
    (entityId: string) => {
      setLoginError(null);
      commandLogin(entityId);
      setIsAuthenticated(true);
      setAuthenticated(true);
    },
    [commandLogin, setAuthenticated],
  );

  // Handle entity selection and navigation
  const handleGoToEntityWrapper = useCallback(
    (entityId: string) => {
      handleSelectEntity(entityId);
      const entity = entityRegistry.get(entityId);
      if (entity) {
        handleSelectPosition(entity.pos.x, entity.pos.y);
      }
      goToEntity(entityId);
    },
    [handleSelectEntity, handleSelectPosition, goToEntity, entityRegistry],
  );

  // Handle position navigation
  const handleGoToPositionWrapper = useCallback(
    (position: { x: number; y: number }) => {
      handleSelectPosition(position.x, position.y);
      goToPosition(position);
    },
    [handleSelectPosition, goToPosition],
  );

  // Close context menu when panning starts (moved to camera hook to avoid cascading renders)

  // Show "Ваш ход" notification when turn changes to player
  useEffect(() => {
    if (
      splashNotificationsEnabled &&
      activeEntityId &&
      player &&
      activeEntityId === player.id &&
      prevActiveEntityIdRef.current !== player.id
    ) {
      showSplashNotification("Ваш ход");
    }
    prevActiveEntityIdRef.current = activeEntityId;
  }, [
    activeEntityId,
    player,
    showSplashNotification,
    splashNotificationsEnabled,
  ]);

  const selectedTarget = selectedTargetEntityId
    ? entities.find((e) => e.id === selectedTargetEntityId)
    : null;

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-950 overflow-hidden text-gray-300 font-mono">
      {/* Индикатор подключения */}
      {!isConnected && !isReconnecting && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
          <span className="font-semibold">Подключение к серверу...</span>
        </div>
      )}

      {/* Индикатор переподключения */}
      {isReconnecting && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
          <span className="font-semibold">
            Переподключение... (попытка {reconnectAttempt}/10)
          </span>
        </div>
      )}

      {player && (
        <StatusPanel
          player={player}
          gameState={gameState}
          globalTick={world?.globalTick ?? 0}
          target={selectedTarget}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-black flex flex-col relative border-r border-neutral-800">
          <div
            ref={containerRef}
            className={`absolute inset-0 overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            onWheel={handleWheel}
          >
            {/* Сообщение ожидания данных */}
            {(!world || !player) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-gray-400 text-xl mb-4">
                    Ожидание данных от сервера...
                  </div>
                  <div className="text-gray-600 text-sm">
                    Подключитесь к серверу для начала игры
                  </div>
                </div>
              </div>
            )}

            {/* Индикатор зума и переключатель следования */}
            {world && player && (
              <div className="absolute top-2 right-2 flex flex-col gap-2 z-50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resetZoom();
                  }}
                  className="bg-black/80 text-white px-3 py-1 rounded text-xs font-mono border border-neutral-600 hover:border-cyan-400 hover:text-cyan-200 transition-colors"
                >
                  Zoom: {(zoom * 100).toFixed(0)}%
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFollow();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`px-3 py-1 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                    followedEntityId
                      ? "bg-cyan-600/80 text-white border-cyan-500"
                      : "bg-black/80 text-gray-400 border-neutral-600"
                  }`}
                >
                  {followedEntityId ? (
                    followedEntityId === player?.id ? (
                      <>
                        <Focus className="w-3 h-3" />
                        <span>Следовать</span>
                      </>
                    ) : (
                      <>
                        <Focus className="w-3 h-3" />
                        <span>
                          Следую за{" "}
                          {entityRegistry.get(followedEntityId)?.name ||
                            "сущностью"}
                        </span>
                      </>
                    )
                  ) : (
                    <>
                      <Navigation className="w-3 h-3" />
                      <span>Свободно</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {world && player && (
              <div
                className="absolute top-0 left-0"
                style={{
                  transform: `translate(${cameraOffset.x}px, ${cameraOffset.y}px)`,
                  transition: followedEntityId
                    ? "transform 0.3s ease-out"
                    : "none",
                }}
              >
                <GameGrid
                  world={world}
                  entities={[player, ...entities]}
                  playerPos={player.pos}
                  fovRadius={8}
                  zoom={zoom}
                  disableAnimations={isZooming}
                  followedEntityId={followedEntityId}
                  speechBubbles={speechBubbles}
                  radialMenuOpen={radialMenuOpen}
                  onMovePlayer={handleMovePlayer}
                  onSelectEntity={handleSelectEntity}
                  onSelectPosition={handleSelectPosition}
                  onFollowEntity={followEntity}
                  onSendCommand={sendCommand}
                  onGoToPathfinding={handleGoToPathfinding}
                  onContextMenu={handleContextMenu}
                  onRadialMenuChange={setRadialMenuOpen}
                  selectedTargetEntityId={selectedTargetEntityId}
                  selectedTargetPosition={selectedTargetPosition}
                  pathfindingTarget={pathfindingTarget}
                  currentPath={currentPath}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <WindowManagerProvider>
        <WindowSystem
          keyBindingManager={keyBindingManager}
          entities={player ? [player, ...entities] : entities}
          activeEntityId={activeEntityId}
          playerId={player?.id ?? null}
          onEntityClick={handleGoToEntityWrapper}
          logs={logs}
          onGoToPosition={handleGoToPositionWrapper}
          onGoToEntity={handleGoToEntityWrapper}
          onSendCommand={sendTextCommand}
          onContextMenu={handleContextMenu}
          splashNotificationsEnabled={splashNotificationsEnabled}
          onToggleSplashNotifications={handleToggleSplashNotifications}
          playerInventory={player?.inventory ?? []}
          onUseItem={handleUseItem}
          onDropItem={handleDropItem}
          onLogin={handleLogin}
          isAuthenticated={isAuthenticated}
          wsConnected={isConnected}
          loginError={loginError}
          radialMenuOpen={radialMenuOpen}
          contextMenuOpen={contextMenu !== null}
        />
      </WindowManagerProvider>

      {contextMenu && (
        <ContextMenu
          data={contextMenu}
          onClose={() => setContextMenu(null)}
          onSelectEntity={handleSelectEntity}
          onFollowEntity={followEntity}
          onSendCommand={sendCommand}
          onSelectPosition={handleSelectPosition}
          onGoToPathfinding={handleGoToPathfinding}
        />
      )}

      {/* Splash Notifications */}
      {splashNotifications.map((notification) => (
        <SplashNotification
          key={notification.id}
          notification={notification}
          onComplete={removeSplashNotification}
        />
      ))}
    </div>
  );
};

export default App;
