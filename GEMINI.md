# ZenGo (弈悟) - AI Go Teaching Application

ZenGo is a modern, AI-powered Go (Weiqi) web application designed for teaching and analysis. It allows users to play against various AI models (Gemini, DeepSeek, etc.) and receive professional-grade game analysis in real-time.

## Project Overview

*   **Framework:** React 19 + TypeScript + Vite
*   **Styling:** Tailwind CSS
*   **AI Integration:** Google GenAI SDK (and compatible OpenAI-style APIs)
*   **Platform:** Web / PWA (Progressive Web App)

## Key Features

1.  **Multi-Provider AI Support:** Switch between Gemini, DeepSeek, Zhipu, and Qwen for move generation and game analysis.
2.  **Interactive Board:** 19x19 Go board with visual influence (territory potential) indicators and smooth animations.
3.  **Deep Analysis:** "Professional 9-dan" style commentary on every move, including score estimation, strategic context, and variations.
4.  **Time Travel Analysis:** Review past moves with full board state restoration. Even if stones were captured later, viewing a past move shows the board exactly as it was.
5.  **Robust Error Handling:** AI calls feature exponential backoff retry logic and optimistic UI updates to ensure a smooth experience even with network latency.
6.  **Enhanced AI Perception:** Uses a dual-mode board representation (Visual ASCII + Explicit Coordinate List) to eliminate AI hallucinations regarding stone positions, ensuring accurate move generation and analysis.

## Architecture

The project follows a clean three-layer architecture:

### 1. Presentation Layer (`components/`)
*   **`Board.tsx`**: Renders the 19x19 grid, stones, star points, and influence heatmaps. Handles coordinate translation and user interaction.
*   **`AnalysisPanel.tsx`**: Displays the AI's analysis, including win rate bars, commentary, and variation trees. Supports keyboard navigation (Left/Right arrows).
*   **`Stone.tsx`**: Renders individual black/white stones with visual flair (shadows, highlights).
*   **`SettingsModal.tsx`**: Manages API keys and provider selection.

### 2. Business Logic Layer (`services/`)
*   **`goGame.ts`**: The core rules engine.
    *   `playMove()`: Validates moves, handles captures (liberty counting), and prevents suicide/ko (basic).
    *   `estimateScore()`: Provides a rough score estimation based on territory influence and captured stones.
    *   `calculateInfluence()`: Generates the raw data for the territory visualization.
*   **`geminiService.ts`**: The AI bridge.
    *   `getAIMove()`: Asks the AI for the next best coordinate (JSON output).
    *   `analyzeMove()`: Requests a detailed critique of a specific move.
    *   **Features**:
        *   **Robust JSON Extraction**: Handles Markdown wrapping and fuzzy parsing.
        *   **Explicit Coordinate List**: Generates a text-based list of all stone positions (e.g., `Black: [D4, Q16]`) alongside the visual ASCII board. This forces the AI to cross-reference data, solving "blindness" issues common in LLMs.
        *   **Rule Injection**: System prompts now explicitly define Go rules (Liberties, Capture, Suicide, Ko) to prevent illegal AI moves.
        *   **Retry Logic**: Automatic retries with exponential backoff for network stability.

### 3. State Management (`App.tsx`)
*   Acts as the central controller.
*   Manages `gameState` (current board), `history` (for undo/redo), and `analysisHistory` (AI responses).
*   Implements the "Time Travel" logic via `viewingMoveNum` and `displayGameState`.
*   Handles the game loop: Player Move -> Optimistic Update -> AI Move Generation -> AI Move Execution -> AI Analysis.

## Building and Running

### Prerequisites
*   Node.js (v18+ recommended)
*   API Key for at least one provider (Google Gemini, DeepSeek, etc.)

### Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Windows Quick Start
A convenience script `start-dev.bat` is provided for Windows users. It:
1.  Checks for `npm`.
2.  Installs dependencies if missing.
3.  Starts the Vite server in the background.
4.  Opens the app in a standalone "App Mode" window (using Edge or Chrome) for a native-like experience.

## Configuration

AI settings are persisted in `localStorage`. You can configure:
*   **Provider:** Gemini (default), DeepSeek, Zhipu, Qwen.
*   **API Key:** Your personal API key for the selected provider.
*   **Model:** (Optional) Specific model name overrides.

## Data Structures (`types.ts`)

*   **`GameState`**: Snapshot of the board, captives, and turn info.
*   **`MoveAnalysis`**: Structured AI response containing `evaluation` (e.g., "Divine Move"), `score` (0-100), `detailedAnalysis`, and `variations`.
*   **`AnalysisHistoryItem`**: Links a specific move number to its analysis, supporting the time-travel feature.
