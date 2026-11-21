import { useEffect, useState } from "react";
import { Api } from "./api.js";
import { Store } from "./storage.js";
import { cloud } from "./cloud.js";
import { build } from "./detail.js";
import { qualFor } from "./season.js";

/** 저장된 분석 기록을 가져온다 (다른 기기에서 만든 기록이면 계정에서 불러온다) */
export function useRecord(id, shared = false) {
  const [rec, setRec] = useState(() => (shared ? null : Store.get(id)));
  const [owner, setOwner] = useState("");
  const [loaded, setLoaded] = useState(!shared && !!Store.get(id));
  useEffect(() => {
    if (rec) return;
    if (shared) { cloud.getShared(id).then(r => { if (r) { setRec(r.rec); setOwner(r.owner); } setLoaded(true); }); return; }
    Store.pull().then(() => { setRec(Store.get(id)); setLoaded(true); });
  }, [id, rec, shared]);
  return { rec, loaded, owner };
}

/** 상세 보고서: 저장된 것이 있으면 그대로, 이전에 만든 기록이면 지금 만든다 */
export function useReport(rec) {
  const player = rec && (rec.type === "batter" || rec.type === "pitcher") && rec.result.kind !== "team" && rec.result.kind !== "compare";
  const [rep, setRep] = useState(rec && rec.result.report ? rec.result.report : null);
  useEffect(() => {
    if (rep || !player) return;
    let dead = false;
    (async () => {
      try {
        const meta = await Api.meta();
        const rows = await (rec.type === "batter" ? Api.batters(rec.season) : Api.pitchers(rec.season));
        const monthly = await Api.monthly(rec.type, rec.params.target, rec.season);
        const mix = rec.type === "pitcher" ? await Api.pitchmix(rec.params.target, rec.season) : null;
        if (!dead) setRep(build(rec.type, rows, rec.params.target, qualFor(meta, rec.season), meta, monthly, mix));
      } catch (e) { /* 만들지 못하면 상세 보고서 없이 보여 준다 */ }
    })();
    return () => { dead = true; };
  }, [rec, rep, player]);
  return rep;
}
