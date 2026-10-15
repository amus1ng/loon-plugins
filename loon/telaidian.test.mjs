import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createCipheriv, createHash } from "node:crypto";

const root = import.meta.dirname;
const bundle = fs.readFileSync(path.join(root, "telaidian.js"), "utf8");
const NOW = Date.UTC(2026, 9, 15, 2, 30);
const jwt = (data) => "fixture." + Buffer.from(JSON.stringify(data)).toString("base64url") + ".signature";
const access = jwt({ session_id: "fixture-session", exp: NOW / 1000 + 1200 });
const refresh = jwt({ session_id: "fixture-session", client_id: "fixture-client", exp: NOW / 1000 + 86400 });
const sessionKey = "telaidian.loon.session.v1";
const attemptKey = "telaidian.loon.attempt.v1";
const baseSession = { version: 1, accessToken: access, refreshToken: refresh, clientIp: "192.0.2.1", userAgent: "fixture-agent", origin: "https://c2.teld.cc" };
const success = (data) => ({ state: "1", errcode: null, data });
const status = (extra = {}) => success({ ChallengeID: "fixture-challenge", ChallengeStatus: 1, CompleteDailyTask: 1, ContinuousDays: 8, TargetDays: 30, RewardInfo: { RewardName: "测试充电券", RewardType: 1 }, ...extra });
const tasks = (list = []) => success({ DailyTasks: list });

function setup(store = new Map()) {
  const notifications = [], logs = [];
  const context = vm.createContext({
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } },
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    console: { log: (text) => logs.push(String(text)) },
    $persistentStore: {
      read: (key) => store.get(key) ?? null,
      write: (value, key) => { value == null ? store.delete(key) : store.set(key, value); return true; },
    },
    $notification: { post: (...args) => notifications.push(args) },
  });
  vm.runInContext(bundle, context);
  return { context, api: context.TeldLoon, store, notifications, logs };
}
function authenticated() { return new Map([[sessionKey, JSON.stringify(baseSession)]]); }
async function execute({ store = authenticated(), queue = [], mode = "run", request } = {}) {
  const env = setup(store), requests = [], doneValues = [];
  let transportError;
  const completed = new Promise((resolve) => {
    env.context.$argument = "mode=" + mode;
    if (request) env.context.$request = request;
    env.context.$httpClient = { post: (options, callback) => {
      requests.push(options);
      try {
        assert.equal(new URL(options.url).origin, "https://sgi.teld.cn");
        assert.equal(options.insecure, false);
        assert.equal(options["auto-redirect"], false);
        assert.equal(options["auto-cookie"], false);
        assert(queue.length, "unexpected HTTP request");
        const next = queue.shift();
        const result = typeof next === "function" ? next(options, env) : next;
        if (result?.transportError) callback(result.transportError);
        else callback(null, { status: result?.httpStatus || 200, headers: {} }, JSON.stringify(result));
      } catch (error) { transportError = error; callback("test-transport-error"); }
    } };
    env.context.$done = (value) => { doneValues.push(value); resolve(); };
    env.api.main();
  });
  await Promise.race([completed, new Promise((_, reject) => setTimeout(() => reject(new Error("missing $done")), 5000).unref())]);
  if (transportError) throw transportError;
  assert.equal(doneValues.length, 1);
  assert.equal(queue.length, 0, "expected HTTP requests were skipped");
  const visible = JSON.stringify([env.notifications, env.logs]);
  assert(!visible.includes(access) && !visible.includes(refresh), "credentials leaked to logs or notifications");
  return { ...env, requests, doneValues };
}
const sid = (options) => new URL(options.url).searchParams.get("SID");
const params = (options) => Object.fromEntries(new URLSearchParams(options.body));

const crypto = setup();
assert.equal(crypto.api.decrypt(crypto.api.encrypt(JSON.stringify({ test: "中文" }))).test, "中文");
const cipher = createCipheriv("aes-256-cbc", Buffer.from("7fb498553e3c462988c3b9573692bd5f"), Buffer.from("98d71fe589499967"));
const expectedCipher = Buffer.concat([cipher.update("fixture-text"), cipher.final()]).toString("base64");
assert.equal(crypto.api.encrypt("fixture-text"), expectedCipher);
assert.equal(crypto.api.unseal(crypto.api.seal('{"ok":true}', NOW)).ok, true);

