import { useCallback, useEffect, useRef, useState } from "react";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const METRICS_REFRESH_MS = 5000;
const TAPE_LIMIT = 60;

/** Runtime-tunable parameters (GET /api/metrics → tunables). One shared set:
 *  5 fields apply to both modes, trigger/expiration are #21-only, the lead
 *  pair is #20-only. */
export interface Tunables {
  per_side_size: number;
  per_side_price: number;
  gtd_after_close_s: number;
  trigger_offset_s: number;
  expiration_window_s: number;
  min_lead_time_s: number;
  max_lead_time_s: number;
  per_window_max_usd: number;
  per_day_loss_pct: number;
}

/** Per-asset сводка (один инструмент: BTC/ETH/SOL/XRP). */
export interface AssetStats {
  bids_sent: number;
  fills: number;
  fill_rate: number;
  windows_caught: number;
  pending: number;
  pnl_usd: number;
  wins: number;
  losses: number;
  active_windows: number;
  /** Среднее submit→fill только по выигрышным сделкам, ms. */
  avg_fill_delay_wins_ms: number;
  /** Среднее положение fill относительно close окна (выигрышные), сек. null — нет данных. */
  avg_window_second_wins: number | null;
  /** Realtime bid/ask spread (сумма up+down), $. null — стакан недоступен. */
  spread: number | null;
}

/** Серия проигрышных сделок подряд — для полукруглого gauge. */
export interface LossStreak {
  current: number;
  scale_max: number;
  top5: number[];
}

/** Subset of GET /api/metrics consumed by the dashboard. */
export interface Metrics {
  status: string;
  mode: string;
  uptime_seconds: number;
  risk: { balance: number | null; halt: { active: boolean; reason: string } };
  capital: { balance_usd: number | null };
  pnl: {
    realized_pnl_usd: number;
    markets_resolved: number;
    wins: number;
    losses: number;
    win_rate: number;
    loss_streak: LossStreak;
  };
  orders: {
    bids_sent: number;
    fills: number;
    fill_rate: number;
    windows_caught: number;
    pending: number;
    avg_fill_delay_ms: number;
    avg_fill_delay_wins_ms: number;
    /** Среднее положение fill относительно close окна, сек (− до close, + после).
     *  Сравнимо между #21 и #20. null — нет filled-ордеров. */
    avg_window_second: number | null;
    avg_window_second_wins: number | null;
  };
  scheduler: { ticks: number; fires: number; halted: boolean };
  /** Per-mode enable flags from the kill switch ({window_switch, pre_fill, ...}). */
  modes: Record<string, boolean>;
  active_windows: number;
  by_asset: Record<string, AssetStats>;
  /** 24 часовых бина выигрышных fill'ов по Киеву, на каждый инструмент. */
  wins_by_hour: Record<string, number[]>;
  /** Empty object {} when the runtime tuner is not running. */
  tunables?: Tunables | Record<string, never>;
}

/** Server → client frame from /ws/dashboard. */
export interface WsFrame {
  type: string;
  ts: number;
  data: Record<string, unknown>;
}

/** Polls /api/metrics every 5s (matches backend metrics_refresh_ms). */
export function useMetrics(): {
  metrics: Metrics | null;
  error: string | null;
} {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async (): Promise<void> => {
      try {
        const r = await fetch(`${API_URL}/api/metrics`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as Metrics;
        if (alive) {
          setMetrics(body);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void poll();
    const id = setInterval(() => void poll(), METRICS_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { metrics, error };
}

/** Maintains a live WS connection; exposes the most recent frames (newest first). */
export function useEventStream(): { frames: WsFrame[]; connected: boolean } {
  const [frames, setFrames] = useState<WsFrame[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const wsUrl = `${API_URL.replace(/^http/, "ws")}/ws/dashboard`;

    const connect = (): void => {
      if (!alive) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (alive) setConnected(true);
      };
      ws.onclose = () => {
        if (!alive) return;
        setConnected(false);
        retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev: MessageEvent) => {
        if (!alive) return;
        try {
          const frame = JSON.parse(ev.data as string) as WsFrame;
          setFrames((prev) => [frame, ...prev].slice(0, TAPE_LIMIT));
        } catch {
          /* ignore malformed frame */
        }
      };
    };
    connect();
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  return { frames, connected };
}

/** Admin session state. Checks the GitHub-OAuth cookie via /api/auth/me. */
export function useAdmin(): {
  isAdmin: boolean;
  checked: boolean;
  refresh: () => Promise<void>;
} {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });
      const body = (await r.json()) as { admin?: boolean };
      setIsAdmin(Boolean(body.admin));
    } catch {
      setIsAdmin(false);
    }
    setChecked(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isAdmin, checked, refresh };
}

/** Result of an admin mutation — `error` carries the backend `detail` on failure. */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function adminPost(path: string, body?: unknown): Promise<ActionResult> {
  try {
    const r = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (r.ok) return { ok: true };
    const detail = (await r.json().catch(() => ({}))) as { detail?: unknown };
    const msg =
      typeof detail.detail === "string" ? detail.detail : `HTTP ${r.status}`;
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Patch Mode #21 runtime tunables (admin-only). Partial — only changed fields. */
export function updateTunables(
  patch: Partial<Tunables>,
): Promise<ActionResult> {
  return adminPost("/api/admin/tunables", patch);
}

/** Enable/disable one trading mode (admin-only). Persists across restart. */
export function toggleMode(
  mode: string,
  enabled: boolean,
): Promise<ActionResult> {
  return adminPost(`/api/admin/modes/${mode}/toggle`, { enabled });
}

/** Kill switch: stop the bot (manual halt — needs an explicit resume). */
export function haltBot(): Promise<ActionResult> {
  return adminPost("/api/admin/halt", { reason: "manual" });
}

/** Kill switch: clear the halt and let the bot trade again. */
export function resumeBot(): Promise<ActionResult> {
  return adminPost("/api/admin/resume");
}

/** End the admin session (clears the session cookie). */
export function logoutAdmin(): Promise<ActionResult> {
  return adminPost("/api/auth/logout");
}
