// ゲーム全体の設定値をまとめた定数
const config = {
  gatherRatePerSecond: 3, // 採取班1人あたりの資源獲得量
  gathererCost: 20, // 採取班追加コスト
  soldierCost: 15, // 歩兵追加コスト
  assaultThreshold: 25, // 城壁を突破するための歩兵数
  wallBaseIntegrity: 100, // 城壁耐久値の初期値
  moraleShockDelay: 4000, // 迎撃後のメッセージ表示時間(ms)
  assaultSpeed: 0.35, // 突撃アニメーションの進行速度
  attackDuration: 2.6, // 城壁攻撃演出の継続時間(s)
  failedAssaultDuration: 1.8, // 臨界未達時の突撃失敗アニメーション時間(s)
  collapseSpeed: 0.22, // 城壁崩壊アニメーションの進行速度
  collapseSwarmCount: 64, // 敵基地崩壊演出に使う群体の数
  collapseNibbleSpeed: 0.38, // 群体一体あたりの崩壊進行速度
  enemyGatherPerSecond: 3.8, // 敵AIの資源増加量
  enemyUnitCost: 18, // 敵歩兵増援コスト
  enemyVolleyThreshold: 12, // 敵が迎撃部隊を送り出す歩兵数
  enemyVolleyCooldown: 8 // 迎撃のインターバル(s)
};

// シンプルなイージング関数（突撃時の加速感を演出）
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// 歩兵ユニットを生成するヘルパー
function createSoldier() {
  return {
    jitter: Math.random() * 0.6 - 0.3, // 横方向の微揺れ量
    pulseOffset: Math.random() * Math.PI * 2 // 待機時の跳ね方に個性を持たせる
  };
}

// 敵歩兵を生成するヘルパー
function createEnemyUnit() {
  return {
    jitter: Math.random() * 0.6 - 0.3,
    pulseOffset: Math.random() * Math.PI * 2,
    ringOffset: Math.random() * 24
  };
}

// 城壁崩壊エフェクト用パーティクルを組み立て
function createWallChunks() {
  const chunks = [];
  for (let i = 0; i < 12; i++) {
    chunks.push({
      anchorY: 140 + i * 25,
      drift: (Math.random() * 0.7 + 0.4) * (i % 2 === 0 ? 1 : -1),
      rotation: Math.random() * 0.6 - 0.3,
      length: 40 + Math.random() * 30
    });
  }
  return chunks;
}

const enemyBaseVertices = [
  { x: 680, y: 360 },
  { x: 760, y: 440 },
  { x: 840, y: 360 }
];

function randomPointInEnemyBase() {
  let r1 = Math.random();
  let r2 = Math.random();
  if (r1 + r2 > 1) {
    r1 = 1 - r1;
    r2 = 1 - r2;
  }
  const p0 = enemyBaseVertices[0];
  const p1 = enemyBaseVertices[1];
  const p2 = enemyBaseVertices[2];
  return {
    x: p0.x + r1 * (p1.x - p0.x) + r2 * (p2.x - p0.x),
    y: p0.y + r1 * (p1.y - p0.y) + r2 * (p2.y - p0.y)
  };
}

function createSwarmUnit() {
  const target = randomPointInEnemyBase();
  return {
    startX: 540 + (Math.random() - 0.5) * 60,
    startY: 220 + Math.random() * 200,
    targetX: target.x,
    targetY: target.y,
    progress: 0,
    delay: Math.random() * 0.9,
    speed: 0.6 + Math.random() * 0.9,
    radius: 3 + Math.random() * 4,
    wobble: Math.random() * Math.PI * 2
  };
}

function createEnemySwarmers() {
  return Array.from({ length: config.collapseSwarmCount }, () => createSwarmUnit());
}

