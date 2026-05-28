// ═══════════════════════════════════════════════════════════════════
// ComplianceVision — Frontend Logic  v7
// ═══════════════════════════════════════════════════════════════════

// ── DOM refs ──────────────────────────────────────────────────────
const video           = document.querySelector("#video");
const overlay         = document.querySelector("#overlay");
const overlayCtx      = overlay.getContext("2d");
const cameraStage     = document.querySelector("#cameraStage");
const cameraEmpty     = document.querySelector("#cameraEmpty");
const emptyHint       = document.querySelector("#emptyHint");
const cameraNotif     = document.querySelector("#cameraNotif");
const uploadPreview   = document.querySelector("#uploadPreview");
const dropZone        = document.querySelector("#dropZone");

const roboflowApiKey    = document.querySelector("#roboflowApiKey");
const roboflowProjectId = document.querySelector("#roboflowProjectId");
const confirmApiButton  = document.querySelector("#confirmApiButton");
const startButton       = document.querySelector("#startButton");
const stopButton        = document.querySelector("#stopButton");
const saveButton        = document.querySelector("#saveButton");
const clearLogBtn       = document.querySelector("#clearLogBtn");
const uploadLabel       = document.querySelector("#uploadLabel");
const imageUpload       = document.querySelector("#imageUpload");
const themeToggle       = document.querySelector("#themeToggle");
const themeIconSun      = document.querySelector("#themeIconSun");
const themeIconMoon     = document.querySelector("#themeIconMoon");
const homeStartBtn      = document.querySelector("#homeStartBtn");
const homeSettingsBtn   = document.querySelector("#homeSettingsBtn");
const homeApiStatus     = document.querySelector("#homeApiStatus");

// Login
const loginPage         = document.querySelector("#loginPage");
const loginUsername     = document.querySelector("#loginUsername");
const loginPassword     = document.querySelector("#loginPassword");
const loginBtn          = document.querySelector("#loginBtn");
const loginError        = document.querySelector("#loginError");
const logoutBtn         = document.querySelector("#logoutBtn");
const audioToggle       = document.querySelector("#audioToggle");
const cooldownInput     = document.querySelector("#cooldownInput");

const frameStatus     = document.querySelector("#frameStatus");
const processingTime  = document.querySelector("#processingTime");
const detectionCount  = document.querySelector("#detectionCount");
const genderDisplay   = document.querySelector("#genderDisplay");
const decisionCard    = document.querySelector("#decisionCard");
const decisionText    = document.querySelector("#decisionText");
const reasonCount     = document.querySelector("#reasonCount");
const reasonList      = document.querySelector("#reasonList");
const labelCount      = document.querySelector("#labelCount");
const labelList       = document.querySelector("#labelList");
const eventLog        = document.querySelector("#eventLog");
const apiStatusDot    = document.querySelector("#apiStatusDot");
const settingsStatus  = document.querySelector("#settingsStatus");

// Off-screen canvases
const captureCanvas = document.createElement("canvas");
const captureCtx    = captureCanvas.getContext("2d");
const inferCanvas   = document.createElement("canvas");
const inferCtx      = inferCanvas.getContext("2d");
const INFER_MAX_W   = 640;

// ── Constants ────────────────────────────────────────────────────
const MAX_LOG_ENTRIES = 20;

const CATEGORY_COLORS = {
  improper_haircut_male:   "#f87171",
  improper_haircut_female: "#f87171",
  headwear:                "#fb923c",
  bright_dyed_hair:        "#c084fc",
  proper_haircut_male:     "#34d399",
  proper_haircut_female:   "#34d399",
  no_headwear:             "#34d399",
  natural_hair_color:      "#34d399",
};

