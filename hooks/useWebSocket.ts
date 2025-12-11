import { useRef, useEffect, useCallback } from "react";

import {
  ClientToServerCommand,
  serializeClientCommand,
  LogType,
} from "../types";

interface UseWebSocketProps {
  onMessage: (data: any) => void;
  onConnectionChange: (isConnected: boolean) => void;
  onAuthenticationChange: (isAuthenticated: boolean) => void;
  onReconnectChange: (isReconnecting: boolean, attempt: number) => void;
  onLoginError: (error: string | null) => void;
  addLog: (text: string, type: LogType) => void;
}

export const useWebSocket = ({
  onMessage,
  onConnectionChange,
  onAuthenticationChange,
  onReconnectChange,
  onLoginError,
  addLog,
}: UseWebSocketProps) => {
  const socketRef = useRef<WebSocket | null>(null);
  const isAuthenticatedRef = useRef(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);

  // Store callbacks in refs to avoid useEffect re-running
  const onMessageRef = useRef(onMessage);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onAuthenticationChangeRef = useRef(onAuthenticationChange);
  const onReconnectChangeRef = useRef(onReconnectChange);
  const onLoginErrorRef = useRef(onLoginError);
  const addLogRef = useRef(addLog);

  // Keep refs up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  useEffect(() => {
    onAuthenticationChangeRef.current = onAuthenticationChange;
  }, [onAuthenticationChange]);

  useEffect(() => {
    onReconnectChangeRef.current = onReconnectChange;
  }, [onReconnectChange]);

  useEffect(() => {
    onLoginErrorRef.current = onLoginError;
  }, [onLoginError]);

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // Single useEffect for connection management - runs only once on mount
  useEffect(() => {
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 3000;
    let isMounted = true;

    const connect = () => {
      // Prevent multiple simultaneous connection attempts
      if (isConnectingRef.current) {
        return;
      }

      // Prevent connecting if already connected
      if (
        socketRef.current?.readyState === WebSocket.CONNECTING ||
        socketRef.current?.readyState === WebSocket.OPEN
      ) {
        return;
      }

      isConnectingRef.current = true;

      // Clean up any existing socket
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          // Ignore close errors
        }
        socketRef.current = null;
      }

      // Определяем URL для WebSocket с учётом окружения
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      let wsUrl: string;

      // В dev режиме (Vite dev server на :3000) используем прокси
      // В production или при прямом подключении - используем backend порт
      const isDev = window.location.port === "3000";

      if (isDev) {
        // Development: используем Vite proxy
        wsUrl = `${protocol}//${window.location.host}/ws`;
      } else {
        // Production: подключаемся напрямую к backend (порт 8080)
        const backendHost = window.location.hostname;
        const backendPort = "8080";
        wsUrl = `${protocol}//${backendHost}:${backendPort}/ws`;
      }

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;

        if (!isMounted) {
          ws.close();
          return;
        }

        onConnectionChangeRef.current(true);
        onReconnectChangeRef.current(false, 0);
        onLoginErrorRef.current(null);
        reconnectAttemptsRef.current = 0;
        addLogRef.current("Connected to server", LogType.INFO);
      };

      ws.onmessage = (evt) => {
        if (!isMounted) {
          return;
        }

        try {
          const msg = JSON.parse(evt.data);

          // Handle error responses from server
          if (msg?.error) {
            addLogRef.current(`Server error: ${msg.error}`, LogType.ERROR);
            // If error during login (like "Entity not found"), reset authentication
            if (
              msg.error.includes("Entity not found") ||
              msg.error.includes("not found")
            ) {
              onAuthenticationChangeRef.current(false);
              isAuthenticatedRef.current = false;
              onLoginErrorRef.current(msg.error);
            }
          }

          // Pass message to handler
          onMessageRef.current(msg);
        } catch (error) {
          console.error("WebSocket parse error:", error);
          addLogRef.current(`WS parse error: ${error}`, LogType.ERROR);
        }
      };

      ws.onerror = () => {
        isConnectingRef.current = false;
        // Error details are not available in browser WebSocket API
        // The actual error will come through onclose
      };

      ws.onclose = (event) => {
        isConnectingRef.current = false;
        socketRef.current = null;

        if (!isMounted) {
          return;
        }

        const wasAuthenticated = isAuthenticatedRef.current;
        onConnectionChangeRef.current(false);
        onAuthenticationChangeRef.current(false);
        isAuthenticatedRef.current = false;

        addLogRef.current(
          `Disconnected from server (${event.code})`,
          LogType.INFO,
        );

        // If we weren't authenticated yet, try to reconnect
        if (
          !wasAuthenticated &&
          reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
        ) {
          reconnectAttemptsRef.current++;
          onReconnectChangeRef.current(true, reconnectAttemptsRef.current);
          addLogRef.current(
            `Reconnecting... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
            LogType.INFO,
          );
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (isMounted) {
              connect();
            }
          }, RECONNECT_DELAY);
        } else if (!wasAuthenticated) {
          console.error(
            `[useWebSocket] Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
          );
          onReconnectChangeRef.current(false, 0);
          addLogRef.current(
            `Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
            LogType.ERROR,
          );
        }
      };
    };

    connect();

    return () => {
      isMounted = false;

      // Clean up reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Close WebSocket connection
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          // Ignore close errors
        }
        socketRef.current = null;
      }

      isConnectingRef.current = false;
    };
  }, []); // Empty dependency array - run only once on mount

  const sendCommand = useCallback((command: ClientToServerCommand) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      addLogRef.current("Not connected to server", LogType.ERROR);
      return false;
    }

    const serialized = serializeClientCommand(command);
    socketRef.current.send(serialized);
    return true;
  }, []);

  const isConnected = useCallback(() => {
    return socketRef.current?.readyState === WebSocket.OPEN;
  }, []);

  const setAuthenticated = useCallback((value: boolean) => {
    isAuthenticatedRef.current = value;
  }, []);

  return {
    sendCommand,
    isConnected,
    setAuthenticated,
  };
};
