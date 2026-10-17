import { fetchJson, type DataSource, type RankingFile } from "./source";

// Reads the JSON saved by scripts/fetch-ranking.ts. The browser never calls the API directly.
export const snapshotSource: DataSource = {
  name: "snapshot",
  loadRanking: () => fetchJson<RankingFile>("/data/ranking.json"),
};
