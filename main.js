// 煚煚抓壞蛋 — three.js 點擊收集小遊戲 + WebXR AR
// 資產策略：優先載入 assets/monster.glb（Meshy 生成），不存在則用程序化幾何佔位怪獸

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ── 常數 ──────────────────────────────────────────────
const GAME_DURATION = 60;          // 秒
const MONSTER_LIFETIME = 2000;     // 毫秒，怪獸停留時間
const SPAWN_INTERVAL_START = 1100; // 毫秒，初始生成間隔
const SPAWN_INTERVAL_MIN = 550;    // 毫秒，最快生成間隔
const COMBO_WINDOW = 1500;         // 毫秒，連擊判定窗
const BEST_KEY = 'monster-catch-best';

// ── DOM ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const startOverlay = $('start-overlay');
const endOverlay = $('end-overlay');
const hud = $('hud');
const scoreEl = $('score');
const timerEl = $('timer');
const timerBadge = $('timer-badge');
const arHint = $('ar-hint');
const arExitBtn = $('btn-ar-exit');

// ── three.js 基礎 ─────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0D0F1A);
scene.fog = new THREE.Fog(0x0D0F1A, 8, 16);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 50);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xf1f5f9, 0x1a1e2e, 1.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
dirLight.position.set(2, 4, 1);
scene.add(dirLight);
// 正面補光：深色資產（如骷髏騎士）在深色背景下的可見度
const fillLight = new THREE.DirectionalLight(0xbfd4ff, 1.6);
fillLight.position.set(0, 1.6, 5);
scene.add(fillLight);

// IBL 環境光照：PBR 金屬材質（AI 生成 GLB 常見）沒有環境貼圖會近乎全黑
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.2;

// 螢幕模式場地：地面網格（深度提示）
const grid = new THREE.GridHelper(20, 20, 0x4ADE80, 0x1A1E2E);
grid.position.y = 0;
scene.add(grid);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── 怪獸模型（GLB 優先，程序化佔位備援）──────────────
let monsterProto = null;

function buildPlaceholderMonster() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4ADE80, roughness: 0.5 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xA7F3D0, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0D0F1A, roughness: 0.3 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 20), bodyMat);
  body.scale.y = 1.15;
  g.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), bellyMat);
  belly.position.set(0, -0.08, 0.24);
  belly.scale.set(1, 1.1, 0.6);
  g.add(belly);

  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), whiteMat);
    eyeWhite.position.set(side * 0.19, 0.2, 0.4);
    g.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), darkMat);
    pupil.position.set(side * 0.19, 0.2, 0.51);
    g.add(pupil);

    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 12), bodyMat);
    ear.position.set(side * 0.3, 0.62, 0);
    ear.rotation.z = side * -0.35;
    g.add(ear);

    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), bodyMat);
    foot.position.set(side * 0.22, -0.55, 0.1);
    foot.scale.set(1, 0.5, 1.2);
    g.add(foot);
  }
  return g;
}

async function loadMonster() {
  try {
    // 直接載入，失敗自然 fallback（HEAD 探測在部分靜態託管會誤判）
    const gltf = await new GLTFLoader().loadAsync('assets/monster.glb');
    const model = gltf.scene;
    // 正規化尺寸：最長邊 = 1
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 1 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
    model.position.sub(center);
    const wrapper = new THREE.Group();
    wrapper.add(model);
    monsterProto = wrapper;
    $('placeholder-note')?.classList.add('hidden');
  } catch {
    monsterProto = buildPlaceholderMonster();
  }
}

// ── 遊戲狀態 ──────────────────────────────────────────
const state = {
  playing: false,
  mode: 'screen',       // 'screen' | 'ar'
  score: 0,
  combo: 0,
  lastCatch: 0,
  endAt: 0,
  nextSpawnAt: 0,
  arPlaced: false,
};
const monsters = [];    // { obj, bornAt, dieAt, caught }
const monsterRoot = new THREE.Group(); // AR 模式時掛在場地錨點
scene.add(monsterRoot);

function spawnMonster(now) {
  if (!monsterProto) return;
  const m = monsterProto.clone(true);
  const isAR = state.mode === 'ar';
  const s = isAR ? 0.32 : 1.5 + Math.random() * 0.6;
  m.scale.setScalar(0.001); // 彈跳進場起點
  m.userData.targetScale = s;

  if (isAR) {
    // 場地錨點周圍 0.6m 內、離地 0~0.4m
    const r = 0.25 + Math.random() * 0.45;
    const a = Math.random() * Math.PI * 2;
    m.position.set(Math.cos(a) * r, 0.1 + Math.random() * 0.35, Math.sin(a) * r);
  } else {
    // 相機前方扇形區
    m.position.set((Math.random() - 0.5) * 4, 0.7 + Math.random() * 1.5, -2.5 - Math.random() * 2);
  }
  m.userData.baseY = m.position.y;
  m.userData.phase = Math.random() * Math.PI * 2;
  // 基準朝向：正/背/左/右四方位隨機，再加少許偏差更自然
  m.userData.baseYaw = Math.floor(Math.random() * 4) * (Math.PI / 2) + (Math.random() - 0.5) * 0.4;
  monsterRoot.add(m);
  monsters.push({ obj: m, bornAt: now, dieAt: now + MONSTER_LIFETIME, caught: false });
}

