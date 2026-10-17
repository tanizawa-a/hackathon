# 動画スタック拡張機能 実装計画書

ハッカソン副案。YouTube視聴中のページに、気になった動画を小窓（PiP風）として次々に追加し、同時再生できるChrome拡張機能を4時間で実装する。

## 1. 前提

| 項目 | 内容 |
|---|---|
| 開発時間 | 約4時間 |
| 対象サイト | YouTubeのみ |
| 小窓の配置 | 視聴中のページ上に重ねて表示（オーバーレイ） |
| デモの目玉 | 右クリックでのスタック追加、ズームして他の小窓を停止 |
| 対象外 | 盛り上がり検知、キャッチアップ要約、ニコニコ動画対応（スライドで将来像として説明） |

## 2. 技術方針

- Manifest V3 の Chrome 拡張機能として実装する。
- 小窓は YouTube の埋め込みプレイヤー（iframe）を使う。
  - URL: `https://www.youtube.com/embed/{videoId}?enablejsapi=1&autoplay=1&mute=1&playsinline=1`
  - 再生・停止・ミュート・倍速は `postMessage` で iframe に命令を送って操作する。
- 追加の入口は、動画リンクの右クリックメニュー「小窓に追加」とする。
  - サムネイルにボタンを挿入する方式は YouTube の DOM 変更に弱いため採用しない。
- 小窓パネルは `document.body` 直下に配置する。YouTube はページ遷移時に全体を再読み込みしないため、探索中も小窓が残る想定（要検証）。

## 3. ファイル構成

```
pip-stack/
├── manifest.json
├── background.js   # 右クリックメニューの登録、動画IDの抽出、タブへの送信
├── content.js      # 小窓パネルの生成、iframe管理、ズーム・倍速制御
└── content.css     # パネルとグリッドのスタイル
```

### manifest.json（骨組み）

```json
{
  "manifest_version": 3,
  "name": "PiP Stack",
  "version": "0.1.0",
  "permissions": ["contextMenus"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ]
}
```

## 4. 機能仕様

### 4.1 スタック追加

- 動画リンクを右クリック →「小窓に追加」を選択。
  - `contextMenus` の `targetUrlPatterns` で `*://www.youtube.com/watch*` に限定する。
- background.js でリンクURLから動画IDを取り出し、`chrome.tabs.sendMessage` で content.js に送る。
- content.js はパネルに iframe を追加する。同じ動画IDの重複追加は無視する。
- 本数に応じてレイアウトを自動で切り替える。

| 本数 | レイアウト |
|---|---|
| 1 | 1列 |
| 2〜4 | 2×2 |
| 5〜9 | 3×3 |
| 10以上 | 追加しない（上限表示） |

### 4.2 ズーム

- 小窓をクリックするとズーム状態にする。
  - ズーム対象：拡大表示、ミュート解除、再生。
  - それ以外：一時停止。
- もう一度クリック（または戻るボタン）でグリッドに戻る。
  - ズームしていた動画：ミュートに戻す。
  - それ以外：ミュートのまま再生を再開。

### 4.3 小窓の操作

- 各小窓に「×」ボタン（削除）。
- パネル上部に全体の倍速切替（1 / 1.5 / 2倍）。全 iframe に `setPlaybackRate` を送る。
- 埋め込み不可の動画は、エラー表示に切り替えて削除を促す。

### 4.4 postMessage の命令形式

```js
function sendCommand(iframe, func, args = []) {
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "https://www.youtube.com"
  );
}

// 使用例
sendCommand(iframe, "pauseVideo");
sendCommand(iframe, "playVideo");
sendCommand(iframe, "mute");
sendCommand(iframe, "unMute");
sendCommand(iframe, "setPlaybackRate", [2]);
```

※ iframe の読み込み完了前に送った命令は無視される可能性がある。`load` イベント後に送ること。

## 5. タイムライン

| 時間 | 作業 | 完了条件 |
|---|---|---|
| 0:00–0:20 | 技術検証（下記3点） | 3点とも手動で確認できた |
| 0:20–1:20 | 右クリック追加、パネル生成、自動レイアウト | 4本スタックできる |
| 1:20–2:10 | ズームと他小窓の停止・再開 | 主役の切り替えが安定して動く |
| 2:10–2:50 | ×ボタン、倍速切替、埋め込み不可のエラー表示 | 想定外の動画を入れても崩れない |
| 2:50–3:20 | 見た目の調整、パネルのドラッグ移動（余裕があれば） | デモで見栄えする |
| 3:20–4:00 | 機能追加は停止。デモ通し練習とバッファ | 3回通して問題が出ない |

### 0:00–0:20 の検証項目

1. youtube.com 上に embed の iframe を差し込んで再生できるか。
2. `postMessage` で pauseVideo / mute / setPlaybackRate が効くか。
3. YouTube 内で別の動画に遷移しても、差し込んだ要素が残るか。

### 検証が通らなかった場合の代替策

| 失敗した項目 | 代替策 |
|---|---|
| 1. iframe が表示されない | 拡張機能内のページ（`chrome-extension://` の HTML）を別ウィンドウで開き、そこに並べる |
| 2. postMessage が効かない | IFrame Player API のスクリプトを読み込んで `YT.Player` 経由で操作する |
| 3. 遷移で小窓が消える | `yt-navigate-finish` イベントを拾ってパネルを再生成し、動画IDと再生位置を保持して復元する |

## 6. リスクと対策

| リスク | 対策 |
|---|---|
| 埋め込み禁止の動画がある | エラー表示にして削除を促す。デモ用動画は事前に埋め込み可能なものを選んでおく |
| 埋め込みでも広告が流れる | デモ用動画を事前に確認し、問題が少ないものを使う |
| 本数が増えるとPCが重くなる | 上限を9本にする。デモ機で事前に9本同時再生を試す |
| 画質を細かく制御できない | 画質指定APIには頼らない。小窓サイズに応じたプレイヤー側の自動選択に任せる |
| 自動再生がブロックされる | ミュート付き自動再生（`mute=1`）で開始する |

## 7. 後回し・ストレッチ

- 再生終了時に小窓を自動で消す／次の動画を再生する（iframe からの状態通知の受信が必要）
- Document Picture-in-Picture API で、パネルを最前面の別ウィンドウに出す（iframe が中で動作するかは未検証）
- 現在視聴中の動画を小窓に送るボタン
- キーボードショートカット

## 8. 将来像（スライドで説明）

- 生配信のコメント急増を検知し、小窓を光らせて知らせる
- ズーム時・復帰時に、直近の流れを要約して表示する
- ニコニコ動画の新機能「動画のマルチ表示＆ザッピング支援」として、ランキング上位を自動で同時再生する

## 9. デモ手順

1. YouTube で普通に動画を見ている状態から始める。
2. 検索しながら、気になった動画を右クリックで3本追加する → 小窓が並ぶ。
3. 1本をクリックしてズーム → 他の小窓が止まる。もう一度押すと全体が戻る。
4. 2倍速に切り替え、「複数を速く浴びる」体験を見せる。
