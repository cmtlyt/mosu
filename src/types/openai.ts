export interface ChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
