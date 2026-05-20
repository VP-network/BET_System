import { useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const METRICS_REFRESH_MS = 5000;
const TAPE_LIMIT = 60;

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
  };
  orders: {
    bids_sent: number;
    fills: number;
    fill_rate: number;
    windows_caught: number;
    pending: number;
    avg_fill_delay_ms: number;
  };
  scheduler: { ticks: number; fires: number; halted: boolean };
  active_windows: number;
  by_asset: Record<string, AssetStats>;
}

/** Server → client frame from /ws/dashboard. */
export interface WsFrame {
  type: string;
  ts: number;
  data: Record<string, unknown>;
}

/** Polls /api/metrics every 5s (matches backend metrics_refresh_ms). */
export function useMetrics(): { metrics: Metrics | null; error: string | null } {
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
