import { config } from "../config";
import { formatCount } from "../format";
import type { BudgetResult } from "../engine/qualityBudget";
import type { EndAction, GridLayout, ThumbnailStyle } from "../types";

interface Props {
  started: boolean;
  onStart: () => void;
  rate: number;
  onRate: (rate: number) => void;
  premium: boolean;
  onPremium: (on: boolean) => void;
  highlight: boolean;
  onHighlight: (on: boolean) => void;
  endAction: EndAction;
  onEndAction: (a: EndAction) => void;
  showDebug: boolean;
  onDebug: (on: boolean) => void;
  thumbnailStyle: ThumbnailStyle;
  onThumbnailStyle: (s: ThumbnailStyle) => void;
  layout: GridLayout;
  onLayout: (layout: GridLayout) => void;
  onCredits: () => void;
}

const THUMBNAIL_STYLES: { key: ThumbnailStyle; label: string }[] = [
  { key: "real", label: "そのまま" },
  { key: "mosaic", label: "モザイク" },
  { key: "off", label: "モック" },
];

export function ControlBar(p: Props) {
  return (
    <div className="control-bar">
      <div className="brand">
        <span className="brand-title" title="盛り上がりでザッピング">
          ニコザップ
        </span>
        <button
          className="link-button"
          title="映像はオープンムービー（CC BY）・サムネは投稿者の作品"
          onClick={p.onCredits}
        >
          クレジット
        </button>
      </div>
      <RateSlider rate={p.rate} onRate={p.onRate} premium={p.premium} onPremium={p.onPremium} />
      <div className="control-group">
        <span className="control-label">枠</span>
        {config.gridLayouts.map((l) => (
          <button
            key={`${l.cols}x${l.rows}`}
            className={l.cols === p.layout.cols && l.rows === p.layout.rows ? "active" : ""}
            onClick={() => p.onLayout(l)}
          >
            {l.cols}×{l.rows}
          </button>
        ))}
      </div>
      {!p.started ? (
        <button className="start-button" onClick={p.onStart}>
          ▶ 一斉に再生
        </button>
      ) : (
        <div className="controls">
          <div className="control-group">
            <span className="control-label">再生</span>
            <button className={p.highlight ? "active" : ""} onClick={() => p.onHighlight(true)}>
              ハイライト
            </button>
            <button className={!p.highlight ? "active" : ""} onClick={() => p.onHighlight(false)}>
              頭から
            </button>
          </div>
          <div className="control-group">
            <span className="control-label">終了時</span>
            <button className={p.endAction === "next" ? "active" : ""} onClick={() => p.onEndAction("next")}>
              次を自動再生
            </button>
            <button className={p.endAction === "remove" ? "active" : ""} onClick={() => p.onEndAction("remove")}>
              消す
            </button>
          </div>
          <div className="control-group">
            <span className="control-label">サムネ</span>
            {THUMBNAIL_STYLES.map((s) => (
              <button
                key={s.key}
                className={p.thumbnailStyle === s.key ? "active" : ""}
                onClick={() => p.onThumbnailStyle(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="control-group">
            <button className={p.showDebug ? "active" : ""} onClick={() => p.onDebug(!p.showDebug)}>
              デバッグ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RateSliderProps {
  rate: number;
  onRate: (rate: number) => void;
  premium: boolean;
  onPremium: (on: boolean) => void;
}

// Slider over config.playbackRates. Steps at or above premiumMinRate need premium.
function RateSlider({ rate, onRate, premium, onPremium }: RateSliderProps) {
  const rates = config.playbackRates;
  const allowed = premium ? rates : rates.filter((r) => r < config.premiumMinRate);
  const index = Math.max(0, rates.indexOf(rate));
  const premiumFrom = rates.findIndex((r) => r >= config.premiumMinRate);
  const premiumStart = (premiumFrom / (rates.length - 1)) * 100;
  const pick = (i: number) => {
    const r = rates[i];
    onRate(allowed.includes(r) ? r : allowed[allowed.length - 1]);
  };
  return (
    <div className="rate-slider">
      <span className="control-label">倍速</span>
      <div className="rate-track">
        <input
          type="range"
          min={0}
          max={rates.length - 1}
          step={1}
          value={index}
          onChange={(e) => pick(Number(e.target.value))}
          style={{ ["--premium-start" as string]: `${premiumStart}%` }}
          className={premium ? "" : "locked"}
          aria-label="再生速度"
        />
        <div className="rate-ticks">
          {rates.map((r, i) => (
            <button
              key={r}
              className={`rate-tick${r === rate ? " current" : ""}${r >= config.premiumMinRate ? " premium" : ""}`}
              disabled={!allowed.includes(r)}
              onClick={() => pick(i)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <span className="rate-value">×{rate}</span>
      <button
        className={`premium-toggle${premium ? " on" : ""}`}
        title={`${config.premiumMinRate}倍以上はプレミアム会員限定（モック）`}
        onClick={() => {
          if (premium && rate >= config.premiumMinRate) onRate(allowed.filter((r) => r < config.premiumMinRate).at(-1) ?? 1);
          onPremium(!premium);
        }}
      >
        {premium ? "プレミアム" : "一般会員"}
      </button>
    </div>
  );
}

export function DebugPanel({ budget, rate, tiles }: { budget: BudgetResult; rate: number; tiles: number }) {
  const ratio = budget.backgroundMpx / budget.budgetMpx;
  const counts: Record<string, number> = {};
  for (const q of Object.values(budget.qualities)) counts[q] = (counts[q] ?? 0) + 1;
  return (
    <div className="debug-panel">
      <div className="panel-title">画質予算</div>
      <div className="debug-formula">画素数 × {config.quality.fps}fps × 倍速 × 本数</div>
      <div className="debug-bar">
        <span className={ratio > 1 ? "over" : ""} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div>
        脇役 {budget.backgroundMpx.toFixed(1)} / 予算 {budget.budgetMpx} Mpx/s
      </div>
      <div className="muted">
        {tiles}本 ・ {rate}倍速 ・{" "}
        {Object.entries(counts)
          .map(([q, n]) => `${q}×${n}`)
          .join(" ")}
      </div>
      <div className="muted">主役（予算外）{budget.mainMpx > 0 ? `${budget.mainMpx.toFixed(1)} Mpx/s @720p` : "なし"}</div>
      <div className="muted">※ 画質切り替えはモック（実ファイルは全枠240p）</div>
      <div className="muted">≒ {formatCount(Math.round(budget.backgroundMpx * 1e6))} px/s</div>
    </div>
  );
}
