# Loon 插件合集

存放 Loon 插件、脚本和使用说明，后续可继续增加其他插件。

| 插件 | 配置 | 说明 |
| --- | --- | --- |
| 特来电「打卡领好礼」 | [`telaidian.plugin`](loon/telaidian.plugin) | [`安装与使用`](loon/README.md) |

## 特来电「打卡领好礼」

在手机 Loon 上捕获活动 H5 登录态，每天 09:00 检查已有挑战，仅在今日未打卡且没有任务时提交。

- 有邀请、开会员、买券包、评论等任务时跳过并提醒。
- 提交后重新查询确认；结果不确定时，当天不自动重复提交。
- 登录态保存在手机 Loon 本地，不包含在本仓库中。
- 不开启、更换或放弃挑战，不补卡，不处理收货地址。

## 文件

- [`loon/telaidian.plugin`](loon/telaidian.plugin)：插件配置。
- [`loon/telaidian.js`](loon/telaidian.js)：可直接使用的完整脚本，已包含加密依赖。
- [`loon/README.md`](loon/README.md)：安装、获取登录态、使用和验证范围。

本地安装：先将完整脚本导入 Loon 本地脚本库并保持名称 `telaidian.js`，再导入插件配置。安装后先执行“特来电状态检查”，确认能够查询自己的活动信息。

## 验证状态

已通过本地模拟检查，覆盖登录态捕获、续期、有任务跳过、重复提交保护和提交后复查。线上仅验证过匿名登录和匿名只读请求，尚未在真实 iPhone/Loon 中完成账号打卡验证。

09:00 使用手机本地时区，执行受 Loon、iOS 调度及网络状态影响。

## 构建与本地检查

```sh
node loon/build.mjs
node loon/telaidian.test.mjs
```

源码位于 `loon/src/`，CryptoJS 4.2.0 及其 MIT 许可证位于 `loon/vendor/`。仓库不包含本地侦察记录、浏览器配置或真实账号凭据。
