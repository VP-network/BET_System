import { useEffect, useState } from "react";
import clsx from "clsx";
import { AsciiBox } from "./AsciiBox";
import {
  API_URL,
  haltBot,
  logoutAdmin,
  resumeBot,
  toggleMode,
  updateTunables,
  type Metrics,
  type Tunables,
} from "../lib/useBackend";

/** Global switch: exactly one of these trades at a time (#21 ↔ #20). */
const SWITCHABLE_MODES: { mode: string; label: string }[] = [
  { mode: "window_switch", label: "#21 CLOSE" },
  { mode: "pre_fill", label: "#20 FRONTIER" },
];

interface FieldSpec {
  key: keyof Tunables;
  label: string;
  step: string;
  /** UI value = stored × scale. per_day_loss_pct stored as fraction, shown as %. */
  scale: number;
  hint: string;
}

const FIELDS: FieldSpec[] = [
  { key: "per_side_size", label: "PER SIDE SIZE", step: "1", scale: 1, hint: "шер на сторону, ≥1" },
  {
    key: "per_side_price",
    label: "PER SIDE PRICE",
    step: "0.01",
    scale: 1,
    hint: "цена входа $, кратно 0.01",
  },
  {
    key: "gtd_after_close_s",
    label: "GTD AFTER CLOSE",
    step: "1",
    scale: 1,
    hint: "GTD = close + N сек",
  },
  {
    key: "trigger_offset_s",
    label: "TRIGGER OFFSET",
    step: "0.1",
    scale: 1,
    hint: "сек vs close (− = раньше)",
  },
  {
    key: "expiration_window_s",
    label: "EXPIRATION WINDOW",
    step: "0.5",
    scale: 1,
    hint: "сек после close ещё стрелять",
  },
  {
    key: "per_window_max_usd",
    label: "PER WINDOW MAX",
    step: "0.5",
    scale: 1,
    hint: "кап капитала на окно, $",
  },
  {
    key: "per_day_loss_pct",
    label: "DAILY LOSS HALT",
    step: "0.5",
    scale: 100,
    hint: "дневной риск-стоп, %",
  },
];

type EditState = Record<keyof Tunables, string>;

function readTunables(m: Metrics | null): Tunables | null {
  const t = m?.tunables;
  if (!t || !("per_side_size" in t)) return null;
  return t as Tunables;
}

function toEdit(t: Tunables): EditState {
  const e = {} as EditState;
  for (const f of FIELDS) e[f.key] = String(t[f.key] * f.scale);
  return e;
}

/** Displayed value of a live tunable, scaled for the UI (e.g. fraction → %). */
function shown(t: Tunables, f: FieldSpec): string {
  const v = t[f.key] * f.scale;
  return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, "");
}

