import { AsciiBox } from "./AsciiBox";
import { useRecorder, type RecorderStatus as RS } from "../lib/useBackend";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Один компактный AsciiBox с метриками BookRecorder. Виден когда recorder
 *  запущен в engine — даёт оператору обратную связь, что paper-mode книги
 *  пишутся в JSONL для последующего edge-backtest'a. */
export function RecorderStatusBox() {
  const { recorder, error } = useRecorder();
  return (
    <AsciiBox title="BOOK RECORDER">
      {error && <div className="text-red-500">{error}</div>}
      {recorder && <RecorderBody r={recorder} />}
      {!recorder && !error && <div>loading…</div>}
    </AsciiBox>
  );
}

function RecorderBody({ r }: { r: RS }) {
  return (
    <div className="text-xs space-y-0.5">
      <Row label="status" value={r.running ? "live" : "—"} />
      <Row label="tracked" value={String(r.tracked)} />
      <Row label="snapshots" value={String(r.snapshots)} />
      <Row label="resolved" value={String(r.resolved)} />
      <Row label="dropped" value={String(r.dropped_no_book)} />
      <Row label="file" value={fmtBytes(r.file_size_bytes)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}