// Compare against the actual crypt module downloaded from the official activity page.
const officialFile = path.join(root, "../recon/out/lib_teld-plugin-fas-all.umd.js");
if (fs.existsSync(officialFile)) {
  const official = fs.readFileSync(officialFile, "utf8");
  const at = official.indexOf('const e="7fb498');
  const moduleSource = official.slice(official.lastIndexOf("!function(", at), official.indexOf("\n\n!function", at));
  vm.runInContext(moduleSource, crypto.context);
  const oracle = crypto.context.TFF.common.crypt;
  oracle.rsa.setMaxDigits(129);
  const source = fs.readFileSync(path.join(root, "src/telaidian.js"), "utf8");
  const modulus = /var MODULUS = "([A-F0-9]+)"/.exec(source)[1];
  assert.equal(modulus, /new o\.rsa\.RSAKeyPair\("010001","","([A-F0-9]+)"/.exec(official)[1]);
  const key = new oracle.rsa.RSAKeyPair("010001", "", modulus);
  assert.equal(crypto.api.rsaTime("1792031400"), oracle.rsa.encryptedString(key, "1792031400").padStart(256, "0"));
  assert.equal(oracle.aes.cajess("fixture-text"), expectedCipher);
}
const signed = crypto.api.signed("ProSrv-GetCheckInStatus", "request", "{}", baseSession);
const signedParams = params(signed);
const hash = (s) => createHash("sha256").update(s).digest("hex");
assert.equal(signedParams.Sign, [hash(access), hash("fixture-client"), hash(signedParams.WVER), hash(signedParams.WTS), 2].join("_"));
const beforeTrace = { ...signedParams }; delete beforeTrace.t;
assert.equal(signedParams.t, hash(access + "rWoT8TDpIhHTqNG8mPtM1CDU7FCdqg3puZhVbo51JBg" + "SID=ProSrv-GetCheckInStatus" + JSON.stringify(beforeTrace)));

let result = await execute({ store: new Map(), queue: [] });
assert.equal(result.requests.length, 0);

const pageUrl = "https://c2.teld.cc/gencode/tffH5/SignHomepage?p=" + encodeURIComponent(crypto.api.encrypt(JSON.stringify({ teldc: 0, teldb: refresh.split(".").reverse().join("."), teldz: "192.0.2.1" })));
const pageRequest = { url: pageUrl, headers: { "User-Agent": "fixture-agent" } };
result = await execute({ store: new Map(), request: pageRequest });
assert.equal(JSON.parse(result.store.get(sessionKey)).refreshToken, refresh);

assert.equal(JSON.stringify(result.doneValues[0]), "{}");
assert.equal(result.requests.length, 0);
assert(!JSON.stringify(result.store.get(sessionKey)).includes("?p="));

const captureStore = result.store;
result = await execute({ store: captureStore, request: {
  url: "https://sgi.teld.cn/api/invoke?SID=ProSrv-GetCheckInStatus",
  headers: { Referer: "https://c2.teld.cc/", "User-Agent": "fixture-agent" },
  body: new URLSearchParams({ "X-Token": access, WRS: "WEB", WSDI: "192.0.2.1", t: "fixture-checksum" }).toString(),
} });
assert.equal(JSON.parse(result.store.get(sessionKey)).accessToken, access);

assert.equal(JSON.parse(result.store.get(sessionKey)).refreshToken, refresh);

const accountB = jwt({ session_id: "fixture-account-b", exp: NOW / 1000 + 1200 });
result = await execute({ store: new Map([[sessionKey, JSON.stringify(baseSession)]]), request: {
  url: "https://sgi.teld.cn/api/invoke?SID=ProSrv-GetCheckInStatus",
  headers: {}, body: new URLSearchParams({ "X-Token": accountB, WRS: "WEB", WSDI: "192.0.2.2" }).toString(),
} });
assert.equal(JSON.parse(result.store.get(sessionKey)).accessToken, accountB);
assert(!JSON.parse(result.store.get(sessionKey)).refreshToken, "must not mix accounts' refresh/access tokens");

const anonymous = jwt({ session_id: "", exp: NOW / 1000 + 1200 });
const anonymousUrl = "https://c2.teld.cn/gencode/tffH5/SignHomepage?p=" + encodeURIComponent(crypto.api.encrypt(JSON.stringify({ teldc: 1, teldb: anonymous })));
result = await execute({ store: new Map(), request: { url: anonymousUrl, headers: {} } });
assert(!result.store.has(sessionKey));

result = await execute({ mode: "status", queue: [status(), tasks()] });
assert.equal(result.requests.length, 2);
assert(!result.store.has(attemptKey));
assert(result.notifications.some((n) => n[2].includes("当前奖品：测试充电券") && n[2].includes("挑战目标：30 天") && n[2].includes("已连续打卡：8 天")));

result = await execute({ mode: "reward", queue: [status({ RewardInfo: { RewardName: "测试奖品 B", ReceivingAddress: "PRIVATE-ADDRESS-MARKER" } })] });
assert.equal(result.requests.length, 1, "reward detection only queries current challenge, without tasks or writes");
assert.equal(sid(result.requests[0]), "ProSrv-GetCheckInStatus");
assert(result.notifications.some((n) => n[1] === "当前打卡奖品" && n[2].includes("测试奖品 B")));
assert(!JSON.stringify(result.notifications).includes("PRIVATE-ADDRESS-MARKER"));
assert(!JSON.stringify([...result.store]).includes("PRIVATE-ADDRESS-MARKER"));
assert(!result.store.has(attemptKey));

result = await execute({ mode: "reward", queue: [status({ ChallengeStatus: 2, CompleteDailyTask: 2 })] });
assert(result.notifications.some((n) => n[2].includes("挑战成功") && n[2].includes("当前奖品：测试充电券")));
result = await execute({ mode: "reward", queue: [{ state: "0", errcode: "12904", data: null }] });
assert(result.notifications.some((n) => n[1] === "尚无当前挑战"));
result = await execute({ mode: "reward", queue: [status({ RewardInfo: null, TargetDays: undefined })] });
assert(result.notifications.some((n) => n[2].includes("接口未返回名称") && n[2].includes("挑战目标：未知")));
for (const list of [[{ TaskType: 3, IsCompleted: false }], [{ TaskType: 2, IsCompleted: true }]]) {
  result = await execute({ queue: [status(), tasks(list)] });
  assert(!result.requests.some((r) => sid(r) === "ProSrv-CompleteCheckInTask"));
}
for (const data of [{}, { DailyTasks: null }, { DailyTasks: "" }]) {
  result = await execute({ queue: [status(), success(data)] });
  assert(!result.store.has(attemptKey));
}
result = await execute({ queue: [status({ CompleteDailyTask: 2 }), tasks()] });
assert(!result.store.has(attemptKey));
result = await execute({ queue: [status({ ChallengeStatus: 2 })] });
assert.equal(result.requests.length, 1);

result = await execute({ queue: [status(), tasks(), success({ IsCheckInSuccess: true }), status({ CompleteDailyTask: 2, ContinuousDays: 9 }), tasks()] });
assert.equal(result.requests.filter((r) => sid(r) === "ProSrv-CompleteCheckInTask").length, 1);
assert(result.notifications.some((n) => n[1] === "打卡成功"));
assert(result.store.has(attemptKey));

result = await execute({ queue: [status(), tasks(), success({ IsCheckInSuccess: true }), status({ ChallengeStatus: 2, CompleteDailyTask: 2, ContinuousDays: 30 })] });
assert(result.notifications.some((n) => n[1] === "打卡成功"), "final-day success must still be confirmed after the challenge ends");

const uncertainStore = authenticated();
result = await execute({ store: uncertainStore, queue: [status(), tasks(), { transportError: "fixture-secret-error" }] });
assert(!result.notifications.some((n) => JSON.stringify(n).includes("fixture-secret-error")));
result = await execute({ store: uncertainStore, queue: [status(), tasks()] });
assert(!result.requests.some((r) => sid(r) === "ProSrv-CompleteCheckInTask"));
result = await execute({ queue: [status(), tasks(), success({ IsCheckInSuccess: true }), status(), tasks()] });
assert(!result.notifications.some((n) => n[1] === "打卡成功"));

const expiredStore = authenticated();
const expired = { ...baseSession, accessToken: jwt({ session_id: "fixture-session", exp: NOW / 1000 - 10 }) };
expiredStore.set(sessionKey, JSON.stringify(expired));
result = await execute({ store: expiredStore, mode: "status", queue: [
  (options, env) => {
    assert.equal(sid(options), "UserAPI-WEBUI-SRefreshToken");
    const decoded = env.api.unseal(params(options).refreshToken);
    assert.equal(decoded.RefreshToken, refresh.split(".").reverse().join("."));
    return success(env.api.encrypt(env.api.seal(JSON.stringify({ AccessToken: access, TokenType: 0, ClientIP: "192.0.2.1" }), NOW)));
  }, status(), tasks(),
] });
assert.equal(JSON.parse(result.store.get(sessionKey)).accessToken, access);

const rejectedRefresh = new Map([[sessionKey, JSON.stringify(expired)]]);
result = await execute({ store: rejectedRefresh, mode: "run", queue: [{ state: "0", errcode: "BIZ-User-0043", data: null }] });
assert.equal(result.requests.length, 1);
assert(!result.store.has(attemptKey));

result = await execute({ queue: [status(), tasks(), success({ IsCheckInSuccess: true }), status({ ChallengeID: "different-challenge", CompleteDailyTask: 2 }), tasks()] });
assert(!result.notifications.some((n) => n[1] === "打卡成功"));

const catalogKey = "telaidian.loon.catalog.v1";
const planKey = "telaidian.loon.switch-plan.v1";
const switchAttemptKey = "telaidian.loon.switch-attempt.v1";
const choiceKey = "teld_reward_choice";
const confirmationKey = "teld_switch_confirmation";
const giftRows = [
  { ActivityId: "physical", RewardName: "测试实物", RewardType: 5, TargetDays: 1 },
  { ActivityId: "discount", RewardName: "测试折扣", RewardType: 2, TargetDays: 3 },
  { ActivityId: "coupon-long", RewardName: "测试长周期券", RewardType: 1, TargetDays: 30 },
  { ActivityId: "coupon-short", RewardName: "测试短周期券", RewardType: 1, TargetDays: 7 },
  { ActivityId: "current", RewardName: "测试充电券", RewardType: 1, TargetDays: 30 },
];
const list = () => success(giftRows);
const afterSwitch = () => status({ ChallengeID: "new-challenge", ActivityId: "coupon-short", ContinuousDays: 0, TargetDays: 7, RewardInfo: { RewardName: "测试短周期券", RewardType: 1 } });
const isSwitch = (options) => sid(options) === "ProSrv-GiveUpCheckInChallenge";
async function preview(store = authenticated()) {
  const listed = await execute({ store, mode: "gifts", queue: [status(), list()] });
  const sorted = JSON.parse(store.get(catalogKey)).gifts;
  assert.equal(sorted[0].id, "coupon-short");
  assert.equal(sorted.at(-1).id, "physical");
  assert(!listed.requests.some(isSwitch));
  assert(listed.notifications.some((n) => n[2].includes("门槛") && n[2].includes("清零")));
  store.set(choiceKey, "1");
  const planned = await execute({ store, mode: "switch-preview", queue: [status(), list()] });
  assert(!planned.requests.some(isSwitch));
  const plan = JSON.parse(store.get(planKey));
  assert(plan.code.startsWith("清零并更换-"));
  assert(planned.notifications.some((n) => n[2].includes("清零现有 8 天") && n[2].includes(plan.code)));
  return { store, plan };
}

let prepared = await preview();
prepared.store.set(confirmationKey, prepared.plan.code);
result = await execute({ store: prepared.store, mode: "switch-confirm", queue: [status(), list(),
  (options) => {
    assert.equal(sid(options), "ProSrv-GiveUpCheckInChallenge");
    assert.deepEqual(JSON.parse(params(options).request), { ChangeActivityID: "coupon-short" });
    return success({ IsSuccess: true });
  }, afterSwitch(),
] });
assert.equal(result.requests.filter(isSwitch).length, 1);
assert(!result.requests.some((r) => sid(r) === "ProSrv-CompleteCheckInTask"));
assert(result.notifications.some((n) => n[1] === "奖品切换已核对"));
assert(!prepared.store.has(planKey) && !prepared.store.has(confirmationKey));
assert(prepared.store.has(switchAttemptKey));

result = await execute({ mode: "switch-confirm", queue: [status()] });
assert(!result.requests.some(isSwitch), "no confirmation must never change the challenge");
for (const mutation of [
  ({ store }) => store.set(confirmationKey, "wrong-code"),
  ({ store }) => store.set(choiceKey, "2"),
  ({ store, plan }) => store.set(planKey, JSON.stringify({ ...plan, expiresAt: NOW - 1 })),
  ({ store }) => store.set(sessionKey, JSON.stringify({ ...baseSession, accessToken: accountB, refreshToken: "" })),
  ({ store }) => store.set(catalogKey, JSON.stringify({ ...JSON.parse(store.get(catalogKey)), gifts: [] })),
]) {
  prepared = await preview();
  prepared.store.set(confirmationKey, prepared.plan.code);
  mutation(prepared);
  result = await execute({ store: prepared.store, mode: "switch-confirm", queue: [status()] });
  assert(!result.requests.some(isSwitch));
}
prepared = await preview(); prepared.store.set(confirmationKey, prepared.plan.code);
result = await execute({ store: prepared.store, mode: "switch-confirm", queue: [status({ ContinuousDays: 9 })] });
assert(!result.requests.some(isSwitch), "additional progress must invalidate the clearing confirmation");

prepared = await preview(); prepared.store.set(confirmationKey, prepared.plan.code);
result = await execute({ store: prepared.store, mode: "switch-confirm", queue: [status(), success(giftRows.map((g) => g.ActivityId === "coupon-short" ? { ...g, TargetDays: 99 } : g))] });
assert(!result.requests.some(isSwitch), "changed target conditions must invalidate preview");

prepared = await preview(); prepared.store.set(confirmationKey, prepared.plan.code);
result = await execute({ store: prepared.store, mode: "switch-confirm", queue: [status(), list(), { transportError: "uncertain-switch-error" }] });
assert(!result.notifications.some((n) => JSON.stringify(n).includes("uncertain-switch-error")));
assert(!prepared.store.has(planKey));
result = await execute({ store: prepared.store, mode: "switch-confirm", queue: [status()] });
assert(!result.requests.some(isSwitch), "never replay an uncertain switch");

prepared = await preview(); prepared.store.set(confirmationKey, prepared.plan.code);
result = await execute({ store: prepared.store, mode: "switch-confirm", queue: [status(), list(), success({ IsSuccess: true }), status({ ChallengeID: "another-challenge" })] });
assert(!result.notifications.some((n) => n[1] === "奖品切换已核对"), "success flag alone must not verify the wrong reward");

result = await execute({ mode: "switch-preview", queue: [status({ ChallengeStatus: 2 })] });
assert(!result.requests.some(isSwitch));
result = await execute({ mode: "gifts", queue: [status(), { state: "0", errcode: "fixture-error" }] });
assert(!result.requests.some(isSwitch));

result = await execute({ mode: "switch-preview", queue: [status()] });
assert(!result.store.has(planKey), "switch preview requires a prior account-bound catalog");
const ambiguousRows = [...giftRows, { ...giftRows[3], ActivityId: "coupon-short-copy", CityName: "另一个测试城市" }];
const ambiguousStore = authenticated();
await execute({ store: ambiguousStore, mode: "gifts", queue: [status(), success(ambiguousRows)] });
ambiguousStore.set(choiceKey, "1");
result = await execute({ store: ambiguousStore, mode: "switch-preview", queue: [status(), success(ambiguousRows)] });
assert(!result.store.has(planKey));
assert(result.notifications.some((n) => n[2].includes("同名同天数")));

result = await execute({ store: new Map([[sessionKey, JSON.stringify(baseSession)], ["unrelated-plugin", "keep"]]), mode: "clear" });
assert(!result.store.has(sessionKey));
assert.equal(result.store.get("unrelated-plugin"), "keep");

const plugin = fs.readFileSync(path.join(root, "telaidian.plugin"), "utf8");
for (const line of plugin.split(/\r?\n/).filter((l) => l.startsWith("http-request "))) {
  const regex = new RegExp(line.slice("http-request ".length).split(" script-path=")[0]);
  assert(regex.test(pageRequest.url) || regex.test("https://sgi.teld.cn/api/Invoke?SID=ProSrv-GetCheckInStatus"));
  assert(!regex.test("https://unrelated.example/"));
}
assert(plugin.includes('cron "0 9 * * *"'));
assert(plugin.includes('tag=特来电查看奖品,argument="mode=reward"'));
assert(plugin.includes('tag=特来电预览切换,argument="mode=switch-preview"'));
assert(plugin.includes('tag=特来电确认切换,argument="mode=switch-confirm"'));
assert(plugin.includes("#!input = teld_reward_choice"));
assert(!plugin.split(/\r?\n/).some((line) => line.startsWith("cron ") && /argument="[^"]*mode=switch/.test(line)));
console.log("PASS: cryptography, capture/renewal, reward detection/ranking, two-step switch, stale/account/progress guards, exact target verification, uncertain-write protection and Loon config");
