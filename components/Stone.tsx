import React from 'react';
import { PlayerColor } from '../types';

interface StoneProps {
  color: PlayerColor;
  isLastMove?: boolean;
}

const Stone: React.FC<StoneProps> = ({ color, isLastMove }) => {
  if (color === PlayerColor.Empty) return null;

  const baseClasses = "w-[90%] h-[90%] rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300";
  
  // Realistic CSS shadows/gradients for stones
  const blackStoneStyle = {
    background: 'radial-gradient(circle at 30% 30%, #555, #111 80%)',
    boxShadow: '2px 3px 4px rgba(0,0,0,0.4)'
  };

  const whiteStoneStyle = {
    background: 'radial-gradient(circle at 30% 30%, #fff, #ddd 80%)',
    boxShadow: '2px 3px 4px rgba(0,0,0,0.3)'
  };

  return (
    <div 
      className={baseClasses} 
      style={color === PlayerColor.Black ? blackStoneStyle : whiteStoneStyle}
    >
      {isLastMove && (
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 ${color === PlayerColor.Black ? 'border-white/50' : 'border-black/50'}`} />
      )}
    </div>
  );
};

export default Stone;
