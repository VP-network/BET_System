import clsx from "clsx";
import { AdminPanel } from "../components/AdminPanel";
import { AsciiBox } from "../components/AsciiBox";
import { HourHistogram } from "../components/HourHistogram";
import { LossStreakGauge } from "../components/LossStreakGauge";
import { RecorderStatusBox } from "../components/RecorderStatus";
import {
  useAdmin,
  useEventStream,
  useMetrics,
  type AssetStats,
  type Metrics,
  type WsFrame,
} from "../lib/useBackend";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.1.0";

/** Coerce an unknown WS-frame field to a printable string. */
function s(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Signed dollar string, e.g. "-$0.50" / "$1.20". */
function usd(v: number): string {
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

/** Секунда окна, в которую сел fill — отсчёт от старта окна (0 = открытие).
 *  Для 5-мин окна типично 200-300+ сек. — когда данных нет. */
function fmtWindowSec(s: number | null): string {
  if (s == null) return "—";
  return `${Math.round(s)}s`;
}

/** Время HH:MM из unix-ms — для ярлыка окна в ленте. */
function fmtHM(ms: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Box {
  label: string;
  value: string;
  loss?: boolean;
}

/** 7 главных коробок. */
function primaryBoxes(m: Metrics): Box[] {
  const balance = m.capital.balance_usd ?? m.risk.balance;
  const pnl = m.pnl.realized_pnl_usd;
  return [
    {
      label: "BALANCE",
      value: balance != null ? `$${balance.toFixed(2)}` : "—",
    },
    { label: "BIDS SENT", value: String(m.orders.bids_sent) },
    { label: "FILLS", value: String(m.orders.fills) },
    { label: "FILL RATE", value: `${(m.orders.fill_rate * 100).toFixed(1)}%` },
    { label: "ACTIVE WINDOWS", value: String(m.active_windows) },
    { label: "WINDOWS CAUGHT", value: String(m.orders.windows_caught) },
    { label: "PNL", value: usd(pnl), loss: pnl < 0 },
  ];
}

/** Вторичный ряд: исходы и состояние очереди ордеров. */
function secondaryBoxes(m: Metrics): Box[] {
  // Среднее: на какой секунде окна (от его старта) наполняются ордера.
  return [
    { label: "W / L", value: `${m.pnl.wins} / ${m.pnl.losses}` },
    { label: "WIN RATE", value: `${(m.pnl.win_rate * 100).toFixed(1)}%` },
    { label: "PENDING", value: String(m.orders.pending) },
    { label: "AVG FILL · СЕК ОКНА", value: fmtWindowSec(m.orders.avg_window_second) },
    {
      label: "AVG FILL · СЕК ОКНА · WIN",
      value: fmtWindowSec(m.orders.avg_window_second_wins),
    },
  ];
}

const PRIMARY_LABELS = [
  "BALANCE",
  "BIDS SENT",
  "FILLS",
  "FILL RATE",
  "ACTIVE WINDOWS",
  "WINDOWS CAUGHT",
  "PNL",
];
const SECONDARY_LABELS = [
  "W / L",
  "WIN RATE",
  "PENDING",
  "AVG FILL · СЕК ОКНА",
  "AVG FILL · СЕК ОКНА · WIN",
];

function placeholders(labels: string[]): Box[] {
  return labels.map((label) => ({ label, value: "—" }));
}

/** One-line summary of a WS frame for the event tape. */
function frameDetail(f: WsFrame): string {
  const d = f.data;
  switch (f.type) {
    case "fill": {
      const base = `${s(d.asset)} ${s(d.side)} ${s(d.size)}sh @ $${s(d.price)}`;
      const ws = d.window_second;
      // Секунда окна (от старта) + ярлык пятиминутки, к которой относится fill.
      const open = fmtHM(d.window_open_ms);
      const close = fmtHM(d.window_close_ms);
      const label = open && close ? ` (${open}–${close})` : "";
      return ws == null
        ? `${base}${label}`
        : `${base} · окно ${Math.round(Number(ws))}s${label}`;
    }
    case "order":
      return `${s(d.asset)} ${s(d.side)} ${s(d.status)}`;
    case "pnl":
      return `${s(d.asset)} ${s(d.side)} pnl $${s(d.pnl_usd)} ${d.won ? "WON" : "lost"}`;
    case "market_resolved":
      return `winner=${s(d.winning_side) || "?"}`;
    case "market_new":
      return `${s(d.asset)} ${s(d.close_time)}`;
    case "capital": {
      const act = s(d.action);
      if (act)
        return `${act} $${s(d.amount_usd)} · free $${s(d.available_usd)}`;
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
  const { isAdmin, refresh: refreshAdmin } = useAdmin();

  const boxes1 = metrics ? primaryBoxes(metrics) : placeholders(PRIMARY_LABELS);
  const boxes2 = metrics
    ? secondaryBoxes(metrics)
    : placeholders(SECONDARY_LABELS);
  const halt = metrics?.risk.halt;
  const tape = frames
    .filter((f) => !TAPE_HIDDEN.has(f.type))
    .slice(0, TAPE_ROWS);
  const assets = metrics ? Object.entries(metrics.by_asset) : [];
  // Composite v1 frozen 2026-05-23 — its widgets (per-mode tuning, per-asset
  // bids/fills/spread, hourly wins, loss-streak gauge, primary/secondary
  // metric rows) only make sense while a trading mode is registered. With
  // modes={} we observe only recorder + market discovery. Stage 2 zscore
  // wiring will re-introduce different widgets.
  const compositeEra = !!metrics && Object.keys(metrics.modes).length > 0;

  return (
    <div className="mx-auto min-h-screen max-w-[1200px] p-4">
      <header className="ascii-box mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="ascii-box-title">
              BET_SYSTEM // POLYMARKET 15M FRONTIER MONITOR
            </div>
            <div className="text-terminal-muted text-xs mt-1">
              {metrics
                ? `${metrics.mode} · uptime ${metrics.uptime_seconds}s · `
                : ""}
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

      {compositeEra && (
        <main className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {boxes1.map((box) => (
            <MetricBox key={box.label} box={box} />
          ))}
        </main>
      )}

      {!compositeEra && (
        <main className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <MetricBox
            box={{
              label: "BALANCE",
              value:
                metrics?.capital.balance_usd != null
                  ? `$${metrics.capital.balance_usd.toFixed(2)}`
                  : "—",
            }}
          />
          <MetricBox
            box={{
              label: "ACTIVE WINDOWS",
              value: String(metrics?.active_windows ?? "—"),
            }}
          />
          <MetricBox
            box={{
              label: "MODE",
              value: "frozen · zscore TBD",
            }}
          />
        </main>
      )}

      {compositeEra && (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2">
          {boxes2.map((box) => (
            <MetricBox key={box.label} box={box} />
          ))}
        </div>
      )}

      {compositeEra && (
        <AdminPanel
          metrics={metrics}
          isAdmin={isAdmin}
          onAction={() => void refreshAdmin()}
        />
      )}

      {compositeEra && (
        <section className="mt-4">
          <div className="ascii-box-title mb-1">Per-asset</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {assets.length === 0
              ? ["BTC", "ETH", "SOL", "XRP"].map((a) => (
                  <AsciiBox key={a} title={a}>
                    <div className="text-xs text-terminal-muted">—</div>
                  </AsciiBox>
                ))
              : assets.map(([asset, a]) => (
                  <AssetPanel key={asset} asset={asset} a={a} />
                ))}
          </div>
        </section>
      )}

      <section className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2 items-start">
        {compositeEra && (
          <div className="lg:col-span-2">
            <HourHistogram winsByHour={metrics!.wins_by_hour} />
          </div>
        )}
        <div className={clsx("grid grid-cols-1 gap-2", !compositeEra && "lg:col-span-3 lg:grid-cols-3")}>
          {compositeEra && <LossStreakGauge streak={metrics!.pnl.loss_streak} />}
          <RecorderStatusBox />
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2 items-start">
        <AsciiBox
          title={`Event tape · последние ${TAPE_ROWS}`}
          className="lg:col-span-2"
        >
          {tape.length === 0 ? (
            <div className="text-xs text-terminal-muted">Ожидание событий…</div>
          ) : (
            <div>
              {tape.map((f, i) => (
                <div key={`${f.ts}-${i}`} className="event-row flex gap-2">
                  <span className="text-terminal-muted">
                    {new Date(f.ts).toLocaleTimeString()}
                  </span>
                  <span
                    className={clsx(
                      "w-32 shrink-0 uppercase",
                      frameTone(f.type),
                    )}
                  >
                    {f.type}
                  </span>
                  <span className="text-terminal-green truncate">
                    {frameDetail(f)}
                  </span>
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
              <Row
                label="halted"
                value={metrics.scheduler.halted ? "yes" : "no"}
              />
              <Row
                label="markets resolved"
                value={String(metrics.pnl.markets_resolved)}
              />
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

function MetricBox({ box }: { box: Box }) {
  return (
    <div className="ascii-box">
      <div className="ascii-box-title">{box.label}</div>
      <div className={clsx("metric-value", box.loss && "metric-value-loss")}>
        {box.value}
      </div>
    </div>
  );
}

function AssetPanel({ asset, a }: { asset: string; a: AssetStats }) {
  return (
    <AsciiBox title={asset}>
      <div className="text-xs space-y-1">
        <Row label="active" value={String(a.active_windows)} />
        <Row label="bids / fills" value={`${a.bids_sent} / ${a.fills}`} />
        <Row label="fill rate" value={`${(a.fill_rate * 100).toFixed(1)}%`} />
        <Row label="caught" value={String(a.windows_caught)} />
        <Row label="pending" value={String(a.pending)} />
        <Row
          label="сек окна · win"
          value={fmtWindowSec(a.avg_window_second_wins)}
        />
        <Row
          label="spread"
          value={a.spread != null ? `$${a.spread.toFixed(2)}` : "—"}
        />
        <Row label="W / L" value={`${a.wins} / ${a.losses}`} />
        <Row label="pnl" value={usd(a.pnl_usd)} loss={a.pnl_usd < 0} />
      </div>
    </AsciiBox>
  );
}

function Row({
  label,
  value,
  loss,
}: {
  label: string;
  value: string;
  loss?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-terminal-muted">{label}</span>
      <span className={loss ? "text-terminal-red" : "text-terminal-green"}>
        {value}
      </span>
    </div>
  );
}
