
import React, { useState, useEffect, useRef } from 'react';
import { MoveAnalysis, PlayerColor, AnalysisHistoryItem } from '../types';
import {
  Brain, TrendingUp, TrendingDown, BookOpen, Compass, Target,
  History, ChevronUp, ChevronDown, CircleDot, ChevronLeft, ChevronRight
} from 'lucide-react';

interface AnalysisPanelProps {
  history: AnalysisHistoryItem[];
  isLoading: boolean;
  currentMoveNumber: number;
  selectedMoveNumber: number | null; // Controlled prop
  onMoveSelect: (moveNum: number | null) => void; // Callback
  onAnalyze?: (moveNum: number) => void; // Callback to trigger analysis
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  history,
  isLoading,
  currentMoveNumber,
  selectedMoveNumber,
  onMoveSelect,
  onAnalyze
}) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sort history by moveNumber to ensure order is correct
  const sortedHistory = React.useMemo(() => {
    return [...history].sort((a, b) => a.moveNumber - b.moveNumber);
  }, [history]);

  // Determine which analysis to display
  const selectedItem = selectedMoveNumber 
    ? sortedHistory.find(h => h.moveNumber === selectedMoveNumber) 
    : null;
    
  // If nothing selected (or not found), show latest
  const activeItem = selectedItem || (sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1] : null);

  // Auto-scroll to top when content changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeItem?.moveNumber]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (history.length === 0) return;
      
      const currentNum = activeItem ? activeItem.moveNumber : -1;
      const idx = sortedHistory.findIndex(h => h.moveNumber === currentNum);
      
      if (idx === -1) return;

      if (e.key === 'ArrowLeft') {
        if (idx > 0) {
          onMoveSelect(sortedHistory[idx - 1].moveNumber);
        }
      } else if (e.key === 'ArrowRight') {
        if (idx < sortedHistory.length - 1) {
          onMoveSelect(sortedHistory[idx + 1].moveNumber);
        } else {
           // If at the end, maybe deselect to show "current" state logic if needed, 
           // but usually sticking to last item is fine.
           onMoveSelect(sortedHistory[sortedHistory.length - 1].moveNumber);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, activeItem, sortedHistory, onMoveSelect]);

  const analysis = activeItem?.analysis;

  // Navigation Logic for Buttons
  const currentIndex = activeItem 
    ? sortedHistory.findIndex(h => h.moveNumber === activeItem.moveNumber)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < sortedHistory.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      onMoveSelect(sortedHistory[currentIndex - 1].moveNumber);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onMoveSelect(sortedHistory[currentIndex + 1].moveNumber);
    }
  };

  // Helper to format coordinates (convert 0-18 to A-T, 1-19)
  const formatCoord = (c: {x: number, y: number}) => {
    const letters = "ABCDEFGHJKLMNOPQRST";
    return `${letters[c.x]}${19 - c.y}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#fcfbf9] border-l border-stone-200/80 w-full md:w-96 lg:w-[28rem] shadow-xl z-20 shrink-0 transition-all duration-300">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-stone-200/50 bg-white/80 backdrop-blur-sm sticky top-0 z-10 flex justify-between items-center shrink-0 h-16">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-display text-ink font-bold tracking-widest flex items-center">
            <span className="text-2xl">弈悟</span> 
          </h2>
          
          <span className="h-4 w-px bg-stone-300/50"></span>

          {history.length > 0 ? (
            <div className="flex items-center bg-stone-100/50 rounded-full border border-stone-200/60 p-0.5">
              <button 
                onClick={handlePrev}
                disabled={!hasPrev}
                className={`p-1 rounded-full transition-all duration-200 ${hasPrev ? 'hover:bg-white hover:shadow-sm text-stone-600 active:scale-95' : 'text-stone-300 cursor-not-allowed'}`}
                aria-label="Previous move"
              >
                <ChevronLeft size={14} />
              </button>
              
              <span className="px-3 text-xs font-serif font-bold text-stone-600 tracking-wider min-w-[3.5rem] text-center select-none">
                 {activeItem ? `第 ${activeItem.moveNumber} 手` : ""}
              </span>

              <button 
                onClick={handleNext}
                disabled={!hasNext}
                className={`p-1 rounded-full transition-all duration-200 ${hasNext ? 'hover:bg-white hover:shadow-sm text-stone-600 active:scale-95' : 'text-stone-300 cursor-not-allowed'}`}
                aria-label="Next move"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : (
             <span className="text-xs font-serif font-normal text-stone-500 tracking-wider">
               AI 深度复盘
             </span>
          )}
        </div>

        {isLoading && (
           <div className="flex items-center gap-2 px-2 py-1 bg-stone-100 rounded-full">
             <div className="w-3 h-3 rounded-full border-2 border-stone-300 border-t-accent-gold animate-spin"></div>
             <span className="text-[10px] text-stone-500 font-serif hidden sm:inline">思考中</span>
           </div>
        )}
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative" ref={scrollRef}>
        
        {/* Empty State */}
        {!activeItem && !isLoading && (
           <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-4 opacity-60 p-8 text-center">
             <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-2">
                <Target className="w-8 h-8 text-stone-300" />
             </div>
             <p className="text-sm font-serif">请落子，AI 导师将为您解析每一步的玄机。</p>
           </div>
        )}

        {/* Analysis Content */}
        {activeItem && activeItem.isLoading ? (
           <div className="flex flex-col items-center justify-center h-full pb-20 space-y-6 animate-in fade-in duration-500">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-stone-100 border-t-accent-gold animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <Brain className="w-6 h-6 text-stone-300 animate-pulse" />
                </div>
              </div>
              <div className="text-center space-y-2">
                 <p className="text-sm font-serif text-stone-600 font-medium tracking-wide">AI 正在深度推演局势...</p>
                 <p className="text-xs text-stone-400">分析第 {activeItem.moveNumber} 手的变化</p>
              </div>
           </div>
        ) : analysis && activeItem && analysis.title === '分析失败' ? (
           // Analysis failed - show retry button
           <div className="flex flex-col items-center justify-center h-full pb-20 space-y-6 animate-in fade-in duration-500">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <Brain className="w-8 h-8 text-red-300" />
              </div>
              <div className="text-center space-y-3 px-8">
                 <p className="text-sm font-serif text-stone-600 font-medium tracking-wide">{analysis.detailedAnalysis}</p>
                 <button
                   onClick={() => onAnalyze && onAnalyze(activeItem.moveNumber)}
                   disabled={isLoading}
                   className="px-6 py-2 bg-stone-800 text-white text-xs font-bold rounded-full shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                 >
                   重试分析
                 </button>
              </div>
           </div>
        ) : (analysis && activeItem && (
          <div className="animate-fade-in pb-10">
            
            {/* 1. Evaluation Hero Section */}
            <div className="p-6 pb-2 bg-gradient-to-b from-white to-[#fcfbf9]">
              <div className="flex items-end justify-between mb-2">
                <span className="text-xs font-bold text-stone-400 tracking-[0.2em] uppercase">
                   {activeItem.player === PlayerColor.Black ? "Black Move" : "White Move"} • {formatCoord(activeItem.coordinate)}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${analysis.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  <span className="text-sm font-mono font-bold text-stone-600">{analysis.score}/100</span>
                </div>
              </div>
              
              <h3 className={`text-4xl font-display font-bold mb-1 ${
                  analysis.evaluation === '神之一手' || analysis.evaluation === '好棋' ? 'text-emerald-800' :
                  analysis.evaluation === '败着' || analysis.evaluation === '恶手' ? 'text-red-800' :
                  'text-stone-800'
                }`}>
                {analysis.evaluation}
              </h3>
              <p className="text-lg text-accent-gold font-serif font-bold tracking-wide italic mb-4">
                "{analysis.title}"
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                 <div className="bg-white p-3 rounded border border-stone-100 shadow-sm flex items-center gap-3">
                    {analysis.territoryChange >= 0 ? 
                      <TrendingUp className="w-5 h-5 text-emerald-600" /> : 
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    }
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase">目数损益</p>
                      <p className="text-sm font-semibold text-ink">
                        {analysis.territoryChange > 0 ? `+${analysis.territoryChange} 目` : `${analysis.territoryChange} 目`}
                      </p>
                    </div>
                 </div>
                 {/* Visual indicator bar */}
                 <div className="flex items-center gap-1">
                    <div className="h-1.5 flex-1 bg-stone-200 rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-stone-800 transition-all duration-700 ease-out"
                         style={{ width: `${analysis.score}%` }}
                       />
                    </div>
                 </div>
              </div>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-stone-200 to-transparent my-2"></div>

            {/* 2. Detailed Reasoning */}
            <div className="px-6 py-4">
               <div className="flex items-center gap-2 mb-3">
                 <BookOpen className="w-4 h-4 text-stone-400" />
                 <span className="text-xs font-bold uppercase tracking-wider text-stone-500">局势解析</span>
               </div>
               <p className="text-[15px] text-stone-700 leading-7 text-justify font-serif border-l-2 border-accent-gold pl-4 bg-stone-50/50 py-2 rounded-r-lg">
                 {analysis.detailedAnalysis}
               </p>
            </div>

            {/* 3. Strategic Context & Joseki */}
            <div className="px-6 py-4 space-y-4">
               {/* Strategy */}
               <div>
                 <div className="flex items-center gap-2 mb-2">
                    <Compass className="w-4 h-4 text-stone-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500">战略研判</span>
                 </div>
                 <p className="text-sm text-stone-600 leading-relaxed font-serif">
                   {analysis.strategicContext}
                 </p>
               </div>

               {/* Tags: Joseki / Proverbs */}
               {analysis.josekiOrProverbs && analysis.josekiOrProverbs.length > 0 && (
                 <div className="flex flex-wrap gap-2 mt-3">
                    {analysis.josekiOrProverbs.map((tag, idx) => (
                      <span key={idx} className="px-3 py-1 bg-stone-100 text-stone-600 text-xs border border-stone-200 rounded-full font-serif">
                        {tag}
                      </span>
                    ))}
                 </div>
               )}
            </div>

            {/* 4. Variations / Recommendations */}
            {analysis.variations && analysis.variations.length > 0 && (
              <div className="px-6 py-4">
                 <div className="flex items-center gap-2 mb-4">
                    <Target className="w-4 h-4 text-stone-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500">推荐选点</span>
                 </div>
                 
                 <div className="space-y-3">
                   {analysis.variations.map((v, i) => (
                     <div key={i} className="group bg-white p-3 rounded-lg border border-stone-100 shadow-sm hover:shadow-md hover:border-accent-gold/30 transition-all cursor-default">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-accent-gold">推荐 {i+1}</span>
                          <span className="text-xs font-mono text-stone-400">({formatCoord(v.move)})</span>
                        </div>
                        <p className="text-sm text-stone-700 mb-2 font-medium">{v.explanation}</p>
                        <div className="flex items-center gap-2">
                           <div className="flex-1 h-1 bg-stone-100 rounded-full">
                              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${v.score}%` }}></div>
                           </div>
                           <span className="text-[10px] text-emerald-600 font-bold">{v.score}分</span>
                        </div>
                     </div>
                   ))}
                 </div>
              </div>
            )}

          </div>
        ))}
      </div>

      {/* History Footer (Collapsible) */}
      <div className={`border-t border-stone-200 bg-white transition-all duration-300 ease-in-out flex flex-col ${isHistoryOpen ? 'h-64' : 'h-12'}`}>
         
         {/* Toggle Bar */}
         <button 
           onClick={() => setIsHistoryOpen(!isHistoryOpen)}
           className="h-12 w-full px-6 flex items-center justify-between hover:bg-stone-50 transition-colors shrink-0"
         >
           <div className="flex items-center gap-2 text-stone-600">
             <History size={16} />
             <span className="text-xs font-bold uppercase tracking-wider">历史记录 ({history.length})</span>
           </div>
           {isHistoryOpen ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronUp size={16} className="text-stone-400" />}
         </button>

         {/* List */}
         {isHistoryOpen && (
           <div className="flex-1 overflow-y-auto bg-stone-50/50 p-2 space-y-1 custom-scrollbar">
             {[...sortedHistory].reverse().map((item) => {
               const isFailed = item.analysis.title === '分析失败';
               return (
               <div
                 key={item.moveNumber}
                 onClick={() => onMoveSelect(item.moveNumber)}
                 className={`
                    flex items-center justify-between p-3 rounded-md cursor-pointer border transition-all
                    ${selectedMoveNumber === item.moveNumber || (!selectedMoveNumber && item === sortedHistory[sortedHistory.length-1])
                      ? 'bg-white border-accent-gold shadow-sm'
                      : isFailed
                        ? 'bg-red-50/50 border-red-200 hover:bg-red-100'
                        : 'bg-transparent border-transparent hover:bg-white hover:border-stone-200'}
                 `}
               >
                  <div className="flex items-center gap-3">
                     <div className={`
                       w-5 h-5 rounded-full flex items-center justify-center shadow-sm border
                       ${item.player === PlayerColor.Black ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-300'}
                     `}>
                        <span className={`text-[9px] font-mono ${item.player === PlayerColor.Black ? 'text-white' : 'text-black'}`}>
                          {item.moveNumber}
                        </span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-xs font-bold text-stone-700">{formatCoord(item.coordinate)}</span>
                        <span className="text-[10px] text-stone-400 font-serif truncate w-24">
                          {item.isLoading ? "分析中..." : isFailed ? "分析失败" : item.analysis.title}
                        </span>
                     </div>
                  </div>

                  <div className="text-right">
                     {item.isLoading ? (
                       <div className="w-4 h-4 rounded-full border border-stone-300 border-t-accent-gold animate-spin" />
                     ) : isFailed ? (
                       <Brain size={12} className="text-red-400" />
                     ) : (
                       <span className={`
                         text-xs font-bold px-1.5 py-0.5 rounded
                         ${item.analysis.evaluation.includes('好') || item.analysis.evaluation.includes('神') ? 'text-emerald-700 bg-emerald-50' :
                           item.analysis.evaluation.includes('败') || item.analysis.evaluation.includes('恶') ? 'text-red-700 bg-red-50' : 'text-stone-600 bg-stone-100'}
                       `}>
                         {item.analysis.evaluation}
                       </span>
                     )}
                  </div>
               </div>
             )})}
             {history.length === 0 && (
               <div className="text-center py-8 text-stone-400 text-xs font-serif italic">暂无落子记录</div>
             )}
           </div>
         )}
      </div>
    </div>
  );
};

export default AnalysisPanel;
