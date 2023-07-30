//  API

export interface User {
  _id: string;
  userName: string;
  email: string;
  account: string[];
}

export interface CreateUserDTO {
  userDetails: string;
}

export interface Team {
  _id: string;
  name: string;
  tags: string[];
  users: User[];
  type?: 'admin' | 'default';
}

export interface CreateTeamDTO {
  tags: string[];
  name: string;
  users: string[];
}

export interface Account {
  admins: string[];
  id: string;
  name: string;
}

export interface CurrentUser extends Omit<User, 'account'> {
  account: Account[];
  activeAccountName: string;
}

interface Condition {
  Fn: string;
  args: {
    tags: string[];
  };
}

export interface Rule {
  action: string;
  resource: string;
  relatedResource?: string;
  attributes: string[];
  condition?: Condition;
  id: string;
  role: string;
}

export interface CreateRuleDTO {
  teams: string[];
  actions: string[];
  tags: string[];
  resource: string;
  relatedResource?: string;
}

//  Internal

export type Command = string[];

export interface Options {
  cfconfigPath?: string;
  sourceContext: string;
  targetContext: string;
}

export interface CLIArguments {
  command: Command;
  options: Options;
}

export interface CodefreshCLIConfigContext {
  type: string;
  name: string;
  url: string;
  token: string;
  beta: boolean;
  onPrem: boolean;
}

export interface CodefreshCLIConfig {
  contexts: Record<string, CodefreshCLIConfigContext>;
  'current-context': string;
}

export interface Diff {
  common: string[];
  added: string[];
  removed: string[];
}

export interface SuccessfullCopyResult<SourceType, ResultType> {
  source: SourceType;
  result: ResultType;
}

export interface FailedCopyResult<SourceType> {
  source: SourceType;
  // deno-lint-ignore no-explicit-any
  reason: any;
}
