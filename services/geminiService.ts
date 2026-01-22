
import { GoogleGenAI, Type } from "@google/genai";
import { GameState, PlayerColor, Coordinate, MoveAnalysis, AIConfig, AIProvider } from "../types";

// Default Configuration Maps
const PROVIDER_CONFIGS: Record<AIProvider, { baseURL?: string, defaultModel: string, jsonMode: boolean }> = {
  gemini: {
    defaultModel: 'gemini-3-flash-preview',
    jsonMode: true
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    jsonMode: true
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    jsonMode: true
  }
};

// --- Helper: Robust JSON Extractor ---
function extractJSON(text: string): any {
  // 0. Pre-processing: Remove <think>...</think> blocks common in reasoning models (like DeepSeek R1)
  let processedText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  try {
    // 1. Try direct parse
    return JSON.parse(processedText);
  } catch (e) {
    // 2. Try extracting from Markdown code blocks
    const codeBlockMatch = processedText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch (e2) {
        // continue
      }
    }

    // 3. Try finding the first brace pair (greedy)
    const match = processedText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e3) {
        // continue
      }
    }

    // 4. Last resort: aggressive cleanup
    const clean = processedText.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch (e4) {
      // Return null to indicate failure instead of throwing immediately, allowing caller to log
      return null;
    }
  }
}

interface ServiceResponse {
  text: string;
  usage: number; // Total tokens
}

