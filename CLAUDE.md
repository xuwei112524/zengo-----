# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ZenGo (弈悟) - 基于 AI 的围棋教学 Web 应用（PWA），支持与多个 AI 服务商（Google Gemini、DeepSeek、智谱GLM、通义千问）对弈。

## 常用命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产环境构建
npm run build

# 预览构建产物
npm run preview
```

**前置要求：** 在 `.env.local` 中配置 `GEMINI_API_KEY` 或其他 AI 服务商的 API Key。

## 项目架构

```
三层架构设计：
1. 表示层 (components/)     - React UI 组件
2. 业务逻辑层 (services/)   - 游戏规则和 AI 服务
3. 类型定义层               - TypeScript 类型
```

### 核心模块

- **`services/goGame.ts`** - 围棋核心逻辑（落子、提子、势力计算、胜负判断）
- **`services/geminiService.ts`** - AI 服务集成（统一接口，支持多提供商）
- **`components/Board.tsx`** - 19x19 棋盘渲染（含星位、势力可视化）
- **`components/AnalysisPanel.tsx`** - AI 分析结果展示（走法评估、战略分析）
- **`components/SettingsModal.tsx`** - AI 提供商切换和 API Key 配置
- **`App.tsx`** - 主应用状态管理（无外部状态库，使用 useState）

### 技术特性

- **PWA** - 可离线使用，支持安装为原生应用
- **多 AI 支持** - 扩展自 `services/geminiService.ts` 的 `getAIMove()` 和 `analyzeMove()` 接口
- **无测试框架** - 项目未配置 Vitest/Jest
