const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  sensorModel: document.getElementById("sensorModel"),
  positionNoise: document.getElementById("positionNoise"),
  noiseValue: document.getElementById("noiseValue"),
  smoothing: document.getElementById("smoothing"),
  smoothingValue: document.getElementById("smoothingValue"),
  planner: document.getElementById("planner"),
  replanInterval: document.getElementById("replanInterval"),
  replanValue: document.getElementById("replanValue"),
  controller: document.getElementById("controller"),
  maxSpeed: document.getElementById("maxSpeed"),
  maxSpeedValue: document.getElementById("maxSpeedValue"),
  kp: document.getElementById("kp"),
  kpValue: document.getElementById("kpValue"),
  kd: document.getElementById("kd"),
  kdValue: document.getElementById("kdValue"),
  actuatorLag: document.getElementById("actuatorLag"),
  lagValue: document.getElementById("lagValue"),
  runPauseBtn: document.getElementById("runPauseBtn"),
  stepBtn: document.getElementById("stepBtn"),
  resetBtn: document.getElementById("resetBtn"),
  randomizeBtn: document.getElementById("randomizeBtn"),
  mTick: document.getElementById("mTick"),
  mDist: document.getElementById("mDist"),
  mLocErr: document.getElementById("mLocErr"),
  mPath: document.getElementById("mPath"),
  mEffort: document.getElementById("mEffort"),
  mCollide: document.getElementById("mCollide"),
  mReached: document.getElementById("mReached"),
  explain: document.getElementById("explain"),
  copilotProvider: document.getElementById("copilotProvider"),
  copilotBaseUrl: document.getElementById("copilotBaseUrl"),
  copilotModel: document.getElementById("copilotModel"),
  copilotApiKey: document.getElementById("copilotApiKey"),
  whyCollideBtn: document.getElementById("whyCollideBtn"),
  applySuggestionsBtn: document.getElementById("applySuggestionsBtn"),
  copilotStatus: document.getElementById("copilotStatus"),
  copilotResponse: document.getElementById("copilotResponse"),
};

const world = {
  width: 18,
  height: 10.4,
  scale: 50,
  robotRadius: 0.28,
};

const state = {
  running: true,
  tick: 0,
  replanCountdown: 0,
  prevHeadingErr: 0,
  commandV: 0,
  commandW: 0,
  path: [],
  pathLength: 0,
  controlEffort: 0,
  collisions: 0,
  reached: false,
  explanation: "Initializing simulation loop.",
  latestCollisionSnapshot: null,
  recentTelemetry: [],
  latestCopilotSuggestions: null,
};

let truth;
let estimate;
let goal;
let obstacles = [];

function resetSimulation() {
  truth = { x: 1.3, y: 1.1, th: 0, v: 0, w: 0 };
  estimate = { x: truth.x, y: truth.y, th: truth.th };
  goal = { x: 16.6, y: 8.9 };
  state.tick = 0;
  state.replanCountdown = 0;
  state.prevHeadingErr = 0;
  state.commandV = 0;
  state.commandW = 0;
  state.path = [];
  state.pathLength = 0;
  state.controlEffort = 0;
  state.collisions = 0;
  state.reached = false;
  state.explanation = "Reset complete. Planner will compute a fresh path.";
  state.latestCollisionSnapshot = null;
  state.recentTelemetry = [];
  state.latestCopilotSuggestions = null;
  ui.copilotResponse.textContent = "";
  ui.copilotStatus.textContent = "Copilot ready.";
}

