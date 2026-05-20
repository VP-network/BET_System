import clsx from "clsx";
import { AsciiBox } from "../components/AsciiBox";
import { useEventStream, useMetrics, type Metrics, type WsFrame } from "../lib/useBackend";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.1.0";

/** Coerce an unknown WS-frame field to a printable string. */
function s(v: unknown): string {
  return v == null ? "" : String(v);
}

interface Box {
  label: string;
  value: string;
  loss?: boolean;
}

/** Map a metrics snapshot to the 7 header boxes. */
function boxesFrom(m: Metrics): Box[] {
  const balance = m.capital.balance_usd ?? m.risk.balance;
  const pnl = m.pnl.realized_pnl_usd;
  return [
    { label: "BALANCE", value: balance != null ? `$${balance.toFixed(2)}` : "—" },
    { label: "BIDS SENT", value: String(m.orders.bids_sent) },
    { label: "FILLS", value: String(m.orders.fills) },
    { label: "FILL RATE", value: `${(m.orders.fill_rate * 100).toFixed(1)}%` },
    { label: "ACTIVE WINDOWS", value: String(m.active_windows) },
    { label: "WINDOWS CAUGHT", value: String(m.orders.windows_caught) },
    {
      label: "PNL",
      value: `${pnl < 0 ? "-" : ""}$${Math.abs(pnl).toFixed(2)}`,
      loss: pnl < 0,
    },
  ];
}

const PLACEHOLDER_BOXES: Box[] = [
  "BALANCE",
  "BIDS SENT",
  "FILLS",
  "FILL RATE",
  "ACTIVE WINDOWS",
  "WINDOWS CAUGHT",
  "PNL",
].map((label) => ({ label, value: "—" }));

/** One-line summary of a WS frame for the event tape. */
function frameDetail(f: WsFrame): string {
  const d = f.data;
  switch (f.type) {
    case "fill":
      return `${s(d.asset)} ${s(d.side)} ${s(d.size)}sh @ $${s(d.price)}`;
    case "order":
      return `${s(d.asset)} ${s(d.side)} ${s(d.status)}`;
    case "pnl":
      return `${s(d.side)} pnl $${s(d.pnl_usd)} ${d.won ? "WON" : "lost"}`;
    case "market_resolved":
      return `winner=${s(d.winning_side) || "?"}`;
    case "market_new":
      return `${s(d.asset)} ${s(d.close_time)}`;
    case "capital": {
      const act = s(d.action);
      if (act) return `${act} $${s(d.amount_usd)} · free $${s(d.available_usd)}`;
      return `balance $${s(d.balance)}`;
    }
    case "halt":
      return `HALT ${s(d.reason)}`;
    case "mode_toggle":
      return `${s(d.mode)} ${s(d.channel)}`;
    default:
      return "";
  }
}

const TAPE_HIDDEN = new Set(["tick", "hello"]);
// Лента — это «бегущая строка»: показываем только свежие события, без скролла.
// Полная история живёт в журнале бота, не в UI.
const TAPE_ROWS = 24;

function frameTone(type: string): string {
  if (type === "fill" || type === "pnl") return "text-terminal-green";
  if (type === "halt") return "text-terminal-red";
  if (type === "market_resolved") return "text-terminal-orange";
  return "text-terminal-muted";
}

export function Dashboard() {
  const { metrics, error } = useMetrics();
  const { frames, connected } = useEventStream();

  const boxes = metrics ? boxesFrom(metrics) : PLACEHOLDER_BOXES;
  const halt = metrics?.risk.halt;
  const tape = frames.filter((f) => !TAPE_HIDDEN.has(f.type)).slice(0, TAPE_ROWS);

  return (
    <div className="min-h-screen p-4">
      <header className="ascii-box mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="ascii-box-title">BET_SYSTEM // POLYMARKET 5M FRONTIER MONITOR</div>
            <div className="text-terminal-muted text-xs mt-1">
              {metrics ? `${metrics.mode} · uptime ${metrics.uptime_seconds}s · ` : ""}
              v{APP_VERSION}
            </div>
          </div>
          <div className="text-right text-xs">
            {connected ? (
              <span className="text-terminal-green">● WS LIVE</span>
            ) : metrics ? (
              <span className="text-terminal-orange">● WS RECONNECTING…</span>
            ) : error ? (
              <span className="text-terminal-red">● BACKEND UNREACHABLE</span>
            ) : (
              <span className="text-terminal-orange">● CONNECTING…</span>
            )}
            {halt?.active && (
              <div className="text-terminal-red mt-1">HALT: {halt.reason}</div>
            )}
          </div>
        </div>
      </header>

      <main className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {boxes.map((box) => (
          <div key={box.label} className="ascii-box">
            <div className="ascii-box-title">{box.label}</div>
            <div className={clsx("metric-value", box.loss && "metric-value-loss")}>
              {box.value}
            </div>
          </div>
        ))}
      </main>

      <section className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2 items-start">
        <AsciiBox title={`Event tape · последние ${TAPE_ROWS}`} className="lg:col-span-2">
          {tape.length === 0 ? (
            <div className="text-xs text-terminal-muted">Ожидание событий…</div>
          ) : (
            <div>
              {tape.map((f, i) => (
                <div key={`${f.ts}-${i}`} className="event-row flex gap-2">
                  <span className="text-terminal-muted">
                    {new Date(f.ts).toLocaleTimeString()}
                  </span>
                  <span className={clsx("w-32 shrink-0 uppercase", frameTone(f.type))}>
                    {f.type}
                  </span>
                  <span className="text-terminal-green truncate">{frameDetail(f)}</span>
                </div>
              ))}
            </div>
          )}
        </AsciiBox>

        <AsciiBox title="Scheduler">
          {metrics ? (
            <div className="text-xs space-y-1">
              <Row label="ticks" value={String(metrics.scheduler.ticks)} />
              <Row label="fires" value={String(metrics.scheduler.fires)} />
              <Row label="halted" value={metrics.scheduler.halted ? "yes" : "no"} />
              <Row label="markets resolved" value={String(metrics.pnl.markets_resolved)} />
            </div>
          ) : (
            <div className="text-xs text-terminal-muted">
              {error ? `error: ${error}` : "loading…"}
            </div>
          )}
        </AsciiBox>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-terminal-muted">{label}</span>
      <span className="text-terminal-green">{value}</span>
    </div>
  );
}