// ── Grooming rules (mirrored from config/grooming_rules.json) ────
const LABEL_TO_CATEGORY = (() => {
  const map = {};
  const labels = {
    improper_haircut_female: ["improper_haircut_female","improper_haircut_f","improper_female_haircut","bad_haircut_female","haircut_violation_female"],
    improper_haircut_male:   ["improper_haircut_male","improper_haircut_m","improper_male_haircut","bad_haircut_male","haircut_violation_male","long_hair_male","unkempt_hair_male"],
    proper_haircut_female:   ["proper_haircut_female","proper_haircut_f","proper_female_haircut","acceptable_haircut_female","neat_haircut_female"],
    proper_haircut_male:     ["proper_haircut_male","proper_haircut_m","proper_male_haircut","acceptable_haircut_male","neat_haircut_male"],
    headwear:                ["headwear","headwear_detected","hat","cap","hood","bonnet","beanie","helmet","hat_detected","cap_detected"],
    no_headwear:             ["no_headwear","no_hat","without_headwear"],
    bright_dyed_hair:        ["dyed_bright_color","bright_dyed_hair","bright_hair","dyed_hair","colored_hair","red_hair","blue_hair","pink_hair","blonde_hair","bleached_hair","unnatural_hair_color"],
    natural_hair_color:      ["natural_hair_color","natural_hair","black_hair","brown_hair","dark_hair"],
  };
  for (const [cat, aliases] of Object.entries(labels)) {
    for (const alias of aliases) map[alias] = cat;
  }
  return map;
})();

const VIOLATION_CATEGORIES = new Set([
  "improper_haircut_male",
  "improper_haircut_female",
  "headwear",
  "bright_dyed_hair",
]);

const GENDER_CATEGORY_MAP = {
  improper_haircut_male:   "male",
  improper_haircut_female: "female",
  proper_haircut_male:     "male",
  proper_haircut_female:   "female",
};

const VIOLATION_MESSAGES = {
  improper_haircut_male:   "Improper haircut detected (male).",
  improper_haircut_female: "Improper haircut detected (female).",
  headwear:                "Headwear detected — not allowed.",
  bright_dyed_hair:        "Bright or dyed hair color detected.",
};

// ── State ────────────────────────────────────────────────────────
let stream             = null;
let drawLoopHandle     = null;

// Two separate locks:
//   isAnalyzing  — continuous auto-inference in flight (from draw loop)
//   isManualBusy — snapshot or log-entry in flight (user-triggered)
// Draw loop pauses while isManualBusy is true so we never send two requests at once.
let isAnalyzing        = false;
let isManualBusy       = false;

let latestResult       = null;
let statusPayload      = null;
let isApiConfirmed     = false;
let confirmedApiConfig = null;
let isUploadMode       = false;

// Audio
let audioEnabled      = true;
let audioCtx          = null;
let lastViolationTime = 0;

// ═══════════════════════════════════════════════════════════════════
// Login / Logout  (demo: admin / admin)
// ═══════════════════════════════════════════════════════════════════

const DEMO_USER = "admin";
const DEMO_PASS = "admin";

function checkSession() {
  if (sessionStorage.getItem("cv-auth") === "1") {
    loginPage.classList.add("hidden");
  }
}

function doLogin() {
  const user = loginUsername.value.trim();
  const pass = loginPassword.value;
  if (user === DEMO_USER && pass === DEMO_PASS) {
    sessionStorage.setItem("cv-auth", "1");
    loginPage.classList.add("hidden");
    loginError.classList.remove("visible");
    loginError.textContent = "";
    loginPassword.value = "";
  } else {
    loginError.textContent = "Incorrect username or password.";
    loginError.classList.add("visible");
    loginPassword.value = "";
    loginPassword.focus();
  }
}

function doLogout() {
  sessionStorage.removeItem("cv-auth");
  stopCamera();
  loginUsername.value = "";
  loginPassword.value = "";
  loginError.classList.remove("visible");
  loginPage.classList.remove("hidden");
  loginUsername.focus();
}

loginBtn.addEventListener("click", doLogin);
logoutBtn.addEventListener("click", doLogout);

// Allow Enter key in both login fields
loginUsername.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPassword.focus(); });
loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

// ═══════════════════════════════════════════════════════════════════
// Theme  (default = light; dark mode = html.dark class)
// ═══════════════════════════════════════════════════════════════════

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  // In light mode  → show moon icon (click to go dark)
  // In dark mode   → show sun icon  (click to go light)
  themeIconMoon.style.display = isDark ? "none" : "";
  themeIconSun.style.display  = isDark ? "" : "none";
  localStorage.setItem("cv-theme", isDark ? "dark" : "light");
}

themeToggle.addEventListener("click", () => {
  applyTheme(!document.documentElement.classList.contains("dark"));
});

