import { useState } from "react";
import { AsciiBox } from "./AsciiBox";

/** Цвет столбика на каждый инструмент. Порядок = порядок свичей. */
const ASSET_COLORS: Record<string, string> = {
  BTC: "#57c97a",
  ETH: "#4ea1d3",
  SOL: "#c678dd",
  XRP: "#FFA500",
};

interface Props {
  /** 24 часовых бина выигрышей по Киеву, на каждый инструмент. */
  winsByHour: Record<string, number[]>;
}

/**
 * Гистограмма выигрышных сделок по 24 часам (время Киева). Столбики сложены по
 * инструментам; 4 свича включают/выключают инструмент, по умолчанию все вкл.
 */
export function HourHistogram({ winsByHour }: Props) {
  const assets = Object.keys(ASSET_COLORS).filter((a) => a in winsByHour);
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(assets.map((a) => [a, true])),
  );

  const shown = assets.filter((a) => on[a]);
  const totals = Array.from({ length: 24 }, (_, h) =>
    shown.reduce((sum, a) => sum + (winsByHour[a]?.[h] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);
  const grandTotal = totals.reduce((s, n) => s + n, 0);

  return (
    <AsciiBox title="Wins by hour · Kyiv">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-terminal-muted">
          {grandTotal} побед · только выигрышные
        </span>
        <div className="flex gap-1">
          {assets.map((a) => (
            <button
              key={a}
              onClick={() => setOn((p) => ({ ...p, [a]: !p[a] }))}
              className="border px-1 text-xs"
              style={{
                color: on[a] ? ASSET_COLORS[a] : "#444",
                borderColor: on[a] ? ASSET_COLORS[a] : "#2a2a2a",
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="flex h-24 items-end gap-[2px]">
        {totals.map((_, h) => (
          <div key={h} className="flex h-full flex-1 flex-col-reverse">
            {shown.map((a) => {
              const v = winsByHour[a]?.[h] ?? 0;
              if (v === 0) return null;
              return (
                <div
                  key={a}
                  style={{
                    height: `${(v / max) * 100}%`,
                    backgroundColor: ASSET_COLORS[a],
                  }}
                  title={`${a} · ${String(h).padStart(2, "0")}:00 — ${v}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-terminal-muted">
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
    </AsciiBox>
  );
}