function clearMonsters() {
  for (const rec of monsters) monsterRoot.remove(rec.obj);
  monsters.length = 0;
}

function startGame() {
  state.playing = true;
  state.score = 0;
  state.combo = 0;
  state.lastCatch = 0;
  state.endAt = performance.now() + GAME_DURATION * 1000;
  state.nextSpawnAt = performance.now() + 400;
  clearMonsters();
  scoreEl.textContent = '0';
  timerEl.textContent = String(GAME_DURATION);
  timerBadge.classList.remove('warning');
  startOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
}

function endGame() {
  state.playing = false;
  clearMonsters();
  hud.classList.add('hidden');
  const best = Math.max(state.score, Number(localStorage.getItem(BEST_KEY) || 0));
  localStorage.setItem(BEST_KEY, String(best));
  $('final-score').textContent = String(state.score);
  $('best-score').textContent = String(best);
  // AR session 內結束時隱藏「再進 AR」按鈕（已在 AR 中）
  $('btn-ar-end').classList.toggle('hidden', !arSupported || state.mode === 'ar');
  endOverlay.classList.remove('hidden');
}

// ── 點擊命中 ──────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function findMonsterRoot(obj) {
  while (obj && obj.parent !== monsterRoot) obj = obj.parent;
  return obj;
}

function tryCatch(screenX, screenY) {
  const hits = raycaster.intersectObjects(monsterRoot.children, true);
  // 往後找第一隻未被抓的怪獸（避免被淡出中的怪獸擋住漏抓）
  let rec = null;
  for (const h of hits) {
    const root = findMonsterRoot(h.object);
    rec = monsters.find((r) => r.obj === root && !r.caught);
    if (rec) break;
  }
  if (!rec) return;

  const now = performance.now();
  rec.caught = true;
  rec.caughtAt = now;
  rec.dieAt = now + 200; // squash 淡出時間
  state.combo = now - state.lastCatch < COMBO_WINDOW ? state.combo + 1 : 1;
  state.lastCatch = now;
  state.score += 1;
  scoreEl.textContent = String(state.score);

  showFloatText('+1', screenX, screenY, false);
  if (state.combo >= 2) showFloatText(`Combo ×${state.combo}`, screenX, screenY - 36, true);
}

function showFloatText(text, x, y, isCombo) {
  const el = document.createElement('div');
  el.className = 'float-text' + (isCombo ? ' combo' : '');
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 650);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!state.playing || state.mode !== 'screen') return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  tryCatch(e.clientX, e.clientY);
});

// ── WebXR AR ──────────────────────────────────────────
let xrSession = null;
let hitTestSource = null;
let arSupported = false;

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.08, 0.11, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xA78BFA })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const fieldAnchor = new THREE.Group(); // AR 遊戲場地
scene.add(fieldAnchor);

const controller = renderer.xr.getController(0);
scene.add(controller);
const tempMatrix = new THREE.Matrix4();

controller.addEventListener('select', () => {
  if (state.mode !== 'ar') return;
  if (!state.arPlaced) {
    if (!reticle.visible) return;
    // 放置場地：把怪獸掛到場地錨點
    fieldAnchor.position.setFromMatrixPosition(reticle.matrix);
    fieldAnchor.add(monsterRoot);
    monsterRoot.position.set(0, 0, 0);
    state.arPlaced = true;
    reticle.visible = false;
    arHint.classList.add('hidden');
    startGame();
    return;
  }
  if (!state.playing) return;
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  tryCatch(innerWidth / 2, innerHeight * 0.4);
});

async function checkARSupport() {
  try {
    arSupported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'));
  } catch {
    arSupported = false;
  }
  if (arSupported) {
    $('btn-ar').classList.remove('hidden');
    $('btn-ar-end').classList.remove('hidden');
  } else {
    $('ar-unsupported').classList.remove('hidden');
  }
}

