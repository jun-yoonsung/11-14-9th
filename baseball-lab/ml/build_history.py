#!/usr/bin/env python3
"""과거 시즌(1982~2025) 분석용 데이터와 역대 기록을 만든다. 원본: Kaggle 'KBO Player Stats 1982-2026'(CC BY-NC-SA 4.0).
만드는 파일(public/data): batters_hist.csv, pitchers_hist.csv, teams_hist.csv, records.json, meta.json(seasonInfo·allSeasons 추가)
과거 시즌에는 투구별 기록(스윙·헛스윙·구속 등)이 없어 기본 기록 지표만 계산할 수 있다."""
import json, re, sys
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parent.parent; RAW = ROOT / "ml/raw"; DATA = ROOT / "public/data"
LAST = 2026
TEAM_NAMES = {"OB": "OB(현 두산)", "MBC": "MBC(현 LG)", "해태": "해태(현 KIA)", "빙그레": "빙그레(현 한화)", "SK": "SK(현 SSG)", "넥센": "넥센(현 키움)", "우리": "우리(현 키움)", "히어로즈": "히어로즈(현 키움)", "청보": "청보", "태평양": "태평양", "삼미": "삼미", "쌍방울": "쌍방울", "현대": "현대"}
POS = {"C": "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수", "SS": "유격수", "OF": "외야수", "DH": "지명타자", "P": "투수"}

def outs_of(v):
    s = str(v).strip(); m = re.match(r"^(\d+)(?:\s+(\d)/3)?$", s)
    if m: return int(m.group(1)) * 3 + (int(m.group(2)) if m.group(2) else 0)
    m = re.match(r"^(\d)/3$", s); return int(m.group(1)) if m else 0

def load():
    b = pd.read_csv(RAW / "kbo_batting_stats_season_1982-2026.csv", low_memory=False)
    p = pd.read_csv(RAW / "kbo_pitching_stats_season_1982-2026.csv", low_memory=False)
    p["outs"] = p.IP.map(outs_of)
    # 한 시즌에 팀을 옮긴 선수는 시즌 기록을 합친다(대표 팀은 마지막 팀)
    nb = ["G", "PA", "AB", "H", "2B", "3B", "HR", "RBI", "R", "BB", "HBP", "SO", "SF", "SB"]
    b = b.sort_values(["Id", "Season"]).groupby(["Id", "Season"], as_index=False).agg(Player=("Player", "first"), Team=("Team", "last"), Pos=("Position", "first"), Age=("Age", "first"), **{c: (c, "sum") for c in nb})
    np_ = ["G", "H", "HR", "BB", "HBP", "SO", "R", "ER", "W", "L", "SV", "HLD", "outs"]
    p = p.sort_values(["Id", "Season"]).groupby(["Id", "Season"], as_index=False).agg(Player=("Player", "first"), Team=("Team", "last"), Age=("Age", "first"), **{c: (c, "sum") for c in np_})
    return b, p

def teams_table(p, b):
    t = p.groupby(["Season", "Team"], as_index=False).agg(w=("W", "sum"), l=("L", "sum"), ra=("R", "sum"))
    rs = b.groupby(["Season", "Team"], as_index=False).agg(rs=("R", "sum"))
    t = t.merge(rs, on=["Season", "Team"], how="inner"); t = t[(t.w + t.l) > 40].copy()
    t["g"] = t.w + t.l; t["d"] = 0
    return t