// ═══════════════════════════════════════════════════════════════════
// Audio alerts (Web Audio API — no library)
// ═══════════════════════════════════════════════════════════════════

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playViolationBeep() {
  if (!audioEnabled) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    const t    = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.25);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.start(t);
    osc.stop(t + 0.38);
  } catch { /* audio blocked or unavailable */ }
}

audioToggle.addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  audioToggle.classList.toggle("on", audioEnabled);
  audioToggle.setAttribute("aria-checked", String(audioEnabled));
  saveSettings();
});

// ═══════════════════════════════════════════════════════════════════
// Tab switching
// ═══════════════════════════════════════════════════════════════════

function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b)   => b.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  document.querySelector(`[data-tab="${name}"]`).classList.add("active");
}

document.querySelectorAll(".tab-btn").forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab))
);

// ═══════════════════════════════════════════════════════════════════
// API confirmation
// ═══════════════════════════════════════════════════════════════════

async function loadStatus() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    statusPayload = await res.json();
  } catch { /* backend offline */ }
  renderApiState();
}

function renderApiState() {
  if (isApiConfirmed && confirmedApiConfig) {
    // Topbar dot
    apiStatusDot.className   = "api-dot ready";
    apiStatusDot.title       = `Connected: ${confirmedApiConfig.projectId} / v${confirmedApiConfig.version}`;
    // Settings card
    settingsStatus.className = "settings-status connected";
    settingsStatus.innerHTML =
      `<span>✓</span>` +
      `<span>Connected — <strong>${confirmedApiConfig.projectId}</strong> / v${confirmedApiConfig.version}</span>`;
    // Scanner empty hint
    emptyHint.textContent = "Press Start Live Feed — or drop / upload an image";
    dropZone.classList.remove("hidden");
    // Home page status badge
    if (homeApiStatus) {
      homeApiStatus.className = "home-status-badge home-status--ok";
      homeApiStatus.innerHTML =
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` +
        `<span>Model ready — <strong>${confirmedApiConfig.projectId}</strong> / v${confirmedApiConfig.version}</span>`;
    }
  } else {
    apiStatusDot.className   = "api-dot";
    apiStatusDot.title       = "API not configured";
    settingsStatus.className = "settings-status";
    settingsStatus.innerHTML = "";
    emptyHint.textContent    = "Configure your model in Settings to begin";
    dropZone.classList.add("hidden");
    if (homeApiStatus) {
      homeApiStatus.className = "home-status-badge home-status--warn";
      homeApiStatus.innerHTML =
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` +
        `<span>Model not configured — open Settings to connect your Roboflow model</span>`;
    }
  }
}

function confirmApiConfig() {
  if (isApiConfirmed) { unlockApiConfig(); return; }
  const config  = readApiConfig();
  const missing = missingApiFields(config);
  if (missing.length) { showSettingsError(`Missing: ${missing.join(", ")}.`); return; }
  confirmedApiConfig = config;
  isApiConfirmed     = true;
  setApiInputsLocked(true);
  confirmApiButton.textContent = "Change API";
  confirmApiButton.classList.replace("btn-primary", "btn-ghost");
  renderApiState();
  renderControls();
  saveSettings();
}

function unlockApiConfig() {
  stopCamera();
  isApiConfirmed = false; confirmedApiConfig = null;
  setApiInputsLocked(false);
  confirmApiButton.textContent = "Confirm API";
  confirmApiButton.classList.replace("btn-ghost", "btn-primary");
  renderApiState();
  resetDecision();
  renderControls();
}

function showSettingsError(msg) {
  settingsStatus.className   = "settings-status error";
  settingsStatus.textContent = msg;
}

function setApiInputsLocked(locked) {
  roboflowApiKey.disabled    = locked;
  roboflowProjectId.disabled = locked;
}

function readApiConfig() {
  const raw   = roboflowProjectId.value.trim();
  const slash = raw.lastIndexOf("/");
  return {
    apiKey:    roboflowApiKey.value.trim(),
    projectId: slash !== -1 ? raw.slice(0, slash).trim() : raw,
    version:   slash !== -1 ? (raw.slice(slash + 1).trim() || "1") : "1",
  };
}

