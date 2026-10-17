import type { MockVideo, VideoCredit } from "../types";

export function creditLine(c: VideoCredit): string {
  return `映像：${c.title}（${c.year}）© ${c.author} / ${c.license}`;
}

export function CreditLine({ credit }: { credit: VideoCredit | null }) {
  if (!credit) return null;
  return (
    <a className="credit-line" href={credit.sourceUrl} target="_blank" rel="noreferrer">
      {creditLine(credit)}
    </a>
  );
}

export function CreditsDialog({ videos, onClose }: { videos: MockVideo[]; onClose: () => void }) {
  return (
    <div className="zoom-backdrop" onClick={onClose}>
      <div className="credits" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-header">
          <span className="zoom-title">クレジット</span>
          <button className="close-button" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="credits-body">
          <p className="muted">
            タイトル・再生数などの一覧はニコニコ動画のスナップショット検索API v2から取得したものです。「VOICEROIDキッチン」タグの動画のサムネイルは、各投稿者の作品をデモのためだけに表示しています。映像は実際の動画ではなく、以下のオープンムービーを各枠に割り当てたものです。コメントと要約は生成したモックです。
          </p>
          <table>
            <thead>
              <tr>
                <th>枠</th>
                <th>作品</th>
                <th>著作者</th>
                <th>ライセンス</th>
                <th>変更</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.mockId}>
                  <td>{Number(v.mockId.slice(4))}位</td>
                  <td>
                    <a href={v.credit.sourceUrl} target="_blank" rel="noreferrer">
                      {v.credit.title}（{v.credit.year}）
                    </a>
                  </td>
                  <td>© {v.credit.author}</td>
                  <td>
                    <a href={v.credit.licenseUrl} target="_blank" rel="noreferrer">
                      {v.credit.license}
                    </a>
                  </td>
                  <td className="muted">{v.credit.changes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
