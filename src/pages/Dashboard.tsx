import { useEffect, useState } from "react";

interface Health {
  status: string;
  version: string;
  mode: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="min-h-screen p-4">
      <header className="ascii-box mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="ascii-box-title">BET_SYSTEM // POLYMARKET 5M FRONTIER MONITOR</div>
            <div className="text-terminal-muted text-xs mt-1">
              Phase 0 scaffold · v{import.meta.env.VITE_APP_VERSION || "0.1.0"}
            </div>
          </div>
          <div className="text-right text-xs">
            {health ? (
              <span className="text-terminal-green">● CONNECTED ({health.mode})</span>
            ) : error ? (
              <span className="text-terminal-red">● BACKEND UNREACHABLE</span>
            ) : (
              <span className="text-terminal-orange">● CONNECTING…</span>
            )}
          </div>
        </div>
      </header>

      <main className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {["BALANCE", "BIDS SENT", "FILLS", "FILL RATE", "ACTIVE WINDOWS", "WINDOWS CAUGHT", "PNL"].map(
          (label) => (
            <div key={label} className="ascii-box">
              <div className="ascii-box-title">{label}</div>
              <div className="metric-value">—</div>
            </div>
          ),
        )}
      </main>

      <section className="mt-4 ascii-box">
        <div className="ascii-box-title">Status</div>
        <div className="text-xs text-terminal-muted">
          Phase 0 scaffold. Bot engine, WS push, mode scheduler — следующие сессии.<br />
          Backend health: {health ? JSON.stringify(health) : error ? `error: ${error}` : "loading…"}<br />
          API URL: {API_URL}
        </div>
      </section>
    </div>
  );
}