function missingApiFields(c) {
  const m = [];
  if (!c.apiKey)    m.push("API key");
  if (!c.projectId) m.push("Project ID");
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// Controls state
// ═══════════════════════════════════════════════════════════════════

function renderControls() {
  const hasCamera = Boolean(stream);
  const canUse    = isApiConfirmed && Boolean(confirmedApiConfig);
  startButton.disabled = hasCamera || !canUse || isManualBusy;
  stopButton.disabled  = !hasCamera && !isUploadMode;
  saveButton.disabled  = (!hasCamera && !isUploadMode) || isManualBusy;
  uploadLabel.classList.toggle("disabled", !canUse || isManualBusy);
  imageUpload.disabled    = !canUse || isManualBusy;
  cameraStage.classList.toggle("scanning", hasCamera);
}

// ═══════════════════════════════════════════════════════════════════
// Live camera
// ═══════════════════════════════════════════════════════════════════

async function startCamera() {
  if (!isApiConfirmed) { switchTab("settings"); return; }
  clearUploadMode();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    video.classList.add("active");
    cameraEmpty.classList.add("hidden");
    syncOverlaySize();
    frameStatus.textContent = "Scanning…";
    startDrawLoop();
    renderControls();
  } catch {
    frameStatus.textContent = "Camera blocked";
    addLog("CAMERA", "Camera access was denied.");
    renderControls();
  }
}

function stopCamera() {
  stopDrawLoop();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  video.classList.remove("active");
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  clearUploadMode();
  cameraEmpty.classList.remove("hidden");
  hideCameraNotif();
  frameStatus.textContent = "Idle";
  renderControls();
}

// ═══════════════════════════════════════════════════════════════════
// Draw loop  — rAF at ~60 fps; auto-inference fires when idle.
// The loop is PAUSED (skips inference) while isManualBusy is true.
// ═══════════════════════════════════════════════════════════════════

function startDrawLoop() {
  stopDrawLoop();
  const loop = () => {
    if (!stream) return;
    syncOverlaySize();
    drawDetections(latestResult);
    // Skip auto-inference while a manual op is in progress
    if (!isAnalyzing && !isManualBusy && video.readyState >= 2) runAutoInference();
    drawLoopHandle = requestAnimationFrame(loop);
  };
  drawLoopHandle = requestAnimationFrame(loop);
}

function stopDrawLoop() {
  if (drawLoopHandle) { cancelAnimationFrame(drawLoopHandle); drawLoopHandle = null; }
  isAnalyzing = false;
}

