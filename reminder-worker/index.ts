import { z } from "zod";
import { buildPushPayload } from "@block65/webcrypto-web-push";
type Env = { DB: D1Database; API_KEY: string; API_KEY_2?: string; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; APP_URL: string };
const jobSchema = z.object({ id: z.string().max(400), title: z.string().max(150), body: z.string().max(600), due: z.number().int(), start: z.number().int() }).strict();
type Job = z.infer<typeof jobSchema>;
type Scheduler = { revision: number; pending: number; paused: number; jobs: string; heartbeat: number };
const endpoint = z.string().max(2048).url().refine(value => {
  const u = new URL(value);
  return u.protocol === "https:" && !u.username && !u.password && !u.port &&
    (u.hostname === "web.push.apple.com" || u.hostname.endsWith(".push.apple.com") || u.hostname === "fcm.googleapis.com" || u.hostname === "updates.push.services.mozilla.com" || u.hostname.endsWith(".notify.windows.com"));
}, "不支持这个通知服务地址");
const subscriptionSchema = z.object({ endpoint, expirationTime: z.number().nullable().default(null), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }) });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), n => n.toString(16).padStart(2, "0")).join("");
const getScheduler = (env: Env) => env.DB.prepare("SELECT * FROM scheduler WHERE id=1").first<Scheduler>();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") return json({ ok: true });
    const token = request.headers.get("Authorization")?.slice(7);
    if (!token || (token !== env.API_KEY && token !== env.API_KEY_2)) return json({ error: "Unauthorized" }, 401);
    try {
      if (request.method === "GET" && path === "/status") {
        const scheduler = (await getScheduler(env))!;
        const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first<{ n: number }>();
        const latest = await env.DB.prepare("SELECT status,at,code FROM deliveries ORDER BY at DESC LIMIT 1").first();
        return json({ revision: scheduler.revision, paused: !!scheduler.paused, heartbeat: scheduler.heartbeat, devices: count!.n, publicKey: env.VAPID_PUBLIC_KEY, latest });
      }
      if (request.method !== "POST") return json({ error: "Not found" }, 404);
      const text = await request.text();
      if (text.length > 600000) return json({ error: "内容太长" }, 413);
      const input = JSON.parse(text);
      if (path === "/pause") {
        const { revision } = z.object({ revision: z.number().int().nonnegative() }).parse(input);
        const result = await env.DB.prepare("UPDATE scheduler SET paused=1,pending=MAX(pending,?) WHERE id=1 AND revision<=? AND pending<=?").bind(revision + 1, revision, revision + 1).run();
        if (!result.meta.changes) return json({ error: "另一项日程修改正在进行，请刷新后重试。" }, 409);
      } else if (path === "/sync") {
        const { revision, jobs } = z.object({ revision: z.number().int().positive(), jobs: z.array(jobSchema).max(1600) }).parse(input);
        const result = await env.DB.prepare("UPDATE scheduler SET revision=?,pending=?,paused=0,jobs=? WHERE id=1 AND revision<=? AND pending<=?").bind(revision, revision, JSON.stringify(jobs), revision, revision).run();
        if (!result.meta.changes) return json({ error: "提醒正在等待更新的日程，请刷新后重试。" }, 409);
      } else if (path === "/subscribe") {
        const sub = subscriptionSchema.parse(input);
        const id = await hash(sub.endpoint);
        const existing = await env.DB.prepare("SELECT id FROM subscriptions WHERE id=?").bind(id).first();
        const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first<{ n: number }>();
        if (!existing && count!.n >= 5) return json({ error: "最多支持 5 台设备，请先在旧设备关闭提醒。" }, 400);
        await env.DB.prepare("INSERT INTO subscriptions(id,data,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(id, JSON.stringify(sub), Date.now()).run();
        return json({ id });
      } else if (path === "/unsubscribe") {
        const { endpoint: url } = z.object({ endpoint }).parse(input);
        await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(await hash(url)).run();
      } else if (path === "/test") {
        const { endpoint: url } = z.object({ endpoint }).parse(input);
        const id = await hash(url);
        if (!await env.DB.prepare("SELECT id FROM subscriptions WHERE id=?").bind(id).first()) return json({ error: "请先开启这台设备的提醒。" }, 400);
        const recent = await env.DB.prepare("SELECT id FROM tests WHERE subscription=? AND due>?").bind(id, Date.now() - 60000).first();
        if (recent) return json({ error: "已有测试通知在等待，请稍后再试。" }, 429);
        await env.DB.prepare("INSERT INTO tests(id,subscription,due) VALUES(?,?,?)").bind(crypto.randomUUID(), id, Date.now() + 60000).run();
      } else return json({ error: "Not found" }, 404);
      return json({ ok: true });
    } catch (error) {
      return json({ error: error instanceof z.ZodError || error instanceof SyntaxError ? "提醒请求格式无效。" : "提醒服务暂时不可用，请稍后重试。" }, 400);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    const now = Date.now();
    await env.DB.prepare("UPDATE scheduler SET heartbeat=? WHERE id=1").bind(now).run();
    const scheduler = (await getScheduler(env))!;
    const subscriptions = await env.DB.prepare("SELECT * FROM subscriptions").all<{ id: string; data: string; created: number }>();
    const tests = await env.DB.prepare("SELECT * FROM tests WHERE due<=? AND due>?").bind(now, now - 600000).all<{ id: string; subscription: string; due: number }>();
    const jobs: Job[] = scheduler.paused ? [] : JSON.parse(scheduler.jobs);
    let sent = 0;
    for (const sub of subscriptions.results) {
      const testJobs = tests.results.filter(t => t.subscription === sub.id).map(t => ({ id: "test:" + t.id, title: "理 · 锁屏提醒测试", body: "看见这条，说明后台通知已到达这台设备。", due: t.due, start: t.due + 600000 }));
      for (const job of [...jobs, ...testJobs]) {
        if (sent >= 30 || job.due > now || job.due <= now - 600000 || job.start <= now || sub.created > job.due) continue;
        const id = await hash(sub.id + "|" + job.id);
        const claim = await env.DB.prepare("INSERT INTO deliveries(id,status,attempts,at) VALUES(?,'sending',1,?) ON CONFLICT(id) DO UPDATE SET status='sending',attempts=attempts+1,at=excluded.at WHERE deliveries.status!='sent' AND deliveries.at<? AND deliveries.attempts<3").bind(id, now, now - 120000).run();
        if (!claim.meta.changes) continue;
        // Recheck immediately before sending: paused or superseded snapshots never start a send.
        const latest = (await getScheduler(env))!;
        if (!job.id.startsWith("test:") && (latest.paused || latest.revision !== scheduler.revision)) {
          await env.DB.prepare("DELETE FROM deliveries WHERE id=? AND status='sending'").bind(id).run(); continue;
        }
        sent++;
        let code = 0, error = "", stage = "encrypt";
        try {
          const subscription = subscriptionSchema.parse(JSON.parse(sub.data));
          const payload = await buildPushPayload({ data: JSON.stringify({ title: job.title, body: job.body, tag: id, url: env.APP_URL }), options: { ttl: 300 } }, subscription, { subject: env.APP_URL, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
          stage = "send";
          // Workers rejects redirect:"error". Manual keeps credentials at the original endpoint.
          const response = await fetch(subscription.endpoint, { ...payload, redirect: "manual", signal: AbortSignal.timeout(10000) });
          code = response.status;
          if (code === 404 || code === 410) await env.DB.prepare("DELETE FROM subscriptions WHERE id=?").bind(sub.id).run();
          await response.body?.cancel();
        } catch (e) {
          // Retain the failure stage, never subscription URLs, keys or notification content.
          error = stage + ": " + (e instanceof Error ? e.name + ": " + e.message : "Unknown error").replace(/https?:\/\/\S+|[A-Za-z0-9_+\/-]{40,}={0,2}/g, "[redacted]").slice(0, 300);
        }
        await env.DB.prepare("UPDATE deliveries SET status=?,code=?,error=?,attempts=CASE WHEN ? IN (400,401,403,404,410) THEN 3 ELSE attempts END WHERE id=?").bind(code >= 200 && code < 300 ? "sent" : "failed", code, error || null, code, id).run();
      }
    }
    if (new Date(now).getUTCMinutes() === 0) await env.DB.batch([
      env.DB.prepare("DELETE FROM tests WHERE due<?").bind(now - 86400000),
      env.DB.prepare("DELETE FROM deliveries WHERE at<?").bind(now - 30 * 86400000),
    ]);
  },
};
