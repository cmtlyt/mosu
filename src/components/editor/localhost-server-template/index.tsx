import { dispatchEditorEvent, EDITOR_EVENTS } from '@/utils/editor/event-bus';
import styles from './index.module.css';

const SERVER_TEMPLATE = `import http from 'node:http';

const PORT = process.env.PORT || 3001;
const AI_BASE_URL = 'https://idealab.alibaba-inc.com/api/openai/v1';
const AI_MODEL = 'qwen3-coder-plus';
const AI_API_KEY = process.env.AI_API_KEY || 'your-api-key-here';

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const isStream = requestData.stream === true;

        const upstreamResponse = await fetch(\`\${AI_BASE_URL}/chat/completions\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${AI_API_KEY}\`,
          },
          body: JSON.stringify({
            ...requestData,
            model: AI_MODEL,
          }),
        });

        if (!upstreamResponse.ok) {
          const errorBody = await upstreamResponse.text();
          console.error(\`Upstream error \${upstreamResponse.status}: \${errorBody}\`);
          res.writeHead(upstreamResponse.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: \`Upstream API error: \${upstreamResponse.status}\` } }));
          return;
        }

        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          const reader = upstreamResponse.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }

          res.end();
        } else {
          const data = await upstreamResponse.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        }
      } catch (error) {
        console.error('Proxy error:', error);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Failed to connect to upstream API' } }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(\`AI Proxy server running on http://localhost:\${PORT}\`);
  console.log(\`Model: \${AI_MODEL}\`);
  console.log(\`API Key configured: \${AI_API_KEY !== 'your-api-key-here'}\`);
});`;

export function LocalhostServerTemplate() {
  const handleCopy = () => {
    navigator.clipboard.writeText(SERVER_TEMPLATE).then(
      () => {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '代码已复制到剪贴板', type: 'success' });
      },
      () => {
        dispatchEditorEvent(EDITOR_EVENTS.MESSAGE, { text: '复制失败，请手动选择复制', type: 'error' });
      },
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Localhost AI Server（纯 Node.js 实现）</h3>
        <button type="button" className={styles.copyButton} onClick={handleCopy}>
          复制代码
        </button>
      </div>

      <div className={styles.hint}>
        启动本地代理后，请在 "AI 配置" 标签页中选择 "API 调用" 模式，并将 Base URL 填写为{' '}
        <code>http://localhost:3001/v1</code>。本地代理会在服务端注入 API Key，避免前端暴露密钥。
      </div>

      <div className={styles.section}>
        <h4>使用方法</h4>
        <ol className={styles.steps}>
          <li>
            创建文件 <code>ai-server.mjs</code>
          </li>
          <li>
            运行 <code>node ai-server.mjs</code>
          </li>
          <li>
            在编辑器中配置 AI Base URL 为 <code>http://localhost:3001/v1</code>
          </li>
        </ol>
      </div>

      <div className={styles.section}>
        <h4>环境变量</h4>
        <ul className={styles.envList}>
          <li>
            <code>PORT</code>：服务端口（默认 3001）
          </li>
          <li>
            <code>AI_API_KEY</code>：API Key（必填）
          </li>
        </ul>
      </div>

      <div className={styles.section}>
        <h4>完整代码</h4>
        <pre className={styles.codeBlock}>
          <code>{SERVER_TEMPLATE}</code>
        </pre>
      </div>
    </div>
  );
}
