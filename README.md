# Loon 插件合集

存放 Loon 插件、脚本和使用说明，后续可继续增加其他插件。

| 插件 | 配置 | 说明 |
| --- | --- | --- |
| 特来电「打卡领好礼」 | [`telaidian.plugin`](loon/telaidian.plugin) | [`安装与使用`](loon/README.md) |

## 特来电「打卡领好礼」

在手机 Loon 上捕获活动 H5 登录态，每天 09:00 检查已有挑战，仅在今日未打卡且没有任务时提交。

- 有邀请、开会员、买券包、评论等任务时跳过并提醒。
- 可单独查询当前账号已选奖品、挑战目标、连续天数和今日完成状态。
- 可按“省事实用、优先充电权益”列出奖品推荐和理由，手动预览并确认后切换奖品。
- 提交后重新查询确认；结果不确定时，当天不自动重复提交。
- 登录态保存在手机 Loon 本地，不包含在本仓库中。
- 每日定时任务只处理打卡。手动更换奖品会清零原挑战进度，须先预览并填写一次性确认码；补卡和收货地址由用户在官方页面处理。

## 文件

- [`loon/telaidian.plugin`](loon/telaidian.plugin)：插件配置。
- [`loon/telaidian.js`](loon/telaidian.js)：可直接使用的完整脚本，已包含加密依赖。
- [`loon/README.md`](loon/README.md)：安装、获取登录态、使用和验证范围。

## 导入 Loon

在 Loon 的插件页面添加以下订阅地址，插件会自动下载完整脚本：

```text
https://raw.githubusercontent.com/amus1ng/loon-plugins/main/loon/telaidian.plugin
```

[打开特来电插件配置](https://raw.githubusercontent.com/amus1ng/loon-plugins/main/loon/telaidian.plugin)

导入后打开特来电小程序的“打卡领好礼”获取登录态，再执行“特来电状态检查”。详细步骤见[安装与使用说明](loon/README.md)。

## 验证状态

- **本地模拟检查已通过**：覆盖登录态捕获、续期、奖品推荐、切换确认与状态校验、有任务跳过、重复提交保护和提交后复查。
- **真实 iPhone/Loon 已看到**：登录态可用，“奖品推荐”能返回当前账号的完整候选列表及编号。
- **尚未独立核实**：真实账号的奖品切换结果、自动/手动打卡成功、09:00 定时触发和跨日续期。

09:00 使用手机本地时区，执行受 Loon、iOS 调度及网络状态影响。

## 构建与本地检查

```sh
node loon/build.mjs
node loon/telaidian.test.mjs
```

源码位于 `loon/src/`，CryptoJS 4.2.0 及其 MIT 许可证位于 `loon/vendor/`。仓库不包含本地侦察记录、浏览器配置或真实账号凭据。
