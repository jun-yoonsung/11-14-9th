/* 구속 예측 모델 계산 — ml/form_ref.py predict_export()와 같은 계산 (tests/formModel.test.js가 일치를 검증).
 * 입력은 원래 특징값(없으면 null/NaN) → 중앙값으로 대체 → 표준화 → 모델. 모델 종류: linear, mlp, trees(sklearn·XGBoost), oblivious(CatBoost). */

function evalTree(t, z, strict) {
  let n = 0;
  while (t.f[n] >= 0) {
    const v = Math.fround(z[t.f[n]]);
    const left = strict ? v < Math.fround(t.t[n]) : v <= t.t[n];   // 트리 라이브러리는 입력을 32비트 실수로 비교한다
    n = left ? t.l[n] : t.r[n];
  }
  return t.v[n];
}

function predictOne(m, row) {
  const z = row.map((v, j) => ((v == null || Number.isNaN(v) ? m.impute[j] : v) - m.mean[j]) / m.std[j]);
  switch (m.kind) {
    case "linear": return z.reduce((s, v, j) => s + v * m.coef[j], m.intercept);
    case "mlp": {
      let h = z;
      m.layers.forEach((L, i) => {
        const out = L.b.map((b, c) => h.reduce((s, v, r) => s + v * L.W[r][c], b));
        h = i < m.layers.length - 1 ? out.map(v => Math.max(v, 0)) : out;
      });
      return h[0];
    }
    case "trees": {
      const s = m.trees.reduce((a, t) => a + evalTree(t, z, m.strict), 0);
      return m.mode === "mean" ? s / m.trees.length : s + m.base;
    }
    case "oblivious": {
      let s = 0;
      for (const t of m.trees) { let idx = 0; t.s.forEach(([f, border], b) => { if (z[f] > border) idx |= 1 << b; }); s += t.v[idx]; }
      return s * m.scale + m.bias;
    }
    default: throw new Error(`알 수 없는 모델 종류: ${m.kind}`);
  }
}

/** 행 배열(원래 특징값)의 예측 — 시험·내부용 */
export const predictRaw = (m, rows) => rows.map(r => predictOne(m, r));

/** 영상에서 얻은 특징으로 구속(mph) 예측. 모델이 없는 시점이면 null. rmse는 교차검증 오차(mph) */
export function predictSpeed(models, view, features) {
  const m = models?.[view];
  if (!m) return null;
  return { mph: predictOne(m, m.features.map(k => features?.[k] ?? null)), rmse: m.rmse ?? null, model: m.name ?? null };
}
