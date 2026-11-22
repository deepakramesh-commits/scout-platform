import type { Q } from "@/lib/auth";
import type { QcSettings } from "@/lib/qc";

export type Settings = QcSettings & { sampleMinutes: number };

export async function readSettings(tx: Q): Promise<Settings> {
  const rows = await tx<{ key: string; value: number }[]>`select key, value from settings where key like 'qc_%'`;
  const get = (k: string, fallback: number) => Number(rows.find((r) => r.key === k)?.value ?? fallback);
  return {
    countAgreement: get("qc_count_agreement", 0.9),
    locationTolerance: get("qc_location_tolerance", 10),
    timeWindow: get("qc_time_window", 3),
    sampleMinutes: get("qc_sample_minutes", 15),
  };
}