function syncOverlaySize() {
  if (!video.videoWidth || !video.videoHeight) return;
  const w = video.videoWidth, h = video.videoHeight;
  cameraStage.style.aspectRatio = `${w} / ${h}`;
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width  = w; overlay.height  = h;
    captureCanvas.width = w; captureCanvas.height = h;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Auto-inference  (continuous, never logs, uses isAnalyzing lock)
// ═══════════════════════════════════════════════════════════════════

async function runAutoInference() {
  if (!stream || !video.videoWidth || isAnalyzing || !isApiConfirmed) return;
  isAnalyzing = true;
  try {
    const blob   = await captureFrame(0.72);
    const scale  = blob._scale;
    const result = await callRoboflowDirect(blob, false);
    if (scale < 1) scaleBoxes(result, 1 / scale);
    latestResult = result;
    updatePanels(result, false);
  } catch (err) {
    frameStatus.textContent = "Error";
    renderError(err.message);
  } finally {
    isAnalyzing = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Manual inference  — Snapshot / Log Entry from live feed.
// Uses isManualBusy so it NEVER conflicts with auto-inference.
// The draw loop detects isManualBusy and skips firing auto-inference.
// ═══════════════════════════════════════════════════════════════════

async function captureAndAnalyze(recordEvent) {
  if (!stream || !video.videoWidth || !isApiConfirmed || isManualBusy) return;
  isManualBusy = true;
  frameStatus.textContent = recordEvent ? "Logging…" : "Analyzing snapshot…";
  renderControls();
  try {
    const blob   = await captureFrame(0.85);
    const scale  = blob._scale;
    const result = await callRoboflowDirect(blob, recordEvent);
    if (scale < 1) scaleBoxes(result, 1 / scale);
    latestResult = result;
    drawDetections(result);
    updatePanels(result, recordEvent);
    if (!["MODEL_REQUIRED", "ERROR"].includes(result.decision)) {
      frameStatus.textContent = recordEvent ? "Logged ✓" : "Snapshot ✓";
      setTimeout(() => { if (stream && !isManualBusy) frameStatus.textContent = "Scanning…"; }, 2000);
    }
  } catch (err) {
    frameStatus.textContent = "Error";
    renderError(err.message);
  } finally {
    isManualBusy = false;
    renderControls();
  }
}

// Log the already-analyzed result (used by Log Entry in upload mode)
function logCurrentResult() {
  if (!latestResult) return;
  if (latestResult.decision === "VIOLATION") {
    addLog("VIOLATION", latestResult.reasons.join(" · ") || "Violation detected");
  } else if (latestResult.decision === "PASS") {
    addLog("PASS", "No violations detected.");
  }
  frameStatus.textContent = "Logged ✓";
}

// ═══════════════════════════════════════════════════════════════════
// Image upload / drag-and-drop
// ═══════════════════════════════════════════════════════════════════

async function analyzeUploadedFile(file) {
  if (!isApiConfirmed || !file || !file.type.startsWith("image/")) return;

  // Stop live feed if running
  if (stream) {
    stopDrawLoop();
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    video.classList.remove("active");
  }

  isManualBusy = true;
  frameStatus.textContent = "Analyzing image…";
  renderControls();

  try {
    const objectUrl = URL.createObjectURL(file);
    const imgEl     = new Image();
    await new Promise((res, rej) => { imgEl.onload = res; imgEl.onerror = rej; imgEl.src = objectUrl; });
    const nw = imgEl.naturalWidth, nh = imgEl.naturalHeight;

    const scale = Math.min(1, INFER_MAX_W / nw);
    const iw = Math.round(nw * scale), ih = Math.round(nh * scale);
    inferCanvas.width = iw; inferCanvas.height = ih;
    inferCtx.drawImage(imgEl, 0, 0, iw, ih);

    const blob   = await canvasToBlob(inferCanvas, 0.85);
    const result = await callRoboflowDirect(blob, false);
    if (scale < 1) scaleBoxes(result, 1 / scale);

    // Display image in stage
    isUploadMode = true;
    uploadPreview.src = objectUrl;
    uploadPreview.classList.add("visible");
    cameraEmpty.classList.add("hidden");
    cameraStage.style.aspectRatio = `${nw} / ${nh}`;
    overlay.width  = nw;
    overlay.height = nh;

    latestResult = result;
    drawDetections(result);
    updatePanels(result, false);
    frameStatus.textContent = `Image: ${file.name}`;
  } catch (err) {
    frameStatus.textContent = "Upload error";
    renderError(err.message);
    clearUploadMode();
    cameraEmpty.classList.remove("hidden");
  } finally {
    isManualBusy = false;
    renderControls();
  }
}

function clearUploadMode() {
  if (!isUploadMode) return;
  isUploadMode = false;
  uploadPreview.classList.remove("visible");
  uploadPreview.src = "";
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  cameraEmpty.classList.remove("hidden");
}

// Drag-and-drop
cameraStage.addEventListener("dragover", (e) => {
  if (!isApiConfirmed || stream) return;
  e.preventDefault();
  cameraStage.classList.add("drag-over");
});
cameraStage.addEventListener("dragleave", () => cameraStage.classList.remove("drag-over"));
cameraStage.addEventListener("drop", (e) => {
  cameraStage.classList.remove("drag-over");
  if (!isApiConfirmed || stream) return;
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) analyzeUploadedFile(file);
});

imageUpload.addEventListener("change", () => {
  const file = imageUpload.files?.[0];
  if (file) analyzeUploadedFile(file);
  imageUpload.value = "";
});

// ═══════════════════════════════════════════════════════════════════
// Shared inference helpers
// ═══════════════════════════════════════════════════════════════════

// Capture current video frame, downscale, return blob with ._scale attached
async function captureFrame(quality) {
  const vw = video.videoWidth, vh = video.videoHeight;
  captureCanvas.width = vw; captureCanvas.height = vh;
  captureCtx.drawImage(video, 0, 0, vw, vh);
  const scale = Math.min(1, INFER_MAX_W / vw);
  const iw = Math.round(vw * scale), ih = Math.round(vh * scale);
  inferCanvas.width = iw; inferCanvas.height = ih;
  inferCtx.drawImage(captureCanvas, 0, 0, iw, ih);
  const blob = await canvasToBlob(inferCanvas, quality);
  blob._scale = scale;
  return blob;
}

// ── Client-side Roboflow inference (bypasses backend DNS) ─────────
// Sends the frame blob directly to detect.roboflow.com from the
// browser, then applies grooming rules in JS and — when recordEvent
// is true — persists the result via the backend's /api/log-event.
async function callRoboflowDirect(blob, recordEvent) {
  const { apiKey, projectId, version } = confirmedApiConfig;
  const started = performance.now();

  const url =
    `https://detect.roboflow.com/${encodeURIComponent(projectId)}` +
    `/${encodeURIComponent(version)}` +
    `?api_key=${encodeURIComponent(apiKey)}&confidence=35&overlap=30`;

  const form = new FormData();
  form.append("file", blob, "frame.jpg");
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j.message || ""; } catch { /* noop */ }
    throw new Error(`Roboflow API error ${res.status}${detail ? ": " + detail : ""}`);
  }
  const rfData = await res.json();
  const processing_ms = parseFloat((performance.now() - started).toFixed(2));
  const timestamp     = new Date().toISOString();

  // Convert center-based Roboflow predictions → corner-based detections
  const detections = (rfData.predictions || []).map((p) => {
    const label    = p.class || "";
    const category = LABEL_TO_CATEGORY[label] || label;
    const violation = VIOLATION_CATEGORIES.has(category);
    return {
      label,
      category,
      confidence: p.confidence,
      violation,
      box: {
        x1: p.x - p.width  / 2,
        y1: p.y - p.height / 2,
        x2: p.x + p.width  / 2,
        y2: p.y + p.height / 2,
      },
    };
  });

  const { decision, gender, reasons } = applyGroomingRules(detections);

  const result = {
    timestamp,
    decision,
    gender,
    provider:       "roboflow",
    reasons,
    detections,
    model_loaded:   true,
    model_path:     "Roboflow Hosted API",
    model_error:    null,
    roboflow_model: `${projectId}/${version}`,
    processing_ms,
    event_logged:   false,
  };

  if (recordEvent) {
    await logEventToBackend(result);
    result.event_logged = true;
  }
  return result;
}

