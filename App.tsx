
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Board from './components/Board';
import AnalysisPanel from './components/AnalysisPanel';
import SettingsModal from './components/SettingsModal';
import { createInitialState, playMove, calculateInfluence, estimateScore, getRandomValidMove } from './services/goGame';
import { getAIMove, analyzeMove } from './services/geminiService';
import { GameState, PlayerColor, MoveAnalysis, Coordinate, AnalysisHistoryItem, AIConfig } from './types';
import { RotateCcw, Play, Undo2, TrendingUp, Activity, Settings, Cpu, Coins } from 'lucide-react';

const BOARD_SIZE = 19; 

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(createInitialState(BOARD_SIZE));
  const [history, setHistory] = useState<GameState[]>([]); // Store history for Undo
  const [prevBoard, setPrevBoard] = useState<PlayerColor[][] | undefined>(undefined);
  
  // New: Store history of analyses
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryItem[]>([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scoreEst, setScoreEst] = useState<{leadColor: PlayerColor, diff: number} | null>(null);
  
  // Token Stats
  const [totalTokens, setTotalTokens] = useState(0);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'gemini',
    apiKey: ''
  });

  // Load saved config on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('zenGo_aiConfig');
    if (savedConfig) {
      try {
        setAiConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
  }, []);

  const handleSaveSettings = (newConfig: AIConfig) => {
    setAiConfig(newConfig);
    localStorage.setItem('zenGo_aiConfig', JSON.stringify(newConfig));
  };

  // Update score estimate whenever game state changes
  useEffect(() => {
    const est = estimateScore(gameState);
    setScoreEst(est);
  }, [gameState]);

  const handleRestart = () => {
    const fresh = createInitialState(BOARD_SIZE);
    setGameState(fresh);
    setHistory([]);
    setPrevBoard(undefined);
    setAnalysisHistory([]);
    setErrorMsg(null);
    setTotalTokens(0);
  };

  const handleUndo = () => {
    if (isAiThinking) return;
    if (history.length === 0) return;

    let stepsToUndo = 1;
    const newHistory = [...history];
    let targetState = newHistory.pop();

    // If AI just moved, undo both AI and Player
    if (targetState && targetState.currentPlayer === PlayerColor.White && newHistory.length > 0) {
       targetState = newHistory.pop();
       stepsToUndo = 2; // Logic might vary depending on exact turn sequence, but generally we pop states
    }

    if (targetState) {
      setGameState(targetState);
      setHistory(newHistory);
      setPrevBoard(newHistory.length > 0 ? newHistory[newHistory.length - 1].board : undefined);
      
      // Sync Analysis History: Remove the last N entries
      const currentMoveCount = targetState.moveHistory.length;
      setAnalysisHistory(prev => prev.filter(item => item.moveNumber <= currentMoveCount));
    }
  };

  const makeMove = async (x: number, y: number) => {
    // 1. Player Move
    const result = playMove(gameState, x, y);
    if (!result.success || !result.newState) {
      setErrorMsg(result.error || "Invalid move");
      setTimeout(() => setErrorMsg(null), 2000);
      return;
    }

    // Save history
    const currentHistory = [...history, gameState];
    setHistory(currentHistory);
    setPrevBoard(gameState.board);
    
    // Update State
    const playerMovedState = result.newState;
    setGameState(playerMovedState);
    
    // Current Move Number (1-based)
    const currentMoveNum = playerMovedState.moveHistory.length;
    const currentPlayerColor = gameState.currentPlayer; // Who JUST moved

    // 2. Trigger Analysis (Parallel)
    setIsAnalyzing(true);
    analyzeMove(playerMovedState, { x, y }, aiConfig).then(({ analysis, usage }) => {
      // Add to history
      setAnalysisHistory(prev => [
        ...prev, 
        {
          moveNumber: currentMoveNum,
          player: currentPlayerColor,
          coordinate: {x, y},
          analysis: analysis
        }
      ]);
      setTotalTokens(prev => prev + usage);
      setIsAnalyzing(false);
    });

    // 3. AI Turn
    setIsAiThinking(true);
    setErrorMsg(null);

    try {
      let aiAttempts = 0;
      let validMoveFound = false;
      const invalidCandidates: Coordinate[] = [];
      const MAX_ATTEMPTS = 3;
      
      // AI Retry Loop
      while (!validMoveFound && aiAttempts <= MAX_ATTEMPTS) {
        try {
          // getAIMove now returns { move, usage }
          const { move: aiCoords, usage } = await getAIMove(playerMovedState, invalidCandidates, aiConfig);
          
          if (usage) setTotalTokens(prev => prev + usage);

          if (aiCoords) {
            const aiResult = playMove(playerMovedState, aiCoords.x, aiCoords.y);
            
            if (aiResult.success && aiResult.newState) {
               // Success!
               const aiMoveNum = playerMovedState.moveHistory.length + 1;
               
               setHistory(prev => [...prev, playerMovedState]);
               setPrevBoard(playerMovedState.board);
               setGameState(aiResult.newState);
               validMoveFound = true;

               // Analyze AI Move as well
               setIsAnalyzing(true);
               analyzeMove(aiResult.newState, aiCoords, aiConfig).then(({ analysis: aiAnalysisResult, usage: analysisUsage }) => {
                  setAnalysisHistory(prev => [
                    ...prev, 
                    {
                      moveNumber: aiMoveNum,
                      player: PlayerColor.White,
                      coordinate: aiCoords,
                      analysis: aiAnalysisResult
                    }
                  ]);
                  setTotalTokens(prev => prev + analysisUsage);
                  setIsAnalyzing(false);
               });

            } else {
               console.warn(`AI attempted invalid move at ${aiCoords.x},${aiCoords.y}: ${aiResult.error}. Retrying...`);
               invalidCandidates.push(aiCoords);
               aiAttempts++;
            }
          } else {
             aiAttempts++;
          }
        } catch (innerError) {
           console.warn("AI generation error, retrying...", innerError);
           aiAttempts++;
        }
      }

      // FALLBACK: If AI failed all attempts, play a random valid move to keep game alive
      if (!validMoveFound) {
        console.warn("AI exceeded max attempts. Falling back to random valid move.");
        const fallbackMove = getRandomValidMove(playerMovedState);
        
        if (fallbackMove) {
            const fbResult = playMove(playerMovedState, fallbackMove.x, fallbackMove.y);
            if (fbResult.success && fbResult.newState) {
                setHistory(prev => [...prev, playerMovedState]);
                setPrevBoard(playerMovedState.board);
                setGameState(fbResult.newState);
                setErrorMsg("AI 遇到困难，已随机落子");
                setTimeout(() => setErrorMsg(null), 2000);
            }
        } else {
            setErrorMsg("无路可走 (Game Over?)");
        }
      }

    } catch (e: any) {
      console.error("AI Critical Error", e);
      setErrorMsg(`AI Error: ${e.message}`);
    } finally {
      setIsAiThinking(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#f2efe9] flex flex-col md:flex-row text-ink font-serif overflow-hidden">
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        currentConfig={aiConfig}
        onSave={handleSaveSettings}
      />

      {/* Left Column: Game Area */}
      <div className="flex-1 flex flex-col h-full relative min-w-0">
        
        {/* Compact Header */}
        <header className="w-full px-6 py-3 flex justify-between items-center shrink-0 z-10 bg-[#f2efe9] border-b border-stone-200/50">
          <div>
            <h1 className="text-xl md:text-2xl font-display text-ink font-bold tracking-widest drop-shadow-sm">ZenGo <span className="text-xs font-serif font-normal text-stone-500 ml-2">弈悟</span></h1>
          </div>
          <div className="flex space-x-2 items-center">
            
            {/* Token Usage Indicator (Small & Subtle) */}
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-stone-100/50 rounded-md border border-stone-200/50 mr-2" title="本局估算 Token 消耗">
                <Coins size={12} className="text-stone-400" />
                <span className="text-[10px] font-mono text-stone-500">{totalTokens.toLocaleString()}</span>
            </div>

            {/* Model Switcher Button */}
            <button
               onClick={() => setIsSettingsOpen(true)}
               className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 rounded-md shadow-sm border border-stone-200 text-stone-600 hover:text-ink hover:border-accent-gold transition-all text-xs mr-2"
               title="模型设置"
            >
               <Cpu size={14} />
               <span className="font-medium hidden sm:inline uppercase">{aiConfig.provider}</span>
            </button>

            <button 
              onClick={handleUndo}
              disabled={history.length === 0 || isAiThinking}
              className="px-3 py-1.5 bg-white rounded-md shadow-sm border border-stone-200 text-stone-600 hover:text-ink hover:border-accent-gold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              title="悔棋"
            >
              <Undo2 size={14} />
              <span className="font-medium">悔棋</span>
            </button>

            <button 
              onClick={handleRestart}
              className="p-1.5 bg-white rounded-md shadow-sm border border-stone-200 text-stone-600 hover:text-red-600 hover:border-red-200 transition-all"
              title="重新开始"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </header>

        {/* Board Container */}
        <div className="flex-1 flex flex-col items-center justify-center p-2 md:p-6 min-h-0 relative bg-[#f2efe9]">
          <div className="relative h-full w-full flex items-center justify-center">
            <div className="relative aspect-square h-full max-h-[calc(100vh-9rem)] shadow-2xl rounded-sm">
              <Board 
                gameState={gameState} 
                onIntersectClick={(x, y) => !isAiThinking && makeMove(x, y)}
                prevBoardState={prevBoard}
              />
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="w-full py-2 bg-white/60 backdrop-blur-md border-t border-stone-200/50 flex justify-center items-center shrink-0 gap-8 md:gap-16">
              
              {/* Black Stats */}
              <div className="flex items-center gap-3 opacity-90">
                  <div className={`w-8 h-8 rounded-full bg-black shadow-lg border-2 flex items-center justify-center transition-all ${gameState.currentPlayer === PlayerColor.Black ? 'border-accent-gold scale-110' : 'border-transparent'}`}>
                    <span className="text-[10px] text-white/50">黑</span>
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${gameState.currentPlayer === PlayerColor.Black ? 'text-ink' : 'text-stone-400'}`}>Black</span>
                    <span className="text-[10px] text-stone-500">提子: {gameState.capturedWhite}</span>
                  </div>
              </div>

              {/* Score Badge */}
              <div className="flex flex-col items-center px-4">
                 <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100/80 border border-stone-200 shadow-inner">
                    <Activity size={12} className="text-accent-gold" />
                    <span className="text-xs font-bold text-stone-600 font-mono">
                       {scoreEst?.leadColor === PlayerColor.Black ? `B+${scoreEst.diff.toFixed(1)}` : `W+${scoreEst?.diff.toFixed(1)}`}
                    </span>
                 </div>
              </div>

              {/* White Stats */}
              <div className="flex items-center gap-3 opacity-90">
                  <div className="flex flex-col items-end">
                    <span className={`text-sm font-bold ${gameState.currentPlayer === PlayerColor.White ? 'text-ink' : 'text-stone-400'}`}>White</span>
                    <span className="text-[10px] text-stone-500">提子: {gameState.capturedBlack}</span>
                  </div>
                  <div className={`w-8 h-8 rounded-full bg-white shadow-lg border-2 flex items-center justify-center transition-all ${gameState.currentPlayer === PlayerColor.White ? 'border-accent-gold scale-110' : 'border-stone-300'}`}>
                    <span className="text-[10px] text-black/50">白</span>
                  </div>
              </div>
        </div>

        {/* Error Toast */}
        {errorMsg && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-stone-800 text-white px-6 py-2 rounded-full shadow-lg text-sm animate-bounce z-50">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Right Column: Analysis Sidebar */}
      <AnalysisPanel 
        history={analysisHistory}
        isLoading={isAnalyzing} 
        currentMoveNumber={gameState.moveHistory.length}
      />

    </div>
  );
};

export default App;