function randomObstacles() {
  obstacles = [
    { x: 4.0, y: 2.2, r: 0.7 },
    { x: 5.9, y: 4.4, r: 0.8 },
    { x: 8.8, y: 2.4, r: 0.9 },
    { x: 10.4, y: 5.9, r: 1.0 },
    { x: 13.2, y: 3.6, r: 0.8 },
    { x: 14.2, y: 7.8, r: 0.9 },
  ];
  for (let i = 0; i < 4; i += 1) {
    obstacles.push({
      x: 2 + Math.random() * 14,
      y: 1.3 + Math.random() * 7.4,
      r: 0.45 + Math.random() * 0.55,
    });
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wrapToPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function captureConfig() {
  return {
    sensorModel: ui.sensorModel.value,
    positionNoise: Number(ui.positionNoise.value),
    smoothing: Number(ui.smoothing.value),
    planner: ui.planner.value,
    replanInterval: Number(ui.replanInterval.value),
    controller: ui.controller.value,
    maxSpeed: Number(ui.maxSpeed.value),
    kp: Number(ui.kp.value),
    kd: Number(ui.kd.value),
    actuatorLag: Number(ui.actuatorLag.value),
  };
}

function maybeSaveCopilotSettings() {
  const payload = {
    provider: ui.copilotProvider.value,
    baseUrl: ui.copilotBaseUrl.value.trim(),
    model: ui.copilotModel.value.trim(),
    apiKey: ui.copilotApiKey.value.trim(),
  };
  localStorage.setItem("robotPlaygroundCopilot", JSON.stringify(payload));
}

function loadCopilotSettings() {
  const raw = localStorage.getItem("robotPlaygroundCopilot");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    ui.copilotProvider.value = parsed.provider || "heuristic";
    ui.copilotBaseUrl.value = parsed.baseUrl || "https://api.openai.com/v1";
    ui.copilotModel.value = parsed.model || "gpt-4o-mini";
    ui.copilotApiKey.value = parsed.apiKey || "";
  } catch (_err) {
    ui.copilotProvider.value = "heuristic";
    ui.copilotBaseUrl.value = "https://api.openai.com/v1";
    ui.copilotModel.value = "gpt-4o-mini";
  }
}

function noisyMeasurement() {
  if (ui.sensorModel.value === "perfect") {
    return { x: truth.x, y: truth.y, th: truth.th };
  }
  const n = Number(ui.positionNoise.value);
  return {
    x: truth.x + (Math.random() - 0.5) * n,
    y: truth.y + (Math.random() - 0.5) * n,
    th: truth.th + (Math.random() - 0.5) * n * 0.2,
  };
}

function updateEstimator(z) {
  const a = Number(ui.smoothing.value);
  estimate.x = a * estimate.x + (1 - a) * z.x;
  estimate.y = a * estimate.y + (1 - a) * z.y;
  estimate.th = wrapToPi(a * estimate.th + (1 - a) * z.th);
}

function worldToGrid(x, y, cols, rows) {
  const gx = clamp(Math.floor((x / world.width) * cols), 0, cols - 1);
  const gy = clamp(Math.floor((y / world.height) * rows), 0, rows - 1);
  return { gx, gy };
}

function gridToWorld(gx, gy, cols, rows) {
  return {
    x: ((gx + 0.5) / cols) * world.width,
    y: ((gy + 0.5) / rows) * world.height,
  };
}

function buildOccupancy(cols, rows) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const p = gridToWorld(x, y, cols, rows);
      for (const o of obstacles) {
        if (Math.hypot(p.x - o.x, p.y - o.y) < o.r + world.robotRadius + 0.2) {
          grid[y][x] = 1;
          break;
        }
      }
    }
  }
  return grid;
}

function planAStar(start, target) {
  const cols = 45;
  const rows = 26;
  const occ = buildOccupancy(cols, rows);
  const s = worldToGrid(start.x, start.y, cols, rows);
  const g = worldToGrid(target.x, target.y, cols, rows);
  const key = (x, y) => `${x},${y}`;
  const open = [{ x: s.gx, y: s.gy, f: 0, g: 0 }];
  const came = new Map();
  const costs = new Map([[key(s.gx, s.gy), 0]]);
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (!cur) break;
    if (cur.x === g.gx && cur.y === g.gy) break;

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || occ[ny][nx] === 1) continue;
      const step = Math.hypot(dx, dy);
      const ng = cur.g + step;
      const nk = key(nx, ny);
      if (!costs.has(nk) || ng < costs.get(nk)) {
        costs.set(nk, ng);
        came.set(nk, key(cur.x, cur.y));
        const h = Math.hypot(nx - g.gx, ny - g.gy);
        open.push({ x: nx, y: ny, g: ng, f: ng + h });
      }
    }
  }

  const path = [];
  let curKey = key(g.gx, g.gy);
  if (!came.has(curKey)) return [];
  while (curKey !== key(s.gx, s.gy)) {
    const [x, y] = curKey.split(",").map(Number);
    path.push(gridToWorld(x, y, cols, rows));
    curKey = came.get(curKey);
    if (!curKey) break;
  }
  path.reverse();
  return path;
}

