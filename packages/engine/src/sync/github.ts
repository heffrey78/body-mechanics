/**
 * The GitHub connection (#38; after writer's github.ts at e89d55c): an OAuth App's device flow, the
 * token kept in this device's secrets (the OS keychain, or the Android keystore), never in a file,
 * a log line, or the repository's git config. It knows who you are, creates the private repository
 * for your records, lists your repositories (to join from another device, #40), and gives git its
 * credentials for github.com.
 */
import type { GitAuth } from "../ports/git-port.ts";
import type { HttpPort, HttpResponse } from "../ports/http-port.ts";
import type { SecretsPort } from "../ports/secrets-port.ts";

/** Body Mechanics' OAuth App (device flow): public, and shipped in the app. */
export const GITHUB_CLIENT_ID = "Ov23lixhZMZ75CiX01PR";
/** Private repositories (to create one and push to it), and who you are. */
export const SCOPES = ["repo", "read:user"];
const TOKEN_SECRET = "github-token";
const WEB = "https://github.com";
const API = "https://api.github.com";

export type GitHubErrorCode = "NO_SIGN_IN" | "OFFLINE" | "EXISTS" | "GITHUB";

export class GitHubError extends Error {
  readonly code: GitHubErrorCode;
  constructor(code: GitHubErrorCode, message: string) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
  }
}

export interface GitHubAccount {
  login: string;
  id?: number;
  name?: string;
}

export interface DeviceCode {
  userCode: string;
  verificationUri: string;
  /** Seconds until the code expires. */
  expiresIn: number;
  /** Seconds to wait between polls. */
  interval: number;
}

export type PollResult =
  | { status: "pending"; interval: number }
  | { status: "expired" | "denied" | "none" }
  | { status: "done"; account: GitHubAccount };

export interface RepoSummary {
  fullName: string;
  private: boolean;
  cloneUrl: string;
  pushedAt?: string;
  description?: string;
}

export interface AccountStatus {
  signedIn: boolean;
  account?: GitHubAccount;
  /** Signed in, but GitHub couldn't be reached to say who as. */
  offline?: boolean;
  /** GitHub stopped accepting the stored token (revoked): it has been forgotten. */
  expired?: boolean;
}

export class GitHub {
  readonly #http: HttpPort;
  readonly #secrets: SecretsPort;
  readonly #clientId: string;
  #account: GitHubAccount | undefined;
  #expired = false;
  #device: { deviceCode: string; interval: number; expiresAt: number } | undefined;
  /** A token GitHub has issued whose account couldn't be looked up yet (the network went away between). */
  #issued: string | undefined;
  readonly #now: () => number;

  constructor(http: HttpPort, secrets: SecretsPort, { clientId = GITHUB_CLIENT_ID, now = () => Date.now() }: { clientId?: string; now?: () => number } = {}) {
    this.#http = http;
    this.#secrets = secrets;
    this.#clientId = clientId;
    this.#now = now;
  }

  async token(): Promise<string | undefined> {
    return this.#secrets.get(TOKEN_SECRET).catch(() => undefined);
  }

