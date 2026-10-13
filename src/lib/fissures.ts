// Live Void Fissures from the community worldstate API (https://docs.warframestat.us).
import { useEffect, useState } from "react";

export interface Fissure {
  id: string;
  node: string;
  missionType: string;
  enemy: string;
  tier: string; // Lith, Meso, Neo, Axi, Requiem, Omnia
  expiry: string;
  isStorm: boolean; // Void Storm (Railjack)
  isHard: boolean; // Steel Path
}

const URL = "https://api.warframestat.us/pc/fissures/?language=en";

export function useFissures(refreshMs = 60_000) {
  const [fissures, setFissures] = useState<Fissure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(URL);
        if (!res.ok) throw new Error(`the worldstate API answered ${res.status}`);
        const data = (await res.json()) as (Fissure & { expired?: boolean })[];
        if (!alive) return;
        setFissures(data.filter(f => !f.expired && new Date(f.expiry).getTime() > Date.now()));
        setFetchedAt(new Date());
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(t); };
  }, [refreshMs]);

  return { fissures, error, fetchedAt };
}

/** "34m" / "1h 05m" until a time, re-rendered by the caller's clock. */
export function timeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "ended";
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