function planGreedy(start, target) {
  const path = [];
  let p = { x: start.x, y: start.y };
  for (let i = 0; i < 45; i += 1) {
    let vx = target.x - p.x;
    let vy = target.y - p.y;
    const d = Math.hypot(vx, vy) + 1e-6;
    vx /= d;
    vy /= d;

    for (const o of obstacles) {
      const ox = p.x - o.x;
      const oy = p.y - o.y;
      const od = Math.hypot(ox, oy);
      const influence = clamp((2.2 - od) / 2.2, 0, 1);
      if (influence > 0) {
        vx += (ox / (od + 1e-6)) * influence * 1.5;
        vy += (oy / (od + 1e-6)) * influence * 1.5;
      }
    }

    const vnorm = Math.hypot(vx, vy) + 1e-6;
    p = {
      x: clamp(p.x + (vx / vnorm) * 0.36, 0.1, world.width - 0.1),
      y: clamp(p.y + (vy / vnorm) * 0.36, 0.1, world.height - 0.1),
    };
    path.push({ x: p.x, y: p.y });
    if (dist(p, target) < 0.4) break;
  }
  return path;
}

function updatePlanner() {
  const shouldReplan = state.replanCountdown <= 0 || state.path.length < 2;
  if (!shouldReplan) {
    state.replanCountdown -= 1;
    return;
  }
  state.replanCountdown = Number(ui.replanInterval.value);
  if (ui.planner.value === "astar") {
    state.path = planAStar(estimate, goal);
  } else {
    state.path = planGreedy(estimate, goal);
  }
}

