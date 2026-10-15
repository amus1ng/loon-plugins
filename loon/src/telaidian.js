/* 特来电「打卡领好礼」Loon runtime. CryptoJS 4.2.0 is bundled at build time. */
var TeldLoon = (function () {
  "use strict";
  var KEY = "telaidian.loon.session.v1";
  var ATTEMPT = "telaidian.loon.attempt.v1";
  var LOCK = "telaidian.loon.lock.v1";
  var CATALOG = "telaidian.loon.catalog.v1";
  var PLAN = "telaidian.loon.switch-plan.v1";
  var SWITCH_ATTEMPT = "telaidian.loon.switch-attempt.v1";
  var CHOICE = "teld_reward_choice";
  var CONFIRM = "teld_switch_confirmation";
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
    var city = query.selectedCityCode || query.cityCode || cookies.ta_cityCode;
    if (/^\d{2,12}$/.test(city || "")) merged.cityCode = city;
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
  async function snapshot(session, includeTasks) {
    var day = new Date(Date.now() + (session.offset || 0) * 1000 + 8 * 3600000).toISOString().slice(0, 10);
    var result = await http("ProSrv-GetCheckInStatus", "request", JSON.stringify({ YearMonth: Number(day.slice(0, 7).replace("-", "")) }), session);
    if (String(result.errcode) === "12904") return { kind: "inactive", day: day };
    if (String(result.state) !== "1" || !result.data) fail("query_failed");
    var data = result.data;
    var state = {
      kind: data.ChallengeStatus === 1 ? "active" : "inactive", day: day,
      id: data.ChallengeID, status: data.CompleteDailyTask, days: data.ContinuousDays, tasks: null,
      challengeStatus: data.ChallengeStatus, targetDays: data.TargetDays,
      activityId: data.ActivityId == null ? "" : String(data.ActivityId),
      rewardType: data.RewardInfo && data.RewardInfo.RewardType,
      rewardName: data.RewardInfo && typeof data.RewardInfo.RewardName === "string"
        ? data.RewardInfo.RewardName.trim().slice(0, 120) : "",
    };
    // The final successful check-in can finish the challenge. Retain its confirmation fields.
    if (includeTasks !== false) await loadTasks(session, state);
    return state;
  }
  async function loadTasks(session, state) {
    if (state.challengeStatus !== 1) return;
    var task = await http("ProSrv-GetCheckInTask", "request", JSON.stringify({ MakeUpDate: "" }), session);
    if (String(task.state) !== "1") fail("query_failed");
    state.tasks = task.data && task.data.DailyTasks;
  }
  function decide(state) {
    if (!state || state.kind !== "active") return "inactive";
    if (!state.id) return "unknown";
    if (state.status === 2) return "done";
    if (state.status !== 1 || !Array.isArray(state.tasks)) return "unknown";
    return state.tasks.length ? "manual" : "ready";
  }
  function describe(state) {
    if (!state.id) return "未获取到当前已选奖品信息。";
    function days(value) {
      var number = Number(value);
      return value != null && value !== "" && Number.isInteger(number) && number >= 0 ? number + " 天" : "未知";
    }
    var statuses = { 1: "挑战中", 2: "挑战成功", 3: "挑战失败", 4: "已放弃" };
    return "当前奖品：" + (state.rewardName || "接口未返回名称") +
      "\n挑战目标：" + days(state.targetDays) + "；已连续打卡：" + days(state.days) +
      "\n挑战状态：" + (statuses[state.challengeStatus] || "未知") +
      "；今日：" + (state.status === 2 ? "已完成" : state.status === 1 ? "未完成" : "未知");
  }
  function giftText(gift) {
    return gift.name + "（" + gift.days + " 天" + (gift.city ? "，" + gift.city : "") + "）";
  }
  function reason(gift) {
    if (gift.type === 1) return "优先考虑：充电券贴近日常充电用途，同类再优先较短挑战；需核对门槛、有效期和适用场站。";
    if (gift.type === 2 || gift.type === 3) return "次选：折扣权益需实际充电才能体现收益，应核对折扣范围、有效期及适用场站。";
    if (gift.type === 4) return "低于普通充电券：会员/黑钻权益应先核对资格、有效期与是否涉及额外开通。";
    return "当前偏好下靠后：实物与日常充电用途较远，还需核对库存、领取、收货与邮寄条件。";
  }
  function normalizeGifts(data) {
    if (!Array.isArray(data)) fail("catalog_failed");
    var result = data.map(function (item) {
      if (!item || typeof item !== "object") return null;
      return {
        id: item.ActivityId == null ? "" : String(item.ActivityId).trim(),
        name: typeof item.RewardName === "string" ? item.RewardName.trim().slice(0, 120) : "",
        days: Number(item.TargetDays), type: Number(item.RewardType),
        city: typeof item.CityName === "string" ? item.CityName.trim().slice(0, 60) : "",
      };
    }).filter(function (gift) {
      return gift && gift.id && gift.id.length <= 128 && gift.name && Number.isInteger(gift.days) && gift.days > 0 && [1, 2, 3, 4, 5].indexOf(gift.type) >= 0;
    });
    var tier = { 1: 0, 2: 1, 3: 1, 4: 2, 5: 3 };
    return result.sort(function (a, b) {
      return tier[a.type] - tier[b.type] || a.days - b.days || a.id.localeCompare(b.id);
    });
  }
  async function catalog(session) {
    var result = await http("ProSrv-GetCheckInActivityList", "request", JSON.stringify({ CityCode: session.cityCode || "" }), session);
    if (String(result.state) !== "1") fail("catalog_failed");
    return normalizeGifts(result.data);
  }
  function ownerHash(session) { return sha(sessionId(session)); }
  function challengeStamp(state) {
    return sha(JSON.stringify([state.id, state.activityId, state.challengeStatus, state.days, state.status, state.rewardName, state.rewardType, state.targetDays]));
  }
  function assertScope(session, owner) {
    if (sessionId(read(KEY) || {}) !== sessionId(session)) fail("account_changed");
    if ((read(LOCK) || {}).owner !== owner) fail("unknown_state");
  }
  function assertSwitchable(state) {
    if (!state.id || state.challengeStatus !== 1 || !state.rewardName || !Number.isInteger(state.days) || state.days < 0 ||
        !Number.isInteger(Number(state.targetDays)) || Number(state.targetDays) <= 0 ||
        [1, 2, 3, 4, 5].indexOf(Number(state.rewardType)) < 0) fail("switch_inactive");
  }
  async function giftActions(mode, session, state, owner) {
    if (mode === "gifts") {
      var gifts = await catalog(session);
      if (!gifts.length) fail("catalog_empty");
      assertScope(session, owner);
      save({ owner: ownerHash(session), createdAt: Date.now(), gifts: gifts }, CATALOG);
      var lines = gifts.map(function (gift, i) { return (i + 1) + ". " + giftText(gift) + "\n理由：" + reason(gift); });
      console.log("[特来电] 当前账号可比较奖品列表（行首数字即编号，无需其他ID）\n" + lines.join("\n\n"));
      return notify("奖品推荐：省事实用优先", describe(state) + "\n\n" + lines.slice(0, 3).join("\n") +
        "\n共 " + gifts.length + " 项，完整编号见本次脚本日志。后续任务与券使用条件未核实，不代表全程无额外要求。" +
        (Number(state.days) > 0 ? "\n你已坚持 " + state.days + " 天，更换会清零；没有充分收益依据时建议先保留当前挑战。" : "") +
        "\n不换无需操作。要换：15分钟内在插件参数 teld_reward_choice 填编号（行首数字，如 3），再运行“特来电换奖品②预览确认”。");
    }
    assertSwitchable(state);
    var attempt = sha(ownerHash(session) + ":" + state.id);
    if ((read(SWITCH_ATTEMPT) || {}).key === attempt) fail("switch_already_attempted");
    var note = "";
    if (mode === "switch") {
      // One entry: only a code matching a live preview of this account submits; anything else re-previews.
      var typed = String($persistentStore.read(CONFIRM) || "").trim(), live = read(PLAN);
      if (typed && live && typed === live.code && live.owner === ownerHash(session) && live.expiresAt > Date.now()) mode = "switch-confirm";
      else {
        mode = "switch-preview";
        if (typed) note = "填写的确认码无效或已过期，本次没有更换，已重新预览。\n";
      }
    }
    if (mode === "switch-preview") {
      var saved = read(CATALOG), choice = String($persistentStore.read(CHOICE) || "").trim();
      if (!saved || saved.owner !== ownerHash(session) || Date.now() - saved.createdAt > 900000) fail("catalog_stale");
      if (!/^[1-9]\d*$/.test(choice) || !saved.gifts[Number(choice) - 1]) fail("choice_required");
      var selected = saved.gifts[Number(choice) - 1];
      var candidates = await catalog(session);
      var matches = candidates.filter(function (gift) { return gift.id === selected.id; });
      if (matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(selected)) fail("plan_stale");
      if (state.activityId === selected.id || (state.rewardName === selected.name && Number(state.targetDays) === selected.days && Number(state.rewardType) === selected.type)) fail("same_reward");
      var ambiguous = candidates.filter(function (gift) { return gift.name === selected.name && gift.days === selected.days && gift.type === selected.type; }).length > 1;
      if (ambiguous && !state.activityId) fail("target_ambiguous");
      var pending = {
        owner: ownerHash(session), source: challengeStamp(state), target: selected,
        choice: choice, catalog: sha(JSON.stringify(saved.gifts)), requireActivityId: ambiguous,
        expiresAt: Date.now() + 600000,
        code: "清零并更换-" + sha(owner + selected.id + Math.random()).slice(0, 8).toUpperCase(),
      };
      assertScope(session, owner);
      save(pending, PLAN);
      $persistentStore.write(null, CONFIRM);
      return notify("切换预览：尚未提交", note + describe(state) + "\n目标奖品：" + giftText(selected) +
        "\n更换将放弃当前挑战，清零现有 " + state.days + " 天进度并重新开始。券门槛、后续任务和领取条件请先在官方页面核对。" +
        "\n如确认，在插件参数 teld_switch_confirmation 填入：" + pending.code +
        "\n10分钟内再次运行“特来电换奖品②预览确认”即提交更换；不换则不填。账号或挑战变化将使本次预览失效。");
    }
    var plan = read(PLAN), confirmation = String($persistentStore.read(CONFIRM) || "").trim();
    if (!plan || !confirmation || confirmation !== plan.code) fail("confirmation_required");
    // A stale plan can never be confirmed; drop it so the next run starts a fresh preview.
    function stale() { $persistentStore.write(null, PLAN); fail("plan_stale"); }
    var cachedCatalog = read(CATALOG);
    if (plan.owner !== ownerHash(session) || plan.expiresAt <= Date.now() || plan.source !== challengeStamp(state) ||
        String($persistentStore.read(CHOICE) || "").trim() !== plan.choice || !cachedCatalog ||
        cachedCatalog.owner !== plan.owner || sha(JSON.stringify(cachedCatalog.gifts)) !== plan.catalog) stale();
    var fresh = await catalog(session);
    var target = fresh.filter(function (gift) { return gift.id === plan.target.id; });
    if (target.length !== 1 || JSON.stringify(target[0]) !== JSON.stringify(plan.target)) stale();
    assertScope(session, owner);
    save({ key: attempt, at: Date.now() }, SWITCH_ATTEMPT);
    if (!$persistentStore.write(null, PLAN) || !$persistentStore.write(null, CONFIRM)) fail("storage_failed");
    // The official change dialog uses uppercase ChangeActivityID; no separate give-up/start calls.
    var changed = await http("ProSrv-GiveUpCheckInChallenge", "request", JSON.stringify({ ChangeActivityID: plan.target.id }), session);
    var after = await snapshot(session, false);
    var exactTarget = (!after.activityId || after.activityId === plan.target.id) && (!plan.requireActivityId || after.activityId === plan.target.id) &&
      after.rewardName === plan.target.name && Number(after.targetDays) === plan.target.days && Number(after.rewardType) === plan.target.type;
    if (String(changed.state) !== "1" || !changed.data || changed.data.IsSuccess !== true ||
        !after.id || after.id === state.id || after.challengeStatus !== 1 || !exactTarget) fail("switch_unverified");
    notify("奖品切换已核对", describe(after) + "\n已核对新挑战与目标奖品。本次没有提交每日打卡。");
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
      var state = await snapshot(session, false);
      if (mode === "run" || mode === "status") {
        // Status always shows the selected reward, even when the task query fails.
        try { await loadTasks(session, state); } catch (error) {
          if (mode === "status") return notify("需要手动处理", describe(state) + "\n" + explain(error));
          throw error;
        }
      }
      var action = decide(state);
      if (["gifts", "switch", "switch-preview", "switch-confirm"].indexOf(mode) >= 0) return await giftActions(mode, session, state, owner);
      if (mode === "reward") return notify(state.id ? "当前打卡奖品" : "尚无当前挑战", describe(state));
      if (action === "inactive") return notify("需要手动查看", describe(state) + "\n当前没有进行中的挑战，或挑战已经结束。");
      if (action === "done") return notify("今日已完成", describe(state));
      if (action === "unknown") {
        if (mode === "status") return notify("需要手动处理", describe(state) + "\n" + explain(new Error("unknown_state")));
        fail("unknown_state");
      }
      if (action === "manual") {
        var names = state.tasks.map(function (task) { return TASKS[task.TaskType] || "未知任务"; });
        return notify("今日有任务，已跳过", describe(state) + "\n今日任务：" + names.join("、") + "。请在特来电手动处理。");
      }
      if (mode === "status") return notify("今日可直接打卡", describe(state) + "\n当前无任务。本次仅查询，没有提交。");
      if (sessionId(read(KEY) || {}) !== sessionId(session)) fail("account_changed");
      if ((read(LOCK) || {}).owner !== owner) fail("unknown_state");
      var attemptKey = state.day + ":" + sha(sessionId(session) + ":" + state.id);
      if ((read(ATTEMPT) || {}).key === attemptKey) return notify("今日曾尝试提交", "为避免重复提交，本次跳过；请在活动页核对结果。");
      save({ key: attemptKey, at: Date.now() }, ATTEMPT);
      var result = await http("ProSrv-CompleteCheckInTask", "request", "{}", session);
      var after = await snapshot(session);
      if (String(result.state) !== "1" || !result.data || result.data.IsCheckInSuccess !== true ||
          after.id !== state.id || after.day !== state.day || after.status !== 2) fail("verification_failed");
      notify("打卡成功", describe(after) + "\n已重新查询确认今日完成。");
    } finally {
      if ((read(LOCK) || {}).owner === owner) $persistentStore.write(null, LOCK);
    }
  }
  var MESSAGES = {
    login_required: "请开启获取登录态规则，重新打开小程序的打卡领好礼；也可使用 Safari 登录活动页。",
    storage_failed: "Loon 本地存储失败，本次未继续操作。",
    account_changed: "运行时检测到账号已切换，已停止；请重新运行状态检查。",
    catalog_failed: "候选奖品查询失败或格式变化，请重新获取登录态或查看官方活动页。",
    catalog_empty: "当前没有字段完整的可比较奖品，请查看官方活动页。",
    catalog_stale: "推荐列表不存在、属于其他账号或已超过15分钟。请先运行“特来电换奖品①推荐”，获取当前账号的新列表和编号。",
    choice_required: "请在插件参数 teld_reward_choice 填入推荐日志里的编号（行首数字，如 3），再运行“特来电换奖品②预览确认”。",
    switch_inactive: "仅允许更换进行中的挑战，且必须能确认当前奖品和已打卡天数；请查看官方活动页。",
    same_reward: "目标与当前奖品相同或显示信息无法区分，已停止，避免清零进度。",
    target_ambiguous: "候选中存在同名同天数奖品，当前接口又无法提供活动标识，不能可靠核对具体目标；请在官方页面切换。",
    confirmation_required: "尚未确认清零，本次没有提交切换。请运行“特来电换奖品②预览确认”，把预览通知里的完整确认码（清零并更换-…）填入 teld_switch_confirmation，10分钟内再运行一次②。",
    plan_stale: "账号、挑战、进度、目标奖品或预览有效期发生变化，本次没有更换。请重新运行“特来电换奖品②预览确认”生成新预览；仍提示时从①推荐开始。",
    switch_already_attempted: "当前挑战已经尝试过切换，不重复提交；请在官方活动页核对结果。",
    switch_unverified: "未能确认切换到目标奖品，不自动重试；请立即在官方活动页核对当前挑战。",
    runtime_old: "当前 JavaScript 运行时不支持 BigInt，请更新 iOS 和 Loon。",
    network_failed: "请求未完成；若已发出打卡请求，请先在活动页核对，本日不自动重试。",
    http_failed: "服务器 HTTP 返回异常，请检查网络或在活动页核对。",
    response_unknown: "接口响应格式变化或无法解码，已停止操作。",
    query_failed: "活动状态查询失败，可能登录过期或服务端有限制，请重新打开活动页。",
    unknown_state: "打卡状态或任务信息不完整，已跳过。",
    verification_failed: "未能确认今日打卡完成，请在活动页查看；本日不自动重试。",
  };
  function explain(error) {
    return MESSAGES[error && error.message] || "运行未完成，请检查 Loon 配置或重新获取登录态。";
  }
  // Never log raw exceptions, HTTP bodies, cookies or token-bearing URLs.
  function reportError(error) { notify("需要手动处理", explain(error)); }
  async function main() {
    var intercepted = typeof $request !== "undefined";
    try {
      if (intercepted) capture($request);
      else {
        var mode = parseForm(typeof $argument === "string" ? $argument : "").mode || "status";
        if (mode === "clear") {
          [KEY, ATTEMPT, LOCK, CATALOG, PLAN, SWITCH_ATTEMPT, CHOICE, CONFIRM].forEach(function (key) { if (!$persistentStore.write(null, key)) fail("storage_failed"); });
          notify("已清除本插件登录态", "关闭获取规则后将不再保存新的登录态。");
        } else if (["status", "run", "reward", "gifts", "switch", "switch-preview", "switch-confirm"].indexOf(mode) >= 0) await run(mode);
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
