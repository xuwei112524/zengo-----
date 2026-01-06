
import React, { useMemo } from 'react';
import { GameState, PlayerColor, Coordinate } from '../types';
import Stone from './Stone';
import { calculateInfluence } from '../services/goGame';

interface BoardProps {
  gameState: GameState;
  onIntersectClick: (x: number, y: number) => void;
  prevBoardState?: PlayerColor[][]; // To calculate visual delta
}

// Standard Go coordinates: Skip 'I'
const COORD_X_LABELS = "ABCDEFGHJKLMNOPQRST".split('');
const COORD_Y_LABELS = Array.from({length: 19}, (_, i) => 19 - i); // 19 down to 1

const STAR_POINTS_19 = [
  {x: 3, y: 3}, {x: 9, y: 3}, {x: 15, y: 3},
  {x: 3, y: 9}, {x: 9, y: 9}, {x: 15, y: 9},
  {x: 3, y: 15}, {x: 9, y: 15}, {x: 15, y: 15},
];

const Board: React.FC<BoardProps> = ({ gameState, onIntersectClick, prevBoardState }) => {
  const { board, boardSize, lastMove } = gameState;

  // Calculate Influence Delta for visualization
  const influenceDelta = useMemo(() => {
    if (!prevBoardState) return null;
    const currentInf = calculateInfluence(board);
    const prevInf = calculateInfluence(prevBoardState);
    const delta = Array(boardSize).fill(0).map(() => Array(boardSize).fill(0));
    
    for(let y=0; y<boardSize; y++) {
      for(let x=0; x<boardSize; x++) {
        delta[y][x] = currentInf[y][x] - prevInf[y][x];
      }
    }
    return delta;
  }, [board, prevBoardState, boardSize]);

  const renderGrid = () => {
    const cells = [];
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const isStarPoint = STAR_POINTS_19.some(p => p.x === x && p.y === y);
        const stone = board[y][x];
        const isLast = lastMove?.x === x && lastMove?.y === y;

        // Influence Visualization
        const deltaVal = influenceDelta ? influenceDelta[y][x] : 0;
        let deltaColor = '';
        if (deltaVal > 2) deltaColor = 'bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.4)]'; // Black gains
        if (deltaVal < -2) deltaColor = 'bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.4)]';   // White gains

        // Grid lines logic
        const isTop = y === 0;
        const isBottom = y === boardSize - 1;
        const isLeft = x === 0;
        const isRight = x === boardSize - 1;

        // Calculate specific classes to avoid conflicts (e.g. h-full vs h-1/2)
        
        // Vertical Line
        let vLineClass = "bg-stone-800 w-px transform -translate-x-1/2 left-1/2 z-0 opacity-90";
        if (isTop) {
           vLineClass += " top-1/2 h-1/2"; // Start center, go down
        } else if (isBottom) {
           vLineClass += " top-0 h-1/2";   // Start top, go center
        } else {
           vLineClass += " top-0 h-full";  // Full height
        }

        // Horizontal Line
        let hLineClass = "bg-stone-800 h-px transform -translate-y-1/2 top-1/2 z-0 opacity-90";
        if (isLeft) {
           hLineClass += " left-1/2 w-1/2"; // Start center, go right
        } else if (isRight) {
           hLineClass += " left-0 w-1/2";   // Start left, go center
        } else {
           hLineClass += " left-0 w-full";  // Full width
        }

        cells.push(
          <div 
            key={`${x}-${y}`} 
            className="relative w-full h-full cursor-pointer flex items-center justify-center group"
            onClick={() => onIntersectClick(x, y)}
          >
            {/* Visual Delta Overlay */}
            {deltaColor && stone === PlayerColor.Empty && (
               <div className={`absolute inset-0 m-0.5 rounded-full transition-opacity duration-1000 ${deltaColor} animate-pulse z-0`} />
            )}

            {/* Grid Lines - Centered Cross */}
            {/* Vertical Line */}
            <div className={`absolute ${vLineClass}`} />
            {/* Horizontal Line */}
            <div className={`absolute ${hLineClass}`} />
            
            {/* Star Point - Centered */}
            {isStarPoint && (
              <div className="absolute w-1.5 h-1.5 bg-stone-900 rounded-full z-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-sm" />
            )}

            {/* Hover Target / Interaction Area */}
            {stone === PlayerColor.Empty && (
               <div className="absolute w-8 h-8 rounded-full bg-stone-900/0 group-hover:bg-stone-900/10 transition-colors z-10 pointer-events-none" />
            )}

            {/* Stone */}
            <Stone color={stone} isLastMove={isLast} />
          </div>
        );
      }
    }
    return cells;
  };

  return (
    <div 
      className="relative bg-go-wood shadow-board rounded-sm select-none flex flex-col"
      style={{
        width: '100%',
        height: '100%',
        padding: '3.5%', // Slightly smaller padding for coordinates to look integrated but clear
      }}
    >
       {/* Wood Texture Overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none z-0 rounded-sm" style={{
         backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`
      }}></div>

      {/* Coordinate Labels Container */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Top Coordinates */}
        <div className="absolute top-0 left-[3.5%] right-[3.5%] h-[3.5%] flex items-center">
           {COORD_X_LABELS.map(l => (
             <div key={`t-${l}`} className="flex-1 text-center text-[10px] sm:text-xs font-serif font-bold text-stone-800/70">{l}</div>
           ))}
        </div>

        {/* Bottom Coordinates */}
        <div className="absolute bottom-0 left-[3.5%] right-[3.5%] h-[3.5%] flex items-center">
           {COORD_X_LABELS.map(l => (
             <div key={`b-${l}`} className="flex-1 text-center text-[10px] sm:text-xs font-serif font-bold text-stone-800/70">{l}</div>
           ))}
        </div>

        {/* Left Coordinates */}
        <div className="absolute left-0 top-[3.5%] bottom-[3.5%] w-[3.5%] flex flex-col justify-center">
           {COORD_Y_LABELS.map(l => (
             <div key={`l-${l}`} className="flex-1 flex items-center justify-center text-[10px] sm:text-xs font-serif font-bold text-stone-800/70">{l}</div>
           ))}
        </div>

        {/* Right Coordinates */}
        <div className="absolute right-0 top-[3.5%] bottom-[3.5%] w-[3.5%] flex flex-col justify-center">
           {COORD_Y_LABELS.map(l => (
             <div key={`r-${l}`} className="flex-1 flex items-center justify-center text-[10px] sm:text-xs font-serif font-bold text-stone-800/70">{l}</div>
           ))}
        </div>
      </div>

      {/* Inner Grid Area (The playable board) */}
      <div className="relative w-full h-full z-20">
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
            gridTemplateRows: `repeat(${boardSize}, 1fr)`,
            width: '100%',
            height: '100%'
          }}
        >
          {renderGrid()}
        </div>
      </div>
    </div>
  );
};

export default Board;
