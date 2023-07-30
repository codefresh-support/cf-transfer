import { CodefreshCLIService } from './codefresh-cli/codefresh-cli.service.ts';
import { CodefreshHttpClient } from './codefresh.http-client.ts';
import { COLORS } from './const.ts';
import { CopyService } from './copy.service.ts';
import { colors } from './deps.ts';
import { logger } from './logger.service.ts';
import { parseFlags } from './parse-flags.ts';

try {
  const {
    command,
    options,
  } = parseFlags(Deno.args);
  logger.debug({ command, options });

  const cliService = new CodefreshCLIService(logger);
  await cliService.init(options.cfconfigPath);

  const sourceContext = cliService.getContextByName(options.sourceContext);
  const targetContext = cliService.getContextByName(options.targetContext);

  const sourceHttpClient = new CodefreshHttpClient(
    logger,
    sourceContext.token,
    sourceContext.url,
  );
  const targetHttpClient = new CodefreshHttpClient(
    logger,
    targetContext.token,
    targetContext.url,
  );

  const [
    { activeAccountName: sourceAccountName },
    { activeAccountName: targetAccountName },
  ] = await Promise.all([
    sourceHttpClient.getCurrentUser(),
    targetHttpClient.getCurrentUser(),
  ]);

  logger.warn(
    colors.rgb24(
      `\n⚠️\tYou're about to ${
        colors.bold(command.join(' '))
      }\n\tsource account: ${
        colors.bold(sourceAccountName)
      } →\n\ttarget account: → ${colors.bold(targetAccountName)}\n`,
      COLORS.orange,
    ),
  );
  const shouldProceed = confirm(
    colors.rgb24('Do you want to proceed?', COLORS.orange),
  );

  if (!shouldProceed) {
    logger.log(colors.red('Aborting...'));
    Deno.exit(0);
  }
  logger.log(colors.green('Proceeding...'));

  const copyService = new CopyService(
    logger,
    sourceHttpClient,
    targetHttpClient,
  );

  if (command[0] === 'copy') {
    if (command[1] === 'users') {
      await copyService.copyUsers();
      Deno.exit(0);
    }

    if (command[1] === 'admins') {
      await copyService.copyAdmins();
      Deno.exit(0);
    }

    if (command[1] === 'teams') {
      await copyService.copyTeams();
      Deno.exit(0);
    }

    if (command[1] === 'rules') {
      await copyService.copyRules();
      Deno.exit(0);
    }
  }

  if (command[0] === 'compare') {
    if (command[1] === 'users') {
      await copyService.compareUsers();
      Deno.exit(0);
    }

    if (command[1] === 'admins') {
      await copyService.compareAdmins();
      Deno.exit(0);
    }

    if (command[1] === 'teams') {
      await copyService.compareTeams();
      Deno.exit(0);
    }

    if (command[1] === 'rules') {
      await copyService.compareRules();
      Deno.exit(0);
    }
  }
} catch (error) {
  logger.debug(error.stack);
  logger.error(`❌ ${error.name}: ${error.message}`);
  Deno.exit(1);
}
