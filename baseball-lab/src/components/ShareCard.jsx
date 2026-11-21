import { useState } from "react";
import { Store } from "../lib/storage.js";
import { cloud } from "../lib/cloud.js";
import { useToast } from "../context/ToastContext.jsx";

export const shareUrl = id => `${location.origin}${location.pathname}#/s/${encodeURIComponent(id)}`;

/** 공개 설정: 비공개(나만 봄) / 공개(링크를 아는 누구나 읽기만 가능). 공개하면 공유 링크가 나온다 */
export default function ShareCard({ rec, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pub = rec.visibility === "public";
  const can = Store.canShare();

  const set = async vis => {
    if (busy || (vis === "public") === pub) return;
    setBusy(true);
    const ok = await Store.setVisibility(rec.id, vis);
    setBusy(false);
    if (!ok) { toast("공개 설정을 바꾸지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요."); return; }
    onChange(Store.get(rec.id));
    toast(vis === "public" ? "공개로 바꿨습니다. 아래 링크를 보내면 누구나 볼 수 있어요." : "비공개로 바꿨습니다. 이제 나만 볼 수 있어요.");
  };
  const copy = async () => {
    const url = shareUrl(rec.id);
    try { await navigator.clipboard.writeText(url); toast("링크를 복사했습니다."); }
    catch (e) { const el = document.getElementById("share-url"); if (el) { el.select(); } toast("링크를 길게 눌러 복사해 주세요."); }
  };

  return (
    <section className="share-card" aria-label="공개 설정">
      <div className="share-head">
        <div>
          <h2>공개 설정</h2>
          <p className="sub">{pub ? "공개: 링크를 아는 사람은 누구나 이 분석을 볼 수 있어요(읽기만 가능)." : "비공개: 나만 볼 수 있어요."}</p>
        </div>
        <div className="seg2" role="group" aria-label="공개 여부">
          <button type="button" aria-pressed={!pub} disabled={busy || !can} onClick={() => set("private")}>비공개</button>
          <button type="button" aria-pressed={pub} disabled={busy || !can} onClick={() => set("public")}>공개</button>
        </div>
      </div>
      {!can && <p className="note">공유는 계정(이메일·Google)으로 로그인했을 때만 쓸 수 있어요. 체험 로그인이나 계정 연결이 없는 상태에서는 이 브라우저에만 저장돼서 다른 사람이 볼 수 없습니다.</p>}
      {can && !cloud.enabled && <p className="note">시험 공유 모드(개발용 PC): 이 브라우저 안에서만 링크가 열립니다. 계정을 연결하면 다른 사람도 볼 수 있어요.</p>}
      {can && pub && (
        <div className="share-link">
          <input id="share-url" readOnly value={shareUrl(rec.id)} aria-label="공유 링크" onFocus={e => e.target.select()} />
          <button type="button" className="btn pri small" onClick={copy}>링크 복사</button>
        </div>
      )}
      {can && pub && <p className="note">비공개로 바꾸거나 이 기록을 삭제하면 링크가 바로 닫힙니다. 이미 본 사람이 저장한 PDF는 되돌릴 수 없어요.</p>}
    </section>
  );
}