function nearestTargetOnPath() {
  if (state.path.length === 0) return goal;
  let best = goal;
  let bestD = Infinity;
  for (const p of state.path) {
    const d = dist(p, truth);
    if (d < bestD && d > 0.8) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function computeControl(dt) {
  const target = nearestTargetOnPath();
  const maxSpeed = Number(ui.maxSpeed.value);
  const headingTarget = Math.atan2(target.y - estimate.y, target.x - estimate.x);
  const headingErr = wrapToPi(headingTarget - estimate.th);
  const distanceErr = dist(estimate, target);

  let vCmd = clamp(0.4 + distanceErr * 1.2, 0, maxSpeed);
  let wCmd = 0;

  if (ui.controller.value === "pid") {
    const kp = Number(ui.kp.value);
    const kd = Number(ui.kd.value);
    const dErr = (headingErr - state.prevHeadingErr) / Math.max(dt, 1e-3);
    wCmd = kp * headingErr + kd * dErr;
    state.prevHeadingErr = headingErr;
  } else {
    const lookahead = 1.0;
    const alpha = headingErr;
    wCmd = (2 * Math.sin(alpha) / lookahead) * vCmd;
  }

  const lag = Number(ui.actuatorLag.value);
  state.commandV += (vCmd - state.commandV) * (1 - lag);
  state.commandW += (wCmd - state.commandW) * (1 - lag);
  state.commandW = clamp(state.commandW, -4.5, 4.5);
  state.controlEffort = 0.92 * state.controlEffort + 0.08 * (Math.abs(state.commandV) + Math.abs(state.commandW));
}

function propagateTruth(dt) {
  truth.v = state.commandV;
  truth.w = state.commandW;
  truth.th = wrapToPi(truth.th + truth.w * dt);
  truth.x = clamp(truth.x + Math.cos(truth.th) * truth.v * dt, 0.05, world.width - 0.05);
  truth.y = clamp(truth.y + Math.sin(truth.th) * truth.v * dt, 0.05, world.height - 0.05);
}

function handleCollisions() {
  let collided = false;
  for (const o of obstacles) {
    const d = Math.hypot(truth.x - o.x, truth.y - o.y);
    const minD = o.r + world.robotRadius;
    if (d < minD) {
      collided = true;
      const nx = (truth.x - o.x) / (d + 1e-6);
      const ny = (truth.y - o.y) / (d + 1e-6);
      truth.x = o.x + nx * minD;
      truth.y = o.y + ny * minD;
      truth.v *= 0.35;
    }
  }
  if (collided) state.collisions += 1;
  return collided;
}

function generateHeuristicDiagnosis(snapshot) {
  const causes = [];
  const suggestions = {};

  if (snapshot.localizationError > 0.9) {
    causes.push("State estimate drift was high, so planning/control tracked the wrong state.");
    suggestions.positionNoise = Math.max(0, snapshot.config.positionNoise - 0.2);
    suggestions.smoothing = Math.min(0.95, snapshot.config.smoothing + 0.1);
  }
  if (snapshot.maxAbsW > 3.2) {
    causes.push("Angular velocity commands were aggressive and likely overshot near obstacles.");
    suggestions.kp = Math.max(0.6, snapshot.config.kp - 0.5);
    suggestions.kd = Math.min(2.0, snapshot.config.kd + 0.2);
  }
  if (snapshot.config.maxSpeed > 2.4) {
    causes.push("Robot speed was high for the obstacle density in this scene.");
    suggestions.maxSpeed = Math.max(0.8, snapshot.config.maxSpeed - 0.4);
  }
  if (snapshot.config.replanInterval > 12) {
    causes.push("Replan interval was long, so the path could become stale around obstacles.");
    suggestions.replanInterval = Math.max(4, snapshot.config.replanInterval - 4);
  }
  if (snapshot.config.actuatorLag > 0.25) {
    causes.push("Actuator lag delayed execution and reduced turning responsiveness.");
    suggestions.actuatorLag = Math.max(0, snapshot.config.actuatorLag - 0.1);
  }
  if (snapshot.config.planner === "greedy" && snapshot.pathLengthToGoal > 3.2) {
    causes.push("Greedy planner took a risky local route near obstacles.");
    suggestions.planner = "astar";
  }

  if (causes.length === 0) {
    causes.push("Collision appears scenario-driven (tight geometry) with current parameters.");
    suggestions.maxSpeed = Math.max(0.8, snapshot.config.maxSpeed - 0.2);
    suggestions.replanInterval = Math.max(4, snapshot.config.replanInterval - 2);
  }

  const diagnosticsText = [
    "Likely causes:",
    ...causes.map((c) => `- ${c}`),
    "",
    "Suggested parameter updates:",
    ...Object.entries(suggestions).map(([k, v]) => `- ${k}: ${v}`),
  ].join("\n");

  return { diagnosticsText, suggestions };
}

function buildCollisionSnapshot() {
  const recent = state.recentTelemetry.slice(-25);
  const localizationError = dist(truth, estimate);
  let maxAbsW = 0;
  let avgDistToGoal = 0;
  for (const t of recent) {
    maxAbsW = Math.max(maxAbsW, Math.abs(t.commandW));
    avgDistToGoal += t.distToGoal;
  }
  avgDistToGoal = recent.length > 0 ? avgDistToGoal / recent.length : dist(truth, goal);
  return {
    tick: state.tick,
    collisions: state.collisions,
    localizationError,
    maxAbsW,
    pathLengthToGoal: dist(estimate, goal),
    avgDistToGoal,
    config: captureConfig(),
    explanation: state.explanation,
    recentTelemetry: recent,
  };
}

function parseSuggestionsFromText(text, fallback) {
  const suggestions = { ...fallback };
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*-\s*([a-zA-Z]+)\s*:\s*([a-zA-Z0-9.\-]+)/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];
    if (["sensorModel", "planner", "controller"].includes(key)) {
      suggestions[key] = value;
    } else {
      const num = Number(value);
      if (!Number.isNaN(num)) suggestions[key] = num;
    }
  }
  return suggestions;
}