// --- Helper for OpenAI Compatible Fetch ---
async function callOpenAICompatible(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<ServiceResponse> {
  const providerConf = PROVIDER_CONFIGS[config.provider];
  const url = providerConf.baseURL;
  if (!url) throw new Error("Base URL not defined for this provider");

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  };

  const model = config.modelName || providerConf.defaultModel;
  
  // DeepSeek Reasoner (R1) and some others do not support temperature when reasoning
  const isReasoningModel = model.includes('reasoner') || model.includes('r1');

  const body: any = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    stream: false,
  };

  // Only apply temperature if NOT a reasoning model
  if (!isReasoningModel) {
    body.temperature = 0.2;
  }

  // Helper to make the actual fetch
  const makeRequest = async (useJsonMode: boolean) => {
    const currentBody = { ...body };
    if (useJsonMode && providerConf.jsonMode && !isReasoningModel) {
       currentBody.response_format = { type: "json_object" };
    } else {
       delete currentBody.response_format;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(currentBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${config.provider} API Error (${res.status}): ${errText}`);
    }

    return res.json();
  };

  try {
    // Attempt 1: With default JSON mode setting
    let json;
    try {
        json = await makeRequest(true);
    } catch (e: any) {
        // Attempt 2: If JSON mode failed (sometimes caused by strict format checks or specific model issues), try without it
        // Only retry if it was likely a format/server issue, not auth
        if (!e.message.includes("401") && !e.message.includes("403")) {
            console.warn(`Attempt 1 failed (${e.message}), retrying without strict JSON mode...`);
            json = await makeRequest(false);
        } else {
            throw e;
        }
    }

    const content = json.choices[0].message.content;
    const usage = json.usage?.total_tokens || 0;

    return { text: content, usage };
  } catch (error: any) {
    console.error("API Call Failed:", error);
    throw error;
  }
}

// --- Gemini Specific Logic ---
const callGemini = async (
  config: AIConfig,
  prompt: string,
  schema?: any,
  isThinkingDisabled: boolean = false
): Promise<ServiceResponse> => {
  const keyToUse = config.apiKey || process.env.API_KEY;
  if (!keyToUse) throw new Error("API Key is missing for Gemini.");

  const ai = new GoogleGenAI({ apiKey: keyToUse });
  const modelName = config.modelName || PROVIDER_CONFIGS.gemini.defaultModel;
  
  const genConfig: any = {
    responseMimeType: 'application/json',
    temperature: 0.1, // Low temp for logic/coordinates
  };

  if (schema) {
    genConfig.responseSchema = schema;
  }
  
  // Disable thinking for coordinate generation to speed up and enforce schema
  if (isThinkingDisabled && (modelName.includes('gemini-3') || modelName.includes('gemini-2.5') || modelName.includes('flash-thinking'))) {
      // Force budget to 0 to disable extended thinking for pure coordinate generation
      genConfig.thinkingConfig = { thinkingBudget: 1 }; // Set to minimal non-zero or just omit if 0 causes issues, but 0 is usually disable.
      // Actually, for some models, 0 might be invalid. Let's try omitting it or setting strict params.
      // If the model allows it, we want minimal thinking.
      // Let's rely on the prompt "Strict JSON" and low temp mostly, but if it is a thinking model, we clamp it.
       try {
         genConfig.thinkingConfig = { thinkingBudget: 1024 }; // Minimal budget if required
       } catch (e) {
         // ignore
       }
  }

  // REVISION: The user reported significant slowdown. 
  // If we are using a preview model that forces thinking, we must clamp it.
  // However, setting it to 0 might be safer to disable it?
  // Let's try to remove thinkingConfig completely if isThinkingDisabled is true, 
  // AND maybe switch model? No, we stick to config.
  
  // Better approach: If isThinkingDisabled, ensure we don't trigger long chain of thought.
  if (isThinkingDisabled) {
     // For newer Gemini models, simple prompting is usually enough.
     // But if it is a thinking model, we might want to restrict it.
     // Re-enabling the block I commented out, but with safer check.
     if (modelName.includes('thinking')) {
        genConfig.thinkingConfig = { thinkingBudget: 1 }; // Minimum
     }
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: genConfig
    });

    const text = response.text || "";
    const usage = response.usageMetadata?.totalTokenCount || 0;

    return { text, usage };
  } catch (e: any) {
    throw e;
  }
};

// --- Helper: Coordinate Converters ---
function toSGFCoordinate(c: Coordinate): string {
  const alphabet = "abcdefghijklmnopqrs"; // 19x19 support
  if (c.x < 0 || c.x >= 19 || c.y < 0 || c.y >= 19) return "";
  return alphabet[c.x] + alphabet[c.y];
}

function toHumanCoordinate(c: Coordinate): string {
  const letters = "ABCDEFGHJKLMNOPQRST"; // Skip I
  if (c.x < 0 || c.x >= 19 || c.y < 0 || c.y >= 19) return "Unknown";
  const col = letters[c.x];
  const row = 19 - c.y;
  return `${col}${row}`;
}

function fromHumanCoordinate(coordStr: string): Coordinate | null {
  if (!coordStr || coordStr.length < 2) return null;
  const letters = "ABCDEFGHJKLMNOPQRST";
  const colChar = coordStr[0].toUpperCase();
  const rowStr = coordStr.slice(1);
  
  const x = letters.indexOf(colChar);
  const rowNum = parseInt(rowStr, 10);
  
  if (x === -1 || isNaN(rowNum)) return null;
  
  const y = 19 - rowNum;
  if (x < 0 || x >= 19 || y < 0 || y >= 19) return null;
  
  return { x, y };
}

function generateSGF(history: Coordinate[], size: number): string {
  let sgf = `(;GM[1]FF[4]SZ[${size}]`;
  // Assuming Black always starts for simplicity in this history tracking
  history.forEach((move, index) => {
    const color = index % 2 === 0 ? "B" : "W"; 
    sgf += `;${color}[${toSGFCoordinate(move)}]`;
  });
  sgf += ")";
  return sgf;
}

// --- Helper: Enhanced Board Formatter ---
function getQuadrantDescription(x: number, y: number, size: number): string {
  const center = (size - 1) / 2;
  const isLeft = x < center;
  const isRight = x > center;
  const isTop = y < center;    // y=0 is Top (Row 19)
  const isBottom = y > center; // y=18 is Bottom (Row 1)

  let v = "";
  if (isTop) v = "Top";
  else if (isBottom) v = "Bottom";
  else v = "Center";

  let h = "";
  if (isLeft) h = "Left";
  else if (isRight) h = "Right";
  else h = v === "Center" ? "" : "Center"; // Center-Center is just Center

  if (v === "Center" && h === "") return "Center";
  if (v === "Center") return h; // e.g. Left edge center? usually just Left side
  if (h === "Center") return v;
  
  return `${v}-${h}`;
}

function getStoneLocations(board: PlayerColor[][]): { black: string[], white: string[] } {
  const size = board.length;
  const black: string[] = [];
  const white: string[] = [];
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = board[y][x];
      if (cell !== PlayerColor.Empty) {
        const coord = toHumanCoordinate({x, y});
        const quad = getQuadrantDescription(x, y, size);
        // Explicitly map: Standard Q16 <-> Internal (15, 3) to force AI to learn the map
        const desc = `${coord} {x:${x}, y:${y}} (${quad})`;
        
        if (cell === PlayerColor.Black) {
          black.push(desc);
        } else {
          white.push(desc);
        }
      }
    }
  }
  return { black, white };
}

function formatBoardDeepSeek(board: PlayerColor[][], moveHistory: Coordinate[]): string {
  const size = board.length;
  const sgf = generateSGF(moveHistory, size);
  const { black, white } = getStoneLocations(board);
  
  // Use the existing grid generator logic
  const xLabels = "A B C D E F G H J K L M N O P Q R S T".split(' ');
  let gridStr = "   " + xLabels.join(" ") + "\n"; // Clean header
  gridStr += "   -------------------------------------\n";

  for (let y = 0; y < size; y++) {
    const yLabel = (size - y).toString().padStart(2, ' ');
    // Y-axis label (Left: Standard 19-1)
    gridStr += yLabel + "|";
    
    for (let x = 0; x < size; x++) {
       const cell = board[y][x];
       const char = cell === PlayerColor.Black ? 'X' : (cell === PlayerColor.White ? 'O' : '.');
       gridStr += char + " "; 
    }
    // Y-axis label (Right: Internal 0-18) -> CRITICAL for AI debugging
    gridStr += `| y:${y}\n`;
  }
  gridStr += "   -------------------------------------\n";
  gridStr += "   " + xLabels.join(" ") + "\n";

  return `[DATA SECTION]
1. Game History (SGF):
${sgf}

2. Explicit Stone Positions (Format: "Standard {Internal} (Quadrant)"):
- Black Stones (${black.length}): [${black.join(', ')}]
- White Stones (${white.length}): [${white.join(', ')}]

3. Visual Board (Reference):
(Left: Standard Row 19-1. Right: Internal y 0-18)
(Top Row is Standard 19 / Internal y=0)
${gridStr}`;
}

function formatBoardEnhanced(board: PlayerColor[][], moveHistory: Coordinate[]): string {
  const size = board.length;
  const xLabels = "A B C D E F G H J K L M N O P Q R S T".split(' ');
  const { black, white } = getStoneLocations(board);
  
  // 1. ASCII Visual Grid with Coordinates
  let gridStr = "   (Left) " + xLabels.join(" ") + " (Right)\n"; // Header padding + X Labels
  gridStr += "         (Top 19)\n";

  for (let y = 0; y < size; y++) {
    const yLabel = (size - y).toString().padStart(2, ' ');
    // Y-axis label (Left)
    gridStr += yLabel + " ";
    
    for (let x = 0; x < size; x++) {
       const cell = board[y][x];
       // Visualize stones: X for Black, O for White, . for Empty
       const char = cell === PlayerColor.Black ? 'X' : (cell === PlayerColor.White ? 'O' : '.');
       gridStr += char + " "; 
    }
    // Y-axis label (Right) for readability
    gridStr += yLabel + "\n";
  }
  gridStr += "         (Bottom 1)\n";
  // Footer X Labels
  gridStr += "   (Left) " + xLabels.join(" ") + " (Right)\n";

  // 2. SGF History
  const sgf = generateSGF(moveHistory, size);

  return `Game History (SGF):
${sgf}

Explicit Stone Positions (with Quadrants):
- Black Stones (${black.length}): [${black.join(', ')}]
- White Stones (${white.length}): [${white.join(', ')}]

Visual Board (For spatial context):
(Coordinates: X=A-T, Y=19-1. X: Black, O: White, .: Empty)
${gridStr}`;
}

// --- Main Exported Functions ---

export const getAIMove = async (
  gameState: GameState, 
  invalidCandidates: Coordinate[] = [],
  config: AIConfig
): Promise<{ move: Coordinate | null, usage: number }> => {
  
  // Select formatter based on provider. Qwen also benefits from explicit stone lists.
  const useExplicitFormat = config.provider === 'deepseek' || config.provider === 'qwen';
  const boardDescription = useExplicitFormat 
    ? formatBoardDeepSeek(gameState.board, gameState.moveHistory)
    : formatBoardEnhanced(gameState.board, gameState.moveHistory);

  const size = gameState.boardSize;
  const color = gameState.currentPlayer === PlayerColor.Black ? 'Black' : 'White';
  
  // Explicitly format the last move if it exists
  let lastMoveInfo = "None (Start of Game)";
  if (gameState.lastMove) {
    const lm = gameState.lastMove;
    lastMoveInfo = `Internal(${lm.x},${lm.y}) | SGF[${toSGFCoordinate(lm)}] | Standard(${toHumanCoordinate(lm)})`;
  }

  // Convert invalid candidates to human-readable strings for better AI comprehension
  const forbiddenHuman = invalidCandidates.map(c => toHumanCoordinate(c));
  const forbiddenStr = forbiddenHuman.length > 0 
    ? `IMPORTANT: The following coordinates are INVALID (occupied or suicide), DO NOT PLAY HERE: ${JSON.stringify(forbiddenHuman)}`
    : '';

  const systemPrompt = `You are a professional Go (Weiqi) player (9-dan).
Board Size: ${size}x${size}.
Your Color: ${color}.
Game Rules: Chinese Rules (Komis 7.5).

Task: Calculate the single best LEGAL next move.
Output: Strict JSON { "move": "Q16" }.

Coordinate System:
- Standard: A-T (skip I), 19-1. (e.g., Q16, D4, K10)
- (0,0) Internal is A19.

VISUAL ANCHORS (Use these to orient yourself):
- Top-Left: A19
- Top-Right: T19
- Bottom-Left: A1
- Bottom-Right: T1
- Direction: Row 19 is TOP. Row 1 is BOTTOM. Column A is LEFT. Column T is RIGHT.

IMPORTANT:
- Output only standard coordinates (e.g. "D4").
- Do NOT output internal x/y numbers.`;

  const userPrompt = `Current Game State:
${boardDescription}

The last move was at: ${lastMoveInfo}

${forbiddenStr}

Return JSON { "move": "..." } only. Do not include any markdown formatting or explanations.`;

  let response: ServiceResponse;

  try {
    if (config.provider === 'gemini') {
      const prompt = systemPrompt + "\n" + userPrompt;
      const schema = {
        type: Type.OBJECT,
        properties: {
          move: { type: Type.STRING }
        },
        required: ['move']
      };
      response = await callGemini(config, prompt, schema, true);
    } else {
      response = await callOpenAICompatible(config, systemPrompt, userPrompt);
    }

    const json = extractJSON(response.text);
    
    // Parse the standard coordinate string back to internal x,y
    if (json && typeof json.move === 'string') {
      const parsed = fromHumanCoordinate(json.move);
      if (parsed) {
        return { move: parsed, usage: response.usage };
      }
      console.warn("AI returned invalid coordinate string:", json.move);
    } else if (json && typeof json.x === 'number' && typeof json.y === 'number') {
       // Fallback for legacy/gemini if it ignores instruction
       return { move: { x: json.x, y: json.y }, usage: response.usage };
    }

    console.warn("AI returned invalid JSON structure. Raw text:", response.text);
    return { move: null, usage: response.usage };
  } catch (e: any) {
    console.error(`AI Move Error (${config.provider}):`, e);
    // Return partial usage if possible, but easier to just throw or return 0
    throw new Error(e.message || "AI failed to generate move");
  }
};

// --- Retry Helper ---
async function callWithRetry<T>(fn: () => Promise<T>, retries = 2, initialDelay = 1000): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt >= retries) throw e;
      attempt++;
      console.warn(`API call failed, retrying (${attempt}/${retries})...`, e.message);
      await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt - 1)));
    }
  }
}

export const analyzeMove = async (
  gameState: GameState, 
  move: Coordinate,
  config: AIConfig
): Promise<{ analysis: MoveAnalysis, usage: number }> => {
  // Select formatter based on provider. Qwen also benefits from explicit stone lists.
  const useExplicitFormat = config.provider === 'deepseek' || config.provider === 'qwen';
  const boardDescription = useExplicitFormat 
    ? formatBoardDeepSeek(gameState.board, gameState.moveHistory)
    : formatBoardEnhanced(gameState.board, gameState.moveHistory);

  const player = gameState.currentPlayer === PlayerColor.Black ? 'White' : 'Black';

  // Explicit coordinate data for the move being analyzed
  const humanCoord = toHumanCoordinate(move);
  const sgfCoord = toSGFCoordinate(move);

  const systemPrompt = `Act as a gentle, wise, and encouraging Go (Weiqi) teacher (9-dan professional level).
Analyze the last move played by ${player}.
Location: Internal(x=${move.x}, y=${move.y}) | SGF[${sgfCoord}] | "${humanCoord}"

Board Visualization uses Standard Go coordinates (A-T, 19-1).
Mapping: (0,0) is Top-Left (A19).

VISUAL ANCHORS:
- Top-Left: A19
- Top-Right: T19
- Bottom-Left: A1
- Bottom-Right: T1
- Direction: Row 19 is TOP. Row 1 is BOTTOM. Column A is LEFT. Column T is RIGHT.

INSTRUCTION:
1.  **Tone**: Warm, encouraging, and constructive. NEVER use harsh or insulting language.
    *   Avoid: "恶手" (Evil/Bad move), "败着" (Losing move), "愚蠢" (Stupid).
    *   Prefer: "缓手" (Slow), "欠妥" (Questionable), "值得商榷" (Debatable), "遗憾" (Pity).
2.  **Comparison**: Explicitly compare the board state *before* and *after* this move.
    *   Did the move fix a weakness?
    *   Did it create a new attack?
    *   How did the win rate/territory balance shift?
3.  **Teaching**: Explain the *logic* (Haengma/Shape). Focus on the future potential.
4.  **Language**: Simplified Chinese (简体中文).

Return strict JSON matching the schema.`;

  const userPrompt = `Game Context:
${boardDescription}

Output JSON fields:
1. evaluation: Choose one based on Score:
   - "神之一手" (Score > 95): Game-defining brilliance.
   - "好棋" (Score 80-95): Strong, active, positive move.
   - "普通" (Score 60-79): Standard, acceptable move.
   - "缓手" (Score 40-59): Passive, small, or low efficiency (but not a blunder).
   - "欠妥" (Score 20-39): Bad direction, shape defect, or loss of points.
   - "遗憾" (Score < 20): Severe mistake or blunder.
2. score: 0-100 (Be decisive! Do not default to 50-60.)
3. title: 4-character idiom (e.g. "大局为重", "稳步前行", "错失良机", "一石二鸟")
4. detailedAnalysis: string (CRITICAL: Compare the situation BEFORE and AFTER the move. What changed? Predict next moves.)
5. strategicContext: string (Current board situation: Leading/Trailing/Complicated)
6. josekiOrProverbs: string[]
7. territoryChange: number (Estimated point loss/gain relative to optimal play)
8. variations: array of {move: {x,y}, explanation, score} (Suggest better moves if this one was bad)

IMPORTANT: Return ONLY the raw JSON string. No Markdown blocks.`;

  let response: ServiceResponse;

  try {
    if (config.provider === 'gemini') {
      const prompt = systemPrompt + "\n" + userPrompt;
      const schema = {
        type: Type.OBJECT,
        properties: {
          evaluation: { type: Type.STRING, enum: ['神之一手', '好棋', '普通', '缓手', '欠妥', '遗憾'] },
          score: { type: Type.INTEGER },
          title: { type: Type.STRING },
          detailedAnalysis: { type: Type.STRING },
          strategicContext: { type: Type.STRING },
          josekiOrProverbs: { type: Type.ARRAY, items: { type: Type.STRING } },
          territoryChange: { type: Type.INTEGER },
          variations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                move: { type: Type.OBJECT, properties: { x: {type: Type.INTEGER}, y: {type: Type.INTEGER} } },
                explanation: { type: Type.STRING },
                score: { type: Type.INTEGER }
              }
            }
          }
        },
        required: ['evaluation', 'score', 'title', 'detailedAnalysis', 'strategicContext', 'territoryChange']
      };
      // Wrap in Retry
      response = await callWithRetry(() => callGemini(config, prompt, schema, false));
    } else {
       // Wrap in Retry
       response = await callWithRetry(() => callOpenAICompatible(config, systemPrompt, userPrompt));
    }

    const result = extractJSON(response.text);
    
    // Safety defaults
    const safeAnalysis: MoveAnalysis = {
      evaluation: result?.evaluation || '普通',
      score: result?.score || 70,
      title: result?.title || '...',
      detailedAnalysis: result?.detailedAnalysis || '无法解析详细分析 (Raw text logged)',
      strategicContext: result?.strategicContext || '',
      josekiOrProverbs: result?.josekiOrProverbs || [],
      territoryChange: result?.territoryChange || 0,
      variations: result?.variations || []
    };

    if (!result) {
        console.warn("Analysis JSON parse failed. Raw text:", response.text);
    }

    return { analysis: safeAnalysis, usage: response.usage };

  } catch (e) {
    console.error(`Analysis Error (${config.provider}):`, e);
    const fallback: MoveAnalysis = {
      evaluation: '普通',
      score: 75,
      title: "分析中断",
      detailedAnalysis: `AI (${config.provider}) 服务繁忙或配置错误，请检查 API Key。`,
      strategicContext: "暂无",
      territoryChange: 0,
      variations: []
    };
    return { analysis: fallback, usage: 0 };
  }
};
