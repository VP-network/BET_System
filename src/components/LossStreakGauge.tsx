import { AsciiBox } from "./AsciiBox";
import type { LossStreak } from "../lib/useBackend";

interface Props {
  streak: LossStreak;
}

const CX = 100;
const CY = 100;
const TICKS = 50;

/** Цвет зоны по доле шкалы: зелёная → оранжевая → красная. */
function zoneColor(t: number): string {
  if (t < 0.5) return "#57c97a";
  if (t < 0.8) return "#FFA500";
  return "#FF3333";
}

/**
 * Полукруглый прибор: стрелка = текущая серия проигрышей подряд. Шкала 0..scale_max
 * (динамическая, округлена вверх до десятков). Снизу — ряд топ-5 завершённых серий.
 */
export function LossStreakGauge({ streak }: Props) {
  const { current, scale_max, top5 } = streak;
  const frac =
    scale_max > 0 ? Math.min(1, Math.max(0, current / scale_max)) : 0;

  // Полукруг: угол θ=π (левый край) → θ=0 (правый). frac 0→1 идёт слева направо.
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const t = i / (TICKS - 1);
    const theta = Math.PI * (1 - t);
    const lit = t <= frac;
    const x1 = CX + 64 * Math.cos(theta);
    const y1 = CY - 64 * Math.sin(theta);
    const x2 = CX + 82 * Math.cos(theta);
    const y2 = CY - 82 * Math.sin(theta);
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={zoneColor(t)}
        strokeOpacity={lit ? 1 : 0.16}
        strokeWidth={2}
      />
    );
  });

  const needleTheta = Math.PI * (1 - frac);
  const nx = CX + 58 * Math.cos(needleTheta);
  const ny = CY - 58 * Math.sin(needleTheta);

  return (
    <AsciiBox title="Loss streak">
      <svg
        viewBox="0 0 200 124"
        className="w-full"
        role="img"
        aria-label="Loss streak gauge"
      >
        {ticks}
        <line
          x1={CX}
          y1={CY}
          x2={nx}
          y2={ny}
          stroke="#FF3333"
          strokeWidth={2.5}
        />
        <circle cx={CX} cy={CY} r={5} fill="#FF3333" />
        <text
          x={CX}
          y={78}
          textAnchor="middle"
          fill="#FF3333"
          fontSize={15}
          fontWeight={700}
        >
          {current}
        </text>
        <text
          x={CX - 82}
          y={118}
          textAnchor="middle"
          fill="#666666"
          fontSize={9}
        >
          0
        </text>
        <text
          x={CX + 82}
          y={118}
          textAnchor="middle"
          fill="#666666"
          fontSize={9}
        >
          {scale_max}
        </text>
      </svg>

      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-terminal-muted">рекорды</span>
        <span className="flex gap-2 font-mono">
          {top5.length === 0 ? (
            <span className="text-terminal-muted">—</span>
          ) : (
            top5.map((v, i) => (
              <span key={i} className="text-terminal-orange">
                {v}
              </span>
            ))
          )}
        </span>
      </div>
    </AsciiBox>
  );
}
