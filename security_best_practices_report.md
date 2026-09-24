# Ritodo 安全审查报告

审查日期：2026-09-25

## 执行摘要

本次审查覆盖开源仓库、完整 Git 历史、浏览器端、Next/Vinext API、Cloudflare Workers、D1、Web Push、DeepSeek 数据流和 npm 依赖。

发布门槛：没有未处理的 Critical 或 High 问题。生产与开发依赖的 `npm audit` 结果为 0 个已知漏洞；自动化测试、lint、生产构建和本地 Cloudflare 运行时验证均通过。

安全不是绝对保证。当前仍有两个已记录的改进项：登录端点尚未配置 Cloudflare 边缘限流；CSP 已限制嵌入、对象和表单，但尚未限制脚本来源。两项都不构成当前代码中的已证实数据泄露路径。

## 已修复发现

### 1. NEXT-SECRETS-001 — Git 提交元数据包含本机身份线索

- Severity：High
- Location：发布前的根提交作者元数据
- Evidence：作者邮箱包含本机用户名和私有局域网主机形式；正文不记录原值，避免再次扩散。
- Impact：一旦推送到公开 GitHub，个人身份线索会永久进入可克隆历史。
- Fix：发布前将唯一根提交改为匿名作者，并重新扫描全部历史。
- Mitigation：使用 GitHub noreply 邮箱或仓库专用匿名身份。
- False positive notes：不是应用运行时漏洞，但属于真实的个人信息泄露。

### 2. NEXT-SUPPLY-001 / REACT-SUPPLY-001 — 依赖树存在已知漏洞

- Severity：High
- Location：`package.json` 与 `package-lock.json`
- Evidence：初次完整审计发现 React Server DOM 与构建工具链的已知漏洞。
- Impact：受影响版本可能造成拒绝服务、开发服务器文件读取或构建工具资源耗尽。
- Fix：升级 React、React DOM、React Server DOM、Vinext、Vite、Wrangler 和 Cloudflare Vite 插件，并更新传递依赖锁定版本。
- Mitigation：使用 `npm ci` 和已提交的锁文件；发布前运行 `npm audit`。
- False positive notes：多数问题只影响本地构建工具，但 React Server DOM 属于生产依赖，因此整体按 High 处理。

### 3. NEXT-INPUT-001 / NEXT-SESS-001 — 登录配置与请求边界不够严格

- Severity：Medium
- Location：`app/api/login/route.ts:9`，`lib/access.ts:1`
- Evidence：旧实现接受任意长度的已配置密码、任意格式的会话值，并直接解析未限长 JSON。
- Impact：弱配置会降低账户安全；超大登录体可消耗不必要的 Worker 资源；含分隔符的会话配置不适合拼入 Cookie。
- Fix：要求至少 16 位密码、32–256 位安全字符会话密钥，并将登录请求体限制为 1 KB。Cookie 保持 `HttpOnly; Secure; SameSite=Strict`。
- Mitigation：README 默认使用 `openssl rand` 生成高熵值。
- False positive notes：攻击者不能直接修改部署者的 Secret；这是防止部署误配置的加固。

### 4. NEXT-HEADERS-001 / REACT-HEADERS-001 — 缺少统一安全响应头

- Severity：Medium
- Location：`proxy.ts:10`
- Evidence：旧实现没有在应用层统一设置 clickjacking、MIME sniffing、referrer、权限和缓存策略。
- Impact：浏览器缺少纵深防御，私人页面可能被缓存或嵌入。
- Fix：统一设置 CSP 的 `frame-ancestors/object-src/base-uri/form-action`、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy: no-referrer`、`Permissions-Policy`，并对私人页面/API 设置 `Cache-Control: no-store`。
- Mitigation：Cloudflare 边缘也可重复设置这些头。
- False positive notes：运行时验证确认这些响应头实际出现，不只是静态配置。

## 仍需跟踪

### 5. NEXT-DOS-001 — 登录端点没有边缘限流

- Severity：Medium
- Location：`app/api/login/route.ts:9`
- Evidence：仓库内没有登录限流绑定或可验证的 Cloudflare WAF 规则。
- Impact：攻击者可重复提交错误密码，消耗 Worker 请求额度；高熵随机密码使成功猜中基本不可行。
- Fix：在 Cloudflare 为 `POST /api/login` 配置 Rate Limiting 规则。
- Mitigation：默认部署要求 32 位随机登录密码；请求体限长；比较使用 SHA-256 后的固定长度循环。
- False positive notes：账号可能已在 Cloudflare 控制台配置限流，但仓库无法证明，需要在部署环境确认。

### 6. NEXT-CSP-001 / REACT-CSP-001 — CSP 未限制 `script-src`

- Severity：Low
- Location：`proxy.ts:11`
- Evidence：当前 CSP 没有 `script-src`；这是为了避免在未验证 Vinext/React nonce 流程前破坏客户端启动。
- Impact：若未来加入原始 HTML、第三方脚本或 DOM 注入点，CSP 对脚本执行的纵深保护有限。
- Fix：未来先以 Report-Only 验证 nonce CSP，再启用严格 `script-src`。
- Mitigation：当前仓库未发现 `dangerouslySetInnerHTML`、`innerHTML`、`eval`、动态脚本注入或第三方脚本；用户文本由 React 默认转义。
- False positive notes：这不是已证实的 XSS，只是纵深防御缺口。

## 隐私数据流

- API Key、登录密码、会话密钥和 VAPID 私钥只从 Worker Secret 读取，不在客户端包、API 响应或 Git 历史中。
- 账本、聊天、记忆与日程保存在部署者的 D1；推送订阅保存在提醒 D1。
- AI 回复需要把选定的个人上下文发送给 DeepSeek。README 已明确列出范围；不应在聊天中输入密码、API Key、银行卡号或不希望由模型处理的信息。
- 能控制 Cloudflare 账号的人也能控制 Worker、Secret 和 D1。部署者应开启双重验证或 Passkey。

## 验证证据

- `npm test`：全部测试通过，包括认证、跨站拒绝、登录体限长、弱密钥拒绝、账本、日程和提醒。
- `npm run lint`：0 errors，5 个既有非安全 warning。
- `npm run build`：通过。
- `npm audit --json`：0 vulnerabilities。
- Cloudflare 本地生产运行时：未登录 `/` 返回 307 到 `/login`；未登录 `/api/ledger` 返回 401；安全头与 `no-store` 已出现。
- 全部 Git 对象、跟踪文件、构建产物和 PNG 字符串扫描：未发现真实部署地址、真实课表/账户名称、API Key 或私钥。
