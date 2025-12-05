import { Position, GameWorld } from "../types";

interface PathNode {
  pos: Position;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

/**
 * Manhattan distance heuristic
 */
function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Get neighbors for a position (8-directional movement)
 */
function getNeighbors(pos: Position, world: GameWorld): Position[] {
  const neighbors: Position[] = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue; // Skip current position

      const newX = pos.x + dx;
      const newY = pos.y + dy;

      // Check bounds
      if (newX < 0 || newX >= world.width || newY < 0 || newY >= world.height) {
        continue;
      }

      // Check if tile is walkable (not a wall)
      const tile = world.map[newY]?.[newX];
      if (!tile || tile.isWall) {
        continue;
      }

      neighbors.push({ x: newX, y: newY });
    }
  }

  return neighbors;
}

/**
 * Find path using A* algorithm
 * @param start Starting position
 * @param goal Goal position
 * @param world Game world with map data
 * @returns Array of positions representing the path, or null if no path found
 */
export function findPath(
  start: Position,
  goal: Position,
  world: GameWorld
): Position[] | null {
  // Early return if start equals goal
  if (start.x === goal.x && start.y === goal.y) {
    return [];
  }

  // Check if goal is walkable
  const goalTile = world.map[goal.y]?.[goal.x];
  if (!goalTile || goalTile.isWall) {
    return null; // Goal is not walkable
  }

  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();

  // Create start node
  const startNode: PathNode = {
    pos: start,
    g: 0,
    h: heuristic(start, goal),
    f: heuristic(start, goal),
    parent: null,
  };

  openSet.push(startNode);

  const posKey = (pos: Position) => `${pos.x},${pos.y}`;

  while (openSet.length > 0) {
    // Find node with lowest f score
    let currentIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[currentIndex].f) {
        currentIndex = i;
      }
    }

    const current = openSet[currentIndex];

    // Check if we reached the goal
    if (current.pos.x === goal.x && current.pos.y === goal.y) {
      // Reconstruct path
      const path: Position[] = [];
      let node: PathNode | null = current;
      while (node !== null) {
        path.unshift(node.pos);
        node = node.parent;
      }
      // Remove the starting position from the path
      path.shift();
      return path;
    }

    // Move current from open to closed
    openSet.splice(currentIndex, 1);
    closedSet.add(posKey(current.pos));

    // Check neighbors
    const neighbors = getNeighbors(current.pos, world);

    for (const neighborPos of neighbors) {
      const key = posKey(neighborPos);

      // Skip if already evaluated
      if (closedSet.has(key)) {
        continue;
      }

      // Calculate costs
      const dx = Math.abs(neighborPos.x - current.pos.x);
      const dy = Math.abs(neighborPos.y - current.pos.y);
      const moveCost = dx + dy === 2 ? 1.414 : 1; // Diagonal vs straight
      const g = current.g + moveCost;
      const h = heuristic(neighborPos, goal);
      const f = g + h;

      // Check if neighbor is already in open set
      const existingIndex = openSet.findIndex(
        (n) => n.pos.x === neighborPos.x && n.pos.y === neighborPos.y
      );

      if (existingIndex !== -1) {
        // If this path to neighbor is better, update it
        if (g < openSet[existingIndex].g) {
          openSet[existingIndex].g = g;
          openSet[existingIndex].f = f;
          openSet[existingIndex].parent = current;
        }
      } else {
        // Add new node to open set
        openSet.push({
          pos: neighborPos,
          g,
          h,
          f,
          parent: current,
        });
      }
    }
  }

  // No path found
  return null;
}

/**
 * Convert a path into movement commands (dx, dy)
 */
export function pathToCommands(path: Position[]): Array<{ dx: number; dy: number }> {
  const commands: Array<{ dx: number; dy: number }> = [];

  for (let i = 0; i < path.length - 1; i++) {
    const current = path[i];
    const next = path[i + 1];

    commands.push({
      dx: next.x - current.x,
      dy: next.y - current.y,
    });
  }

  return commands;
}
