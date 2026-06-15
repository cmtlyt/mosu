import { createLogger } from '@cmtlyt/logger';
import { webConsoleAdapter } from '@cmtlyt/logger/adapters/web';

interface ParsedData {
  type: string;
  pointer: string;
  message: string;
  otherMessage: any[];
}

type LoggerFn = (pointer: string, message: string, ...otherMessage: any[]) => void;

interface Logger {
  info: LoggerFn;
  warn: LoggerFn;
  error: (pointer: string, message: string, error: any, ...otherMessage: any[]) => void;
  debug: LoggerFn;
  appear: LoggerFn;
  event: LoggerFn;
}

export const logger = createLogger<ParsedData>({
  enableOutput: import.meta.env.DEV,
  transform(options) {
    const { type, messages } = options;
    const [pointer, message, ...otherMessage] = messages;
    return {
      type,
      pointer,
      message,
      otherMessage,
    };
  },
  report(options) {
    const { data: _ } = options;
  },
  outputAdapters: [
    webConsoleAdapter({
      allowTypes: ['appear', 'event'],
      consoleLevel: 'debug',
      getSubTitle(options) {
        return options.transformData.pointer;
      },
      getMessages(options) {
        const { messages } = options;
        return messages.slice(1);
      },
    }),
  ],
}) as unknown as Logger;
