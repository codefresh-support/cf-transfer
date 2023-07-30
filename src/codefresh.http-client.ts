import { BASE_URL } from './const.ts';

import type { LoggerService } from './logger.service.ts';
import type {
  CreateRuleDTO,
  CreateTeamDTO,
  CreateUserDTO,
  CurrentUser,
  Rule,
  Team,
  User,
} from './types.ts';

export class CodefreshHttpClient {
  #logger: LoggerService;
  #baseUrl: string;
  #token: string;
  #headers: RequestInit['headers'];

  constructor(
    logger: LoggerService,
    token: string,
    baseUrl: string = BASE_URL,
  ) {
    this.#logger = logger;
    this.#token = token;
    this.#baseUrl = baseUrl;
    this.#headers = {
      'Content-Type': 'application/json',
      Authorization: this.#token,
    };
  }

  // deno-lint-ignore no-explicit-any
  #getBody(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');
    return contentType && contentType.includes('application/json')
      ? response.json()
      : response.text();
  }

  async #handleErrors(response: Response): Promise<never> {
    const body = await this.#getBody(response);
    this.#logger.debug({
      status: response.status,
      url: response.url,
      body,
    });
    throw new Error(`${response.status}, ${JSON.stringify(body)}`);
  }

  public async getCurrentUser(): Promise<CurrentUser> {
    const url = new URL(`api/user`, this.#baseUrl);
    const response = await fetch(url, {
      method: 'GET',
      headers: this.#headers,
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }

  public async getAllTeams(): Promise<Team[]> {
    const url = new URL(`api/team`, this.#baseUrl);
    const response = await fetch(url, {
      method: 'GET',
      headers: this.#headers,
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }

  public async createTeam(
    data: CreateTeamDTO,
  ): Promise<Team & { users: string[] }> {
    const url = new URL(`api/team`, this.#baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.#headers,
      body: JSON.stringify(data),
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }

  public async getAllUsersByAccount(accountId: string): Promise<User[]> {
    const url = new URL(`api/accounts/${accountId}/users`, this.#baseUrl);
    const response = await fetch(url, {
      method: 'GET',
      headers: this.#headers,
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }

  public async addUserToAccount(
    accountId: string,
    data: CreateUserDTO,
  ): Promise<User> {
    const url = new URL(`api/accounts/${accountId}/adduser`, this.#baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.#headers,
      body: JSON.stringify(data),
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }

  public async setUserAsAdmin(
    accountId: string,
    userId: string,
  ): Promise<unknown> {
    const url = new URL(
      `api/accounts/${accountId}/${userId}/admin`,
      this.#baseUrl,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: this.#headers,
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }

  public async getAllRules(): Promise<Rule[]> {
    const url = new URL(`api/abac`, this.#baseUrl);
    const response = await fetch(url, {
      method: 'GET',
      headers: this.#headers,
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }

  public async createRules(data: CreateRuleDTO[]): Promise<void> {
    const url = new URL(
      `api/abac/batch`,
      this.#baseUrl,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: this.#headers,
      body: JSON.stringify({
        create: data,
      }),
    });

    return response.ok ? response.json() : this.#handleErrors(response);
  }
}