  async status(): Promise<AccountStatus> {
    const token = await this.token();
    if (token) {
      try {
        const account = await this.#who(token);
        if (account) return { signedIn: true, account };
      } catch {
        return { signedIn: true, ...(this.#account ? { account: this.#account } : {}), offline: true };
      }
    }
    const expired = this.#expired;
    this.#expired = false;
    return { signedIn: false, ...(expired ? { expired } : {}) };
  }

  /** Start the device flow: you enter the code at the verification address. */
  async startDevice(): Promise<DeviceCode> {
    this.#issued = undefined;
    const res = await this.#post(`${WEB}/login/device/code`, { client_id: this.#clientId, scope: SCOPES.join(" ") });
    const body = json<{ device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; error_description?: string }>(res);
    if (res.status >= 400 || !body.device_code || !body.user_code || !body.verification_uri) {
      throw new GitHubError("GITHUB", `GitHub didn't start the sign-in: ${body.error_description ?? res.status}`);
    }
    const interval = body.interval ?? 5;
    const expiresIn = body.expires_in ?? 900;
    this.#device = { deviceCode: body.device_code, interval, expiresAt: this.#now() + expiresIn * 1000 };
    return { userCode: body.user_code, verificationUri: body.verification_uri, expiresIn, interval };
  }

  /** Ask GitHub once whether the code has been entered. */
  async pollDevice(): Promise<PollResult> {
    if (this.#issued) return this.#finish(this.#issued);
    const device = this.#device;
    if (!device) return { status: "none" };
    if (this.#now() > device.expiresAt) {
      this.#device = undefined;
      return { status: "expired" };
    }
    const res = await this.#post(`${WEB}/login/oauth/access_token`, {
      client_id: this.#clientId, device_code: device.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    const body = json<{ access_token?: string; error?: string; interval?: number; error_description?: string }>(res);
    if (body.access_token) {
      this.#device = undefined;
      this.#issued = body.access_token;
      return this.#finish(body.access_token);
    }
    switch (body.error) {
      case "authorization_pending":
        return { status: "pending", interval: device.interval };
      case "slow_down":
        device.interval = body.interval ?? device.interval + 5;
        return { status: "pending", interval: device.interval };
      case "expired_token":
        this.#device = undefined;
        return { status: "expired" };
      case "access_denied":
        this.#device = undefined;
        return { status: "denied" };
      default:
        throw new GitHubError("GITHUB", `GitHub didn't finish the sign-in: ${body.error_description ?? body.error ?? res.status}`);
    }
  }

  /** Look up whose the new token is, then keep it. Offline, the token waits for the next poll. */
  async #finish(token: string): Promise<PollResult> {
    const account = await this.#who(token, { remember: false });
    this.#issued = undefined;
    if (!account) throw new GitHubError("GITHUB", "GitHub didn't accept the new sign-in. Try again.");
    await this.#secrets.set(TOKEN_SECRET, token);
    this.#account = account;
    this.#expired = false;
    return { status: "done", account };
  }

  /** Your repositories, most recently pushed first (up to 300). */
  async repos(): Promise<RepoSummary[]> {
    const out: RepoSummary[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await this.api("GET", `/user/repos?per_page=100&sort=pushed&affiliation=owner&page=${page}`);
      if (res.status >= 400) throw new GitHubError("GITHUB", `GitHub answered ${res.status} when asked for your repositories.`);
      const repos = json<{ full_name: string; description: string | null; private: boolean; pushed_at: string | null; clone_url: string }[]>(res);
      for (const r of repos) out.push({ fullName: r.full_name, private: r.private, cloneUrl: r.clone_url, ...(r.description ? { description: r.description } : {}), ...(r.pushed_at ? { pushedAt: r.pushed_at } : {}) });
      if (repos.length < 100) break;
    }
    return out;
  }

  /** A new private repository for your records (empty: the app pushes to it). */
  async createRepo(name: string): Promise<RepoSummary> {
    const res = await this.api("POST", "/user/repos", {
      name, private: true, auto_init: false, has_issues: false, has_projects: false, has_wiki: false,
      description: "Body Mechanics records (encrypted)",
    });
    if (res.status === 422) throw new GitHubError("EXISTS", `You already have a repository called ${name}.`);
    if (res.status >= 400) throw new GitHubError("GITHUB", `GitHub answered ${res.status} when asked to create the repository.`);
    const r = json<{ full_name: string; private: boolean; clone_url: string }>(res);
    return { fullName: r.full_name, private: r.private, cloneUrl: r.clone_url };
  }

  /** Credentials for git, for an https remote on github.com while signed in. */
  async gitAuth(url: string): Promise<GitAuth | undefined> {
    if (!url.startsWith(`${WEB}/`)) return undefined;
    const token = await this.token();
    return token ? { origin: WEB, token } : undefined;
  }

  /** Forget the token (it can be revoked at github.com › Settings › Applications). */
  async signOut(): Promise<void> {
    this.#device = undefined;
    this.#issued = undefined;
    this.#account = undefined;
    await this.#secrets.delete(TOKEN_SECRET);
  }

  /** A request to the GitHub API. A 401 means the token is no longer good: it's forgotten. */
  async api(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<HttpResponse> {
    const token = await this.token();
    if (!token) throw new GitHubError("NO_SIGN_IN", "Sign in to GitHub first.");
    const res = await this.#request(token, method, path, body);
    if (res.status === 401) {
      await this.#forget();
      throw new GitHubError("NO_SIGN_IN", "GitHub no longer accepts this sign-in (it was revoked). Sign in again.");
    }
    return res;
  }

  async #who(token: string, { remember = true } = {}): Promise<GitHubAccount | undefined> {
    if (remember && this.#account) return this.#account;
    const res = await this.#request(token, "GET", "/user");
    if (res.status === 401) {
      if (remember) await this.#forget();
      return undefined;
    }
    if (res.status >= 400) throw new GitHubError("GITHUB", `GitHub answered ${res.status} when asked who you are.`);
    const user = json<{ login: string; id?: number; name?: string | null }>(res);
    const account: GitHubAccount = { login: user.login, ...(typeof user.id === "number" ? { id: user.id } : {}), ...(user.name ? { name: user.name } : {}) };
    if (remember) this.#account = account;
    return account;
  }

  async #forget(): Promise<void> {
    this.#account = undefined;
    this.#expired = true;
    await this.#secrets.delete(TOKEN_SECRET).catch(() => {});
  }

  async #request(token: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<HttpResponse> {
    return this.#send({
      method, url: `${API}${path}`,
      headers: {
        Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "body-mechanics",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  #post(url: string, form: Record<string, string>): Promise<HttpResponse> {
    const body = Object.entries(form).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return this.#send({ method: "POST", url, headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "body-mechanics" }, body });
  }

  async #send(req: Parameters<HttpPort["request"]>[0]): Promise<HttpResponse> {
    try {
      return await this.#http.request(req);
    } catch (e) {
      throw new GitHubError("OFFLINE", `GitHub can't be reached right now (${e instanceof Error ? e.message : String(e)}).`);
    }
  }
}

function json<T>(res: HttpResponse): T {
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return {} as T;
  }
}
