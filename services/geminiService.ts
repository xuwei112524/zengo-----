
import { GoogleGenAI, Type } from "@google/genai";
import { GameState, PlayerColor, Coordinate, MoveAnalysis, AIConfig, AIProvider } from "../types";

// Default Configuration Maps
const PROVIDER_CONFIGS: Record<AIProvider, { baseURL?: string, defaultModel: string, jsonMode: boolean }> = {
  gemini: { 
    defaultModel: 'gemini-3-flash-preview', // Changed back to 3-Flash as requested
    jsonMode: true 
  },
  deepseek: { 
    baseURL: 'https://api.deepseek.com/chat/completions', 
    defaultModel: 'deepseek-chat', 
    jsonMode: true 
  },
  zhipu: { 
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 
    defaultModel: 'glm-4-plus', 
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
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        // continue
      }
    }
    const clean = text.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch (e3) {
      throw new Error("Failed to parse JSON response: " + text.substring(0, 50) + "...");
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

  const body: any = {
    model: config.modelName || providerConf.defaultModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.5,
    stream: false,
  };

  if (providerConf.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${config.provider} API Error (${response.status}): ${errText}`);
  }

  const json = await response.json();
  const content = json.choices[0].message.content;
  const usage = json.usage?.total_tokens || 0;

  return { text: content, usage };
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
  };

  if (schema) {
    genConfig.responseSchema = schema;
  }
  
  if (isThinkingDisabled && (modelName.includes('gemini-3') || modelName.includes('gemini-2.5'))) {
      genConfig.thinkingConfig = { thinkingBudget: 0 };
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

// --- Main Exported Functions ---

export const getAIMove = async (
  gameState: GameState, 
  invalidCandidates: Coordinate[] = [],
  config: AIConfig
): Promise<{ move: Coordinate | null, usage: number }> => {
  
  const boardStr = gameState.board.map(row => row.join('')).join('\n');
  const size = gameState.boardSize;
  const color = gameState.currentPlayer === PlayerColor.Black ? 'Black' : 'White';
  
  const forbiddenStr = invalidCandidates.length > 0 
    ? `IMPORTANT: The following coordinates are INVALID (occupied or suicide), DO NOT PLAY HERE: ${JSON.stringify(invalidCandidates)}`
    : '';

  const systemPrompt = `You are a professional Go (Weiqi) player (9-dan).
Board Size: ${size}x${size}.
Your Color: ${color}.
Task: Calculate the single best LEGAL next coordinate to win. Ensure the spot is currently empty (marked as '.').
Output: JSON only { "x": number, "y": number }.`;

  const userPrompt = `Current Board State:
${boardStr}

The last move was at: ${gameState.lastMove?.x},${gameState.lastMove?.y}.

${forbiddenStr}

Return JSON {x, y} only.`;

  let response: ServiceResponse;

  try {
    if (config.provider === 'gemini') {
      const prompt = systemPrompt + "\n" + userPrompt;
      const schema = {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.INTEGER },
          y: { type: Type.INTEGER }
        },
        required: ['x', 'y']
      };
      response = await callGemini(config, prompt, schema, true);
    } else {
      response = await callOpenAICompatible(config, systemPrompt, userPrompt);
    }

    const json = extractJSON(response.text);
    
    if (json && typeof json.x === 'number' && typeof json.y === 'number') {
      return { move: { x: json.x, y: json.y }, usage: response.usage };
    }
    return { move: null, usage: response.usage };
  } catch (e: any) {
    console.error(`AI Move Error (${config.provider}):`, e);
    // Return partial usage if possible, but easier to just throw or return 0
    throw new Error(e.message || "AI failed to generate move");
  }
};

export const analyzeMove = async (
  gameState: GameState, 
  move: Coordinate,
  config: AIConfig
): Promise<{ analysis: MoveAnalysis, usage: number }> => {
  const boardStr = gameState.board.map(row => row.join('')).join('\n');
  const player = gameState.currentPlayer === PlayerColor.Black ? 'White' : 'Black';

  const systemPrompt = `Act as a world-class Go (Weiqi) Professional 9-dan teacher.
Analyze the last move played by ${player} at x=${move.x}, y=${move.y}.
Provide a deep, sophisticated analysis in Chinese (Simplified).
Return strict JSON matching the requested schema.`;

  const userPrompt = `Board Context:
${boardStr}

Output JSON fields:
1. evaluation: "神之一手" | "好棋" | "普通" | "缓手" | "恶手" | "败着"
2. score: 0-100
3. title: 4-character idiom
4. detailedAnalysis: string
5. strategicContext: string
6. josekiOrProverbs: string[]
7. territoryChange: number
8. variations: array of {move: {x,y}, explanation, score}`;

  let response: ServiceResponse;

  try {
    if (config.provider === 'gemini') {
      const prompt = systemPrompt + "\n" + userPrompt;
      const schema = {
        type: Type.OBJECT,
        properties: {
          evaluation: { type: Type.STRING, enum: ['神之一手', '好棋', '普通', '缓手', '恶手', '败着'] },
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
      response = await callGemini(config, prompt, schema, false);
    } else {
       response = await callOpenAICompatible(config, systemPrompt, userPrompt);
    }

    const result = extractJSON(response.text) as MoveAnalysis;
    
    // Safety defaults
    const safeAnalysis: MoveAnalysis = {
      evaluation: result.evaluation || '普通',
      score: result.score || 70,
      title: result.title || '...',
      detailedAnalysis: result.detailedAnalysis || '无法解析详细分析',
      strategicContext: result.strategicContext || '',
      josekiOrProverbs: result.josekiOrProverbs || [],
      territoryChange: result.territoryChange || 0,
      variations: result.variations || []
    };
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
