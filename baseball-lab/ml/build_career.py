#!/usr/bin/env python3
"""선수별 커리어(시즌별 기록)와 시즌별 리그 평균을 public/data/career.json 으로 만든다.
Kaggle 'KBO Player Stats 1982-2026'(CC BY-NC-SA 4.0)에서 1982년 이후 모든 선수(pid = KBO 선수 번호)를 담는다(과거 시즌 분석에서도 커리어 그래프를 보여 주기 위함)."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(Path(__file__).parent))
import train_forecast as T

def r(v, n):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), n)

def main():
    b, p = T.load()
    ours_b = set(pd.read_csv(T.ROOT / "public/data/batters.csv").pid.astype(str)); ours_p = set(pd.read_csv(T.ROOT / "public/data/pitchers.csv").pid.astype(str))
    b["Id"] = b.Id.astype(str); p["Id"] = p.Id.astype(str)
    out = {"meta": {"source": "Kaggle: netsong / KBO Player Stats 1982-2026 (CC BY-NC-SA 4.0), KBO 공식 기록 기반", "base_season": T.LAST,
                    "note": "타자 행: [시즌, 나이, 팀, 경기, 타석, 타율, 출루율, 장타율, OPS, 홈런] / 투수 행: [시즌, 나이, 팀, 경기, 이닝, ERA, WHIP, K/9, 승, 패, 세이브]"},
           "league": {"batter": {}, "pitcher": {}}, "players": {"batter": {}, "pitcher": {}}}
    b["AVG"] = b.H / b.AB.replace(0, np.nan)
    for s, g in b[b.PA >= 100].groupby("Season"): out["league"]["batter"][int(s)] = r(g.OPS.mean(), 3)
    for s, g in p[p.IPf >= 30].groupby("Season"): out["league"]["pitcher"][int(s)] = r(g.ERA.mean(), 2)
    for pid, g in b.sort_values("Season").groupby("Id"):
        out["players"]["batter"][pid] = [[int(x.Season), r(x.Age, 0), x.Team, int(x.G), int(x.PA), r(x.AVG, 3), r(x.OBP, 3), r(x.SLG, 3), r(x.OPS, 3), int(x.HR)] for x in g.itertuples()]
    for pid, g in p.sort_values("Season").groupby("Id"):
        out["players"]["pitcher"][pid] = [[int(x.Season), r(x.Age, 0), x.Team, int(x.G), r(x.IPf, 1), r(x.ERA, 2), r(x.WHIP, 2), r(x.K9, 1), int(x.W), int(x.L), int(x.SV)] for x in g.itertuples()]
    path = T.ROOT / "public/data/career.json"; path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"타자 {len(out['players']['batter'])}명, 투수 {len(out['players']['pitcher'])}명 -> {path} ({path.stat().st_size // 1024}KB)")

if __name__ == "__main__": main()
