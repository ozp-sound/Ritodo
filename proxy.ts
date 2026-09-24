import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "./lib/access";

const publicPaths = new Set([
  "/login", "/api/login", "/favicon.svg", "/icon-180.png", "/icon-192.png",
  "/icon-512.png", "/manifest.webmanifest", "/sw.js",
]);
const staticPaths = new Set(["/favicon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest", "/sw.js"]);

function secure(response: NextResponse | Response, path: string) {
  response.headers.set("Content-Security-Policy", "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!path.startsWith("/_next/") && !staticPaths.has(path)) response.headers.set("Cache-Control", "no-store");
  return response;
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (publicPaths.has(path) || path.startsWith("/_next/")) return secure(NextResponse.next(), path);
  try {
    checkAccess(request, process.env.NODE_ENV === "development");
    return secure(NextResponse.next(), path);
  } catch {
    if (path.startsWith("/api/")) return secure(Response.json({ error: "请先登录 Ritodo。" }, { status: 401 }), path);
    return secure(NextResponse.redirect(new URL("/login", request.url)), path);
  }
}
