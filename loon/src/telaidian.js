/* 特来电「打卡领好礼」Loon runtime. CryptoJS 4.2.0 is bundled at build time. */
var TeldLoon = (function () {
  "use strict";
  var KEY = "telaidian.loon.session.v1";
  var ATTEMPT = "telaidian.loon.attempt.v1";
  var LOCK = "telaidian.loon.lock.v1";
  var API = "https://sgi.teld.cn/api/invoke?SID=";
  var AES_KEY = "7fb498553e3c462988c3b9573692bd5f";
  var AES_IV = "98d71fe589499967";
  var MODULUS = "C2D84A72668932EBE5CC2BADB5DE288E59AD587775C1E45F33F6CC9DAB376C793AFF12050C0648D5C3016F685B9F4FA2460A59B6B07793808B4E68A883CA2830FD7895C66F68F64A829DB99DEDE978EC2E04711184A872C1F43956B1B72CFA803C1D677BAE386209368B3F3ED7A8CB06BEC64B0D0369EE62A49E6B417FC55959";
  var TITLE = "特来电打卡";
  var TASKS = { 1: "邀请新用户", 2: "好友助力", 3: "开通会员", 4: "购买券包", 5: "电站评论" };

  function fail(code) { throw new Error(code); }
  function sha(text) { return CryptoJS.SHA256(String(text)).toString(CryptoJS.enc.Hex); }
  function json(text) { return JSON.parse(text); }
  function read(key) {
    var raw = $persistentStore.read(key);
    if (!raw) return null;
    try { return json(raw); } catch (_) { return null; }
  }
  function save(value, key) {
    if (!$persistentStore.write(JSON.stringify(value), key)) fail("storage_failed");
  }
  function reverse(token) { return String(token).split(".").reverse().join("."); }
  function jwt(token) {
    try {
      var part = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      return json(CryptoJS.enc.Base64.parse(part).toString(CryptoJS.enc.Utf8));
    } catch (_) { return {}; }
  }
  function encrypt(text, key, iv) {
    return CryptoJS.AES.encrypt(String(text), CryptoJS.enc.Utf8.parse(key || AES_KEY), {
      iv: CryptoJS.enc.Utf8.parse(iv || AES_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    }).ciphertext.toString(CryptoJS.enc.Base64);
  }
  function decrypt(text, key, iv) {
    return json(CryptoJS.AES.decrypt(String(text), CryptoJS.enc.Utf8.parse(key || AES_KEY), {
      iv: CryptoJS.enc.Utf8.parse(iv || AES_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8));
  }
  function seal(text, now) {
    var uts = String(Math.round((now || Date.now()) / 1000));
    var uver = encrypt(uts).slice(0, 16);
    var digits = "";
    for (var i = 0; i < 10; i++) digits += Math.floor(Math.random() * 10);
    return JSON.stringify({ Data: encrypt(text, uts + "000000", uver), UTS: uts, UVER: uver, UUID: String(now || Date.now()) + digits });
  }
  function unseal(value) {
    if (typeof value === "string") {
      try { value = json(value); } catch (_) { value = decrypt(value); }
    }
    if (value && value.Data && value.UTS && value.UVER) {
      return decrypt(value.Data, String(value.UTS) + "000000", value.UVER);
    }
    return value;
  }
  function rsaTime(text) {
    // Same RSA PKCS#1 v1.5 public-key timestamp encoding as the official H5.
    // Random padding protects no secret here; this follows the H5's Math.random scheme.
    if (typeof BigInt !== "function") fail("runtime_old");
    var le = [], i;
    for (i = text.length - 1; i >= 0; i--) le.push(text.charCodeAt(i));
    le.push(0);
    while (le.length < 126) le.push(Math.floor(Math.random() * 254) + 1);
    le.push(2, 0);
    var n = BigInt("0x" + MODULUS), base = BigInt(0), result = BigInt(1), exp = BigInt(65537);
    for (i = 127; i >= 0; i--) base = (base << BigInt(8)) + BigInt(le[i]);
    while (exp > BigInt(0)) {
      if (exp & BigInt(1)) result = result * base % n;
      base = base * base % n;
      exp >>= BigInt(1);
    }
    return result.toString(16).padStart(256, "0");
  }
  function signed(sid, field, value, session) {
    session = session || {};
    var timestamp = String(Math.round(Date.now() / 1000) + (session.offset || 0));
    var wver = rsaTime(timestamp), token = session.accessToken || "";
    var client = jwt(session.refreshToken).client_id;
    var hashes = [], type = 0, data = {};
    if (token) { hashes.push(sha(token)); type = client ? 2 : 3; }
    else if (client) type = 1;
    if (client) hashes.push(sha(client));
    hashes.push(sha(wver), sha(timestamp), type);
    data[field] = value;
    data["X-Token"] = token;
    data.WTS = timestamp;
    data.WVER = wver;
    data.WSDI = session.clientIp || "";
    data.WRS = "WEB";
    data.WCOI = "";
    data.WCOL = "";
    data.Sign = hashes.join("_");
    // H5 includes this public checksum outside its Teld-product cookie mode.
    if (session.includeTraceHash !== false) {
      data.t = sha(token + "rWoT8TDpIhHTqNG8mPtM1CDU7FCdqg3puZhVbo51JBg" + "SID=" + sid + JSON.stringify(data));
    }
    return { url: API + sid, body: form(data) };
  }
  function form(data) {
    return Object.keys(data).map(function (key) { return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]); }).join("&");
  }
  function parseForm(text) {
    var result = {};
    String(text || "").split("&").forEach(function (item) {
      var at = item.indexOf("=");
      if (at < 0) return;
      result[decodeURIComponent(item.slice(0, at).replace(/\+/g, " "))] = decodeURIComponent(item.slice(at + 1).replace(/\+/g, " "));
    });
    return result;
  }
  function header(headers, name) {
    var keys = Object.keys(headers || {});
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === name.toLowerCase()) return headers[keys[i]];
    return "";
  }
  function parseCookies(text) {
    var result = {};
    String(text || "").split(";").forEach(function (pair) {
      var at = pair.indexOf("=");
      if (at < 0) return;
      var key = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
      try { result[key] = decodeURIComponent(value); } catch (_) { result[key] = value; }
    });
    return result;
  }
  function sessionId(session) {
    return String(jwt(session.accessToken).session_id || jwt(session.refreshToken).session_id || "");
  }
  function capture(request) {
    if (header(request.headers, "X-Teld-Loon") === "1") return false;
    var match = /^https:\/\/(c2\.teld\.(?:cn|cc)|sgi\.teld\.cn)\/(.*)$/i.exec(request.url || "");
    if (!match) return false;
    var isPage = match[2].split("?")[0] === "gencode/tffH5/SignHomepage";
    var query = parseForm((request.url.split("?")[1] || "").split("#")[0]);
    if (!isPage && !/^(ProSrv-GetCheckIn(?:Status|Task)|UserAPI-WEBUI-SRefreshToken)$/.test(query.SID || "")) return false;
    var existing = read(KEY) || {}, candidate = {}, cookies = parseCookies(header(request.headers, "Cookie"));
    if (cookies.teldc === "0" && cookies.teldb) {
      candidate.refreshToken = cookies.teldb;
      candidate.accessToken = cookies.telda || "";
      candidate.clientIp = cookies.teldz || "";
    }
    if (isPage && query.p) {
      var info = decrypt(query.p);
      if (String(info.teldc) === "0" && info.teldb) {
        candidate = { refreshToken: reverse(info.teldb), clientIp: info.teldz || "" };
      }
    }
    var body = parseForm(request.body);
    if (!isPage && body.WRS === "WEB") {
      if (body["X-Token"] && jwt(body["X-Token"]).session_id) candidate.accessToken = body["X-Token"];
      if (body.WSDI) candidate.clientIp = body.WSDI;
      candidate.includeTraceHash = Object.prototype.hasOwnProperty.call(body, "t");
      if (query.SID === "UserAPI-WEBUI-SRefreshToken" && body.refreshToken) {
        var decoded = unseal(body.refreshToken);
        if (decoded && decoded.RefreshToken) candidate.refreshToken = reverse(decoded.RefreshToken);
      }
    }
    var newId = sessionId(candidate);
    if (!newId) return false; // Reject anonymous sessions, including anonymous p links.
    if (existing && sessionId(existing) !== newId) existing = {};
    var merged = Object.assign({}, existing, candidate);
    if (merged.accessToken && String(jwt(merged.accessToken).session_id || "") !== newId) merged.accessToken = "";
    if (merged.refreshToken && String(jwt(merged.refreshToken).session_id || "") !== newId) merged.refreshToken = "";
    merged.userAgent = header(request.headers, "User-Agent") || merged.userAgent || "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148";
    var origin = /https:\/\/c2\.teld\.(?:cn|cc)/i.exec(isPage ? request.url : header(request.headers, "Referer"));
    merged.origin = origin ? origin[0] : (merged.origin || "https://c2.teld.cn");
    merged.version = 1;
    merged.capturedAt = Date.now();
    var changed = existing.refreshToken !== merged.refreshToken || !sessionId(existing);
    save(merged, KEY);
    if (changed || (!existing.accessToken && merged.accessToken)) {
      notify(merged.refreshToken ? "登录态已保存" : "仅获取到短期登录态", merged.refreshToken
        ? "可在 Loon 手动运行“状态检查”；登录态仅保存在本机。"
        : "尚无续期凭据。请重新打开小程序里的打卡领好礼，或用 Safari 登录活动页。");
    }
    return true;
  }
  function notify(subtitle, message) {
    console.log("[特来电] " + subtitle + "：" + message);
    $notification.post(TITLE, subtitle, message);
  }
  function http(sid, field, value, session) {
    var request = signed(sid, field, value, session);
    request.timeout = 15000;
    request.insecure = false;
    request["auto-redirect"] = false;
    request["auto-cookie"] = false;
    request.headers = {
      "Content-Type": "application/x-www-form-urlencoded", "X-Teld-Loon": "1",
      "User-Agent": session.userAgent, Origin: session.origin,
      Referer: session.origin + "/gencode/tffH5/SignHomepage",
    };
    return new Promise(function (resolve, reject) {
      $httpClient.post(request, function (error, response, data) {
        if (error) return reject(new Error("network_failed"));
        if (!response || response.status !== 200) return reject(new Error("http_failed"));
        try {
          var result = json(data);
          if (!result || typeof result !== "object") fail("response_unknown");
          if (String(result.state) === "1" && result.data != null) result.data = unseal(result.data);
          var date = Date.parse(header(response.headers, "Date"));
          if (Number.isFinite(date)) session.offset = Math.round((date - Date.now()) / 1000);
          resolve(result);
        } catch (_) { reject(new Error("response_unknown")); }
      });
    });
  }
  async function ensureAccess(session) {
    var identity = sessionId(session);
    if (!identity) fail("login_required");
    var token = jwt(session.accessToken);
    if (token.session_id && Number(token.exp) > Date.now() / 1000 + (session.offset || 0) + 90) return;
    if (!session.refreshToken) fail("login_required");
    var payload = { DeviceType: "WEB", ReqSource: 100, RefreshToken: reverse(session.refreshToken), ClientIP: session.clientIp || "" };
    var result = await http("UserAPI-WEBUI-SRefreshToken", "refreshToken", seal(JSON.stringify(payload)), session);
    var updated = result.data;
    if (String(result.state) !== "1" || !updated || Number(updated.TokenType) !== 0 ||
        String(jwt(updated.AccessToken).session_id || "") !== identity) fail("login_required");
    if (sessionId(read(KEY) || {}) !== identity) fail("account_changed");
    session.accessToken = updated.AccessToken;
    // The H5 retains its existing refresh cookie; do the same unless recaptured by the user.
    if (updated.ClientIP) session.clientIp = updated.ClientIP;
    save(session, KEY);
  }
  async function snapshot(session) {
    var day = new Date(Date.now() + (session.offset || 0) * 1000 + 8 * 3600000).toISOString().slice(0, 10);
    var result = await http("ProSrv-GetCheckInStatus", "request", JSON.stringify({ YearMonth: Number(day.slice(0, 7).replace("-", "")) }), session);
    if (String(result.errcode) === "12904") return { kind: "inactive", day: day };
    if (String(result.state) !== "1" || !result.data) fail("query_failed");
    var data = result.data;
    var state = {
      kind: data.ChallengeStatus === 1 ? "active" : "inactive", day: day,
      id: data.ChallengeID, status: data.CompleteDailyTask, days: data.ContinuousDays, tasks: null,
    };
    // The final successful check-in can finish the challenge. Retain its confirmation fields.
    if (data.ChallengeStatus !== 1) return state;
    var task = await http("ProSrv-GetCheckInTask", "request", JSON.stringify({ MakeUpDate: "" }), session);
    if (String(task.state) !== "1") fail("query_failed");
    state.tasks = task.data && task.data.DailyTasks;
    return state;
  }
  function decide(state) {
    if (!state || state.kind !== "active") return "inactive";
    if (!state.id) return "unknown";
    if (state.status === 2) return "done";
    if (state.status !== 1 || !Array.isArray(state.tasks)) return "unknown";
    return state.tasks.length ? "manual" : "ready";
  }
  async function run(mode) {
    var session = read(KEY);
    if (!session) fail("login_required");
    var lease = read(LOCK);
    if (lease && lease.until > Date.now()) return notify("已有任务运行中", "请等待当前任务结束。");
    var owner = String(Date.now()) + Math.random();
    save({ owner: owner, until: Date.now() + 120000 }, LOCK);
    try {
      await ensureAccess(session);
      var state = await snapshot(session), action = decide(state);
      if (action === "inactive") return notify("需要手动查看", "当前没有进行中的挑战，或挑战已经结束。");
      if (action === "done") return notify("今日已完成", "连续打卡 " + (state.days || 0) + " 天。");
      if (action === "unknown") fail("unknown_state");
      if (action === "manual") {
        var names = state.tasks.map(function (task) { return TASKS[task.TaskType] || "未知任务"; });
        return notify("今日有任务，已跳过", names.join("、") + "。请在特来电手动处理。");
      }
      if (mode === "status") return notify("今日可直接打卡", "当前无任务、今日未完成。本次仅查询，没有提交。");
      if (sessionId(read(KEY) || {}) !== sessionId(session)) fail("account_changed");
      if ((read(LOCK) || {}).owner !== owner) fail("unknown_state");
      var attemptKey = state.day + ":" + sha(sessionId(session) + ":" + state.id);
      if ((read(ATTEMPT) || {}).key === attemptKey) return notify("今日曾尝试提交", "为避免重复提交，本次跳过；请在活动页核对结果。");
      save({ key: attemptKey, at: Date.now() }, ATTEMPT);
      var result = await http("ProSrv-CompleteCheckInTask", "request", "{}", session);
      var after = await snapshot(session);
      if (String(result.state) !== "1" || !result.data || result.data.IsCheckInSuccess !== true ||
          after.id !== state.id || after.day !== state.day || after.status !== 2) fail("verification_failed");
      notify("打卡成功", "已重新查询确认，连续打卡 " + (after.days || 0) + " 天。");
    } finally {
      if ((read(LOCK) || {}).owner === owner) $persistentStore.write(null, LOCK);
    }
  }
  function reportError(error) {
    var messages = {
      login_required: "请开启获取登录态规则，重新打开小程序的打卡领好礼；也可使用 Safari 登录活动页。",
      storage_failed: "Loon 本地存储失败，本次未继续操作。",
      account_changed: "运行时检测到账号已切换，已停止；请重新运行状态检查。",
      runtime_old: "当前 JavaScript 运行时不支持 BigInt，请更新 iOS 和 Loon。",
      network_failed: "请求未完成；若已发出打卡请求，请先在活动页核对，本日不自动重试。",
      http_failed: "服务器 HTTP 返回异常，请检查网络或在活动页核对。",
      response_unknown: "接口响应格式变化或无法解码，已停止操作。",
      query_failed: "活动状态查询失败，可能登录过期或服务端有限制，请重新打开活动页。",
      unknown_state: "打卡状态或任务信息不完整，已跳过。",
      verification_failed: "未能确认今日打卡完成，请在活动页查看；本日不自动重试。",
    };
    // Never log raw exceptions, HTTP bodies, cookies or token-bearing URLs.
    notify("需要手动处理", messages[error && error.message] || "运行未完成，请检查 Loon 配置或重新获取登录态。");
  }
  async function main() {
    var intercepted = typeof $request !== "undefined";
    try {
      if (intercepted) capture($request);
      else {
        var mode = parseForm(typeof $argument === "string" ? $argument : "").mode || "status";
        if (mode === "clear") {
          [KEY, ATTEMPT, LOCK].forEach(function (key) { if (!$persistentStore.write(null, key)) fail("storage_failed"); });
          notify("已清除本插件登录态", "关闭获取规则后将不再保存新的登录态。");
        } else if (mode === "status" || mode === "run") await run(mode);
        else fail("unknown_state");
      }
    } catch (error) { reportError(error); }
    finally { if (intercepted) $done({}); else $done(); }
  }
  return {
    main: main, capture: capture, signed: signed, seal: seal, unseal: unseal,
    encrypt: encrypt, decrypt: decrypt, rsaTime: rsaTime, jwt: jwt,
    decide: decide, http: http, keys: { session: KEY, attempt: ATTEMPT, lock: LOCK },
  };
})();

if (typeof $done === "function") TeldLoon.main();