function resetSwarmUnit(unit) {
  const target = randomPointInEnemyBase();
  unit.startX = 540 + (Math.random() - 0.5) * 60;
  unit.startY = 220 + Math.random() * 200;
  unit.targetX = target.x;
  unit.targetY = target.y;
  unit.progress = 0;
  unit.delay = Math.random() * 0.6;
  unit.speed = 0.6 + Math.random() * 0.9;
  unit.radius = 3 + Math.random() * 4;
  unit.wobble = Math.random() * Math.PI * 2;
}

// 状態管理オブジェクト
const state = {
  resources: 60,
  gatherers: 3,
  soldierUnits: [],
  wallIntegrity: config.wallBaseIntegrity,
  enemyResources: 45,
  enemyUnits: [],
  moraleShockUntil: 0,
  message: "閾値 25 を満たす大隊を準備しろ。",
  lastUpdate: performance.now(),
  phase: "ready", // ready | assaulting | breach | victory | redAssault
  assaultProgress: 0,
  failAssaultProgress: 0,
  collapseProgress: 0,
  defeatFlash: 0,
  wallChunks: [],
  attackTime: 0,
  enemyVolleyTimer: 0,
  assaultOutcome: null,
  lastSoldierPositions: [],
  enemySwarmers: []
};

// 初期歩兵を配備
for (let i = 0; i < 6; i++) {
  state.soldierUnits.push(createSoldier());
}

for (let i = 0; i < 4; i++) {
  state.enemyUnits.push(createEnemyUnit());
}

// DOM参照をまとめて取得
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("battlefield"));
const ctx = canvas.getContext("2d");
const statsEl = document.getElementById("stats");
const messageEl = document.getElementById("message");
const addGathererBtn = document.getElementById("addGatherer");
const addSoldierBtn = document.getElementById("addSoldier");
const launchAssaultBtn = document.getElementById("launchAssault");

// 便利関数: 歩兵数を取得
const soldierCount = () => state.soldierUnits.length;

// リスナー設定
addGathererBtn.addEventListener("click", () => {
  if (state.resources < config.gathererCost || state.phase !== "ready") return;
  state.resources -= config.gathererCost;
  state.gatherers += 1;
  state.message = "採取班が増援。青の軌跡が伸びていく。";
});

addSoldierBtn.addEventListener("click", () => {
  if (state.resources < config.soldierCost || state.phase !== "ready") return;
  state.resources -= config.soldierCost;
  state.soldierUnits.push(createSoldier());
  state.message = "歩兵が隊列に加わった。臨界へあと一歩。";
});

launchAssaultBtn.addEventListener("click", () => {
  if (state.phase !== "ready") return;
  if (soldierCount() === 0) {
    state.message = "突撃可能な歩兵が存在しない。";
    return;
  }
  if (soldierCount() >= config.assaultThreshold) {
    state.phase = "assaulting";
    state.assaultProgress = 0;
    state.assaultOutcome = "success";
    state.attackTime = 0;
    state.enemySwarmers = [];
    state.message = "番号！ 突撃！ 城壁へ向けて進軍中…";
  } else {
    state.phase = "assaulting";
    state.assaultOutcome = "fail";
    state.assaultProgress = 0;
    state.failAssaultProgress = 0;
    state.enemySwarmers = [];
    state.message = "突撃開始… しかし銃座の射界が迫っている。";
  }
});

// 数値整形ユーティリティ
const formatInt = (value) => Math.floor(value).toLocaleString("ja-JP");

// 状態に応じてHUDを更新
function updateHud() {
  const completion = Math.min(1, soldierCount() / config.assaultThreshold);
  const completionPercent = Math.round(completion * 100);
  const wallStat = state.phase === "victory" ? 0 : Math.round(state.wallIntegrity);

  statsEl.innerHTML = `
    <span>資源: ${formatInt(state.resources)}</span>
    <span>採取班: ${state.gatherers}</span>
    <span>歩兵: ${soldierCount()}</span>
    <span>臨界充足率: ${completionPercent}%</span>
    <span>敵城壁耐久: ${wallStat}%</span>
    <span>敵部隊規模: ${state.enemyUnits.length}</span>
  `;

  const now = performance.now();
  const locked = state.phase !== "ready";
  addGathererBtn.disabled = state.resources < config.gathererCost || locked;
  addSoldierBtn.disabled = state.resources < config.soldierCost || locked;
  launchAssaultBtn.disabled = locked;

  if (now < state.moraleShockUntil) {
    messageEl.textContent = "Condition Red: 銃座が圧倒的優位。兵力を整えろ。";
  } else {
    messageEl.textContent = state.message;
  }
}