function applyGroomingRules(detections) {
  // Infer gender from the first gender-mapped detection
  let gender = "unknown";
  for (const det of detections) {
    const g = GENDER_CATEGORY_MAP[det.category];
    if (g) { gender = g; break; }
  }

  // Collect unique violation reasons
  const seen    = new Set();
  const reasons = [];
  for (const det of detections) {
    if (det.violation && !seen.has(det.category)) {
      seen.add(det.category);
      reasons.push(VIOLATION_MESSAGES[det.category] || `${det.category} detected.`);
    }
  }

  const decision = reasons.length ? "VIOLATION" : "PASS";
  return { decision, gender, reasons };
}

async function logEventToBackend(result) {
  try {
    await fetch("/api/log-event", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        timestamp:      result.timestamp,
        decision:       result.decision,
        gender:         result.gender,
        reasons:        result.reasons,
        detections:     result.detections,
        processing_ms:  result.processing_ms,
        roboflow_model: result.roboflow_model,
      }),
    });
  } catch { /* CSV log is best-effort */ }
}

function scaleBoxes(result, factor) {
  for (const d of result.detections) {
    d.box.x1 *= factor; d.box.y1 *= factor;
    d.box.x2 *= factor; d.box.y2 *= factor;
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", quality));
}

function getCooldownMs() {
  const v = parseFloat(cooldownInput.value);
  return (isNaN(v) || v < 0 ? 3 : v) * 1000;
}

// ═══════════════════════════════════════════════════════════════════
// Bounding box drawing
// ═══════════════════════════════════════════════════════════════════

function drawDetections(result) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (!result?.detections?.length) return;

  const lw = Math.max(2, Math.round(overlay.width / 420));
  const fs = Math.max(12, Math.round(overlay.width / 58));
  overlayCtx.font         = `700 ${fs}px Inter, sans-serif`;
  overlayCtx.textBaseline = "top";

  for (const det of result.detections) {
    const { x1, y1, x2, y2 } = det.box;
    const bw    = Math.max(1, x2 - x1);
    const bh    = Math.max(1, y2 - y1);
    const color = CATEGORY_COLORS[det.category] ?? (det.violation ? "#f87171" : "#34d399");
    const label = `${formatLabel(det.label)}  ${pct(det.confidence)}%`;
    const tw    = overlayCtx.measureText(label).width + 18;
    const th    = fs + 10;
    const ty    = y1 - th - 4 < 0 ? y1 + bh + 4 : y1 - th - 4;

    overlayCtx.lineWidth   = lw;
    overlayCtx.strokeStyle = color;
    overlayCtx.shadowColor = color;
    overlayCtx.shadowBlur  = det.violation ? 12 : 5;
    roundRect(overlayCtx, x1, y1, bw, bh, 4, "stroke");

    overlayCtx.shadowBlur = 0;
    overlayCtx.fillStyle  = color;
    roundRect(overlayCtx, x1, ty, tw, th, [4, 4, 4, 0], "fill");

    overlayCtx.fillStyle = "#000";
    overlayCtx.fillText(label, x1 + 9, ty + 5);
  }
  overlayCtx.shadowBlur = 0;
  overlayCtx.shadowColor = "transparent";
}

