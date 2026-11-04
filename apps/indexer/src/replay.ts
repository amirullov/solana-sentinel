import { readFile } from "node:fs/promises";
import type { EventRepository } from "@sentinel/database";
import { processObservation, type AccountObservation } from "./pipeline.js";

export interface ReplaySummary {
  readonly read: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly ignored: number;
}

export async function replayFile(
  path: string,
  repository: EventRepository
): Promise<ReplaySummary> {
  const observations = JSON.parse(await readFile(path, "utf8")) as AccountObservation[];
  const counters = { read: observations.length, inserted: 0, duplicates: 0, ignored: 0 };
  for (const observation of observations) {
    const result = await processObservation(observation, repository);
    if (result.status === "inserted") counters.inserted += 1;
    if (result.status === "duplicate") counters.duplicates += 1;
    if (result.status === "ignored") counters.ignored += 1;
  }
  return counters;
}
