export function checkAccess(request: Request, development = false) {
  const url = new URL(request.url);
  const local = development && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const sessionCookie = "ritodo_session=";
  const session = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(sessionCookie))?.slice(sessionCookie.length);
  const expected = process.env.RITODO_SESSION_TOKEN;
  const authenticated = !!expected && /^[A-Za-z0-9_-]{32,256}$/.test(expected) && session === expected;
  if (!local && !authenticated) {
    throw new Error("请先登录 Ritodo。");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new Error("请求来源不匹配。");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error("不接受跨站请求。");
}
