import { useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import { parseVideoId, search } from "../engine/ranking";
import { formatCount } from "../format";
import type { PoolItem } from "../types";

interface Props {
  items: PoolItem[];
  blocked: Set<string>;
  addedIds: Set<string>;
  onAdd: (item: PoolItem | string) => void;
  onClose: () => void;
}

// Manual mode: search the downloaded pools by title / tag, or paste a video id or URL.
export function AddVideoPanel({ items, blocked, addedIds, onAdd, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => search(items, query, blocked, config.searchResultLimit), [items, query, blocked]);
  const pastedId = parseVideoId(query);
  const pastedKnown = pastedId ? results.some((r) => r.id === pastedId) : false;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="zoom-backdrop" onClick={onClose}>
      <div className="add-panel" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-header">
          <span className="zoom-title">動画を追加</span>
          <button className="close-button" onClick={onClose}>
            閉じる（Esc）
          </button>
        </div>
        <div className="add-body">
          <input
            ref={inputRef}
            className="add-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タイトル・タグで検索、または動画ID／URL（sm9 など）を貼り付け"
          />
          {pastedId && !pastedKnown && (
            <button
              className="add-result"
              disabled={addedIds.has(pastedId) || blocked.has(pastedId)}
              onClick={() => onAdd(pastedId)}
            >
              <span className="add-result-title">{pastedId} を追加</span>
              <span className="muted">一覧にない動画（タイトル・再生数は表示されません）</span>
            </button>
          )}
          {query && results.length === 0 && !pastedId && <div className="muted">見つかりませんでした</div>}
          <div className="add-results">
            {results.map((r) => {
              const added = addedIds.has(r.id);
              return (
                <button key={r.id} className="add-result" disabled={added} onClick={() => onAdd(r)}>
                  <span className="add-result-title">{r.title}</span>
                  <span className="muted">
                    {r.genre ?? "ジャンルなし"} ・ 再生 {formatCount(r.viewCounter)} ・ コメ {formatCount(r.commentCounter)}
                    {added && " ・ 追加済み"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="muted add-note">
            検索対象は事前に取得した一覧（{items.length}本）だけです。追加した動画は空き枠に入り、枠が埋まっていれば待機に並びます。
          </div>
        </div>
      </div>
    </div>
  );
}
