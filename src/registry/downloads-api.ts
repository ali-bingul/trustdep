// filepath: src/registry/downloads-api.ts
import { httpJson } from "./http.js";
import { USER_AGENT } from "../version.js";

const BASE = "https://api.npmjs.org/downloads";

export interface RangeDownloads {
  start: string;
  end: string;
  package: string;
  downloads: Array<{ downloads: number; day: string }>;
}

export async function fetchPointDownloads(
  name: string,
  period: "last-day" | "last-week" | "last-month" = "last-week"
): Promise<number> {
  try {
    const res = await httpJson<{ downloads: number }>(
      `${BASE}/point/${period}/${encodeURIComponent(name)}`,
      { timeoutMs: 15_000, headers: { "user-agent": USER_AGENT } }
    );
    return res.downloads ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchRangeDownloads(
  name: string,
  range: string
): Promise<RangeDownloads | null> {
  try {
    return await httpJson<RangeDownloads>(
      `${BASE}/range/${range}/${encodeURIComponent(name)}`,
      { timeoutMs: 15_000, headers: { "user-agent": USER_AGENT } }
    );
  } catch {
    return null;
  }
}

/**
 * Detects unusual week-over-week download spikes (>500% increase).
 */
export async function detectDownloadSpike(name: string): Promise<{
  spike: boolean;
  currentWeek: number;
  previousWeek: number;
  ratio: number;
}> {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const start = startDate.toISOString().slice(0, 10);
  const data = await fetchRangeDownloads(name, `${start}:${end}`);
  if (!data || data.downloads.length < 14) {
    return { spike: false, currentWeek: 0, previousWeek: 0, ratio: 0 };
  }
  const downloads = data.downloads;
  const half = Math.floor(downloads.length / 2);
  const previousWeek = downloads.slice(0, half).reduce((acc, d) => acc + d.downloads, 0);
  const currentWeek = downloads.slice(half).reduce((acc, d) => acc + d.downloads, 0);
  const ratio = previousWeek === 0 ? 0 : currentWeek / previousWeek;
  return { spike: ratio >= 5, currentWeek, previousWeek, ratio };
}