async function enterAR() {
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body },
    });
  } catch (err) {
    $('ar-unsupported').textContent = 'AR 啟動失敗：' + err.message;
    $('ar-unsupported').classList.remove('hidden');
    return;
  }
  // end 監聽必須在任何 await 之前掛上，session 中途被系統結束才能還原狀態
  xrSession.addEventListener('end', onARSessionEnd);
  state.mode = 'ar';
  state.arPlaced = false;
  state.playing = false;
  clearMonsters();
  scene.background = null; // 透出鏡頭畫面
  scene.fog = null;
  grid.visible = false;
  // dom-overlay 的 root 是 body，深色背景會蓋住鏡頭畫面
  document.documentElement.classList.add('ar-active');
  document.body.classList.add('ar-active');
  startOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
  hud.classList.add('hidden');
  arHint.classList.remove('hidden');
  arExitBtn.classList.remove('hidden');

  try {
    // three.js 預設 reference space 是 local-floor，immersive-ar 未申請該 feature 會被拒；AR 一律用 local
    renderer.xr.setReferenceSpaceType('local');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
    await renderer.xr.setSession(xrSession);
  } catch (err) {
    $('ar-unsupported').textContent = 'AR 啟動失敗：' + (err.name || '') + ' ' + err.message;
    $('ar-unsupported').classList.remove('hidden');
    xrSession?.end().catch(() => {}); // end 事件觸發 onARSessionEnd 還原狀態；?. 防系統中斷競態下已被置 null
  }
}

function onARSessionEnd() {
  hitTestSource?.cancel?.();
  hitTestSource = null;
  xrSession = null;
  state.mode = 'screen';
  state.playing = false;
  state.arPlaced = false;
  clearMonsters();
  fieldAnchor.remove(monsterRoot);
  scene.add(monsterRoot);
  monsterRoot.position.set(0, 0, 0);
  scene.background = new THREE.Color(0x0D0F1A);
  scene.fog = new THREE.Fog(0x0D0F1A, 8, 16);
  grid.visible = true;
  // XR 期間 three 每幀把頭部 pose 寫進 camera，退出後須還原桌面視角
  camera.position.set(0, 1.6, 0);
  camera.quaternion.identity();
  document.documentElement.classList.remove('ar-active');
  document.body.classList.remove('ar-active');
  reticle.visible = false;
  arHint.classList.add('hidden');
  arExitBtn.classList.add('hidden');
  hud.classList.add('hidden');
  endOverlay.classList.add('hidden'); // 避免與開始畫面疊加
  startOverlay.classList.remove('hidden');
}

arExitBtn.addEventListener('click', () => xrSession?.end());

// dom-overlay 已知坑：點 DOM 按鈕會同時誤發 controller select
document.body.addEventListener('beforexrselect', (e) => {
  if (e.target.closest('button')) e.preventDefault();
});

// ── 主迴圈 ────────────────────────────────────────────
function tick(timestamp, frame) {
  const now = performance.now();

  // AR hit-test：未放置場地時顯示 reticle
  if (state.mode === 'ar' && frame && hitTestSource && !state.arPlaced) {
    const refSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length) {
      const pose = hits[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  if (state.playing) {
    // 倒數
    const remain = Math.max(0, Math.ceil((state.endAt - now) / 1000));
    timerEl.textContent = String(remain);
    timerBadge.classList.toggle('warning', remain <= 10);
    if (now >= state.endAt) endGame();

    // 生成（間隔隨時間縮短）
    if (state.playing && now >= state.nextSpawnAt) {
      spawnMonster(now);
      const progress = 1 - (state.endAt - now) / (GAME_DURATION * 1000);
      state.nextSpawnAt = now + SPAWN_INTERVAL_START - (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN) * progress;
    }
  }

  // 怪獸動畫：進場彈跳、閒置漂浮、退場
  for (let i = monsters.length - 1; i >= 0; i--) {
    const rec = monsters[i];
    const m = rec.obj;
    const age = now - rec.bornAt;
    const target = m.userData.targetScale;

    if (rec.caught) {
      // squash 壓扁淡出（用該怪獸自己的被抓時間，連擊時才不會跳動）
      const t = Math.min(1, (now - rec.caughtAt) / 200);
      m.scale.set(target * (1 + t * 0.6), target * (1 - t * 0.9), target * (1 + t * 0.6));
      if (now >= rec.dieAt) { monsterRoot.remove(m); monsters.splice(i, 1); }
      continue;
    }
    if (now >= rec.dieAt) { monsterRoot.remove(m); monsters.splice(i, 1); continue; }

    // 進場彈跳（overshoot）
    if (age < 300) {
      const t = age / 300;
      const s = target * (t < 0.7 ? t / 0.7 * 1.15 : 1.15 - 0.15 * ((t - 0.7) / 0.3));
      m.scale.setScalar(s);
    } else {
      m.scale.setScalar(target);
    }
    // 閒置漂浮
    m.position.y = m.userData.baseY + Math.sin(now / 500 + m.userData.phase) * 0.05 * (state.mode === 'ar' ? 0.5 : 1);
    m.rotation.y = (m.userData.baseYaw || 0) + Math.sin(now / 800 + m.userData.phase) * 0.3;
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

// ── UI 綁定與啟動 ─────────────────────────────────────
$('btn-start').addEventListener('click', startGame);
$('btn-restart').addEventListener('click', startGame);
$('btn-ar').addEventListener('click', enterAR);
$('btn-ar-end').addEventListener('click', enterAR);

loadMonster();
checkARSupport();