def main():
    b, p = load(); t = teams_table(p, b)
    # ---- 시즌 정보: 경기 수와 규정(타석 3.1×경기, 이닝 1.0×경기) ----
    info = {}
    for s, g in t.groupby("Season"):
        games = int(g.g.max()); info[int(s)] = {"games": games, "batterPa": round(3.1 * games), "pitcherOuts": games * 3, "teams": int(len(g))}
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    meta["allSeasons"] = sorted(info.keys(), reverse=True); meta["seasonInfo"] = {str(k): v for k, v in sorted(info.items())}
    meta["teamNames"] = TEAM_NAMES
    meta["historyNote"] = "1982~2025 시즌은 KBO 공식 기록(Kaggle KBO Player Stats 1982–2026, CC BY-NC-SA 4.0)이라 투구별 기록(스윙·구속 등)이 없어 기본 기록 지표만 계산합니다."
    (DATA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- 타자·투수 시즌 기록(과거) ----
    h = b[b.Season < LAST].copy()
    for c in ["SF", "HBP", "2B", "3B", "SB"]: h[c] = h[c].fillna(0)
    out = pd.DataFrame({"pid": h.Id.astype(str), "id": h.Id.astype(str), "name": h.Player, "team": h.Team, "pos": h.Pos.map(POS).fillna("타자"), "season": h.Season, "g": h.G, "pa": h.PA, "ab": h.AB, "h": h.H,
                        "d2": h["2B"], "d3": h["3B"], "hr": h.HR, "rbi": h.RBI, "bb": h.BB, "hbp": h.HBP, "so": h.SO, "sf": h.SF, "r": h.R, "sb": h.SB}).astype({c: int for c in ["g", "pa", "ab", "h", "d2", "d3", "hr", "rbi", "bb", "hbp", "so", "sf", "r", "sb"]})
    out = out[out.pa > 0]; out.to_csv(DATA / "batters_hist.csv", index=False, encoding="utf-8")
    q = p[p.Season < LAST].copy()
    outp = pd.DataFrame({"pid": q.Id.astype(str), "id": q.Id.astype(str), "name": q.Player, "team": q.Team, "pos": "투수", "hand": "", "season": q.Season, "g": q.G, "outs": q.outs, "h": q.H, "bb": q.BB, "hbp": q.HBP, "so": q.SO, "hr": q.HR, "er": q.ER, "r": q.R, "w": q.W, "l": q.L, "sv": q.SV, "hld": q.HLD.fillna(0)}).astype({c: int for c in ["g", "outs", "h", "bb", "hbp", "so", "hr", "er", "r", "w", "l", "sv", "hld"]})
    outp = outp[outp.outs > 0]; outp.to_csv(DATA / "pitchers_hist.csv", index=False, encoding="utf-8")
    th = t[t.Season < LAST]
    pd.DataFrame({"id": th.Team, "name": th.Team.map(lambda x: TEAM_NAMES.get(x, x)), "season": th.Season, "g": th.g, "w": th.w, "l": th.l, "d": th.d, "rs": th.rs, "ra": th.ra}).to_csv(DATA / "teams_hist.csv", index=False, encoding="utf-8")
    print(f"타자 {len(out)}행, 투수 {len(outp)}행, 팀 {len(th)}행, 시즌 {len(info)}개")

    # ---- 역대 기록(records.json) ----
    def obp(d): return (d.H + d.BB + d.HBP) / (d.AB + d.BB + d.HBP + d.SF).replace(0, np.nan)
    b2 = b.copy()
    for c in ["SF", "HBP", "SB"]: b2[c] = b2[c].fillna(0)
    b2["OBP"] = obp(b2); b2["SLG"] = (b2.H + b2["2B"].fillna(0) + 2 * b2["3B"].fillna(0) + 3 * b2.HR) / b2.AB.replace(0, np.nan); b2["OPS"] = b2.OBP + b2.SLG; b2["AVG"] = b2.H / b2.AB.replace(0, np.nan)
    b2["qpa"] = b2.Season.map(lambda s: info[int(s)]["batterPa"] if int(s) in info else 446)
    p2 = p.copy(); ip = p2.outs / 3
    p2["ERA"] = p2.ER * 9 / ip.replace(0, np.nan); p2["WHIP"] = (p2.BB + p2.H) / ip.replace(0, np.nan); p2["K9"] = p2.SO * 9 / ip.replace(0, np.nan)
    p2["qo"] = p2.Season.map(lambda s: info[int(s)]["pitcherOuts"] if int(s) in info else 432)
    N = 100
    def career(df, col, name_col="Player", n=N, fmt=None):
        g = df.groupby("Id").agg(v=(col, "sum"), name=(name_col, "last"), first=("Season", "min"), last=("Season", "max"), team=("Team", "last")).sort_values("v", ascending=False).head(n)
        return [[str(i), r["name"], r["team"], round(float(r["v"]), 1) if fmt == "ip" else int(r["v"]), int(r["first"]), int(r["last"])] for i, r in g.iterrows()]
    def season(df, col, asc=False, n=N, minmask=None, digits=0):
        d = df if minmask is None else df[minmask]
        d = d.dropna(subset=[col]).sort_values(col, ascending=asc).head(n)
        return [[str(r["Id"]), r["Player"], r["Team"], int(r["Season"]), round(float(r[col]), digits) if digits else int(r[col])] for _, r in d.iterrows()]
    rec = {"meta": {"source": "Kaggle: netsong / KBO Player Stats 1982-2026 (CC BY-NC-SA 4.0), KBO 공식 기록 기반", "last": LAST, "note": "통산은 KBO 1군 기록만. 시즌 비율 기록(타율·OPS·ERA 등)은 그 시즌 규정(타자 3.1타석×경기, 투수 1이닝×경기)을 채운 선수만."}, "career": {"batter": {}, "pitcher": {}}, "season": {"batter": {}, "pitcher": {}}}
    for k, col in [("HR", "HR"), ("H", "H"), ("RBI", "RBI"), ("R", "R"), ("SB", "SB"), ("BB", "BB"), ("G", "G"), ("PA", "PA")]: rec["career"]["batter"][k] = career(b2, col)
    for k, col in [("W", "W"), ("SV", "SV"), ("SO", "SO"), ("G", "G"), ("HLD", "HLD")]: rec["career"]["pitcher"][k] = career(p2.assign(HLD=p2.HLD.fillna(0)), col)
    rec["career"]["pitcher"]["IP"] = career(p2.assign(IPo=p2.outs / 3), "IPo", fmt="ip")
    q = b2.PA >= b2.qpa
    for k, col, asc, dg in [("HR", "HR", False, 0), ("H", "H", False, 0), ("RBI", "RBI", False, 0), ("SB", "SB", False, 0), ("BB", "BB", False, 0), ("AVG", "AVG", False, 3), ("OBP", "OBP", False, 3), ("SLG", "SLG", False, 3), ("OPS", "OPS", False, 3)]:
        rec["season"]["batter"][k] = season(b2, col, asc, minmask=(q if dg else None), digits=dg)
    qp = p2.outs >= p2.qo
    for k, col, asc, dg in [("W", "W", False, 0), ("SV", "SV", False, 0), ("SO", "SO", False, 0), ("HLD", "HLD", False, 0), ("ERA", "ERA", True, 2), ("WHIP", "WHIP", True, 2), ("K9", "K9", False, 1)]:
        rec["season"]["pitcher"][k] = season(p2.assign(HLD=p2.HLD.fillna(0)), col, asc, minmask=(qp if dg else None), digits=dg)
    path = DATA / "records.json"; path.write_text(json.dumps(rec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"); print("records.json", path.stat().st_size // 1024, "KB")
    print("통산 HR 1~3:", rec["career"]["batter"]["HR"][:3]); print("시즌 ERA 1~2:", rec["season"]["pitcher"]["ERA"][:2])

if __name__ == "__main__": main()
