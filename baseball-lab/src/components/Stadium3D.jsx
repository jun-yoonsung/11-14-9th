import { useEffect, useRef } from "react";
import * as THREE from "three";

/** three.js로 그린 3D 야구장: 천천히 도는 카메라, 관중석 링, 조명탑과 빛줄기 */
function stripeTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const g = c.getContext("2d");
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#1f7a3a" : "#2a8d46"; g.fillRect(0, i * 32, 512, 32); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export default function Stadium3D({ onFail, mode = "stadium" }) {
  const host = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const el = host.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" }); }
    catch (e) { onFail && onFail(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x070a1c);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070a1c, 0.0075);
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 600);
    const disposables = [];
    const track = o => { disposables.push(o); return o; };

    // 잔디(줄무늬) + 외야 원
    const tex = track(stripeTexture()); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const grass = new THREE.Mesh(track(new THREE.CircleGeometry(62, 72)), track(new THREE.MeshBasicMaterial({ map: tex })));
    grass.rotation.x = -Math.PI / 2; scene.add(grass);
    // 내야 흙 (다이아몬드)
    const dirtMat = track(new THREE.MeshBasicMaterial({ color: 0x9a4a38 }));
    const infield = new THREE.Mesh(track(new THREE.PlaneGeometry(30, 30)), dirtMat);
    infield.rotation.set(-Math.PI / 2, 0, Math.PI / 4); infield.position.set(0, 0.05, -20);
    scene.add(infield);
    const inGrass = new THREE.Mesh(track(new THREE.PlaneGeometry(19, 19)), track(new THREE.MeshBasicMaterial({ color: 0x23823f })));
    inGrass.rotation.set(-Math.PI / 2, 0, Math.PI / 4); inGrass.position.set(0, 0.08, -20); scene.add(inGrass);
    const wm = track(new THREE.MeshBasicMaterial({ color: 0xf3f4f8 }));
    [[0, 0], [15, -15], [0, -30], [-15, -15]].forEach(([x, z], i) => {
      const b = new THREE.Mesh(track(new THREE.BoxGeometry(1.4, 0.3, 1.4)), wm); b.position.set(x, 0.2, z); b.rotation.y = Math.PI / 4; scene.add(b);
    });
    const mound = new THREE.Mesh(track(new THREE.CircleGeometry(2.6, 24)), dirtMat); mound.rotation.x = -Math.PI / 2; mound.position.set(0, 0.1, -15); scene.add(mound);
    // 파울 라인
    const lineMat = track(new THREE.LineBasicMaterial({ color: 0xffffff }));
    [[-1, 1], [1, 1]].forEach(([s]) => {
      const geo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(s * 52, 0.12, -52)]));
      scene.add(new THREE.Line(geo, lineMat));
    });

    // 관중석: 바깥으로 갈수록 높아지는 링 (작은 상자 인스턴스)
    const seatGeo = track(new THREE.BoxGeometry(1.3, 0.9, 1.2));
    const seatMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const rows = 16, per = 300, total = rows * per;
    const seats = new THREE.InstancedMesh(seatGeo, seatMat, total);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const palette = [0x2a2f4d, 0x353a63, 0x3d2c46, 0xd14b78, 0xe86a8e, 0xf4a3b8, 0x5d6bb3, 0xdfe3f3];
    let n = 0;
    for (let r = 0; r < rows; r++) {
      const rad = 70 + r * 1.6, y = 1.5 + r * 1.35;
      for (let k = 0; k < per; k++) {
        const a = Math.PI * 0.08 + (k / (per - 1)) * Math.PI * 0.84 + Math.PI;   // 뒤쪽 열린 반원이 아니라 넓은 부채꼴
        const ang = (k / per) * Math.PI * 2;
        const x = Math.cos(ang) * rad * 1.05, z = -20 + Math.sin(ang) * rad * 0.95;
        m.makeTranslation(x, y, z); seats.setMatrixAt(n, m);
        const rnd = Math.random();
        col.setHex(rnd < 0.62 ? palette[Math.floor(Math.random() * 3)] : palette[3 + Math.floor(Math.random() * 5)]);
        col.multiplyScalar(0.55 + 0.45 * Math.random());
        seats.setColorAt(n, col); n++;
      }
    }
    seats.instanceMatrix.needsUpdate = true; if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
    scene.add(seats);

    // 빛나는 띠 (관중석 안쪽 가장자리, 분홍/흰색)
    const ringMat = (c, o) => track(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
    const rings = [];
    [[66, 1.0, 0xffffff, 0.95, 0.9], [66.8, 2.4, 0xff4fa3, 0.8, 0.9], [88, 24, 0xcfd6ff, 0.55, 0.9]].forEach(([r, y, c, o, sc]) => {
      const t = new THREE.Mesh(track(new THREE.TorusGeometry(r, 0.35, 8, 160)), ringMat(c, o));
      t.rotation.x = Math.PI / 2; t.position.set(0, y, -20); t.scale.set(1.05, 0.95, 1); scene.add(t); rings.push(t);
    });

    // 조명탑 + 빛줄기
    const beamMat = track(new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const panelMat = track(new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    const poleMat = track(new THREE.MeshBasicMaterial({ color: 0x1a1d33 }));
    const glow = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,244,210,1)"); gr.addColorStop(0.25, "rgba(255,236,180,.5)"); gr.addColorStop(1, "rgba(255,236,180,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return track(new THREE.CanvasTexture(c));
    })();
    const sprites = [];
    [[-78, -90], [78, -90], [-86, 40], [86, 40]].forEach(([x, z]) => {
      const pole = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 52, 1.6)), poleMat); pole.position.set(x, 26, z); scene.add(pole);
      const panel = new THREE.Mesh(track(new THREE.BoxGeometry(11, 7, 1.2)), panelMat); panel.position.set(x, 54, z); panel.lookAt(0, 20, -20); scene.add(panel);
      const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
      sp.scale.set(70, 70, 1); sp.position.set(x, 54, z); scene.add(sp); sprites.push(sp);
      const len = Math.hypot(x, 54, z + 20);
      const cone = new THREE.Mesh(track(new THREE.ConeGeometry(24, len, 28, 1, true)), beamMat);
      cone.position.set(x / 2, 27, (z - 20) / 2); cone.lookAt(0, 0, -20); cone.rotateX(Math.PI / 2); cone.position.set(x / 2, 27, (z - 20) / 2); scene.add(cone);
    });

    // 하늘의 먼지 입자(반짝임)
    const pg = track(new THREE.BufferGeometry()), pv = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) { pv[i * 3] = (Math.random() - .5) * 320; pv[i * 3 + 1] = 10 + Math.random() * 90; pv[i * 3 + 2] = (Math.random() - .5) * 320 - 20; }
    pg.setAttribute("position", new THREE.BufferAttribute(pv, 3));
    const pts = new THREE.Points(pg, track(new THREE.PointsMaterial({ color: 0xbcc6ff, size: 1.2, transparent: true, opacity: .6, sizeAttenuation: true })));
    scene.add(pts);


    // ---------- 선수 (단순한 입체 도형으로 만든 사람) ----------
    const lamb = c => track(new THREE.MeshLambertMaterial({ color: c }));
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a3a2a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6); sun.position.set(-30, 60, 40); scene.add(sun);
    function makePlayer(jersey, pants, cap) {
      const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
      const box = (w, h, d, c, x, y, z) => { const o = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), lamb(c)); o.position.set(x, y, z); return o; };
      const legs = [-1, 1].map(sx => { const g = new THREE.Group(); g.position.set(sx * 0.24, 1.0, 0); g.add(box(0.32, 1.0, 0.34, pants, 0, -0.5, 0)); g.add(box(0.34, 0.16, 0.5, 0x15172a, 0, -1.0, 0.08)); body.add(g); return g; });
      const torso = new THREE.Group(); torso.position.y = 1.0; body.add(torso);
      torso.add(box(0.86, 0.95, 0.46, jersey, 0, 0.48, 0));
      const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.26, 16, 12)), lamb(0xf0c9a8)); head.position.y = 1.25; torso.add(head);
      const capM = new THREE.Mesh(track(new THREE.SphereGeometry(0.285, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), lamb(cap)); capM.position.y = 1.28; torso.add(capM);
      torso.add(box(0.3, 0.05, 0.3, cap, 0, 1.3, 0.26));
      const arms = [-1, 1].map(sx => { const g = new THREE.Group(); g.position.set(sx * 0.56, 0.86, 0); g.add(box(0.22, 0.9, 0.24, jersey, 0, -0.42, 0)); g.add(box(0.2, 0.2, 0.2, 0xf0c9a8, 0, -0.92, 0)); torso.add(g); return g; });
      root.scale.setScalar(1.0);
      return { root, body, legs, torso, arms, head };
    }
    // 키프레임 보간
    const kf = (t, pts) => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const a = pts[i - 1], b = pts[i], u = (t - a[0]) / (b[0] - a[0] || 1); const e = u * u * (3 - 2 * u); return a[1] + (b[1] - a[1]) * (0.5 * u + 0.5 * e); } return pts[pts.length - 1][1]; };
    const ballMesh = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.3, 14, 10)), track(new THREE.MeshBasicMaterial({ color: 0xffffff }))));
      const sp = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xaed0ff }))); sp.scale.set(3.4, 3.4, 1); g.add(sp); g.visible = false; scene.add(g); return g; };

    // 타자 장면: 왼쪽 타석에 선 타자와 방망이
    const bat = makePlayer(0x1f3fbf, 0xeaeef8, 0x142a8a); bat.root.position.set(-2.3, 0, 0.1); bat.root.rotation.y = Math.PI / 2; scene.add(bat.root);
    const yaw = new THREE.Group(), tilt = new THREE.Group(); yaw.position.set(0, 0.7, 0.42); bat.torso.add(yaw); yaw.add(tilt);
    const club = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.05, 2.1, 10)), lamb(0xc89455)); club.position.y = 0.85; tilt.add(club);
    const grip = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8)), lamb(0x222222)); grip.position.y = -0.05; tilt.add(grip);
    bat.arms.forEach((a, i) => { a.rotation.set(-1.25, 0, i ? -0.35 : 0.35); });
    const helmet = new THREE.Mesh(track(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), lamb(0x142a8a)); helmet.position.y = 1.27; bat.torso.add(helmet);
    const bBall = ballMesh();
    // 투수 장면: 마운드의 투수
    const pit = makePlayer(0xf2f4fb, 0xdfe3f0, 0xc2263a); pit.root.position.set(0, 0.35, -15); scene.add(pit.root);
    const pBall = ballMesh();
    // 타자 장면에서도 마운드에 서 있는 먼 투수
    const farPit = makePlayer(0xf2f4fb, 0xdfe3f0, 0xc2263a); farPit.root.position.set(0, 0.35, -15); farPit.root.scale.setScalar(1.0); scene.add(farPit.root);

    const T = 3.6, cur = { pos: new THREE.Vector3(60, 40, 60), look: new THREE.Vector3(0, 4, -26), offY: 0, offX: 0.12 };
    function animateActors(t, md) {
      const c = t % T;
      bat.root.visible = md === "batter"; farPit.root.visible = md === "batter"; pit.root.visible = md === "pitcher";
      bBall.visible = false; pBall.visible = false;
      if (md === "batter") {
        const psi = kf(c, [[0, 0], [1.2, -0.2], [1.65, Math.PI / 2], [2.0, 3.0], [2.8, 3.1], [3.3, 0], [3.6, 0]]);
        const th = kf(c, [[0, 0.55], [1.3, 0.5], [1.65, 1.5], [2.0, 1.5], [2.8, 1.35], [3.3, 0.55], [3.6, 0.55]]) + (c < 1.3 ? Math.sin(c * 6) * 0.07 : 0);
        yaw.rotation.y = psi; tilt.rotation.z = th; bat.torso.rotation.y = psi * 0.3; bat.torso.rotation.x = c > 1.3 && c < 2.6 ? 0.12 : 0;
        bat.legs[0].rotation.x = -0.12; bat.legs[1].rotation.x = 0.12; bat.body.position.y = -0.04;
        // 먼 투수도 같은 박자로 던진다
        pitchPose(farPit, c - 0.3);
        if (c > 1.0 && c < 1.65) { const u = (c - 1.0) / 0.65; bBall.visible = true; bBall.position.set(-0.55 * u, 2.7 - 1.3 * u * u + 0 * u, -15 + 15.1 * u); }
        else if (c >= 1.65 && c < 3.0) { const u = c - 1.65; bBall.visible = true; bBall.position.set(-0.55 + 5 * u, 1.4 + 15 * u - 7 * u * u, 0.1 - 34 * u); }
      } else if (md === "pitcher") {
        pitchPose(pit, c);
        if (c > 1.7 && c < 2.15) { const u = (c - 1.7) / 0.45; pBall.visible = true; pBall.position.set(-0.5 + 0.5 * u, 2.7 - 1.3 * u, -13.2 + 13.6 * u); }
      }
    }
    function pitchPose(P, c) {
      if (c < 0) c += T;
      P.legs[1].rotation.x = kf(c, [[0, 0], [0.6, 0], [1.0, -1.35], [1.3, -0.55], [2.6, -0.4], [3.2, 0], [3.6, 0]]);
      P.legs[0].rotation.x = kf(c, [[0, 0], [1.1, 0], [1.4, 0.35], [2.6, 0.3], [3.2, 0], [3.6, 0]]);
      P.arms[0].rotation.x = kf(c, [[0, 0], [0.5, 0], [1.0, 0.8], [1.3, 2.3], [1.55, 2.4], [1.75, -2.7], [2.2, -1.0], [3.0, -0.3], [3.4, 0], [3.6, 0]]);
      P.arms[1].rotation.x = kf(c, [[0, -0.9], [1.0, -1.5], [1.5, -1.0], [1.8, -0.5], [2.6, -0.5], [3.4, -0.9], [3.6, -0.9]]);
      P.torso.rotation.x = kf(c, [[0, 0], [1.5, -0.1], [1.8, 0.5], [2.6, 0.35], [3.4, 0], [3.6, 0]]);
      P.root.position.z = kf(c, [[0, -15], [1.0, -15], [1.5, -13.9], [2.6, -13.9], [3.4, -15], [3.6, -15]]);
    }

    // 크기·카메라
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 1, H = 1;
    const applyOffset = () => { if (W > 760 || cur.offY) camera.setViewOffset(W, H, W > 760 ? -W * cur.offX : 0, H * cur.offY, W, H); else camera.clearViewOffset(); camera.updateProjectionMatrix(); };
    const resize = () => {
      W = el.clientWidth || 1; H = el.clientHeight || 1;
      renderer.setSize(W, H); camera.aspect = W / H;
      // 본문 글씨가 왼쪽에 있어 구장을 오른쪽으로 치우쳐 보이게 한다
      applyOffset();
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    let px = 0, py = 0;
    const move = e => { px = (e.clientX / innerWidth - .5); py = (e.clientY / innerHeight - .5); };
    addEventListener("pointermove", move, { passive: true });

    let raf = 0, t0 = performance.now(), visible = true;
    let last = performance.now();
    const draw = now => {
      const t = (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000); last = now;
      const md = modeRef.current;
      let pos, look, offY = 0, offX = 0.12;
      if (md === "batter") { pos = [9.5 + px * 1.5, 4.0 - py, 11.5]; look = [-1.5, 1.6, -3.0]; offY = W > 760 ? 0.2 : 0.27; offX = 0; }
      else if (md === "pitcher") { pos = [-12.5 + px * 1.5, 4.4 - py, -3.2]; look = [0.3, 1.6, -14.6]; offY = W > 760 ? 0.2 : 0.27; offX = 0; }
      else {
        const ang = reduce ? 0.5 : Math.sin(t * 0.07) * 0.5 + 0.35, rad = 78 + Math.sin(t * 0.05) * 5;
        pos = [Math.sin(ang) * rad + px * 10, 46 + Math.sin(t * 0.09) * 4 - py * 5, Math.cos(ang) * rad * 0.9 + 10]; look = [0, 4, -26];
      }
      const k = reduce ? 1 : 1 - Math.exp(-dt * 2.4);
      cur.pos.lerp(new THREE.Vector3(...pos), k); cur.look.lerp(new THREE.Vector3(...look), k);
      cur.offY += (offY - cur.offY) * k; cur.offX += (offX - cur.offX) * k;
      applyOffset();
      camera.position.copy(cur.pos); camera.lookAt(cur.look);
      animateActors(reduce ? 1.0 : t, md);
      rings.forEach((r, i) => { r.material.opacity = (i === 0 ? .8 : i === 1 ? .7 : .45) + Math.sin(t * 1.4 + i) * .12; });
      sprites.forEach((s, i) => s.scale.setScalar(68 + Math.sin(t * 2.1 + i * 1.7) * 3));
      pts.rotation.y = t * 0.008;
      renderer.render(scene, camera);
    };
    const loop = now => { if (visible) draw(now); raf = requestAnimationFrame(loop); };
    if (reduce) draw(performance.now()); else raf = requestAnimationFrame(loop);
    const vis = () => { visible = !document.hidden; };
    document.addEventListener("visibilitychange", vis);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("pointermove", move); document.removeEventListener("visibilitychange", vis);
      disposables.forEach(d => d.dispose && d.dispose()); seats.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, []);
  return <div ref={host} className="stadium3d" />;
}
