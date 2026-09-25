# Ritodo

Ritodo 是一个私人、聊天优先的手机 PWA。内置助手“理”，可以管理个人日程、课表、长期记忆和虚拟账本，并在日程前 24 小时和 4 小时发送推送提醒。

## 功能

- 像发消息一样记账、添加日程和管理记忆
- 可视化周日程，课程与个人安排平级
- 本月收入、本月支出、明细、撤销和 CSV 导出
- iPhone 主屏幕安装、深色模式和 Web Push
- 单用户密码登录，数据存在自己的 Cloudflare D1

> Ritodo 的账本不连接真实银行或钱包，只是个人记录。当前版本按中国时区计算课表和提醒。

## 技术栈

Vinext / React / Cloudflare Workers / D1 / DeepSeek API / Web Push。

## 部署

需要：Node.js 22+、Cloudflare 账号、DeepSeek API Key。Cloudflare 免费额度足够个人低频使用；DeepSeek API 按你的账户用量计费。

### 1. 安装和登录

```bash
git clone https://github.com/YOUR_NAME/Ritodo.git
cd Ritodo
npm ci
npx wrangler login
```

### 2. 自定义课表

编辑 `lib/user-config.ts`：

- `semester.firstMonday`：第 1 教学周的周一
- `semester.weeks`：学期周数
- `periodTimes`：节次时间
- `courseRules`：课程、星期、节次、周次和教室

仓库只带两条虚构示例，不包含真实个人课表。

### 3. 创建数据库

```bash
npx wrangler d1 create ritodo-data
npx wrangler d1 create ritodo-reminders
cp wrangler.example.jsonc wrangler.jsonc
cp reminder-worker/wrangler.example.jsonc reminder-worker/wrangler.jsonc
```

把两条创建命令返回的 `database_id` 分别写入两个 `wrangler.jsonc`。然后执行：

```bash
npx wrangler d1 execute ritodo-data --remote --config wrangler.jsonc --file drizzle/0000_free_amazoness.sql
npx wrangler d1 execute ritodo-reminders --remote --config reminder-worker/wrangler.jsonc --file reminder-worker/migrations/0001.sql
npx wrangler d1 execute ritodo-reminders --remote --config reminder-worker/wrangler.jsonc --file reminder-worker/migrations/0002.sql
```

### 4. 配置提醒 Worker

先生成 VAPID 密钥对：

```bash
node --input-type=module -e 'import { createECDH } from "node:crypto"; const key=createECDH("prime256v1"); key.generateKeys(); console.log("PUBLIC="+key.getPublicKey().toString("base64url")); console.log("PRIVATE="+key.getPrivateKey().toString("base64url"))'
openssl rand -hex 32
```

保存输出的公钥、私钥和 64 位共享密钥。它们不要写入 Git，只通过 Wrangler 保存：

```bash
npx wrangler secret put API_KEY --config reminder-worker/wrangler.jsonc
npx wrangler secret put VAPID_PUBLIC_KEY --config reminder-worker/wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY --config reminder-worker/wrangler.jsonc
npm run deploy:reminders
```

`API_KEY` 输入刚才生成的共享密钥。

### 5. 配置并部署主站

```bash
openssl rand -hex 16
openssl rand -hex 32
npx wrangler secret put DEEPSEEK_API_KEY --config wrangler.jsonc
npx wrangler secret put RITODO_PASSWORD --config wrangler.jsonc
npx wrangler secret put RITODO_SESSION_TOKEN --config wrangler.jsonc
npx wrangler secret put REMINDER_API_KEY --config wrangler.jsonc
npm run deploy
```

- `RITODO_PASSWORD`：使用第一条命令生成的 32 位随机密码。
- `RITODO_SESSION_TOKEN`：使用第二条命令生成的 64 位随机会话密钥。
- `REMINDER_API_KEY`：与上一步的 `API_KEY` 完全相同。

部署完成后，Wrangler 会打印主站 URL。把它写入 `reminder-worker/wrangler.jsonc` 的 `APP_URL`，再执行一次：

```bash
npm run deploy:reminders
```

### 6. 安装到 iPhone

1. 用 Safari 打开主站 URL 并登录。
2. 点“分享”→“添加到主屏幕”。
3. 从主屏幕打开 Ritodo。
4. 进入“日程”→“通知设置”，开启提醒并发送锁屏测试。

## 本地检查

复制配置模板并填入合法的 D1 ID 后：

```bash
npm test
npm run build
```

## 安全边界

- 主站是单用户应用，不支持公共注册或多用户数据隔离。
- API Key、登录密码、会话密钥和 VAPID 私钥必须使用 `wrangler secret put`。
- `wrangler.jsonc` 被 Git 忽略，不要强制提交。
- 更换 `RITODO_SESSION_TOKEN` 会让所有已登录设备退出。
- 开启 Cloudflare 账号的双重验证或 Passkey；能登录该账号的人可以管理 Worker、Secrets 和 D1 数据。

## 数据与隐私

- 账本、聊天记录、长期记忆和日程保存在部署者自己的 Cloudflare D1；推送订阅保存在提醒 Worker 的 D1。
- 使用聊天功能时，服务器会把最新 20 条对话、最多 30 条近期账目、本月收支汇总、课表、日程和长期记忆作为回答上下文发送给 DeepSeek。不要在聊天中输入密码、API Key、银行卡号或不希望交给模型处理的隐私。
- DeepSeek API Key、登录密码、会话密钥和 VAPID 私钥只由 Cloudflare Worker 在服务端读取，不会写进前端代码或 API 响应。
- 这是个人部署软件，不承诺绝对安全。请定期更新依赖；怀疑密钥泄露时，立即在对应平台撤销并重新生成。

## License

MIT
