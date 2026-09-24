"use client";
import { useEffect, useState } from "react";
type Status = { publicKey: string; paused: boolean; heartbeat: number; devices: number; latest?: { status: string; at: number; code: number } };
async function ready() {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("通知组件未就绪，请刷新页面重试。")), 12000); })]); }
  finally { clearTimeout(timer!); }
}
export default function Notifications({ refresh }: { refresh: () => Promise<void> }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function call(body?: unknown) {
    const response = await fetch("/api/push", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await response.json() as Status & { error?: string };
    if (!response.ok) throw new Error(data.error || "提醒服务连接失败。");
    return data;
  }
  async function load() {
    setStatus(await call());
    if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
      await navigator.serviceWorker.register("/sw.js");
      const registration = await ready();
      setSubscription(await registration.pushManager.getSubscription());
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
      void load().catch(e => setError(e.message));
    });
    return () => clearTimeout(timer);
  }, []);
  async function action(kind: "enable" | "disable" | "test" | "sync") {
    setBusy(true); setError(""); setMessage("");
    try {
      if (kind === "enable") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("未获得通知权限。请在 iPhone 设置的通知中允许 Ritodo，再回来开启。");
        const registration = await ready();
        const key = Uint8Array.from(atob(status!.publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const sub = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        setSubscription(sub);
        await call({ action: "subscribe", subscription: sub.toJSON() });
        await refresh();
        setMessage("已开启");
      } else if (kind === "disable" && subscription) {
        await call({ action: "unsubscribe", endpoint: subscription.endpoint });
        await subscription.unsubscribe(); setSubscription(null); setMessage("已关闭");
      } else if (kind === "test" && subscription) {
        await call({ action: "test", endpoint: subscription.endpoint });
        setMessage("测试已发送，请锁屏查看");
      } else if (kind === "sync") {
        await call({ action: "sync" }); await refresh(); setMessage("已同步");
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <details className="balance-setup notification-settings">
    <summary>通知 · {subscription ? "已开启" : "未开启"}</summary>
    <p className="calendar-help">提前 1 天、4 小时提醒</p>
    {!supported && <p className="calendar-help">请先添加到 iPhone 主屏幕</p>}
    {status?.paused && <p className="calendar-help">提醒已暂停，请同步</p>}
    {status?.latest?.status === "failed" && <p className="calendar-help">最近一次推送失败，请重新测试</p>}
    <div className="calendar-actions">
      <button className="primary-button" disabled={busy || !supported || !status} onClick={() => void action("enable")}>{subscription ? "重新开启" : "开启通知"}</button>
      {subscription && <><button className="secondary-button" disabled={busy} onClick={() => void action("test")}>测试</button><button className="secondary-button" disabled={busy} onClick={() => void action("disable")}>关闭</button></>}
      <button className="secondary-button" disabled={busy || !status} onClick={() => void action("sync")}>同步</button>
    </div>
    {message && <p role="status" className="calendar-help">{message}</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
  </details>;
}
