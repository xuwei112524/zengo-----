
export enum PlayerColor {
  Black = 'B',
  White = 'W',
  Empty = '.'
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface Variation {
  move: Coordinate;
  explanation: string;
  score: number;
}

export interface MoveAnalysis {
  evaluation: '神之一手' | '好棋' | '普通' | '缓手' | '恶手' | '败着';
  score: number; // 0-100
  title: string; // A short, poetic summary (e.g., "Thick Wall", "Taking the Corner")
  detailedAnalysis: string; // The "Professional" explanation
  strategicContext: string; // Impact on influence vs territory, safety
  josekiOrProverbs?: string[]; // E.g., "Star Point Knight's Move", "Ponnuki is 30 points"
  variations: Variation[]; // Better moves
  territoryChange: number;
}

export interface AnalysisHistoryItem {
  moveNumber: number;
  player: PlayerColor;
  coordinate: Coordinate;
  analysis: MoveAnalysis;
  isLoading?: boolean;
}

export interface GameState {
  board: PlayerColor[][]; // [y][x]
  boardSize: number;
  currentPlayer: PlayerColor;
  moveHistory: Coordinate[];
  capturedBlack: number;
  capturedWhite: number;
  lastMove: Coordinate | null;
  isGameOver: boolean;
}

// AI Configuration Types
export type AIProvider = 'gemini' | 'deepseek' | 'qwen';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  modelName?: string;
}
