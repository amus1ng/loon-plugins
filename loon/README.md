# 特来电「打卡领好礼」Loon 插件

每天 09:00 检查已有挑战：仅在今日未打卡且没有任何任务时提交打卡。遇到邀请、开会员、买券包、评论等任务时只提醒，交给你手动处理。不会开启/更换/放弃挑战，也不会补卡或填写收货地址。

09:00 使用手机本地时区；手机时区设为上海时就是北京时间。定时执行取决于 Loon 运行状态、iOS 调度和网络，不能保证关机或系统暂停时准点执行。

## 安装包

- `telaidian.plugin`：Loon 插件配置。
- `telaidian.js`：完整脚本，已经打包 CryptoJS；不需要额外下载运行时依赖。
- `LICENSE-CryptoJS.txt`：第三方库许可证。

要求：iOS/iPadOS 15 或以上、支持脚本的 Loon。插件使用官方仍兼容的传统脚本配置语法。

## 安装

在 Loon 的插件页面添加以下地址：

```text
https://raw.githubusercontent.com/amus1ng/loon-plugins/main/loon/telaidian.plugin
```

[打开插件配置](https://raw.githubusercontent.com/amus1ng/loon-plugins/main/loon/telaidian.plugin) · [完整脚本](https://raw.githubusercontent.com/amus1ng/loon-plugins/main/loon/telaidian.js)

1. 导入后，Loon 会从本仓库自动下载 `telaidian.js`，无需手动导入 JS 文件。
2. 确认 Loon 的脚本、复写和 HTTPS 解密可用，且用于解密的 Loon 证书已按官方流程配置并信任。插件只添加 `c2.teld.cn`、`c2.teld.cc` 和 `sgi.teld.cn` 三个 HTTPS 解密域名，匹配的脚本仅处理活动页、打卡状态/任务查询及 H5 续期请求。
3. 保持两条“特来电获取登录态”规则开启，然后按下一节操作。

如需完全使用本地文件，可将 `telaidian.js` 保存到 Loon 本地脚本库，并将 `.plugin` 中六处 `script-path` 改为 `telaidian.js`。

## 获取你自己的登录态

优先使用小程序：

1. 手机开启 Loon，打开已登录的 **特来电微信小程序**。
2. 进入 **“打卡领好礼”**。如果页面已经开着，退出后重新进入，确保活动页请求重新经过 Loon。
3. 等待“登录态已保存”的本机通知。脚本只保存你打开活动页时的 H5 登录态，不读取微信其他会话。
4. 在 Loon 手动运行 **“特来电状态检查”**，确认能够查询。该入口不提交打卡。

如果只有“仅获取到短期登录态”，或小程序流量没有被匹配，可在 iPhone Safari 直接打开消费者登录页：

[登录并回到打卡领好礼](https://user.teld.cn/newlogin?source=2&redirect_uri=https%3A%2F%2Fc2.teld.cn%2Fgencode%2FtffH5%2FSignHomepage%3Ffrom%3DappHomeNav)

手动完成验证码登录后，回到活动页，必要时刷新一次。此入口已在电脑端验证能够登录并查询活动；iPhone 上仍需按上述步骤首次验证。

如果 HTTPS 解密导致小程序页面加载异常，关闭这三域名的解密后确认页面恢复，再考虑 Safari 获取方式；不要关闭系统的 TLS 校验。脚本自身的 HTTP 请求使用证书校验，不会跟随带凭据的跨域跳转。

## 使用

- **特来电状态检查**：只查询，不写入打卡数据。可能返回今日已完成、当前无任务可打卡、有任务需处理，或登录失效。
- **特来电立即打卡**：与定时脚本使用相同判断，只有无任务日会提交。
- **特来电每日打卡**：每天手机本地时间 09:00 自动执行上述判断。
- **特来电清除登录态**：只删除本插件保存的登录态和运行标记，不清空其他插件存储。清除后可关闭两条捕获规则，避免再次自动保存。

脚本会在提交后重新查询同一挑战，确认今日状态完成才通知成功。如果提交超时或复查不确定，当天不会自动重复提交；请到活动页查看。若服务端要求重新登录、IP 变化、活动接口变更或存在额外任务，脚本会停止并提醒。

仅支持当前一次捕获的账号；换账号后，新登录态会替换旧登录态。短期 AccessToken 到期时按官方 H5 协议续期，RefreshToken 失效时仍需重新获取登录态。

## 数据保存

登录态只保存在手机 Loon 的 `$persistentStore`，不上传到本项目、电脑或其他服务；脚本只向 `https://sgi.teld.cn` 的官方接口发送必要的认证信息。Loon 本地存储并非本插件另行加密的保险箱，备份或导出数据时请保护其中的登录态。

插件文件不包含任何真实账号凭据、手机号或验证码。日志和通知不输出令牌、Cookie、带登录参数的完整 URL 或完整接口响应。

## 验证范围

已完成：

- 与活动页下载的官方加密模块对比 RSA 时间戳编码和 AES 运算；SHA256 签名/请求校验值本地交叉检查。
- 用 Loon API 模拟环境验证小程序 `p` 参数捕获、短期令牌捕获、跨账号隔离、过期续期、只读模式、有任务跳过、重复提交保护和提交后复查。
- 线上匿名登录接口成功返回匿名 TokenType=1；匿名访问打卡状态接口返回 `TTP-SG-1013`，没有使用真实账号，也没有发送打卡写请求。

尚未完成：在真实 iPhone/Loon 中导入、获取你手机上的登录态，以及真实账号打卡验证。因此本包是待手机端首次验证的版本，不能宣称已经成功自动打卡。

## 开发与重新打包

源码在 `src/telaidian.js`。在电脑项目根目录执行：

```powershell
node loon/build.mjs
node loon/telaidian.test.mjs
```

CryptoJS 4.2.0 原始文件固定存放于 `vendor/crypto-js.js`，构建时校验 SHA256：

`ee02257ffbaf0a9b481c7039b0f3bb20c360c9674fe4be8b38ae709b2ea59bbe`

## 文档依据

- [Loon 官方插件格式](https://nsloon.app/docs/Plugin/)
- [Loon 官方 Script API](https://nsloon.app/docs/Script/script_api/)
- [Loon 脚本新旧语法兼容说明](https://nsloon.app/docs/Script/script_v2/)
- [CryptoJS 官方仓库与许可证](https://github.com/brix/crypto-js)

活动协议依据当前项目 `recon/out/cc_index.js` 与 `lib_teld-plugin-fas-all.umd.js` 中的官方前端代码。日期：2026-10-15。
