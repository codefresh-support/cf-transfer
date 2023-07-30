import { COMMANDS } from './const.ts';
import { parseDenoFlags } from './deps.ts';
import { ValidationError } from './errors.ts';

import type { CLIArguments } from './types.ts';

// deno-lint-ignore no-explicit-any
const isKnownCommand = (path: string[], object: any): boolean => {
  if (path.length === 1) {
    return Array.isArray(object) && object.includes(path[0]);
  }
  if (typeof object === 'object' && object?.hasOwnProperty(path[0])) {
    return isKnownCommand(path.slice(1), object[path[0]]);
  }
  return false;
};

export const parseFlags = (
  args: typeof Deno['args'],
): CLIArguments => {
  const parsedFlags = parseDenoFlags(args, {
    string: ['context-from', 'context-to', 'cfconfig-path'],
  });

  const command = parsedFlags['_'].map(String);
  if (!isKnownCommand(command, COMMANDS)) {
    throw new ValidationError(
      `Unknown command: "${
        command.join(' ')
      }". Please check README.md for available commands`,
    );
  }

  if (!parsedFlags['context-from']) {
    throw new ValidationError(`Missing required flag: --context-from`);
  }
  if (!parsedFlags['context-to']) {
    throw new ValidationError(`Missing required flag: --context-to`);
  }

  return {
    command,
    options: {
      cfconfigPath: parsedFlags['cfconfig-path'],
      sourceContext: parsedFlags['context-from'],
      targetContext: parsedFlags['context-to'],
    },
  };
};
