import { fetchJson, type DataSource, type RankingFile } from "./source";

export const mockSource: DataSource = {
  name: "mock",
  loadRanking: () => fetchJson<RankingFile>("/data/ranking.mock.json"),
};
