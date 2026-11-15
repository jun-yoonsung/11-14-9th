"""KBO 2026 원본 CSV를 사이트가 읽는 요약 CSV로 바꾼다.

사용:  python3 build_data.py [원본_폴더]
       (원본 폴더 기본값: ~/Downloads/kbo_2026_data, 안에 kbo_games/ 와 kbo_pitches/ 가 있어야 함)
결과:  data/ 폴더에 meta.json, batters.csv, pitchers.csv, teams.csv, *_monthly.csv, pitchmix.csv
필요:  pandas  (pip install pandas)

기준
- 정규시즌(kbo_r) 경기만 사용한다.
- 타수·안타·홈런·볼넷·삼진·타점·득점·투수 기록은 경기별 기록(kbo_games)이 기준이다.
- 2루타·3루타·사구·희생플라이는 경기별 기록에 없어 투구별 기록(kbo_pitches)의 타석 결과에서 센다.
  투구별 기록에 빠진 타석이 조금 있어 공식 기록과 소폭 다를 수 있다.
"""
import glob, json, pathlib, sys
import pandas as pd

SRC = pathlib.Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else pathlib.Path("~/Downloads/kbo_2026_data").expanduser()
OUT = pathlib.Path(__file__).resolve().parent / "data"
OUT.mkdir(exist_ok=True)
SEASON = 2026
rd = lambda f, **k: pd.read_csv(f, encoding="utf-8-sig", **k)

bat = rd(SRC / "kbo_games/batting.csv"); pit = rd(SRC / "kbo_games/pitching.csv")
bat = bat[bat.round_code == "kbo_r"].copy(); pit = pit[(pit.round_code == "kbo_r") & (pit.used == 1)].copy()   # used=0은 등판하지 않은 대기 선수
cols = ["round_code", "game_date", "batter_id", "pitcher_id", "pa_result", "pa_last_pitch", "pitch_type", "speed_kmh", "pitch_result", "plate_x", "plate_z", "sz_top", "sz_bot"]
px = pd.concat(rd(f, usecols=cols) for f in sorted(glob.glob(str(SRC / "kbo_pitches/*.csv"))))
px = px[px.round_code == "kbo_r"].copy()
for d in (bat, pit, px):
    d["month"] = d.game_date.str[:7]
pa = px[px.pa_last_pitch == 1]

# ---------- 타자 ----------
BS = ["pa", "ab", "hit", "hr", "bb", "so", "rbi", "run"]
def bat_stats(keys):
    g = bat.groupby(keys).agg(**{"g": ("game_id", "nunique")}, **{c: (c, "sum") for c in BS})
    ex = pa.groupby([("batter_id" if k == "pid" else k) for k in keys] + ["pa_result"]).size().unstack(fill_value=0)
    ex.index.names = keys
    for k in ["2루타", "3루타", "사구", "희생플라이"]:
        if k not in ex: ex[k] = 0
    g = g.join(ex[["2루타", "3루타", "사구", "희생플라이"]], how="left").fillna(0)
    out = pd.DataFrame({"g": g.g, "pa": g.pa, "ab": g.ab, "h": g.hit, "d2": g["2루타"], "d3": g["3루타"], "hr": g.hr, "rbi": g.rbi,
                        "bb": g.bb, "hbp": g["사구"], "so": g.so, "sf": g["희생플라이"], "r": g.run}).astype(int)
    out["d2"] = out[["d2"]].join(out.h.rename("hh")).min(axis=1).astype(int)   # 안타보다 많을 수 없게
    return out

bat = bat.rename(columns={"batter_id": "pid"}); px = px.rename(columns={"batter_id": "bid"})
bat["batter_id"] = bat.pid; px["batter_id"] = px.bid; pa = px[px.pa_last_pitch == 1]
bseason = bat_stats(["pid"]); bmonth = bat_stats(["pid", "month"])
last = bat.sort_values("game_date").groupby("pid").tail(1).set_index("pid")
name = bat.groupby("pid").batter_name.last()
pos = bat[~bat.pos.isin(["대타", "대주자"])].groupby("pid").pos.agg(lambda s: s.value_counts().index[0])
bseason["name"] = name; bseason["team"] = last.team; bseason["pos"] = pos.reindex(bseason.index).fillna("대타·대주자")
bseason.insert(0, "season", SEASON); bseason.insert(0, "id", bseason.index)
bseason = bseason[["id", "name", "team", "pos", "season", "g", "pa", "ab", "h", "d2", "d3", "hr", "rbi", "bb", "hbp", "so", "sf", "r"]]
bseason.reset_index().rename(columns={"index": "pid"}).to_csv(OUT / "batters.csv", index=False, encoding="utf-8")
bmonth.reset_index().to_csv(OUT / "batters_monthly.csv", index=False, encoding="utf-8")

# ---------- 투수 ----------
pit = pit.rename(columns={"pitcher_id": "pid"})
pg = pit.groupby("pid").agg(g=("game_id", "nunique"), gs=("starter", "sum"), outs=("outs", "sum"), h=("hit", "sum"), bb=("bb", "sum"),
                            hbp=("hbp", "sum"), so=("kk", "sum"), hr=("hr", "sum"), er=("er", "sum"), r=("run", "sum"), pitches=("pitches", "sum"))
