async function equalSecret(left: string, right: string) {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let different = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) different |= a[i] ^ b[i];
  return different === 0;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) return Response.json({ error: "请在 Ritodo 页面登录。" }, { status: 403 });
  const expected = process.env.RITODO_PASSWORD;
  const session = process.env.RITODO_SESSION_TOKEN;
  if (!expected || expected.length < 16 || expected.length > 200 || !session || !/^[A-Za-z0-9_-]{32,256}$/.test(session)) {
    return Response.json({ error: "登录密钥配置无效；密码至少 16 位，会话密钥使用 32–256 位字母、数字、下划线或连字符。" }, { status: 503 });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 1_000) return Response.json({ error: "登录请求过大。" }, { status: 413 });
  const body = (() => { try { return JSON.parse(text) as { password?: unknown }; } catch { return null; } })();
  if (typeof body?.password !== "string" || body.password.length > 200 || !await equalSecret(body.password, expected)) {
    return Response.json({ error: "密码不对。" }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: {
    "Set-Cookie": `ritodo_session=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7776000`,
    "Cache-Control": "no-store",
  } });
}