// ベクター風の背景グリッドを描画
function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 123, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 40; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 40; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

// 採取班の作業軌跡を描画
function drawGatherers(now) {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 123, 255, 0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < state.gatherers; i++) {
    const progress = ((now / 400) + i * 0.2) % 1;
    const startX = 220;
    const startY = 360;
    const endX = 360;
    const endY = 200;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + (endX - startX) * progress, startY - (startY - endY) * progress);
    ctx.stroke();
  }
  ctx.restore();
}

// ベースと城壁、タレットなどを描画
function drawStructures(collapse, attackHeat, now) {
  // プレイヤー基地
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(120, 440);
  ctx.lineTo(200, 360);
  ctx.lineTo(280, 440);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = "rgba(14, 165, 233, 0.2)";
  ctx.fill();
  ctx.restore();

  // 敵基地
  ctx.save();
  const collapseLevel = state.phase === "victory" ? easeOutCubic(Math.min(1, collapse)) : 0;
  const siegeGlow = state.phase === "breach" ? Math.min(1, state.attackTime / config.attackDuration) : 0;
  const baseOpacity = Math.max(0.04, 0.15 - collapseLevel * 0.12);
  ctx.beginPath();
  ctx.moveTo(enemyBaseVertices[0].x, enemyBaseVertices[0].y);
  ctx.lineTo(enemyBaseVertices[1].x, enemyBaseVertices[1].y);
  ctx.lineTo(enemyBaseVertices[2].x, enemyBaseVertices[2].y);
  ctx.closePath();
  ctx.fillStyle = `rgba(56, 189, 248, ${baseOpacity + siegeGlow * 0.08})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(59, 130, 246, ${0.85 - collapseLevel * 0.45 + siegeGlow * 0.1})`;
  ctx.lineWidth = 3;
  ctx.stroke();
  if (siegeGlow > 0 && state.phase !== "victory") {
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.25 + siegeGlow * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  if (state.phase === "victory" && collapse > 0) {
    drawEnemyCollapseSwarm(collapse, now);
  }

  // 城壁ライン（崩壊時は分解アニメーション）
  ctx.save();
  if (collapse > 0) {
    state.wallChunks.forEach((chunk, idx) => {
      const t = easeOutCubic(collapse);
      const offsetX = chunk.drift * t * 160;
      const offsetY = t * t * 280;
      const angle = chunk.rotation * t;
      ctx.save();
      ctx.translate(540 + offsetX, chunk.anchorY + offsetY);
      ctx.rotate(angle);
      ctx.strokeStyle = `rgba(96, 165, 250, ${Math.max(0, 0.9 - t)})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, chunk.length);
      ctx.stroke();
      ctx.restore();
      if (idx % 3 === 0) {
        ctx.save();
        ctx.fillStyle = `rgba(56, 189, 248, ${Math.max(0, 0.4 - t * 0.4)})`;
        ctx.beginPath();
        ctx.arc(540 + offsetX * 0.6, chunk.anchorY + offsetY * 0.6, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  } else {
    const glow = attackHeat > 0 ? 0.35 + Math.sin(performance.now() / 130) * 0.15 : 0;
    const baseAlpha = attackHeat > 0 ? 0.45 + attackHeat * 0.35 + glow * 0.2 : 0.7;
    ctx.strokeStyle = `rgba(14, 116, 219, ${Math.min(1, baseAlpha)})`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(540, 140);
    ctx.lineTo(540, 440);
    ctx.stroke();
    if (attackHeat > 0) {
      ctx.strokeStyle = `rgba(59, 130, 246, ${0.15 + attackHeat * 0.4})`;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(540, 200);
      ctx.lineTo(540, 380);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 銃座を示すタレット
  ctx.save();
  ctx.strokeStyle = "rgba(30, 64, 175, 0.85)";
  ctx.lineWidth = 2;
  const turretPositions = [
    { x: 520, y: 180 },
    { x: 560, y: 240 },
    { x: 520, y: 300 },
    { x: 560, y: 360 }
  ];
  turretPositions.forEach(({ x, y }) => {
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 20, y);
    ctx.lineTo(x + 20, y);
    ctx.stroke();
    if (attackHeat > 0) {
      ctx.fillStyle = `rgba(59, 130, 246, ${0.35 + attackHeat * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, 6 + attackHeat * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

// 歩兵部隊の描画（突撃アニメーション含む）
function drawSoldiers(now) {
  ctx.save();
  const count = soldierCount();
  if (count === 0) {
    state.lastSoldierPositions = [];
    ctx.restore();
    return;
  }

  const completion = Math.min(1, count / config.assaultThreshold);
  const baseColor = completion >= 1 ? "rgba(250, 204, 21, 0.9)" : "rgba(56, 189, 248, 0.9)";
  const spacing = 18;
  const perRow = 8;
  const advancing = state.phase === "assaulting" || state.phase === "breach" || state.phase === "victory" || state.phase === "redAssault";
  let assaultProgress = Math.min(1, state.assaultProgress);
  if (state.phase === "assaulting" && state.assaultOutcome === "fail") {
    assaultProgress = Math.min(0.75, assaultProgress);
  }
  const assaultT = advancing ? easeOutCubic(assaultProgress) : 0;
  const positions = [];

  const breachPulse = state.phase === "breach" ? (Math.sin(now / 90) + 1) * 0.5 : 0;
  state.soldierUnits.forEach((soldier, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const baseX = 320 + col * spacing;
    const baseY = 440 - row * spacing;
    const idleOffset = Math.sin(now / 600 + soldier.pulseOffset) * 3;

    let drawX = baseX;
    let drawY = baseY + idleOffset;

    if (assaultT > 0) {
      const targetX = 520 + soldier.jitter * 12;
      const targetY = baseY - 140 + soldier.jitter * 30;
      drawX = baseX + (targetX - baseX) * assaultT;
      drawY = baseY + (targetY - baseY) * assaultT;
    }
    if (state.phase === "breach") {
      drawX += Math.sin(now / 70 + soldier.pulseOffset) * 4;
      drawY -= breachPulse * 6;
    } else if (state.phase === "redAssault") {
      const failT = easeOutCubic(Math.min(1, state.failAssaultProgress));
      drawX += Math.sin(now / 55 + soldier.pulseOffset) * (6 + failT * 10);
      drawY += failT * 70;
    }

    ctx.save();
    ctx.translate(drawX, drawY);
    if (state.phase === "redAssault") {
      const fade = Math.max(0, 1 - state.failAssaultProgress * 1.25);
      ctx.globalAlpha = fade;
      ctx.rotate((soldier.jitter - 0.3) * state.failAssaultProgress);
    }
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, 12);
    ctx.lineTo(-6, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    positions.push({ x: drawX, y: drawY });
  });
  state.lastSoldierPositions = positions;
  ctx.restore();
}

// 突撃・攻撃時のビジュアルエフェクトを描画
function drawAssaultEffects(now) {
  if (state.lastSoldierPositions.length === 0) return;

  if (state.phase === "assaulting") {
    const t = easeOutCubic(state.assaultProgress);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(59, 130, 246, ${0.15 + t * 0.4})`;
    ctx.lineWidth = 2;
    state.lastSoldierPositions.forEach((pos, idx) => {
      const offset = (idx % 5) * 18;
      ctx.beginPath();
      ctx.moveTo(pos.x + 4, pos.y - 4);
      ctx.lineTo(440 + offset, pos.y - 60 * t);
      ctx.lineTo(520, 200 + offset * 0.3);
      ctx.stroke();
    });
    ctx.restore();
  } else if (state.phase === "breach") {
    const pulse = (Math.sin(now / 80) + 1) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    state.lastSoldierPositions.forEach((pos, idx) => {
      const targetY = 200 + (idx % 8) * 26;
      ctx.strokeStyle = `rgba(125, 211, 252, ${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 2.5 + pulse * 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - 6);
      ctx.quadraticCurveTo(480, targetY - 20, 540, targetY);
      ctx.stroke();

      ctx.fillStyle = `rgba(250, 204, 21, ${0.5 + pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(540, targetY, 5 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  } else if (state.phase === "redAssault") {
    const failT = easeOutCubic(Math.min(1, state.failAssaultProgress));
    const turrets = [
      { x: 520, y: 180 },
      { x: 560, y: 240 },
      { x: 520, y: 300 },
      { x: 560, y: 360 }
    ];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2.5 + failT * 1.5;
    state.lastSoldierPositions.forEach((pos, idx) => {
      const turret = turrets[idx % turrets.length];
      const hitX = pos.x + Math.sin(now / 45 + idx) * (4 + failT * 8);
      const hitY = pos.y - failT * 20;
      ctx.strokeStyle = `rgba(248, 113, 113, ${0.25 + failT * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(turret.x, turret.y);
      ctx.lineTo(hitX, hitY);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 228, 230, ${0.3 + failT * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(hitX - 5, hitY);
      ctx.lineTo(hitX + 5, hitY);
      ctx.moveTo(hitX, hitY - 5);
      ctx.lineTo(hitX, hitY + 5);
      ctx.stroke();
    });
    ctx.restore();
  }
}

function drawEnemyCollapseSwarm(collapse, now) {
  if (!state.enemySwarmers.length) return;
  const collapseFactor = easeOutCubic(Math.min(1, collapse));

  ctx.save();
  ctx.fillStyle = `rgba(2, 6, 23, ${0.78 + collapseFactor * 0.2})`;
  state.enemySwarmers.forEach((unit, idx) => {
    if (collapse < unit.delay) return;
    const travel = Math.min(1, unit.progress);
    const eased = easeOutCubic(travel);
    const wobbleX = Math.sin(now / 140 + unit.wobble + idx) * (1 - eased) * 16;
    const wobbleY = Math.cos(now / 110 + unit.wobble) * (1 - eased) * 12;
    const x = unit.startX + (unit.targetX - unit.startX) * eased + wobbleX;
    const y = unit.startY + (unit.targetY - unit.startY) * eased + wobbleY;
    const radius = unit.radius * (0.9 + collapseFactor * 1.6);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  state.enemySwarmers.forEach((unit, idx) => {
    if (collapse < unit.delay) return;
    const travel = Math.min(1, unit.progress);
    const eased = easeOutCubic(travel);
    const wobbleX = Math.sin(now / 120 + unit.wobble + idx) * (1 - eased) * 14;
    const wobbleY = Math.cos(now / 100 + unit.wobble) * (1 - eased) * 10;
    const x = unit.startX + (unit.targetX - unit.startX) * eased + wobbleX;
    const y = unit.startY + (unit.targetY - unit.startY) * eased + wobbleY;
    const trail = Math.max(0, 1 - travel);
    ctx.fillStyle = `rgba(125, 211, 252, ${0.3 + collapseFactor * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, 2.5 + trail * 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// 勝利演出のオーバーレイ
function drawVictoryOverlay() {
  if (state.phase !== "victory") return;
  const t = easeOutCubic(Math.min(1, state.collapseProgress));
  ctx.save();
  ctx.fillStyle = `rgba(250, 204, 21, ${0.18 + t * 0.2})`;
  ctx.fillRect(520, 60, 380, 380);
  ctx.strokeStyle = `rgba(250, 204, 21, ${0.4 + t * 0.4})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(520, 60, 380, 380);
  ctx.fillStyle = "rgba(250, 250, 249, 0.9)";
  ctx.font = "32px 'Noto Sans JP', sans-serif";
  ctx.fillText("臨界突破", 620, 260);
  ctx.restore();
}

// 敵AIの資源管理と迎撃制御
function updateEnemyAI(deltaSeconds, now) {
  if (state.phase !== "victory") {
    state.enemyResources += config.enemyGatherPerSecond * deltaSeconds;
  }

  if (state.phase !== "victory") {
    while (state.enemyResources >= config.enemyUnitCost) {
      state.enemyResources -= config.enemyUnitCost;
      state.enemyUnits.push(createEnemyUnit());
      if (state.enemyUnits.length % 4 === 0) {
        state.message = "敵も部隊を再編している。迎撃線が厚みを増した。";
      }
    }
  }

  const thresholdReached = state.enemyUnits.length >= config.enemyVolleyThreshold;
  state.enemyVolleyTimer += deltaSeconds;
  if (thresholdReached && state.enemyVolleyTimer >= config.enemyVolleyCooldown) {
    state.enemyVolleyTimer = 0;
    const volleyCasualties = Math.min(soldierCount(), Math.max(2, Math.round(state.enemyUnits.length / 4)));
    if (volleyCasualties > 0) {
      state.soldierUnits.splice(-volleyCasualties, volleyCasualties);
      state.defeatFlash = Math.max(state.defeatFlash, 0.85);
      state.message = `敵迎撃部隊の集中射撃で味方歩兵が${volleyCasualties}名失われた。`;
      if (state.phase === "ready") {
        state.moraleShockUntil = Math.max(state.moraleShockUntil, now + 2400);
      }
    }
  }

  if (state.phase === "victory") {
    // 敵基地崩壊中は敵部隊が順次解体される
    const disperseCount = Math.min(state.enemyUnits.length, Math.floor(state.collapseProgress * 10));
    if (disperseCount > 0) {
      state.enemyUnits.splice(0, disperseCount);
    }
  }
}

// 戦場のベクター風ビジュアルを描画
function renderScene(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawGatherers(now);
  const collapse = state.phase === "victory" ? state.collapseProgress : 0;
  const attackHeat =
    state.phase === "breach"
      ? Math.min(1, state.attackTime / config.attackDuration)
      : state.phase === "assaulting"
      ? Math.min(1, state.assaultProgress) * 0.6
      : 0;
  drawStructures(collapse, attackHeat, now);
  drawEnemyUnits(now);
  drawSoldiers(now);
  drawAssaultEffects(now);

  if (state.defeatFlash > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(239, 68, 68, ${state.defeatFlash * 0.6})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  drawVictoryOverlay();
}

// メインループで時間経過を処理
function gameLoop(now) {
  const deltaSeconds = (now - state.lastUpdate) / 1000;
  state.lastUpdate = now;

  updateEnemyAI(deltaSeconds, now);

  if (soldierCount() === 0 && state.phase === "assaulting" && state.assaultOutcome === "success") {
    state.assaultOutcome = "fail";
    state.phase = "redAssault";
    state.failAssaultProgress = 0;
    state.defeatFlash = Math.max(state.defeatFlash, 0.9);
    state.moraleShockUntil = Math.max(state.moraleShockUntil, now + config.moraleShockDelay);
    state.message = "兵力が枯渇し、突撃隊が瓦解した。再編が必要だ。";
  }

  if (state.phase === "ready") {
    state.resources += state.gatherers * config.gatherRatePerSecond * deltaSeconds;
    const pressure = Math.min(soldierCount(), config.assaultThreshold);
    const wallDrop = pressure * 0.05 * deltaSeconds;
    state.wallIntegrity = Math.max(0, state.wallIntegrity - wallDrop);
  } else if (state.phase === "assaulting") {
    state.assaultProgress = Math.min(1, state.assaultProgress + deltaSeconds * config.assaultSpeed);
    if (state.assaultOutcome === "success" && state.assaultProgress >= 1) {
      state.phase = "breach";
      state.assaultOutcome = null;
      state.attackTime = 0;
      state.message = "突入完了！ 城壁に集束砲火を浴びせる。";
    } else if (state.assaultOutcome === "fail" && state.assaultProgress >= 1) {
      state.phase = "redAssault";
      state.failAssaultProgress = 0;
      state.defeatFlash = 1;
      state.moraleShockUntil = now + config.moraleShockDelay;
      state.message = "銃座の十字砲火で部隊が霧散… 数の論理を満たせ。";
    }
  } else if (state.phase === "redAssault") {
    state.failAssaultProgress = Math.min(1, state.failAssaultProgress + deltaSeconds / config.failedAssaultDuration);
    if (state.failAssaultProgress >= 1) {
      state.soldierUnits = [];
      state.lastSoldierPositions = [];
      state.phase = "ready";
      state.assaultProgress = 0;
      state.assaultOutcome = null;
      state.failAssaultProgress = 0;
      state.message = "次は臨界 25 を満たして突破せよ。";
    }
  } else if (state.phase === "breach") {
    state.attackTime += deltaSeconds;
    const damage = 45 * deltaSeconds;
    state.wallIntegrity = Math.max(0, state.wallIntegrity - damage);
    if (state.enemyUnits.length > 0) {
      const attrition = Math.min(state.enemyUnits.length, Math.ceil(deltaSeconds * 6));
      state.enemyUnits.splice(0, attrition);
    }
    if (state.wallIntegrity <= 0 || state.attackTime >= config.attackDuration) {
      state.phase = "victory";
      state.wallIntegrity = 0;
      state.collapseProgress = 0;
      state.wallChunks = createWallChunks();
      state.enemySwarmers = createEnemySwarmers();
      state.message = "閾値突破！ 城壁は粉砕された。";
    }
  } else if (state.phase === "victory") {
    state.collapseProgress = Math.min(1, state.collapseProgress + deltaSeconds * config.collapseSpeed);
    state.enemySwarmers.forEach((unit) => {
      if (state.collapseProgress + 0.02 < unit.delay) return;
      unit.progress = Math.min(1, unit.progress + deltaSeconds * config.collapseNibbleSpeed * unit.speed);
      if (unit.progress >= 1) {
        resetSwarmUnit(unit);
      }
    });
  }

  if (state.defeatFlash > 0) {
    state.defeatFlash = Math.max(0, state.defeatFlash - deltaSeconds * 1.5);
  }

  updateHud();
  renderScene(now);
  requestAnimationFrame(gameLoop);
}

// 初期化処理
function init() {
  state.lastUpdate = performance.now();
  updateHud();
  renderScene(state.lastUpdate);
  requestAnimationFrame(gameLoop);
}

// DOM構築完了前でも初期化できるように遅延評価
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
// 敵部隊の編成を描画
function drawEnemyUnits(now) {
  if (state.enemyUnits.length === 0) return;
  ctx.save();
  const perRing = 10;
  const baseX = 760;
  const baseY = 400;
  const pulse = (Math.sin(now / 100) + 1) * 0.5;
  state.enemyUnits.forEach((unit, idx) => {
    const ring = Math.floor(idx / perRing);
    const angle = ((idx % perRing) / perRing) * Math.PI - Math.PI / 2;
    const radius = 40 + ring * 26 + unit.ringOffset * 0.3;
    const drawX = baseX + Math.cos(angle + unit.jitter * 0.5) * radius;
    const drawY = baseY - Math.sin(angle + unit.jitter * 0.5) * radius + Math.sin(now / 700 + unit.pulseOffset) * 4;

    ctx.save();
    ctx.translate(drawX, drawY);
    const warning = state.enemyUnits.length >= config.enemyVolleyThreshold ? 0.4 + pulse * 0.4 : 0.15 + pulse * 0.25;
    ctx.fillStyle = `rgba(148, 163, 184, ${warning})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, 12);
    ctx.lineTo(-6, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}