fb = pit[pit.fb_n > 0].assign(w=lambda d: d.fb_kmh * d.fb_n).groupby("pid").agg(w=("w", "sum"), n=("fb_n", "sum"))
pg["fb"] = (fb.w / fb.n).round(1)
pg["name"] = pit.groupby("pid").pitcher_name.last()
pg["team"] = pit.sort_values("game_date").groupby("pid").tail(1).set_index("pid").team
pg["hand"] = pit.groupby("pid").hand.last()
pg["pos"] = ["선발" if r.gs * 2 >= r.g else "구원" for r in pg.itertuples()]
pg.insert(0, "season", SEASON); pg.insert(0, "id", pg.index)
pg = pg[["id", "name", "team", "pos", "hand", "season", "g", "gs", "outs", "h", "bb", "hbp", "so", "hr", "er", "r", "pitches", "fb"]]
pg.reset_index().rename(columns={"index": "pid"}).to_csv(OUT / "pitchers.csv", index=False, encoding="utf-8")
pm = pit.groupby(["pid", "month"]).agg(g=("game_id", "nunique"), outs=("outs", "sum"), h=("hit", "sum"), bb=("bb", "sum"), hbp=("hbp", "sum"),
                                       so=("kk", "sum"), hr=("hr", "sum"), er=("er", "sum"), r=("run", "sum"))
pm.reset_index().to_csv(OUT / "pitchers_monthly.csv", index=False, encoding="utf-8")


# ---------- 선구안·헛스윙 (투구별 기록) ----------
# 존 안: 홈플레이트 폭(좌우 ±0.83ft, 공 반지름 포함)과 타자별 존 위아래 안. 스윙: 헛스윙(S)·파울(F)·타격(H).
pz = px[px.plate_x.notna() & px.plate_z.notna()].copy()
pz["inz"] = (pz.plate_x.abs() <= 0.83) & (pz.plate_z >= pz.sz_bot - 0.12) & (pz.plate_z <= pz.sz_top + 0.12)
pz["sw"] = pz.pitch_result.isin(["S", "F", "H"]); pz["wh"] = pz.pitch_result == "S"
pz["zn"] = pz.inz; pz["zsw"] = pz.inz & pz.sw; pz["zwh"] = pz.inz & pz.wh
pz["oz"] = ~pz.inz; pz["ozsw"] = ~pz.inz & pz.sw
EYE = ["sw", "wh", "zn", "zsw", "zwh", "oz", "ozsw"]
def eye(key):
    return pz.groupby(key)[EYE].sum().astype(int)
eb = eye("bid"); eb.index.name = "pid"
ep = eye("pitcher_id"); ep.index.name = "pid"
bs = pd.read_csv(OUT / "batters.csv"); bs = bs.merge(eb.reset_index(), on="pid", how="left").fillna(0)
bs[EYE] = bs[EYE].astype(int)
bs.to_csv(OUT / "batters.csv", index=False, encoding="utf-8")
ps = pd.read_csv(OUT / "pitchers.csv"); ps = ps.merge(ep.reset_index(), on="pid", how="left").fillna(0)
ps[EYE] = ps[EYE].astype(int)
ps.to_csv(OUT / "pitchers.csv", index=False, encoding="utf-8")

# 구종 구성
mix = px[px.pitch_type.notna()].groupby(["pitcher_id", "pitch_type"]).agg(n=("speed_kmh", "size"), kmh=("speed_kmh", "mean")).reset_index()
mix["kmh"] = mix.kmh.round(1); mix = mix.rename(columns={"pitcher_id": "pid", "pitch_type": "pitch"})
mix.to_csv(OUT / "pitchmix.csv", index=False, encoding="utf-8")

# ---------- 팀 (경기 점수는 타자 득점 합계) ----------
sc = bat.groupby(["game_id", "team"]).run.sum().reset_index()
sc = sc.merge(sc, on="game_id", suffixes=("", "_o")); sc = sc[sc.team != sc.team_o]
sc = sc.assign(w=(sc.run > sc.run_o).astype(int), l=(sc.run < sc.run_o).astype(int), d=(sc.run == sc.run_o).astype(int))
tm = sc.groupby("team").agg(g=("game_id", "nunique"), w=("w", "sum"), l=("l", "sum"), d=("d", "sum"), rs=("run", "sum"), ra=("run_o", "sum"))
tm.insert(0, "season", SEASON); tm.insert(0, "name", tm.index); tm.insert(0, "id", tm.index)
tm.to_csv(OUT / "teams.csv", index=False, encoding="utf-8")

# ---------- 메타 ----------
gmax = int(tm.g.max())
json.dump({
    "league": "KBO 리그", "seasons": [SEASON], "months": sorted(bat.month.unique().tolist()), "games": gmax,
    "note": f"{SEASON} 정규시즌 경기 기록(실제 데이터)입니다.",
    "qualify": {"batterPa": round(gmax * 3.1), "pitcherOuts": gmax * 3},
    "teams": [{"id": t, "name": t} for t in sorted(tm.index)],
    "range": [bat.game_date.min(), bat.game_date.max()],
}, open(OUT / "meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("타자", len(bseason), "투수", len(pg), "팀", len(tm), "경기", bat.game_id.nunique(), "->", OUT)
