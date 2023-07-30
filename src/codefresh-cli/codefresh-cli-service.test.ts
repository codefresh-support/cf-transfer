import { asserts } from '../deps.ts';
import { CodefreshCLIService } from './codefresh-cli.service.ts';

import type { LoggerService } from '../logger.service.ts';
import type { CodefreshCLIConfig } from '../types.ts';

const mockLogger = {
  log: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
} as LoggerService;

const mockConfig: CodefreshCLIConfig = {
  'current-context': 'contextA',
  contexts: {
    contextA: {
      type: 'contextA-type',
      name: 'contextA-name',
      url: 'contextA-url',
      token: 'contextA-token',
      beta: false,
      onPrem: false,
    },
    contextB: {
      type: 'contextB-type',
      name: 'contextB-name',
      url: 'contextB-url',
      token: 'contextB-token',
      beta: false,
      onPrem: false,
    },
  },
};

Deno.test('CodefreshCLIService', async (t) => {
  await t.step('getCurrentContext', async (t) => {
    await t.step('should throw an error if config was not loaded', () => {
      const service = new CodefreshCLIService(mockLogger);
      asserts.assertThrows(
        () => service.getCurrentContext(),
        Error,
        'CLI config was not loaded',
      );
    });

    await t.step('should return current context', () => {
      const service = new CodefreshCLIService(mockLogger, mockConfig);
      asserts.assertEquals(
        service.getCurrentContext(),
        mockConfig['current-context'],
      );
    });
  });

  await t.step('getContextByName', async (t) => {
    await t.step('should throw an error if config was not loaded', () => {
      const service = new CodefreshCLIService(mockLogger);
      asserts.assertThrows(
        () => service.getContextByName('contextA'),
        Error,
        'CLI config was not loaded',
      );
    });

    await t.step('should return context by name', () => {
      const service = new CodefreshCLIService(mockLogger, mockConfig);
      for (const [name, context] of Object.entries(mockConfig.contexts)) {
        asserts.assertEquals(service.getContextByName(name), context);
      }
    });
  });

  await t.step('init', async (t) => {
    await t.step('if path was not passed', async (t) => {
      await t.step(
        'should throw Error if unable to resolve HOME path',
        async () => {
          const service = new CodefreshCLIService(mockLogger);
          const homeEnvName = Deno.build.os === 'windows'
            ? 'USERPROFILE'
            : 'HOME';
          const homeEnvValue = Deno.env.get(homeEnvName);
          Deno.env.delete(homeEnvName);
          await asserts.assertRejects(
            async () => await service.init(),
            Error,
            'Unable to resolve path to HOME in order to load default CLI config',
          );
          homeEnvValue && Deno.env.set(homeEnvName, homeEnvValue);
        },
      );
    });
  });
});
