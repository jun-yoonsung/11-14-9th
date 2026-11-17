#!/usr/bin/env python3
"""2026 시즌 기록(투구별 기록에서 집계한 batters.csv·pitchers.csv)을 공식 집계(Kaggle KBO Player Stats)와 대조해,
다른 값은 공식 값으로 바꾼다. 투구별 기록 열(스윙·헛스윙·구속 등)은 그대로 둔다. 대조 결과는 ml/data_quality.json 에 남긴다.
(원래 값은 data_quality.json 의 changes 에 있어서 되돌릴 수 있다.) 두 번 실행해도 결과가 같다."""
import json, re
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parent.parent; RAW = ROOT / "ml/raw"; DATA = ROOT / "public/data"; LAST = 2026

def outs_of(v):
    s = str(v).strip(); m = re.match(r"^(\d+)(?:\s+(\d)/3)?$", s)
    if m: return int(m.group(1)) * 3 + (int(m.group(2)) if m.group(2) else 0)
    m = re.match(r"^(\d)/3$", s); return int(m.group(1)) if m else 0

def main():
    b = pd.read_csv(RAW / "kbo_batting_stats_season_1982-2026.csv", low_memory=False); p = pd.read_csv(RAW / "kbo_pitching_stats_season_1982-2026.csv", low_memory=False)
    p["outs"] = p.IP.map(outs_of)
    kb = b[b.Season == LAST].groupby("Id").agg(g=("G", "sum"), pa=("PA", "sum"), ab=("AB", "sum"), h=("H", "sum"), d2=("2B", "sum"), d3=("3B", "sum"), hr=("HR", "sum"), rbi=("RBI", "sum"), bb=("BB", "sum"), hbp=("HBP", "sum"), so=("SO", "sum"), sf=("SF", "sum"), r=("R", "sum"))
    kp = p[p.Season == LAST].groupby("Id").agg(g=("G", "sum"), outs=("outs", "sum"), h=("H", "sum"), bb=("BB", "sum"), hbp=("HBP", "sum"), so=("SO", "sum"), hr=("HR", "sum"), er=("ER", "sum"), r=("R", "sum"))
    report = {"source": "Kaggle KBO Player Stats 1982-2026 (공식 집계)", "season": LAST, "changes": [], "summary": {}}
    for name, kdf in (("batters", kb), ("pitchers", kp)):
        path = DATA / f"{name}.csv"; df = pd.read_csv(path, dtype={"pid": str, "id": str}); n_cmp = 0; n_chg = 0; cols = list(kdf.columns); per = {c: 0 for c in cols}
        for i, row in df.iterrows():
            pid = int(row.pid)
            if pid not in kdf.index: continue
            n_cmp += 1
            for c in cols:
                new = int(kdf.at[pid, c]); old = int(row[c])
                if old != new:
                    report["changes"].append({"file": name, "pid": str(pid), "name": row["name"], "col": c, "old": old, "new": new}); df.at[i, c] = new; per[c] += 1; n_chg += 1
        df.to_csv(path, index=False, encoding="utf-8")
        report["summary"][name] = {"rows": int(len(df)), "compared": n_cmp, "not_in_official": int(len(df) - n_cmp), "values_changed": n_chg, "by_column": {k: v for k, v in per.items() if v}}
    old = json.loads((ROOT / "ml/data_quality.json").read_text(encoding="utf-8")) if (ROOT / "ml/data_quality.json").exists() else None
    if old and not report["changes"]: report["changes"] = old.get("changes", []); report["summary"]["note"] = "이미 공식 값으로 맞춰져 있음(이전 실행의 변경 내역 유지)"
    (ROOT / "ml/data_quality.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=1))

if __name__ == "__main__": main()
