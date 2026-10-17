import { useState } from "react";
import { CATEGORIES, METRICS, PRESET_TAGS } from "../config";
import type { RankingMetric, SourceMode } from "../types";

interface Props {
  mode: SourceMode;
  onMode: (mode: SourceMode) => void;
  metric: RankingMetric;
  onMetric: (metric: RankingMetric) => void;
  categories: string[];
  onCategories: (categories: string[]) => void;
  tag: string;
  onTag: (tag: string) => void;
  onOpenAdd: () => void;
  onClear: () => void;
  sourceLabel: string;
}

const MODES: { key: SourceMode; label: string }[] = [
  { key: "ranking", label: "ランキング" },
  { key: "tag", label: "タグ（オート）" },
  { key: "manual", label: "マニュアル" },
];

export function SourceBar(p: Props) {
  const [tagInput, setTagInput] = useState("");
  const toggle = (c: string) =>
    p.onCategories(p.categories.includes(c) ? p.categories.filter((x) => x !== c) : [...p.categories, c]);

  return (
    <div className="ranking-bar">
      <div className="control-group mode-tabs">
        {MODES.map((m) => (
          <button key={m.key} className={p.mode === m.key ? "active" : ""} onClick={() => p.onMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      {p.mode !== "manual" && (
        <div className="control-group">
          <span className="control-label">指標</span>
          <select value={p.metric} onChange={(e) => p.onMetric(e.target.value as RankingMetric)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {p.mode === "ranking" && (
        <div className="control-group categories">
          <span className="control-label">カテゴリ</span>
          <button className={`chip${p.categories.length === 0 ? " active" : ""}`} onClick={() => p.onCategories([])}>
            すべて
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip${p.categories.includes(c) ? " active" : ""}`} onClick={() => toggle(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {p.mode === "tag" && (
        <div className="control-group categories">
          <span className="control-label">タグ</span>
          <form
            className="tag-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (tagInput.trim()) p.onTag(tagInput.trim());
            }}
          >
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="タグを入力"
              list="preset-tags"
            />
            <datalist id="preset-tags">
              {PRESET_TAGS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </form>
          {PRESET_TAGS.map((t) => (
            <button key={t} className={`chip${p.tag === t ? " active" : ""}`} onClick={() => p.onTag(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {p.mode === "manual" && (
        <div className="control-group">
          <button className="add-button" onClick={p.onOpenAdd}>
            ＋ 動画を追加
          </button>
          <button onClick={p.onClear}>すべて外す</button>
          <span className="muted hint">枠の × で外すと、待機中の動画が繰り上がります</span>
        </div>
      )}

      <span className="muted ranking-source">{p.sourceLabel}</span>
    </div>
  );
}
