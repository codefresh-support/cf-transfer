import { loadYaml, resolvePath } from '../deps.ts';
import { NotFoundError, ValidationError } from '../errors.ts';

import type { LoggerService } from '../logger.service.ts';
import type {
  CodefreshCLIConfig,
  CodefreshCLIConfigContext,
} from '../types.ts';

export class CodefreshCLIService {
  #logger: LoggerService;
  #config?: CodefreshCLIConfig;

  constructor(logger: LoggerService, config?: CodefreshCLIConfig) {
    this.#logger = logger;
    this.#config = config;
  }

  async init(path?: string): Promise<void> {
    try {
      if (!path) {
        this.#logger.log(
          '📃 Path to CLI config was not set. Using default path',
        );
        const HOME = Deno.env.get(
          Deno.build.os === 'windows' ? 'USERPROFILE' : 'HOME',
        );
        if (!HOME) {
          throw new Error(
            'Unable to resolve path to HOME in order to load default CLI config',
          );
        }
        path = resolvePath(HOME, '.cfconfig');
      }
      this.#logger.log(`📃 Loading CLI config from "${path}"`);
      const config = await Deno.readTextFile(path);
      const parsedConfig = <CodefreshCLIConfig> loadYaml(config);
      if (
        typeof parsedConfig === 'object' &&
        parsedConfig !== null &&
        Reflect.has(parsedConfig, 'current-context') &&
        parsedConfig['current-context'] &&
        Reflect.has(parsedConfig, 'contexts') &&
        typeof parsedConfig.contexts === 'object' &&
        parsedConfig.contexts !== null
      ) {
        this.#logger.log('✅ CLI config was successfully loaded');
        this.#config = parsedConfig;
      } else {
        throw new ValidationError('Invalid CLI config');
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new NotFoundError(`CLI config was not found at "${path}"`);
      }
      throw error;
    }
  }

  public getCurrentContext(): string {
    if (!this.#config) throw new Error('CLI config was not loaded');
    return this.#config['current-context'];
  }

  public getContextByName(
    contextName: string,
  ): CodefreshCLIConfigContext {
    if (!this.#config) throw new Error('CLI config was not loaded');
    const context = this.#config.contexts[contextName];
    if (!context) {
      throw new NotFoundError(
        `Context "${contextName}" was not found. Available options: ${
          Object.keys(this.#config.contexts).join(', ')
        }`,
      );
    }
    return context;
  }
}
