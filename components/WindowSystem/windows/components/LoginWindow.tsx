import { FC, useState } from "react";

interface LoginWindowProps {
  onConnect: (entityId: string) => void;
  isConnected: boolean;
  wsConnected?: boolean;
  loginError?: string | null;
}

export const LoginWindow: FC<LoginWindowProps> = ({
  onConnect,
  isConnected,
  wsConnected = false,
  loginError = null,
}) => {
  const [entityId, setEntityId] = useState("");

  const handleConnect = () => {
    const trimmedId = entityId.trim();
    console.log("[LoginWindow] handleConnect called", { entityId: trimmedId });
    if (trimmedId) {
      console.log("[LoginWindow] Calling onConnect with entityId:", trimmedId);
      onConnect(trimmedId);
    } else {
      console.log("[LoginWindow] Empty entityId, skipping connect");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      console.log("[LoginWindow] Enter key pressed", {
        isConnected,
        wsConnected,
        canConnect: !isConnected && wsConnected,
      });
      if (!isConnected && wsConnected) {
        handleConnect();
      }
    }
  };

  console.log("[LoginWindow] Rendering", {
    isConnected,
    wsConnected,
    hasLoginError: !!loginError,
    entityId: entityId.length > 0 ? `${entityId.length} chars` : "empty",
  });

  return (
    <div style={{ padding: "30px" }}>
      <div style={{ marginBottom: "30px" }}>
        <label
          htmlFor="entity-id-input"
          style={{
            display: "block",
            marginBottom: "12px",
            fontWeight: "600",
            color: "#e0e0e0",
            fontSize: "16px",
          }}
        >
          Entity ID:
        </label>
        <input
          id="entity-id-input"
          type="text"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isConnected || !wsConnected}
          placeholder={
            wsConnected ? "Enter your entity ID" : "Waiting for connection..."
          }
          style={{
            width: "100%",
            padding: "12px 16px",
            fontSize: "16px",
            border: "1px solid #444",
            borderRadius: "6px",
            backgroundColor: "#2a2a2a",
            color: "#e0e0e0",
            outline: "none",
            boxSizing: "border-box",
          }}
          autoFocus={wsConnected}
        />
      </div>

      <button
        onClick={handleConnect}
        disabled={!entityId.trim() || isConnected || !wsConnected}
        style={{
          width: "100%",
          padding: "14px 20px",
          fontSize: "16px",
          fontWeight: "600",
          color:
            isConnected || !wsConnected || !entityId.trim() ? "#888" : "#fff",
          backgroundColor:
            isConnected || !wsConnected || !entityId.trim()
              ? "#333"
              : "#4a9eff",
          border: "none",
          borderRadius: "6px",
          cursor:
            !entityId.trim() || isConnected || !wsConnected
              ? "not-allowed"
              : "pointer",
          opacity: !entityId.trim() || isConnected || !wsConnected ? 0.6 : 1,
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) => {
          if (entityId.trim() && !isConnected && wsConnected) {
            e.currentTarget.style.backgroundColor = "#3a8eef";
          }
        }}
        onMouseLeave={(e) => {
          if (!isConnected && wsConnected) {
            e.currentTarget.style.backgroundColor = "#4a9eff";
          }
        }}
      >
        {isConnected
          ? "Authenticated"
          : !wsConnected
            ? "Waiting for connection..."
            : "Login"}
      </button>

      {isConnected && (
        <div
          style={{
            marginTop: "24px",
            padding: "12px 16px",
            backgroundColor: "#1a4d2e",
            border: "1px solid #2d7a4a",
            borderRadius: "6px",
            color: "#4ade80",
            fontSize: "15px",
            fontWeight: "500",
          }}
        >
          ✓ Authenticated as {entityId}
        </div>
      )}

      {loginError && !isConnected && (
        <div
          style={{
            marginTop: "24px",
            padding: "12px 16px",
            backgroundColor: "#4d1a1a",
            border: "1px solid #7a2d2d",
            borderRadius: "6px",
            color: "#f87171",
            fontSize: "15px",
            fontWeight: "500",
          }}
        >
          ✗ {loginError}
        </div>
      )}
    </div>
  );
};
