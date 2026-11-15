import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BallIcon from "../components/BallIcon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useScene } from "../context/SceneContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { Store, Auth } from "../lib/storage.js";
import { dateKo } from "../lib/format.js";
import { TYPES } from "../lib/stats.js";

const TAG = { batter: "bat", pitcher: "pit", team: "team" };
const metricLabels = rec => (rec.result.kind === "team" ? rec.result.metrics : rec.result.lines).map(x => x.label).join(", ");

/** 분석 기록: 목록, 정렬, 다시 열기, 삭제 */
export default function History() {
  useScene("stadium");
  const toast = useToast();
  useAuth();
  const [list, setList] = useState(() => Store.list());
  const [order, setOrder] = useState("new");
  const [confirmId, setConfirmId] = useState(null);

  // 다른 기기에서 만든 기록을 가져와 합친다 (실제 로그인일 때만)
  useEffect(() => { Store.pull().then(ch => { if (ch) setList(Store.list()); }); }, []);

  const sorted = list.slice().sort((a, b) => (order === "new" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  const del = id => { Store.remove(id); setList(Store.list()); setConfirmId(null); toast("분석 기록을 삭제했습니다."); };

  if (!sorted.length) {
    return (
      <div className="wrap"><div className="empty">
        <BallIcon /><h1>아직 분석 기록이 없습니다</h1>
        <p className="sub">분석을 하면 결과가 여기에 자동으로 저장돼요.</p>
        <Link className="btn pri" to="/analyze">첫 분석 시작하기</Link>
      </div></div>
    );
  }
  return (
    <div className="wrap">
      <div className="list-top">
        <div><h1>분석 기록</h1><p className="sub">{sorted.length}개, {Auth.uid() ? "내 계정에 저장됩니다." : "이 브라우저에만 저장됩니다."}</p></div>
        <div className="seg2" role="group" aria-label="정렬">
          <button type="button" aria-pressed={order === "new"} onClick={() => setOrder("new")}>최신순</button>
          <button type="button" aria-pressed={order === "old"} onClick={() => setOrder("old")}>오래된순</button>
        </div>
      </div>
      <ul className="hist">
        {sorted.map(rec => (
          <li key={rec.id}>
            <Link className="t" to={`/result/${encodeURIComponent(rec.id)}`}>{rec.title}</Link>
            <div className="ops">
              {confirmId === rec.id ? (
                <>
                  <span className="confirm">이 기록을 삭제할까요?</span>
                  <button className="btn small danger" type="button" onClick={() => del(rec.id)}>삭제</button>
                  <button className="btn small ghost" type="button" onClick={() => setConfirmId(null)}>취소</button>
                </>
              ) : (
                <button className="linkbtn quiet" type="button" aria-label={`${rec.title} 삭제`} onClick={() => setConfirmId(rec.id)}>삭제</button>
              )}
            </div>
            <div className="meta"><span className={"tag " + TAG[rec.type]}>{TYPES[rec.type].short}</span>{dateKo(rec.createdAt)}, {metricLabels(rec)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
