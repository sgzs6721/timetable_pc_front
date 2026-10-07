# 微信扫码登录接入

前端已接入微信开放平台“网站应用”扫码登录，流程如下：

1. 登录页请求 `GET /auth/wechat-web/config`，返回 `enabled`、`appId`，以及可选的 `redirectUri`。
2. 用户同意协议后跳转微信 `qrconnect`，使用 `snsapi_login` scope，并携带一次性随机 `state`。
3. 微信回调 `/login/wechat?code=...&state=...`，前端校验 state 后调用 `POST /auth/login/wechat-qr`。
4. 后端用 code 换取微信身份并返回与密码登录相同结构的 `LoginVO`，前端保存 token 后进入工作台。

## 开放平台配置

- 在微信开放平台创建并审核“网站应用”，把生产域名加入授权回调域。
- 回调页面需要由 SPA 服务器回退到 `index.html`，完整地址默认为 `https://worktable.devtesting.top/login/wechat`。
- 回调地址优先使用后端 config 接口的 `redirectUri`，其次使用构建变量 `VITE_WECHAT_REDIRECT_URI`，最后才使用当前站点的 `/login/wechat`。
- `AppSecret` 只能保存在后端，不能放进 Vite 环境变量或浏览器代码。

## 后端接口契约

```json
GET /auth/wechat-web/config
{
  "code": 200,
  "data": {
    "enabled": true,
    "appId": "微信开放平台网站应用 AppID",
    "redirectUri": "https://worktable.devtesting.top/login/wechat"
  }
}
```

```json
POST /auth/login/wechat-qr
{ "code": "微信回调返回的临时 code" }
```

登录接口成功响应的 `data` 至少包含 `token`，并可包含 `role` 等 `LoginVO` 字段。后端必须校验 code、限制重放，并在服务端完成 AppSecret 交换。
