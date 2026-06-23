import { createLogger } from '@cmtlyt/logger';
import { webConsoleAdapter } from '@cmtlyt/logger/adapters/web';
import { nodeConsoleAdapter } from '@cmtlyt/logger/adapters/node';

interface ParsedData {
  type: string;
  pointer: string;
  message: string;
  otherMessage: unknown[];
}

type LoggerFn = (pointer: string, message: string, ...otherMessage: unknown[]) => void;

interface Logger {
  info: LoggerFn;
  warn: LoggerFn;
  error: (pointer: string, message: string, error: unknown, ...otherMessage: unknown[]) => void;
  debug: LoggerFn;
  appear: LoggerFn;
  event: LoggerFn;
}

export const logger = createLogger<ParsedData>({
  enableOutput: true,
  transform(options) {
    const { type, messages } = options;
    const [pointer, message, ...otherMessage] = messages;
    return { type, pointer, message, otherMessage };
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
        return options.messages.slice(1);
      },
    }),
    nodeConsoleAdapter({
      allowTypes: ['appear', 'event'],
      getLabel(options) {
        return options.transformData.pointer;
      },
      getMessages(options) {
        return options.messages.slice(1);
      },
      format: '[MOSU][%type][%label][%date] %message %othermessages',
    }),
  ],
}) as unknown as Logger;
