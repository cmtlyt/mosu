export async function detectModelTier(): Promise<'high' | 'low'> {
  // 初期直接使用 high 模型，保留接口供后续降级
  return 'high';
}
