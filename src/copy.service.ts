import { COLORS } from './const.ts';
import { colors, diff } from './deps.ts';

import type { CodefreshHttpClient } from './codefresh.http-client.ts';
import type { LoggerService } from './logger.service.ts';
import type {
  Account,
  CreateRuleDTO,
  Diff,
  FailedCopyResult,
  Rule,
  SuccessfullCopyResult,
  Team,
  User,
} from './types.ts';

export class CopyService {
  #logger: LoggerService;
  #sourceClient: CodefreshHttpClient;
  #targetClient: CodefreshHttpClient;
  #defaultBatchSize = 20;

  constructor(
    logger: LoggerService,
    sourceClient: CodefreshHttpClient,
    targetClient: CodefreshHttpClient,
  ) {
    this.#logger = logger;
    this.#sourceClient = sourceClient;
    this.#targetClient = targetClient;
  }

  // deno-lint-ignore no-explicit-any
  async #executeInBatches<T extends (...args: any) => any>(
    funcs: T[],
    batchSize: number,
  ): Promise<PromiseSettledResult<Awaited<ReturnType<T>>>[]> {
    const results: PromiseSettledResult<Awaited<ReturnType<T>>>[] = [];
    for (let i = 0; i < funcs.length; i += batchSize) {
      const batch = funcs.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((func) => func()),
      );
      results.push(...batchResults);
    }
    return results;
  }

  async #getSourceAccount(): Promise<Account> {
    const sourceCurrentUser = await this.#sourceClient.getCurrentUser();
    return sourceCurrentUser.account.find(
      (account) => account.name === sourceCurrentUser.activeAccountName,
    )!;
  }

  async #getTargetAccount(): Promise<Account> {
    const targetCurrentUser = await this.#targetClient.getCurrentUser();
    return targetCurrentUser.account.find(
      (account) => account.name === targetCurrentUser.activeAccountName,
    )!;
  }

  #compare(source: string[], target: string[]): Diff {
    const result: Diff = {
      common: [],
      added: [],
      removed: [],
    };
    return diff(source.sort(), target.sort()).reduce(
      (acc, { type, value }) => {
        acc[type].push(value);
        return acc;
      },
      result,
    );
  }

  #logDiff(diff: Diff): void {
    this.#logger.debug({ diff });

    this.#logger.log(colors.green(`✅ Common items: ${diff.common.length}`));
    diff.added.length &&
      this.#logger.log(
        colors.blue(`+ Extra in target: ${diff.added.length}`),
        diff.added,
      );
    diff.removed.length &&
      this.#logger.log(
        colors.red(`− Missing in target: ${diff.removed.length}`),
        diff.removed,
      );
  }

  #getTeamsNames(teams: Team[]): string[] {
    return teams.map((team) => {
      switch (team.type) {
        case 'default':
          return '$default';
        case 'admin':
          return '$admin';
        default:
          return team.name;
      }
    });
  }

  public async copyTeams(): Promise<void> {
    const [sourceAccount, targetAccount] = await Promise.all([
      this.#getSourceAccount(),
      this.#getTargetAccount(),
    ]);

    const [sourceUsers, targetUsers] = await Promise.all([
      this.#sourceClient.getAllUsersByAccount(sourceAccount.id),
      this.#targetClient.getAllUsersByAccount(targetAccount.id),
    ]);

    const sourceUsersEmails = sourceUsers.map((user) => user.email);
    const targetUsersEmails = targetUsers.map((user) => user.email);

    const usersDiff = this.#compare(sourceUsersEmails, targetUsersEmails);

    if (usersDiff.removed.length > 0) {
      this.#logger.warn(
        colors.rgb24(
          `\n⚠️\tSome users are missing in target account: ${usersDiff.removed.length}.\n\tProceeding might result in data inconsistency.\n\tIt's recommended to sync users first.\n\tRun "compare users" for more details\n`,
          COLORS.orange,
        ),
      );
      const shouldProceed = confirm(
        colors.rgb24('Do you want to proceed?', COLORS.orange),
      );
      if (!shouldProceed) {
        this.#logger.log(colors.red('Aborting...'));
        Deno.exit(0);
      }
      this.#logger.log(colors.green('Proceeding...'));
    }

    const [sourceTeams, targetTeams] = await Promise.all([
      this.#sourceClient.getAllTeams(),
      this.#targetClient.getAllTeams(),
    ]);

    this.#logger.log(`Found ${sourceTeams.length} teams in source account`);

    const sourceTeamsNames = this.#getTeamsNames(sourceTeams);
    const targetTeamsNames = this.#getTeamsNames(targetTeams);

    const teamsDiff = this.#compare(sourceTeamsNames, targetTeamsNames);
    this.#logger.log(
      `Found ${teamsDiff.common.length} common teams, including "default" (aka "users") and "admin" (aka "admins")`,
    );

    if (teamsDiff.removed.length === 0) {
      this.#logger.log('✅ No teams to copy');
      return;
    }

    this.#logger.log(
      `Found ${teamsDiff.removed.length} teams missing in target account`,
    );

    const teamsToCopy = sourceTeams.filter(
      (team) => teamsDiff.removed.includes(team.name),
    );
    const copyTasks = teamsToCopy.map((sourceTeam) => {
      return this.#targetClient.createTeam.bind(this.#targetClient, {
        name: sourceTeam.name,
        tags: sourceTeam.tags,
        users: sourceTeam.users.map((user) => user._id),
      });
    });
    const copyResults = await this.#executeInBatches(
      copyTasks,
      this.#defaultBatchSize,
    );

    const successful: SuccessfullCopyResult<
      Team,
      Awaited<ReturnType<CodefreshHttpClient['createTeam']>>
    >[] = [];
    const failed: FailedCopyResult<Team>[] = [];

    teamsToCopy.forEach((team, index) => {
      const result = copyResults[index];
      if (result.status === 'fulfilled') {
        successful.push({
          source: team,
          result: result.value,
        });
      } else {
        failed.push({
          source: team,
          reason: result.reason instanceof Error
            ? result.reason.message
            : result.reason,
        });
      }
    });
    this.#logger.debug('Team copy results', { successful, failed });
    successful.length && this.#logger.log(
      `✅ Successfully copied ${successful.length} teams`,
    );
    failed.length && this.#logger.error(
      `❌ Failed to copy ${failed.length} teams`,
    );
  }

  public async copyUsers(): Promise<void> {
    const [sourceAccount, targetAccount] = await Promise.all([
      this.#getSourceAccount(),
      this.#getTargetAccount(),
    ]);

    const [sourceUsers, targetUsers] = await Promise.all([
      this.#sourceClient.getAllUsersByAccount(sourceAccount.id),
      this.#targetClient.getAllUsersByAccount(targetAccount.id),
    ]);

    this.#logger.log(
      `Found ${sourceUsers.length} users in source account`,
    );

    const sourceUsersEmails = sourceUsers.map((user) => user.email);
    const targetUsersEmails = targetUsers.map((user) => user.email);

    const usersDiff = this.#compare(sourceUsersEmails, targetUsersEmails);

    this.#logger.log(`Found ${usersDiff.common.length} common users`);

    if (usersDiff.removed.length === 0) {
      this.#logger.log('✅ No users to copy');
      return;
    }

    this.#logger.log(
      `Found ${usersDiff.removed.length} users missing in target account`,
    );

    const usersToCopy = sourceUsers.filter(
      (user) => usersDiff.removed.includes(user.email),
    );

    const copyTasks = usersToCopy.map((sourceUser) => {
      return this.#targetClient.addUserToAccount.bind(
        this.#targetClient,
        targetAccount.id,
        {
          userDetails: sourceUser.email,
        },
      );
    });
    const copyResults = await this.#executeInBatches(
      copyTasks,
      this.#defaultBatchSize,
    );

    const successful: SuccessfullCopyResult<
      User,
      Awaited<ReturnType<CodefreshHttpClient['addUserToAccount']>>
    >[] = [];
    const failed: FailedCopyResult<User>[] = [];

    usersToCopy.forEach((user, index) => {
      const result = copyResults[index];
      if (result.status === 'fulfilled') {
        successful.push({
          source: user,
          result: result.value,
        });
      } else {
        failed.push({
          source: user,
          reason: result.reason instanceof Error
            ? result.reason.message
            : result.reason,
        });
      }
    });
    this.#logger.debug('User copy results', { successful, failed });
    successful.length && this.#logger.log(
      `✅ Successfully copied ${successful.length} users`,
    );
    failed.length && this.#logger.error(
      `❌ Failed to copy ${failed.length} users`,
    );
  }

  public async copyAdmins(): Promise<void> {
    const [sourceAccount, targetAccount] = await Promise.all([
      this.#getSourceAccount(),
      this.#getTargetAccount(),
    ]);

    const sourceAdmins = sourceAccount.admins;
    const targetAdmins = targetAccount.admins;

    this.#logger.log(
      `Found ${sourceAdmins.length} admins in source account`,
    );

    const adminsDiff = this.#compare(sourceAdmins, targetAdmins);

    this.#logger.log(`Found ${adminsDiff.common.length} common admins`);

    if (adminsDiff.removed.length === 0) {
      this.#logger.log('✅ No admins to copy');
      return;
    }

    this.#logger.log(
      `Found ${adminsDiff.removed.length} admins missing in target account`,
    );

    const adminsToCopy = [...adminsDiff.removed];
    const setAsAdminTasks = adminsToCopy.map((sourceAdminId) => {
      return this.#targetClient.setUserAsAdmin.bind(
        this.#targetClient,
        targetAccount.id,
        sourceAdminId,
      );
    });
    const copyResults = await this.#executeInBatches(
      setAsAdminTasks,
      this.#defaultBatchSize,
    );

    const successful: SuccessfullCopyResult<
      string,
      Awaited<ReturnType<CodefreshHttpClient['setUserAsAdmin']>>
    >[] = [];
    const failed: FailedCopyResult<string>[] = [];

    adminsToCopy.forEach((admin, index) => {
      const result = copyResults[index];
      if (result.status === 'fulfilled') {
        successful.push({
          source: admin,
          result: result.value,
        });
      } else {
        failed.push({
          source: admin,
          reason: result.reason instanceof Error
            ? result.reason.message
            : result.reason,
        });
      }
    });
    this.#logger.debug('Admin copy results', { successful, failed });
    successful.length && this.#logger.log(
      `✅ Successfully copied ${successful.length} admins`,
    );
    failed.length && this.#logger.error(
      `❌ Failed to copy ${failed.length} admins`,
    );
  }

  #mapTeamIDs(sourceTeams: Team[], targetTeams: Team[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const sourceTeam of sourceTeams) {
      if (sourceTeam.type === 'default') {
        map.set(
          sourceTeam._id,
          targetTeams.find((target) => target.type === 'default')!._id,
        );
      } else if (sourceTeam.type === 'admin') {
        map.set(
          sourceTeam._id,
          targetTeams.find((target) => target.type === 'admin')!._id,
        );
        continue;
      } else {
        map.set(
          sourceTeam._id,
          targetTeams.find((target) => target.name === sourceTeam.name)!._id,
        );
      }
    }
    return map;
  }

  #mapRulesToCreateDTO(
    rules: Rule[],
    sourceTeams: Team[],
    targetTeams: Team[],
  ): CreateRuleDTO[] {
    const teamIdMap = this.#mapTeamIDs(sourceTeams, targetTeams);
    return rules.map((rule) => {
      return {
        teams: [teamIdMap.get(rule.role)!],
        actions: [rule.action],
        tags: rule.attributes,
        resource: rule.resource,
        ...rule.relatedResource && { relatedResource: rule.relatedResource },
      };
    });
  }

  public async copyRules(): Promise<void> {
    const [sourceTeams, targetTeams] = await Promise.all([
      this.#sourceClient.getAllTeams(),
      this.#targetClient.getAllTeams(),
    ]);

    const sourceTeamsNames = this.#getTeamsNames(sourceTeams);
    const targetTeamsNames = this.#getTeamsNames(targetTeams);
    const teamsDiff = this.#compare(sourceTeamsNames, targetTeamsNames);

    if (teamsDiff.removed.length > 0) {
      this.#logger.log(
        colors.red(
          `❌ Some teams are missing in target account: ${teamsDiff.removed.length}.\nProceeding impossible until you sync teams.\nRun "compare teams" for more details`,
        ),
      );
      this.#logger.log(colors.red('Aborting...'));
      Deno.exit(0);
    }

    const [sourceRules, targetRules] = await Promise.all([
      this.#sourceClient.getAllRules(),
      this.#targetClient.getAllRules(),
    ]);

    this.#logger.log(`Found ${sourceRules.length} rules in source account`);
    const sourceCreateRuleDTOs = this.#mapRulesToCreateDTO(
      sourceRules,
      sourceTeams,
      targetTeams,
    );
    const targetCreateRuleDTOs = this.#mapRulesToCreateDTO(
      targetRules,
      targetTeams,
      targetTeams,
    );

    const rulesDiff = this.#compare(
      sourceCreateRuleDTOs.map((rule) => JSON.stringify(rule)),
      targetCreateRuleDTOs.map((rule) => JSON.stringify(rule)),
    );

    this.#logger.log(
      `Found ${rulesDiff.common.length} common rules`,
    );

    if (rulesDiff.removed.length === 0) {
      this.#logger.log('✅ No rules to copy');
      return;
    }

    const rulesDtoToCopy: CreateRuleDTO[] = rulesDiff.removed.map((rule) =>
      JSON.parse(rule)
    );
    this.#logger.log(
      `Found ${rulesDtoToCopy.length} rules missing in target account`,
    );

    await this.#targetClient.createRules(rulesDtoToCopy);
    this.#logger.log(`✅ Successfully copied ${rulesDtoToCopy.length} rules`);
  }

  public async compareTeams(): Promise<void> {
    const [sourceTeams, targetTeams] = await Promise.all([
      this.#sourceClient.getAllTeams(),
      this.#targetClient.getAllTeams(),
    ]);

    const sourceTeamsNames = this.#getTeamsNames(sourceTeams);
    const targetTeamsNames = this.#getTeamsNames(targetTeams);

    const diff = this.#compare(sourceTeamsNames, targetTeamsNames);
    this.#logDiff(diff);
  }

  public async compareUsers(): Promise<void> {
    const [sourceAccount, tergetAccount] = await Promise.all([
      this.#getSourceAccount(),
      this.#getTargetAccount(),
    ]);

    const [sourceUsers, targetUsers] = await Promise.all([
      this.#sourceClient.getAllUsersByAccount(sourceAccount.id),
      this.#targetClient.getAllUsersByAccount(tergetAccount.id),
    ]);

    const sourceUsersEmails = sourceUsers.map((user) => user.email);
    const targetUsersEmails = targetUsers.map((user) => user.email);

    const diff = this.#compare(sourceUsersEmails, targetUsersEmails);
    this.#logDiff(diff);
  }

  public async compareAdmins(): Promise<void> {
    const [sourceAccount, targetAccount] = await Promise.all([
      this.#getSourceAccount(),
      this.#getTargetAccount(),
    ]);

    const sourceAdmins = sourceAccount.admins;
    const targetAdmins = targetAccount.admins;

    const diff = this.#compare(sourceAdmins, targetAdmins);
    this.#logDiff(diff);
  }

  public async compareRules(): Promise<void> {
    const [sourceTeams, targetTeams] = await Promise.all([
      this.#sourceClient.getAllTeams(),
      this.#targetClient.getAllTeams(),
    ]);

    const sourceTeamsNames = this.#getTeamsNames(sourceTeams);
    const targetTeamsNames = this.#getTeamsNames(targetTeams);
    const teamsDiff = this.#compare(sourceTeamsNames, targetTeamsNames);

    if (teamsDiff.removed.length > 0) {
      this.#logger.log(
        colors.red(
          `❌ Some teams are missing in target account: ${teamsDiff.removed.length}.\nProceeding impossible until you sync teams.\nRun "compare teams" for more details`,
        ),
      );
      this.#logger.log(colors.red('Aborting...'));
      Deno.exit(0);
    }

    const [sourceRules, targetRules] = await Promise.all([
      this.#sourceClient.getAllRules(),
      this.#targetClient.getAllRules(),
    ]);

    const stringifiedSourceRules = sourceRules.map((rule) =>
      JSON.stringify(
        this.#mapRulesToCreateDTO([rule], sourceTeams, targetTeams),
      )
    );
    const stringifiedTargetRules = targetRules.map((rule) =>
      JSON.stringify(
        this.#mapRulesToCreateDTO([rule], targetTeams, targetTeams),
      )
    );

    const diff = this.#compare(stringifiedSourceRules, stringifiedTargetRules);
    this.#logDiff(diff);
  }
}