export function AdminPanel({
  metrics,
  isAdmin,
  onAction,
}: {
  metrics: Metrics | null;
  isAdmin: boolean;
  onAction: () => void;
}) {
  const tunables = readTunables(metrics);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Re-sync the form from live metrics — but never clobber unsaved edits.
  const tunablesJson = tunables ? JSON.stringify(tunables) : "";
  useEffect(() => {
    if (!tunablesJson || dirty) return;
    setEdit(toEdit(JSON.parse(tunablesJson) as Tunables));
  }, [tunablesJson, dirty]);

  const setField = (key: keyof Tunables, value: string): void => {
    setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
    setMsg(null);
  };

  const revert = (): void => {
    if (tunables) setEdit(toEdit(tunables));
    setDirty(false);
    setMsg(null);
  };

  const save = async (): Promise<void> => {
    if (!edit || !tunables) return;
    const patch: Partial<Tunables> = {};
    for (const f of FIELDS) {
      const raw = parseFloat(edit[f.key]);
      if (Number.isNaN(raw)) {
        setMsg({ ok: false, text: `${f.label}: не число` });
        return;
      }
      const stored = raw / f.scale;
      if (Math.abs(stored - tunables[f.key]) > 1e-9) patch[f.key] = stored;
    }
    if (Object.keys(patch).length === 0) {
      setMsg({ ok: false, text: "нет изменений" });
      return;
    }
    setBusy(true);
    const res = await updateTunables(patch);
    setBusy(false);
    if (res.ok) {
      setDirty(false);
      setMsg({ ok: true, text: "✓ сохранено — переживёт рестарт" });
      onAction();
    } else {
      setMsg({ ok: false, text: res.error ?? "ошибка" });
    }
  };

  const logout = async (): Promise<void> => {
    setBusy(true);
    await logoutAdmin();
    setBusy(false);
    setMsg({ ok: true, text: "✓ сессия завершена" });
    onAction(); // refresh /me → панель снова read-only
  };

  const halt = metrics?.risk.halt;
  const stopped = Boolean(halt?.active);
  const reason = halt?.reason ?? "";

  const toggleBot = async (): Promise<void> => {
    const verb = stopped ? "ЗАПУСТИТЬ" : "ОСТАНОВИТЬ";
    const tail = stopped ? "Торговля возобновится." : "Торговля прекратится.";
    if (!window.confirm(`${verb} бота? ${tail}`)) return;
    setBusy(true);
    const res = stopped ? await resumeBot() : await haltBot();
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `✓ бот ${stopped ? "запущен" : "остановлен"}` });
      onAction();
    } else {
      setMsg({ ok: false, text: res.error ?? "ошибка" });
    }
  };

  const modeFlags = metrics?.modes ?? {};
  const activeMode = SWITCHABLE_MODES.find((m) => modeFlags[m.mode])?.mode ?? null;

  const switchTo = async (target: string): Promise<void> => {
    if (target === activeMode) return;
    const label = SWITCHABLE_MODES.find((m) => m.mode === target)?.label ?? target;
    if (!window.confirm(`Переключить режим на ${label}? Текущий режим выключится.`))
      return;
    setBusy(true);
    // Disable the other mode first — a brief no-trade gap is safer than a
    // moment with both modes armed. Persists across restart (mode_flags.json).
    let res: { ok: boolean; error?: string } = { ok: true };
    for (const m of SWITCHABLE_MODES) {
      if (m.mode !== target && modeFlags[m.mode]) {
        res = await toggleMode(m.mode, false);
        if (!res.ok) break;
      }
    }
    if (res.ok) res = await toggleMode(target, true);
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `✓ режим → ${label}` });
      onAction();
    } else {
      setMsg({ ok: false, text: res.error ?? "ошибка" });
    }
  };

  return (
    <section className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2 items-start">
      <AsciiBox title="Bot control">
        <div className="text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-terminal-muted">состояние</span>
            <span className={stopped ? "text-terminal-red" : "text-terminal-green"}>
              {stopped ? `STOPPED · ${reason}` : "RUNNING"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted">режим</span>
            <span className="text-terminal-green">
              {SWITCHABLE_MODES.find((m) => m.mode === activeMode)?.label ?? "—"}
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-terminal-muted">переключение режима</div>
            <div className="flex gap-1">
              {SWITCHABLE_MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  className={clsx(
                    "term-btn flex-1",
                    m.mode === activeMode && "term-btn-go",
                  )}
                  disabled={!isAdmin || busy || m.mode === activeMode}
                  onClick={() => void switchTo(m.mode)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {isAdmin ? (
            <div className="space-y-1">
              <button
                type="button"
                className={clsx("term-btn w-full", stopped ? "term-btn-go" : "term-btn-danger")}
                disabled={busy}
                onClick={() => void toggleBot()}
              >
                {stopped ? "▶ запустить бота" : "■ остановить бота"}
              </button>
              <button
                type="button"
                className="term-btn w-full"
                disabled={busy}
                onClick={() => void logout()}
              >
                выход (admin)
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <a className="term-btn term-btn-go block text-center" href={`${API_URL}/api/auth/login`}>
                login (github)
              </a>
              <div className="text-terminal-muted">управление — только админ</div>
            </div>
          )}
          {msg && (
            <div className={msg.ok ? "text-terminal-green" : "text-terminal-red"}>{msg.text}</div>
          )}
        </div>
      </AsciiBox>

      <AsciiBox title="Mode #21 tuning" className="lg:col-span-2">
        {!tunables ? (
          <div className="text-xs text-terminal-muted">тюнер недоступен (бот не запущен)</div>
        ) : (
          <div className="text-xs">
            <table className="w-full">
              <tbody>
                {FIELDS.map((f) => (
                  <tr key={f.key}>
                    <td className="text-terminal-muted py-0.5 pr-2 whitespace-nowrap">
                      {f.label}
                    </td>
                    <td className="py-0.5 pr-2 w-24">
                      <input
                        type="number"
                        step={f.step}
                        className="term-input"
                        disabled={!isAdmin || busy}
                        value={edit ? edit[f.key] : ""}
                        onChange={(e) => setField(f.key, e.target.value)}
                      />
                    </td>
                    <td className="text-terminal-muted py-0.5 pr-2 whitespace-nowrap">
                      live: <span className="text-terminal-green">{shown(tunables, f)}</span>
                    </td>
                    <td className="text-terminal-muted py-0.5">{f.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isAdmin ? (
              <div className="mt-2 flex gap-2 items-center">
                <button
                  type="button"
                  className="term-btn term-btn-go"
                  disabled={busy || !dirty}
                  onClick={() => void save()}
                >
                  сохранить
                </button>
                <button
                  type="button"
                  className="term-btn"
                  disabled={busy || !dirty}
                  onClick={revert}
                >
                  сбросить
                </button>
                {dirty && <span className="text-terminal-orange">● есть несохранённые правки</span>}
              </div>
            ) : (
              <div className="mt-2 text-terminal-muted">правка значений — только админ</div>
            )}
          </div>
        )}
      </AsciiBox>
    </section>
  );
}
