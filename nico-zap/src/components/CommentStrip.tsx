import { config } from "../config";
import { recentComments } from "../engine/excitement";
import { formatTime } from "../format";
import type { CommentEvent } from "../types";

// Comments are listed outside the video frame (never overlaid on the picture).
export function CommentStrip({ comments, t }: { comments: CommentEvent[]; t: number }) {
  const list = recentComments(comments, t, config.zoom.commentWindowSeconds, config.zoom.recentComments);
  return (
    <div className="comment-strip">
      <div className="panel-title">直近のコメント</div>
      {list.length === 0 && <div className="muted">（コメントはまだありません）</div>}
      <ul>
        {list.map((c, i) => (
          <li key={`${c.t}-${i}`}>
            <span className="comment-time">{formatTime(c.t)}</span>
            <span className="comment-text">{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
