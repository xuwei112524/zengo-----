
import { PlayerColor, GameState, Coordinate } from '../types';

export const BOARD_SIZE = 19; 

export const createInitialState = (size: number = BOARD_SIZE): GameState => ({
  board: Array(size).fill(null).map(() => Array(size).fill(PlayerColor.Empty)),
  boardSize: size,
  currentPlayer: PlayerColor.Black,
  moveHistory: [],
  capturedBlack: 0,
  capturedWhite: 0,
  lastMove: null,
  isGameOver: false,
});

// Helper to check if a coordinate is within bounds
const isValidBound = (c: Coordinate, size: number) => {
  return c.x >= 0 && c.x < size && c.y >= 0 && c.y < size;
};

// Get neighbors (up, down, left, right)
const getNeighbors = (c: Coordinate, size: number): Coordinate[] => {
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  return dirs
    .map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
    .filter(n => isValidBound(n, size));
};

// Calculate liberties of a group
const getGroupLiberties = (
  board: PlayerColor[][], 
  start: Coordinate, 
  color: PlayerColor
): { liberties: number; group: Coordinate[] } => {
  const size = board.length;
  const visited = new Set<string>();
  const group: Coordinate[] = [];
  let liberties = 0;
  const queue = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    group.push(current);

    const neighbors = getNeighbors(current, size);
    for (const n of neighbors) {
      const cell = board[n.y][n.x];
      const key = `${n.x},${n.y}`;
      
      if (cell === PlayerColor.Empty) {
        if (!visited.has(key)) { 
           // Standard liberty logic would go here
        }
      } else if (cell === color && !visited.has(key)) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  // Re-scan group for actual unique liberties
  const uniqueLiberties = new Set<string>();
  for (const stone of group) {
    const neighbors = getNeighbors(stone, size);
    for (const n of neighbors) {
      if (board[n.y][n.x] === PlayerColor.Empty) {
        uniqueLiberties.add(`${n.x},${n.y}`);
      }
    }
  }

  return { liberties: uniqueLiberties.size, group };
};

// Check if move is valid and return new state
export const playMove = (state: GameState, x: number, y: number): { success: boolean; newState?: GameState; error?: string } => {
  if (state.isGameOver) return { success: false, error: "Game Over" };
  if (state.board[y][x] !== PlayerColor.Empty) return { success: false, error: "Spot occupied" };

  const size = state.boardSize;
  const opponent = state.currentPlayer === PlayerColor.Black ? PlayerColor.White : PlayerColor.Black;
  
  // Clone board
  const newBoard = state.board.map(row => [...row]);
  newBoard[y][x] = state.currentPlayer;

  let capturedStonesCount = 0;
  const neighbors = getNeighbors({ x, y }, size);

  // Check captures
  neighbors.forEach(n => {
    if (newBoard[n.y][n.x] === opponent) {
      const { liberties, group } = getGroupLiberties(newBoard, n, opponent);
      if (liberties === 0) {
        // Capture group
        group.forEach(stone => {
          newBoard[stone.y][stone.x] = PlayerColor.Empty;
          capturedStonesCount++;
        });
      }
    }
  });

  // Check suicide
  const { liberties: selfLiberties } = getGroupLiberties(newBoard, { x, y }, state.currentPlayer);
  if (selfLiberties === 0 && capturedStonesCount === 0) {
    return { success: false, error: "Suicide move not allowed" };
  }

  return {
    success: true,
    newState: {
      ...state,
      board: newBoard,
      currentPlayer: opponent,
      moveHistory: [...state.moveHistory, { x, y }],
      lastMove: { x, y },
      capturedBlack: state.currentPlayer === PlayerColor.White ? state.capturedBlack + capturedStonesCount : state.capturedBlack,
      capturedWhite: state.currentPlayer === PlayerColor.Black ? state.capturedWhite + capturedStonesCount : state.capturedWhite,
    }
  };
};

// Generate a random valid move for fallback
export const getRandomValidMove = (gameState: GameState): Coordinate | null => {
  const size = gameState.boardSize;
  const attempts = 50; // Try 50 times to find a random spot
  
  for (let i = 0; i < attempts; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    
    // Quick check if empty
    if (gameState.board[y][x] === PlayerColor.Empty) {
      // Full rules check
      const result = playMove(gameState, x, y);
      if (result.success) {
        return { x, y };
      }
    }
  }
  
  // If random sampling failed (board very full?), scan linearly
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
       if (gameState.board[y][x] === PlayerColor.Empty) {
          const result = playMove(gameState, x, y);
          if (result.success) return { x, y };
       }
    }
  }

  return null; // No moves left
};

// Heuristic for influence (visualizes territory potential)
export const calculateInfluence = (board: PlayerColor[][]): number[][] => {
  const size = board.length;
  const influence = Array(size).fill(0).map(() => Array(size).fill(0));
  
  // Simple decay function
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stone = board[y][x];
      if (stone !== PlayerColor.Empty) {
        const val = stone === PlayerColor.Black ? 1 : -1;
        // Radiate
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              const dist = Math.abs(dx) + Math.abs(dy);
              let impact = 0;
              if (dist === 0) impact = 6; // On the stone
              else if (dist === 1) impact = 4;
              else if (dist === 2) impact = 2;
              else if (dist === 3) impact = 1;
              
              influence[ny][nx] += val * impact;
            }
          }
        }
      }
    }
  }
  return influence;
};

// Rough score estimator based on territory influence + captures
export const estimateScore = (gameState: GameState): { leadColor: PlayerColor, diff: number } => {
  const influence = calculateInfluence(gameState.board);
  let blackPoints = 0;
  let whitePoints = 0;
  
  // Threshold to consider a territory "secure" enough to count
  const THRESHOLD = 2;

  influence.forEach(row => row.forEach(val => {
    if (val > THRESHOLD) blackPoints++;
    if (val < -THRESHOLD) whitePoints++;
  }));

  // Add prisoners (in Chinese rules roughly stones on board + territory, but simple Japanese style helps estimation)
  // Let's use a hybrid simple count: Area + Captures
  blackPoints += gameState.capturedWhite;
  whitePoints += gameState.capturedBlack;
  
  // Komi (typically 6.5 or 7.5)
  whitePoints += 7.5;

  const diff = blackPoints - whitePoints;
  
  return {
    leadColor: diff > 0 ? PlayerColor.Black : PlayerColor.White,
    diff: Math.abs(diff)
  };
};
