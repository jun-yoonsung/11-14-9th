"""public/data/ 폴더의 KBO CSV·meta.json을 Firestore에 올린다. (한 번 실행하면 되고, build_data.py로 데이터를 새로 만들 때마다 다시 실행)

사용:  python3 tools/upload_firestore.py 서비스계정키.json
필요:  pip install firebase-admin
서비스 계정 키: Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 (🔑 비밀 파일이라 GitHub에 올리면 안 됩니다. .gitignore에 *.json 키 파일을 넣어 두세요)

저장 모양:  datasets/{파일이름}/chunks/{0,1,2...} = { csv: "CSV 텍스트 조각" }   (문서 1개 1MB 제한 때문에 약 600KB씩 나눔)
            datasets/meta = { json: "meta.json 내용" }
"""
import json, pathlib, sys
import firebase_admin
from firebase_admin import credentials, firestore

if len(sys.argv) < 2:
    sys.exit("서비스 계정 키 파일 경로를 넣어 주세요.  예) python3 tools/upload_firestore.py ~/keys/service-account.json")
firebase_admin.initialize_app(credentials.Certificate(sys.argv[1]))
db = firestore.client()
DATA = pathlib.Path(__file__).resolve().parent.parent / "public" / "data"
LIMIT = 600_000

for f in sorted(DATA.glob("*.csv")):
    name = f.stem
    lines = f.read_text(encoding="utf-8").strip().splitlines()
    chunks, cur, size = [], [], 0
    for ln in lines:
        if size + len(ln.encode()) > LIMIT and cur:
            chunks.append("\n".join(cur)); cur, size = [], 0
        cur.append(ln); size += len(ln.encode()) + 1
    chunks.append("\n".join(cur))
    col = db.collection("datasets").document(name).collection("chunks")
    for old in col.stream():          # 이전에 올린 조각 정리
        old.reference.delete()
    for i, c in enumerate(chunks):
        col.document(str(i)).set({"csv": c})
    print(f"{name}: {len(lines) - 1}행 -> 조각 {len(chunks)}개")

meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
db.collection("datasets").document("meta").set({"json": json.dumps(meta, ensure_ascii=False)})
print("meta 올림. 끝.")
