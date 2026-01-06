
import React, { useState, useEffect } from 'react';
import { AIProvider, AIConfig } from '../types';
import { X, Save, Key, Cpu, AlertCircle, Trash2, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: AIConfig;
  onSave: (config: AIConfig) => void;
}

const PROVIDERS: { id: AIProvider; name: string; description: string }[] = [
  { id: 'gemini', name: 'Google Gemini', description: 'Gemini 3 Flash (最新预览版)' },
  { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek V3 (高性价比)' },
  { id: 'zhipu', name: 'Zhipu AI (智谱)', description: 'GLM-4.7 (最新最强推理)' },
  { id: 'qwen', name: 'Qwen (通义千问)', description: 'Qwen-Plus/Max (综合能力强)' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentConfig, onSave }) => {
  const [provider, setProvider] = useState<AIProvider>(currentConfig.provider);
  const [apiKey, setApiKey] = useState<string>(currentConfig.apiKey);
  // Store separate keys for each provider in local state wrapper to improve UX
  const [keysMap, setKeysMap] = useState<Record<string, string>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setProvider(currentConfig.provider);
      // Try to load saved keys map from localStorage
      const savedKeys = localStorage.getItem('zenGo_apiKeys');
      if (savedKeys) {
        const parsed = JSON.parse(savedKeys);
        setKeysMap(parsed);
        setApiKey(parsed[currentConfig.provider] || currentConfig.apiKey);
      } else {
        setApiKey(currentConfig.apiKey);
      }
    }
  }, [isOpen, currentConfig]);

  const handleProviderChange = (p: AIProvider) => {
    // Save current input to map before switching (if not empty)
    if (apiKey.trim()) {
        const newMap = { ...keysMap, [provider]: apiKey };
        setKeysMap(newMap);
        localStorage.setItem('zenGo_apiKeys', JSON.stringify(newMap));
    }
    
    setProvider(p);
    // Restore key if exists
    setApiKey(keysMap[p] || '');
  };

  const handleClearKey = () => {
      setApiKey('');
      const newMap = { ...keysMap };
      delete newMap[provider];
      setKeysMap(newMap);
      localStorage.setItem('zenGo_apiKeys', JSON.stringify(newMap));
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestResult('error');
      setTestMessage('请先输入 API Key');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestMessage('');

    try {
      // Gemini uses GoogleGenAI SDK
      if (provider === 'gemini') {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: 'Hi',
        });
        setTestResult('success');
        setTestMessage('连接成功！模型: gemini-3-flash-preview');
        return;
      }

      // OpenAI-compatible APIs
      const config: Record<string, { baseURL: string; model: string }> = {
        deepseek: {
          baseURL: 'https://api.deepseek.com/chat/completions',
          model: 'deepseek-chat'
        },
        qwen: {
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          model: 'qwen-plus'
        },
        zhipu: {
          baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
          model: 'glm-4.7'
        }
      };

      const conf = config[provider];
      const response = await fetch(conf.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: conf.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      if (response.ok) {
        setTestResult('success');
        setTestMessage(`连接成功！模型: ${conf.model}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setTestResult('error');
        setTestMessage(errorData.error?.message || `连接失败 (${response.status})`);
      }
    } catch (error) {
      setTestResult('error');
      setTestMessage('网络错误，请检查 API Key 或网络连接');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    // Persist all keys map
    const newMap = { ...keysMap };
    if (apiKey.trim()) {
        newMap[provider] = apiKey;
    }
    localStorage.setItem('zenGo_apiKeys', JSON.stringify(newMap));

    onSave({
      provider,
      apiKey,
      modelName: undefined 
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md border border-stone-200 overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="bg-[#fcfbf9] px-6 py-4 border-b border-stone-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Cpu className="text-stone-700" size={20} />
            <h3 className="font-display font-bold text-lg text-ink">AI 模型设置</h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Provider Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">选择 AI 模型</label>
            <div className="grid grid-cols-1 gap-2">
              {PROVIDERS.map((p) => {
                const hasKey = !!keysMap[p.id];
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`
                      flex items-center justify-between p-3 rounded-md border text-left transition-all
                      ${provider === p.id 
                        ? 'border-accent-gold bg-stone-50 shadow-sm ring-1 ring-accent-gold/20' 
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'}
                    `}
                  >
                    <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-3 border ${provider === p.id ? 'bg-accent-gold border-accent-gold' : 'bg-white border-stone-300'}`}></div>
                        <div>
                        <div className="text-sm font-bold text-stone-800">{p.name}</div>
                        <div className="text-[10px] text-stone-500">{p.description}</div>
                        </div>
                    </div>
                    {hasKey && provider !== p.id && (
                        <CheckCircle2 size={14} className="text-emerald-500 opacity-60" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-3">
             <label className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-stone-500">
                <span>API Key</span>
                {provider === 'gemini' && <span className="text-[9px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-400 font-normal normal-case">选填 (默认使用内置 Key)</span>}
             </label>
             <div className="relative group">
               <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" size={16} />
               <input 
                 type="password" 
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 placeholder={`输入 ${PROVIDERS.find(p=>p.id===provider)?.name} API Key`}
                 className="w-full pl-10 pr-10 py-2.5 bg-white border border-stone-200 rounded-md text-sm focus:outline-none focus:border-accent-gold focus:ring-2 focus:ring-accent-gold/20 font-mono text-stone-700 placeholder:text-stone-300 transition-all"
               />
               {apiKey && (
                   <button 
                     onClick={handleClearKey}
                     className="absolute right-3 top-1/2 transform -translate-y-1/2 text-stone-300 hover:text-red-500 transition-colors"
                     title="清除 Key"
                   >
                       <Trash2 size={16} />
                   </button>
               )}
             </div>
             <div className="flex items-start gap-2 bg-amber-50 p-2 rounded border border-amber-100">
                <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-700 leading-tight">
                  您的 API Key 仅存储在本地浏览器中，用于直连模型 API。
                </p>
             </div>

             {/* Test Connection Button */}
             <div className="flex items-center gap-3">
               <button
                 onClick={handleTestConnection}
                 disabled={isTesting || !apiKey.trim()}
                 className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                   isTesting
                     ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                     : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                 }`}
               >
                 {isTesting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                 {isTesting ? '测试中...' : '测试连接'}
               </button>

               {testResult && (
                 <span className={`text-xs font-medium ${
                   testResult === 'success' ? 'text-emerald-600' : 'text-red-500'
                 }`}>
                   {testMessage}
                 </span>
               )}
             </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-3">
           <button 
             onClick={onClose}
             className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200/50 rounded-md transition-colors"
           >
             取消
           </button>
           <button 
             onClick={() => {
                 // Trigger saved feedback
                 handleSave();
             }}
             className="px-6 py-2 bg-stone-800 hover:bg-black text-white text-sm font-bold rounded-md shadow-lg shadow-stone-300/50 flex items-center gap-2 transition-all active:scale-95"
           >
             <Save size={16} />
             已保存
           </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
