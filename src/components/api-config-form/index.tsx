import { useState, useCallback } from 'react';
import {
  SERVER_BASE_URL_KEY,
  AI_MODE_KEY,
  AI_BASE_URL_KEY,
  AI_API_KEY_KEY,
  AI_MODEL_KEY,
  loadAIConfigFromStorage,
  type AIConfig,
  type AiMode,
} from '@/constants/api-config';
import styles from './index.module.css';

export type { AiMode, AIConfig };

interface ApiConfigFormProps {
  onSave: (config: AIConfig) => void;
  submitButtonText?: string;
  showCancelButton?: boolean;
  onCancel?: () => void;
}

export function ApiConfigForm({
  onSave,
  submitButtonText = '保存',
  showCancelButton = false,
  onCancel,
}: ApiConfigFormProps) {
  const [config, setConfig] = useState<AIConfig>(loadAIConfigFromStorage);

  const updateConfig = useCallback(<K extends keyof AIConfig>(key: K, value: AIConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSave(config);
    },
    [config, onSave],
  );

  const isSubmitDisabled = config.aiMode === 'mosu' ? !config.serverBaseUrl.trim() : !config.aiBaseUrl.trim();

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <fieldset className={styles.fieldset}>
        <legend>AI 调用方式</legend>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="aiMode"
            value="mosu"
            checked={config.aiMode === 'mosu'}
            onChange={() => updateConfig('aiMode', 'mosu')}
            aria-label="通过 Mosu 后端代理"
          />
          Mosu 后端代理（推荐）
        </label>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="aiMode"
            value="api"
            checked={config.aiMode === 'api'}
            onChange={() => updateConfig('aiMode', 'api')}
            aria-label="自定义 AI API"
          />
          自定义 AI API
        </label>
      </fieldset>

      {config.aiMode === 'mosu' ? (
        <>
          <label className={styles.urlLabel}>
            后端服务地址
            <input
              type="url"
              value={config.serverBaseUrl}
              onChange={(event) => updateConfig('serverBaseUrl', event.target.value)}
              placeholder="http://localhost:3000"
              aria-label="后端服务地址"
            />
          </label>
          <p className={styles.hint}>
            开发环境下使用 Mosu Plugin 时，后端地址默认与当前页面地址相同，无需额外配置。链接结尾不需要添加斜线（如
            http://localhost:3000 而非 http://localhost:3000/）。AI 请求将通过 Mosu 后端服务转发，无需在前端暴露 API
            Key。
          </p>
        </>
      ) : (
        <>
          <label className={styles.urlLabel}>
            AI API Base URL
            <input
              type="url"
              value={config.aiBaseUrl}
              onChange={(event) => updateConfig('aiBaseUrl', event.target.value)}
              placeholder="https://api.openai.com/v1"
              aria-label="AI API Base URL"
            />
          </label>
          <label className={styles.urlLabel}>
            API Key（可选）
            <input
              type="password"
              value={config.aiApiKey}
              onChange={(event) => updateConfig('aiApiKey', event.target.value)}
              placeholder="sk-..."
              aria-label="API Key（可选）"
            />
          </label>
          <label className={styles.urlLabel}>
            模型名称
            <input
              type="text"
              value={config.aiModel}
              onChange={(event) => updateConfig('aiModel', event.target.value)}
              placeholder="qwen-max"
              aria-label="模型名称"
            />
          </label>
          <p className={styles.hint}>
            自定义 AI API 模式下，API Key
            为可选项（如使用本地代理转发则无需填写）。若填写，密钥将存储在浏览器本地并随请求发送，存在泄露风险，请仅在可信环境中使用。链接结尾不需要添加斜线。
          </p>
        </>
      )}

      <div className={styles.actions}>
        {showCancelButton && (
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            取消
          </button>
        )}
        <button type="submit" className={styles.submitButton} disabled={isSubmitDisabled}>
          {submitButtonText}
        </button>
      </div>
    </form>
  );
}

export function saveApiConfigToStorage(config: AIConfig) {
  localStorage.setItem(AI_MODE_KEY, config.aiMode);
  localStorage.setItem(AI_MODEL_KEY, config.aiModel);
  if (config.aiMode === 'mosu') {
    localStorage.setItem(SERVER_BASE_URL_KEY, config.serverBaseUrl.trim());
  } else {
    localStorage.setItem(AI_BASE_URL_KEY, config.aiBaseUrl.trim());
    localStorage.setItem(AI_API_KEY_KEY, config.aiApiKey);
  }
}
