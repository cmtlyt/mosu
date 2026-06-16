import { useState, useEffect } from 'react';
import { getAIEngine } from '@/libs/ai-engine';
import { logger } from '@/libs/logger';

interface UseModelLoaderReturn {
  isLoaded: boolean;
  error: string | null;
}

export function useModelLoader(): UseModelLoaderReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    logger.info('hooks.use-model-loader.preload', 'Starting model preload...');

    getAIEngine()
      .then(() => {
        if (!cancelled) {
          logger.info('hooks.use-model-loader.preload', 'Model preloaded successfully');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setError(message);
          logger.error('hooks.use-model-loader.preload', 'Model preload failed', err);
        }
      });
    setIsLoaded(true);

    return () => {
      cancelled = true;
    };
  }, []);

  return { isLoaded, error };
}
