<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Cognitive Dungeon - Frontend

A thin client for the Cognitive Dungeon roguelike game. This client is responsible only for rendering game state received from the server and sending user commands.

## Architecture

**Thin Client Approach:**
- All game logic (movement, combat, AI, world generation) runs on the server
- Client only displays data from the server and sends commands via WebSocket
- No local game state calculations or validation

**Communication:**
- WebSocket connection to backend server (default: `ws://localhost:8080/ws`)
- Client sends: `{ type: "COMMAND", command: "text command" }`
- Server sends: `{ type: "UPDATE", world, player, entities, logs, gameState }`

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in `.env.local` (optional, for AI narrative features):
   ```
   API_KEY=your_gemini_api_key_here
   ```

3. Start the backend server first (see backend repository)

4. Run the frontend:
   ```bash
   npm run dev
   ```

## Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

## Linting and Code Style (ESLint)

Use ESLint to ensure consistent code style and catch common issues.

- Run lint:
  ```bash
  npm run lint
  ```
- Auto-fix:
  ```bash
  npm run lint:fix
  ```

**Notes:**
- ESLint is configured for React + TypeScript
- Build artifacts and vendor directories are ignored (`dist`, `node_modules`, `engine_archive_*`)
- Console statements (warn, error) are allowed for debugging

## Project Structure

```
cd-frontend-web/
├── components/          # React UI components
│   ├── GameGrid.tsx    # Game world renderer
│   ├── GameLog.tsx     # Message/event log
│   └── StatusPanel.tsx # Player stats display
├── services/           # External API services
│   └── geminiService.ts # AI narrative generation (optional)
├── constants.ts        # Game constants (colors, symbols, sizes)
├── types.ts           # TypeScript type definitions
├── App.tsx            # Main application component
└── index.tsx          # Application entry point
```

## Archive

`engine_archive_20250119/` contains the old client-side game engine that has been removed as part of the migration to server-authoritative architecture (Issue #4: Frontend Lobotomy).