function roundRect(ctx, x, y, w, h, r, method) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    const rad = typeof r === "number" ? r : (Array.isArray(r) ? r[0] : 4);
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);     ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);     ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);         ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }
  method === "fill" ? ctx.fill() : ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════════
// Camera notification overlay
// ═══════════════════════════════════════════════════════════════════

function updateCameraNotif(result) {
  if (!result || (!stream && !isUploadMode) || ["MODEL_REQUIRED", "ERROR"].includes(result.decision)) {
    hideCameraNotif(); return;
  }
  if (result.decision === "PASS") {
    cameraNotif.className = "camera-notif pass";
    cameraNotif.innerHTML = `<span>✓</span><span>PASS — No violations</span>`;
  } else {
    const msg = result.reasons[0] || "Violation detected";
    cameraNotif.className = "camera-notif violation";
    cameraNotif.innerHTML = `<span>⚠</span><span>VIOLATION — ${msg}</span>`;
  }
}

function hideCameraNotif() { cameraNotif.className = "camera-notif hidden"; }

// ═══════════════════════════════════════════════════════════════════
// Panel rendering
// ═══════════════════════════════════════════════════════════════════

function updatePanels(result, savedManually = false) {
  processingTime.textContent = `${result.processing_ms} ms`;
  detectionCount.textContent = result.detections.length;
  genderDisplay.textContent  = result.gender === "unknown" ? "--" : capitalize(result.gender);
  if (result.decision === "MODEL_REQUIRED") frameStatus.textContent = "Setup needed";
  else if (result.decision === "ERROR")     frameStatus.textContent = "Error";

  renderDecision(result);
  renderReasons(result);
  renderLabels(result);
  updateCameraNotif(result);

  // Cooldown-gated audio + log
  const now = Date.now();
  if (result.decision === "VIOLATION") {
    if (now - lastViolationTime >= getCooldownMs()) {
      playViolationBeep();
      addLog("VIOLATION", result.reasons.join(" · ") || "Violation detected");
      lastViolationTime = now;
    }
  } else if (result.decision === "PASS" && savedManually) {
    addLog("PASS", "No violations detected.");
  }
}

function renderDecision(result) {
  const map = {
    PASS:           ["pass",      "PASS"],
    VIOLATION:      ["violation", "VIOLATION"],
    MODEL_REQUIRED: ["warning",   "SETUP"],
    ERROR:          ["warning",   "ERROR"],
  };
  const [cls, text] = map[result.decision] ?? ["warning", result.decision];
  decisionCard.className   = `decision-card ${cls}`;
  decisionText.textContent = text;
}

function renderReasons(result) {
  reasonList.innerHTML    = "";
  reasonCount.textContent = result.reasons.length;
  if (!result.reasons.length) {
    const li = document.createElement("li");
    li.className   = "item-muted";
    li.textContent = result.decision === "PASS" ? "✓ No violations detected" : "No active check";
    reasonList.append(li);
    return;
  }
  for (const r of result.reasons) {
    const li = document.createElement("li");
    li.className   = result.decision === "VIOLATION" ? "violation" : "";
    li.textContent = r;
    reasonList.append(li);
  }
}

