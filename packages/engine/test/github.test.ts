import { describe, expect, it } from "vitest";
import { GitHub, memorySecretsPort, type HttpPort, type HttpRequest, type HttpResponse } from "../src/index.ts";

/** A fake GitHub: answers by method and path, and records what it was asked. */
function fakeGitHub(routes: Record<string, (req: HttpRequest) => Partial<HttpResponse> & { json?: unknown }>) {
  const asked: HttpRequest[] = [];
  const http: HttpPort = {
    async request(req) {
      asked.push(req);
      const path = req.url.replace(/^https:\/\/(api\.)?github\.com/, "").split("?")[0];
      const route = routes[`${req.method} ${path}`];
      if (!route) return { status: 404, headers: {}, body: "{}" };
      const r = route(req);
      return { status: r.status ?? 200, headers: r.headers ?? {}, body: r.json !== undefined ? JSON.stringify(r.json) : r.body ?? "" };
    },
  };
  return { http, asked };
}

describe("signing in to GitHub (#38)", () => {
  it("runs the device flow: pending, slow down, then the token is kept in secrets", async () => {
    const answers = [{ error: "authorization_pending" }, { error: "slow_down", interval: 10 }, { access_token: "gho_token" }];
    const { http, asked } = fakeGitHub({
      "POST /login/device/code": () => ({ json: { device_code: "dc", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 } }),
      "POST /login/oauth/access_token": () => ({ json: answers.shift() }),
      "GET /user": (req) => (req.headers["Authorization"] === "Bearer gho_token" ? { json: { login: "ada", id: 7, name: "Ada" } } : { status: 401 }),
    });
    const secrets = memorySecretsPort();
    const gh = new GitHub(http, secrets);
    expect(await gh.startDevice()).toEqual({ userCode: "ABCD-1234", verificationUri: "https://github.com/login/device", expiresIn: 900, interval: 5 });
    expect(asked[0]!.body).toBe("client_id=Ov23lixhZMZ75CiX01PR&scope=repo%20read%3Auser");
    expect(await gh.pollDevice()).toEqual({ status: "pending", interval: 5 });
    expect(await gh.pollDevice()).toEqual({ status: "pending", interval: 10 });
    expect(await gh.pollDevice()).toEqual({ status: "done", account: { login: "ada", id: 7, name: "Ada" } });
    expect(await secrets.get("github-token")).toBe("gho_token");
    expect(await gh.status()).toEqual({ signedIn: true, account: { login: "ada", id: 7, name: "Ada" } });
  });

  it("keeps polling through a lost network, and keeps a token issued just before it went (Android backgrounding)", async () => {
    let online = true;
    const answers = [{ error: "authorization_pending" }, { access_token: "gho_token" }];
    const { http: fake } = fakeGitHub({
      "POST /login/device/code": () => ({ json: { device_code: "dc", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", interval: 5 } }),
      "POST /login/oauth/access_token": () => ({ json: answers.shift() }),
      "GET /user": () => (online ? { json: { login: "ada" } } : { status: 500 }),
    });
    // The network drops right after GitHub hands over the token, before the account is looked up.
    const http: HttpPort = {
      async request(req) {
        if (!online) throw new Error("failed to lookup address information");
        const res = await fake.request(req);
        if (req.url.endsWith("/login/oauth/access_token") && res.body.includes("access_token")) online = false;
        return res;
      },
    };
    const secrets = memorySecretsPort();
    const gh = new GitHub(http, secrets);
    await gh.startDevice();
    expect(await gh.pollDevice()).toEqual({ status: "pending", interval: 5 });
    await expect(gh.pollDevice()).rejects.toMatchObject({ code: "OFFLINE" });
    await expect(gh.pollDevice()).rejects.toMatchObject({ code: "OFFLINE" });
    expect(await secrets.get("github-token")).toBeUndefined();
    online = true;
    expect(await gh.pollDevice()).toEqual({ status: "done", account: { login: "ada" } });
    expect(await secrets.get("github-token")).toBe("gho_token");
  });

  it("gives git the token for github.com only", async () => {
    const secrets = memorySecretsPort();
    await secrets.set("github-token", "gho_token");
    const gh = new GitHub(fakeGitHub({}).http, secrets);
    expect(await gh.gitAuth("https://github.com/ada/records.git")).toEqual({ origin: "https://github.com", token: "gho_token" });
    expect(await gh.gitAuth("https://gitlab.com/ada/records.git")).toBeUndefined();
    expect(await gh.gitAuth("/tmp/remote.git")).toBeUndefined();
  });

  it("forgets a token GitHub no longer accepts, and says so once", async () => {
    const secrets = memorySecretsPort();
    await secrets.set("github-token", "revoked");
    const gh = new GitHub(fakeGitHub({ "GET /user": () => ({ status: 401 }) }).http, secrets);
    expect(await gh.status()).toEqual({ signedIn: false, expired: true });
    expect(await secrets.get("github-token")).toBeUndefined();
    expect(await gh.status()).toEqual({ signedIn: false });
  });

  it("creates a private repository, and says when the name is taken", async () => {
    const secrets = memorySecretsPort();
    await secrets.set("github-token", "gho_token");
    let made = false;
    const { http, asked } = fakeGitHub({
      "POST /user/repos": () => (made ? { status: 422, json: { message: "name already exists" } } : ((made = true), { status: 201, json: { full_name: "ada/body-records", private: true, clone_url: "https://github.com/ada/body-records.git" } })),
    });
    const gh = new GitHub(http, secrets);
    expect(await gh.createRepo("body-records")).toEqual({ fullName: "ada/body-records", private: true, cloneUrl: "https://github.com/ada/body-records.git" });
    expect(JSON.parse(asked[0]!.body!)).toMatchObject({ name: "body-records", private: true, auto_init: false });
    await expect(gh.createRepo("body-records")).rejects.toMatchObject({ code: "EXISTS" });
  });

  it("reports GitHub being unreachable as OFFLINE, and stays signed in", async () => {
    const secrets = memorySecretsPort();
    await secrets.set("github-token", "gho_token");
    const gh = new GitHub({ request: async () => { throw new Error("no network"); } }, secrets);
    expect(await gh.status()).toEqual({ signedIn: true, offline: true });
    await expect(gh.repos()).rejects.toMatchObject({ code: "OFFLINE" });
  });
});