async function queryOpenAICompatible(snapshot, fallback) {
  const baseUrl = ui.copilotBaseUrl.value.trim() || "https://api.openai.com/v1";
  const model = ui.copilotModel.value.trim() || "gpt-4o-mini";
  const apiKey = ui.copilotApiKey.value.trim();
  if (!apiKey) {
    throw new Error("Missing API key for OpenAI-compatible provider.");
  }

  const systemPrompt =
    "You are a robotics copilot. Analyze collision causes in perception/planning/control pipelines and return concise diagnosis plus parameter suggestions.";
  const userPrompt = `Given this simulation snapshot JSON, answer in plain text:\n1) Why did it collide?\n2) 4-7 suggested parameter updates as bullet lines in format "- key: value".\nJSON:\n${JSON.stringify(snapshot)}`;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Copilot API error: ${response.status} ${errText}`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return {
    text,
    suggestions: parseSuggestionsFromText(text, fallback),
  };
}

function applySuggestedParameters(suggestions) {
  const map = {
    sensorModel: ui.sensorModel,
    planner: ui.planner,
    controller: ui.controller,
    positionNoise: ui.positionNoise,
    smoothing: ui.smoothing,
    replanInterval: ui.replanInterval,
    maxSpeed: ui.maxSpeed,
    kp: ui.kp,
    kd: ui.kd,
    actuatorLag: ui.actuatorLag,
  };

  Object.entries(suggestions || {}).forEach(([k, v]) => {
    const el = map[k];
    if (!el) return;
    el.value = String(v);
    el.dispatchEvent(new Event("input"));
  });

  state.path = [];
  state.replanCountdown = 0;
  state.explanation = "Applied copilot suggestions and forced replanning.";
}

async function runCopilotDiagnosis() {
  const snapshot = state.latestCollisionSnapshot || buildCollisionSnapshot();
  state.latestCollisionSnapshot = snapshot;
  const heuristic = generateHeuristicDiagnosis(snapshot);

  ui.copilotStatus.textContent = "Copilot analyzing collision...";
  let finalText = heuristic.diagnosticsText;
  let finalSuggestions = heuristic.suggestions;

  try {
    if (ui.copilotProvider.value === "openai") {
      const llm = await queryOpenAICompatible(snapshot, heuristic.suggestions);
      if (llm.text && llm.text.trim().length > 0) {
        finalText = llm.text.trim();
      }
      finalSuggestions = llm.suggestions;
      ui.copilotStatus.textContent = "LLM diagnosis complete.";
    } else {
      ui.copilotStatus.textContent = "Heuristic diagnosis complete (no API used).";
    }
  } catch (err) {
    ui.copilotStatus.textContent = `LLM unavailable, used local heuristic: ${err.message}`;
  }

  state.latestCopilotSuggestions = finalSuggestions;
  ui.copilotResponse.textContent = finalText;
}

function updateExplanation(collided, locErr) {
  const distanceToGoal = dist(truth, goal);
  if (state.path.length === 0) {
    state.explanation = "Planner failed to find a safe route; try Greedy planner or lower obstacle density.";
    return;
  }
  if (collided) {
    state.explanation = "Collision occurred: control saturated near an obstacle. Reduce speed or increase replanning rate.";
    return;
  }
  if (locErr > 0.9) {
    state.explanation = "Perception drift is high; noisy measurements are pushing estimate away from truth.";
    return;
  }
  if (Math.abs(state.commandW) > 3.2) {
    state.explanation = "Controller is commanding aggressive turns. Tune Kp/Kd or switch to Pure Pursuit.";
    return;
  }
  if (distanceToGoal < 0.5) {
    state.explanation = "Goal reached with a stable closed loop from sensing to control.";
    return;
  }
  state.explanation = "Nominal loop: estimate updated, planner refreshed trajectory, controller tracked next waypoint.";
}

function stepSimulation(dt) {
  if (state.reached) return;
  state.tick += 1;
  const z = noisyMeasurement();
  updateEstimator(z);
  updatePlanner();
  computeControl(dt);
  propagateTruth(dt);
  const collided = handleCollisions();

  const locErr = dist(truth, estimate);
  state.recentTelemetry.push({
    tick: state.tick,
    distToGoal: dist(truth, goal),
    localizationError: locErr,
    commandV: state.commandV,
    commandW: state.commandW,
    controlEffort: state.controlEffort,
  });
  if (state.recentTelemetry.length > 180) state.recentTelemetry.shift();
  state.pathLength += truth.v * dt;
  state.reached = dist(truth, goal) < 0.45;
  if (collided) {
    state.latestCollisionSnapshot = buildCollisionSnapshot();
  }
  updateExplanation(collided, locErr);
}

function drawCircle(x, y, r, color, fill = false) {
  ctx.beginPath();
  ctx.arc(x * world.scale, y * world.scale, r * world.scale, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

function drawRobot(p, color) {
  drawCircle(p.x, p.y, world.robotRadius, color, false);
  const hx = p.x + Math.cos(p.th) * world.robotRadius * 1.3;
  const hy = p.y + Math.sin(p.th) * world.robotRadius * 1.3;
  ctx.beginPath();
  ctx.moveTo(p.x * world.scale, p.y * world.scale);
  ctx.lineTo(hx * world.scale, hy * world.scale);
  ctx.strokeStyle = color;
  ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#1f334f";
  for (let x = 0; x <= world.width; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * world.scale, 0);
    ctx.lineTo(x * world.scale, world.height * world.scale);
    ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * world.scale);
    ctx.lineTo(world.width * world.scale, y * world.scale);
    ctx.stroke();
  }

  for (const o of obstacles) {
    drawCircle(o.x, o.y, o.r, "#d95454", true);
  }
  drawCircle(goal.x, goal.y, 0.25, "#f2d449", true);

  if (state.path.length > 0) {
    ctx.beginPath();
    ctx.moveTo(estimate.x * world.scale, estimate.y * world.scale);
    for (const p of state.path) {
      ctx.lineTo(p.x * world.scale, p.y * world.scale);
    }
    ctx.strokeStyle = "#63d4a7";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  drawRobot(truth, "#4ea1ff");
  drawRobot(estimate, "#47e0ff");
}

function updateMetrics() {
  const locErr = dist(truth, estimate);
  ui.mTick.textContent = String(state.tick);
  ui.mDist.textContent = dist(truth, goal).toFixed(2);
  ui.mLocErr.textContent = locErr.toFixed(2);
  ui.mPath.textContent = state.pathLength.toFixed(2);
  ui.mEffort.textContent = state.controlEffort.toFixed(2);
  ui.mCollide.textContent = String(state.collisions);
  ui.mReached.textContent = state.reached ? "Yes" : "No";
  ui.explain.textContent = state.explanation;
}

function bindInputValue(inputEl, valueEl, digits = 2) {
  const update = () => {
    valueEl.textContent = Number(inputEl.value).toFixed(digits);
  };
  inputEl.addEventListener("input", update);
  update();
}

bindInputValue(ui.positionNoise, ui.noiseValue, 1);
bindInputValue(ui.smoothing, ui.smoothingValue, 2);
bindInputValue(ui.replanInterval, ui.replanValue, 0);
bindInputValue(ui.maxSpeed, ui.maxSpeedValue, 1);
bindInputValue(ui.kp, ui.kpValue, 1);
bindInputValue(ui.kd, ui.kdValue, 1);
bindInputValue(ui.actuatorLag, ui.lagValue, 2);

ui.runPauseBtn.addEventListener("click", () => {
  state.running = !state.running;
  ui.runPauseBtn.textContent = state.running ? "Pause" : "Run";
});

ui.stepBtn.addEventListener("click", () => {
  stepSimulation(1 / 30);
  draw();
  updateMetrics();
});

ui.resetBtn.addEventListener("click", () => {
  resetSimulation();
});

ui.randomizeBtn.addEventListener("click", () => {
  randomObstacles();
  state.path = [];
  state.explanation = "Obstacles randomized. Waiting for next replan.";
});

ui.whyCollideBtn.addEventListener("click", async () => {
  maybeSaveCopilotSettings();
  await runCopilotDiagnosis();
});

ui.applySuggestionsBtn.addEventListener("click", () => {
  if (!state.latestCopilotSuggestions) {
    ui.copilotStatus.textContent = "Run copilot first to generate suggestions.";
    return;
  }
  applySuggestedParameters(state.latestCopilotSuggestions);
  ui.copilotStatus.textContent = "Suggested parameters applied.";
});

[ui.copilotProvider, ui.copilotBaseUrl, ui.copilotModel, ui.copilotApiKey].forEach((el) => {
  el.addEventListener("change", maybeSaveCopilotSettings);
});

loadCopilotSettings();
resetSimulation();
randomObstacles();

let last = performance.now();
function loop(now) {
  const dtRaw = (now - last) / 1000;
  const dt = clamp(dtRaw, 0.001, 0.05);
  last = now;
  if (state.running) stepSimulation(dt);
  draw();
  updateMetrics();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