function renderLabels(result) {
  labelList.innerHTML    = "";
  labelCount.textContent = result.detections.length;
  if (!result.detections.length) {
    const c = document.createElement("span");
    c.className = "chip chip-neutral"; c.textContent = "No detections";
    labelList.append(c); return;
  }
  for (const det of result.detections) {
    const c = document.createElement("span");
    c.className   = `chip ${det.violation ? "chip-violation" : "chip-pass"}`;
    c.textContent = `${formatLabel(det.label)} ${pct(det.confidence)}%`;
    c.title       = det.category;
    labelList.append(c);
  }
}

function resetDecision() {
  processingTime.textContent = "--";
  detectionCount.textContent = "0";
  genderDisplay.textContent  = "--";
  frameStatus.textContent    = "Idle";
  decisionCard.className     = "decision-card";
  decisionText.textContent   = "WAITING";
  reasonCount.textContent    = "0";
  reasonList.innerHTML       = `<li class="item-muted">No active check</li>`;
  labelCount.textContent     = "0";
  labelList.innerHTML        = `<span class="chip chip-neutral">No detections</span>`;
  hideCameraNotif();
}

function renderError(msg) {
  decisionCard.className   = "decision-card warning";
  decisionText.textContent = "ERROR";
  reasonCount.textContent  = "1";
  reasonList.innerHTML     = "";
  const li = document.createElement("li");
  li.className = "violation"; li.textContent = msg;
  reasonList.append(li);
}

// ═══════════════════════════════════════════════════════════════════
// Event log
// ═══════════════════════════════════════════════════════════════════

function addLog(decision, detail) {
  const li  = document.createElement("li");
  const now = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  if (decision === "VIOLATION") li.classList.add("log-violation");
  if (decision === "PASS")      li.classList.add("log-pass");
  li.innerHTML =
    `<div class="log-row"><span class="log-decision">${decision}</span><time>${now}</time></div>` +
    `<span class="log-detail">${detail}</span>`;
  eventLog.prepend(li);
  while (eventLog.children.length > MAX_LOG_ENTRIES) eventLog.lastElementChild.remove();
}

// ═══════════════════════════════════════════════════════════════════
// Settings persistence
// ═══════════════════════════════════════════════════════════════════

function saveSettings() {
  localStorage.setItem("cv-settings", JSON.stringify({
    projectId:    roboflowProjectId.value.trim(),
    audioEnabled: audioEnabled,
    cooldown:     cooldownInput.value,
  }));
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("cv-settings") || "{}");
    if (s.projectId)        roboflowProjectId.value = s.projectId;
    if (s.cooldown != null) cooldownInput.value      = s.cooldown;
    if (s.audioEnabled != null) {
      audioEnabled = Boolean(s.audioEnabled);
      audioToggle.classList.toggle("on", audioEnabled);
      audioToggle.setAttribute("aria-checked", String(audioEnabled));
    }
  } catch { localStorage.removeItem("cv-settings"); }

  const savedTheme = localStorage.getItem("cv-theme");
  applyTheme(savedTheme === "dark"); // default light/professional
}

// ═══════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════

function formatLabel(l) {
  return l.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function capitalize(s) { return s[0].toUpperCase() + s.slice(1); }
function pct(c)        { return Math.round(c * 100); }

// ═══════════════════════════════════════════════════════════════════
// Event wiring
// ═══════════════════════════════════════════════════════════════════

// Home page navigation
homeStartBtn.addEventListener("click",    () => switchTab("scanner"));
homeSettingsBtn.addEventListener("click", () => switchTab("settings"));

confirmApiButton.addEventListener("click",  confirmApiConfig);
startButton.addEventListener("click",       startCamera);
stopButton.addEventListener("click",        stopCamera);

// Log Entry — live feed: capture + record; upload mode: log existing result
saveButton.addEventListener("click", () => {
  if (isUploadMode && latestResult) logCurrentResult();
  else captureAndAnalyze(true);
});

roboflowProjectId.addEventListener("input", saveSettings);
cooldownInput.addEventListener("input",     saveSettings);
clearLogBtn.addEventListener("click",       () => { eventLog.innerHTML = ""; });
video.addEventListener("loadedmetadata",    syncOverlaySize);
window.addEventListener("resize",          syncOverlaySize);

// ═══════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════

checkSession();
loadSettings();
renderControls();
loadStatus();
