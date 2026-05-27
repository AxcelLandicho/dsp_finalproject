// ─────────────────────────────────────────────────────────────────────────────
// Student Head Grooming Gate Check — Frontend
// Inference: Roboflow Hosted API (REST), frame captured every 800 ms
// ─────────────────────────────────────────────────────────────────────────────

// ── DOM ──────────────────────────────────────────────────────────────────────
const video             = document.querySelector("#video");
const overlay           = document.querySelector("#overlay");
const overlayCtx        = overlay.getContext("2d");
const cameraStage       = document.querySelector("#cameraStage");
const cameraEmptyState  = document.querySelector("#cameraEmptyState");
const violationFlash    = document.querySelector("#violationFlash");

const roboflowApiKey    = document.querySelector("#roboflowApiKey");
const roboflowProjectId = document.querySelector("#roboflowProjectId");
const confirmApiButton  = document.querySelector("#confirmApiButton");
const startButton       = document.querySelector("#startButton");
const stopButton        = document.querySelector("#stopButton");
const saveButton        = document.querySelector("#saveButton");
const clearLogButton    = document.querySelector("#clearLogButton");

const modelStatus       = document.querySelector("#modelStatus");
const frameStatus       = document.querySelector("#frameStatus");
const processingTime    = document.querySelector("#processingTime");
const detectionCount    = document.querySelector("#detectionCount");
const genderDisplay     = document.querySelector("#genderDisplay");
const decisionCard      = document.querySelector("#decisionCard");
const decisionText      = document.querySelector("#decisionText");
const reasonCount       = document.querySelector("#reasonCount");
const reasonList        = document.querySelector("#reasonList");
const labelCount        = document.querySelector("#labelCount");
const labelList         = document.querySelector("#labelList");
const eventLog          = document.querySelector("#eventLog");

// Off-screen canvas for capturing video frames
const captureCanvas     = document.createElement("canvas");
const captureCtx        = captureCanvas.getContext("2d");

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_LOG_ENTRIES   = 20;

const CATEGORY_COLORS = {
  improper_haircut_male:   "#ef4444",
  improper_haircut_female: "#ef4444",
  headwear:                "#f97316",
  bright_dyed_hair:        "#a855f7",
  proper_haircut_male:     "#22c55e",
  proper_haircut_female:   "#22c55e",
  no_headwear:             "#22c55e",
  natural_hair_color:      "#22c55e",
};

// ── State ─────────────────────────────────────────────────────────────────────
let stream              = null;
let drawLoopHandle      = null;   // requestAnimationFrame handle
let isAnalyzing         = false;  // inference in-flight guard
let latestResult        = null;
let statusPayload       = null;
let isApiConfirmed      = false;
let confirmedApiConfig  = null;

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

async function loadStatus() {
  try {
    const res   = await fetch("/api/status", { cache: "no-store" });
    statusPayload = await res.json();
    renderModelStatus();
  } catch {
    modelStatus.textContent = "Backend offline";
    modelStatus.style.color = "#b42318";
  }
}

function renderModelStatus() {
  if (isApiConfirmed && confirmedApiConfig) {
    modelStatus.textContent =
      `✓ Roboflow confirmed: ${confirmedApiConfig.projectId} / v${confirmedApiConfig.version}`;
    modelStatus.style.color = "#177245";
    return;
  }
  modelStatus.textContent = "Enter your Roboflow API key and project, then confirm.";
  modelStatus.style.color = "#a76700";
}

// ─────────────────────────────────────────────────────────────────────────────
// API confirmation
// ─────────────────────────────────────────────────────────────────────────────

function confirmApiConfig() {
  if (isApiConfirmed) {
    unlockApiConfig();
    return;
  }

  const config  = readApiConfig();
  const missing = missingApiFields(config);
  if (missing.length) {
    renderError(`Missing: ${missing.join(", ")}.`);
    frameStatus.textContent = "Setup needed";
    return;
  }

  confirmedApiConfig = config;
  isApiConfirmed     = true;
  setApiInputsLocked(true);
  confirmApiButton.textContent = "Change API";
  confirmApiButton.classList.replace("primary-button", "ghost-button");
  renderModelStatus();
  resetDecision();
  renderControls();
  saveSettings();
  cameraEmptyState.querySelector("span").textContent = "Press Start Live Feed to scan";
}

function unlockApiConfig() {
  stopCamera();
  isApiConfirmed     = false;
  confirmedApiConfig = null;
  setApiInputsLocked(false);
  confirmApiButton.textContent = "Confirm API";
  confirmApiButton.classList.replace("ghost-button", "primary-button");
  modelStatus.textContent = "Edit your details, then confirm again.";
  modelStatus.style.color = "#a76700";
  resetDecision();
  renderControls();
  cameraEmptyState.querySelector("span").textContent = "Confirm API to start scanning";
}

function setApiInputsLocked(locked) {
  roboflowApiKey.disabled    = locked;
  roboflowProjectId.disabled = locked;
}

function readApiConfig() {
  const raw     = roboflowProjectId.value.trim();
  const slashAt = raw.lastIndexOf("/");
  const projectId = slashAt !== -1 ? raw.slice(0, slashAt).trim() : raw;
  const version   = slashAt !== -1 ? (raw.slice(slashAt + 1).trim() || "1") : "1";
  return { apiKey: roboflowApiKey.value.trim(), projectId, version };
}

function missingApiFields(config) {
  const missing = [];
  if (!config.apiKey)    missing.push("API key");
  if (!config.projectId) missing.push("Project ID");
  return missing;
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera
// ─────────────────────────────────────────────────────────────────────────────

function renderControls() {
  const hasCamera = Boolean(stream);
  const canUse    = isApiConfirmed && Boolean(confirmedApiConfig);
  startButton.disabled = hasCamera || !canUse;
  stopButton.disabled  = !hasCamera;
  saveButton.disabled  = !hasCamera;
}

async function startCamera() {
  if (!isApiConfirmed) { renderError("Confirm API first."); return; }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    video.classList.add("active");
    cameraEmptyState.classList.add("hidden");
    syncOverlaySize();
    frameStatus.textContent = "Scanning…";
    startDrawLoop();
    renderControls();
  } catch {
    frameStatus.textContent = "Camera blocked";
    addEventLog("CAMERA", "Camera access was denied.");
    renderControls();
  }
}

function stopCamera() {
  stopDrawLoop();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream      = null;
  video.srcObject = null;
  video.classList.remove("active");
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  cameraEmptyState.classList.remove("hidden");
  frameStatus.textContent = "Idle";
  renderControls();
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw loop  — requestAnimationFrame draws at ~60 fps
//              Inference fires immediately when the previous call finishes
//              (same pattern Roboflow's own UI uses)
// ─────────────────────────────────────────────────────────────────────────────

function startDrawLoop() {
  stopDrawLoop();

  const loop = () => {
    if (!stream) return;

    syncOverlaySize();
    // Always paint latest boxes every frame — keeps overlay smooth & consistent
    drawDetections(latestResult);

    // Kick off next inference as soon as previous one is done
    if (!isAnalyzing && video.readyState >= 2) {
      runInference(false);
    }

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
  const newW    = video.videoWidth;
  const newH    = video.videoHeight;
  const changed = overlay.width !== newW || overlay.height !== newH;
  cameraStage.style.aspectRatio = `${newW} / ${newH}`;
  if (changed) {
    overlay.width        = newW;
    overlay.height       = newH;
    captureCanvas.width  = newW;
    captureCanvas.height = newH;
  }
}

// Capture one frame and send to Roboflow; update UI when response arrives
async function runInference(recordEvent) {
  if (!stream || !video.videoWidth || isAnalyzing || !isApiConfirmed) return;
  isAnalyzing = true;

  try {
    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    const blob = await canvasToBlob(captureCanvas);

    const form = new FormData();
    form.append("image",               blob, "frame.jpg");
    form.append("record_event",        recordEvent ? "true" : "false");
    form.append("roboflow_api_key",    confirmedApiConfig.apiKey);
    form.append("roboflow_project_id", confirmedApiConfig.projectId);
    form.append("roboflow_version",    confirmedApiConfig.version);

    const res = await fetch("/api/analyze-frame", { method: "POST", body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const result = await res.json();
    latestResult = result;
    updatePanels(result, recordEvent);
  } catch (err) {
    frameStatus.textContent = "Error";
    renderError(err.message);
  } finally {
    isAnalyzing = false;
    renderControls();
  }
}

// Manual "Log Entry" button — capture current frame and record to CSV
async function sendFrame(recordEvent) {
  await runInference(recordEvent);
}

function canvasToBlob(canvas) {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

// Update all info panels — drawing is handled separately by the rAF loop
function updatePanels(result, savedManually = false) {
  processingTime.textContent = `${result.processing_ms} ms`;
  detectionCount.textContent = result.detections.length;
  genderDisplay.textContent  =
    result.gender === "unknown" ? "--" : capitalize(result.gender);
  frameStatus.textContent    =
    result.decision === "MODEL_REQUIRED" ? "Setup needed" : "Scanning…";

  renderDecision(result);
  renderReasons(result);
  renderLabels(result);

  if (result.decision === "VIOLATION") {
    addEventLog("VIOLATION", formatReasons(result));
  } else if (result.decision === "PASS" && savedManually) {
    addEventLog("PASS", "No violations detected.");
  }
}

function renderDecision(result) {
  decisionCard.className = "decision-card";
  const map = {
    PASS:           ["pass",      "PASS"],
    VIOLATION:      ["violation", "VIOLATION"],
    MODEL_REQUIRED: ["warning",   "SETUP"],
    ERROR:          ["warning",   "ERROR"],
  };
  const [cls, text] = map[result.decision] ?? ["warning", result.decision];
  decisionCard.classList.add(cls);
  decisionText.textContent = text;
}

function renderReasons(result) {
  reasonList.innerHTML    = "";
  reasonCount.textContent = result.reasons.length;
  if (!result.reasons.length) {
    const li       = document.createElement("li");
    li.textContent = result.decision === "PASS" ? "No violations detected ✓" : "No active check";
    reasonList.append(li);
    return;
  }
  for (const reason of result.reasons) {
    const li       = document.createElement("li");
    li.textContent = reason;
    if (result.decision === "VIOLATION") li.classList.add("violation");
    reasonList.append(li);
  }
}

function renderLabels(result) {
  labelList.innerHTML    = "";
  labelCount.textContent = result.detections.length;
  if (!result.detections.length) {
    const chip       = document.createElement("span");
    chip.className   = "muted-chip";
    chip.textContent = "No detections";
    labelList.append(chip);
    return;
  }
  for (const det of result.detections) {
    const chip       = document.createElement("span");
    chip.className   = det.violation ? "label-chip violation" : "label-chip";
    chip.textContent = `${formatLabel(det.label)} ${pct(det.confidence)}%`;
    chip.title       = `Category: ${det.category}`;
    labelList.append(chip);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounding box drawing
// ─────────────────────────────────────────────────────────────────────────────

function drawDetections(result) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (!result?.detections?.length) return;

  const lineW    = Math.max(2, Math.round(overlay.width / 400));
  const fontSize = Math.max(13, Math.round(overlay.width / 55));
  overlayCtx.font         = `700 ${fontSize}px Inter, ui-sans-serif, sans-serif`;
  overlayCtx.textBaseline = "top";

  for (const det of result.detections) {
    const { x1, y1, x2, y2 } = det.box;
    const bw    = Math.max(1, x2 - x1);
    const bh    = Math.max(1, y2 - y1);
    const color = CATEGORY_COLORS[det.category] ?? (det.violation ? "#ef4444" : "#22c55e");
    const label = `${formatLabel(det.label)}  ${pct(det.confidence)}%`;

    const lw = overlayCtx.measureText(label).width + 18;
    const lh = fontSize + 10;
    const ly = y1 - lh - 4 < 0 ? y1 + bh + 4 : y1 - lh - 4;

    overlayCtx.lineWidth   = lineW;
    overlayCtx.strokeStyle = color;
    overlayCtx.shadowColor = color;
    overlayCtx.shadowBlur  = det.violation ? 10 : 4;
    drawRoundRect(overlayCtx, x1, y1, bw, bh, 5, "stroke");

    overlayCtx.shadowBlur = 0;
    overlayCtx.fillStyle  = color;
    drawRoundRect(overlayCtx, x1, ly, lw, lh, [4, 4, 4, 0], "fill");

    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.fillText(label, x1 + 9, ly + 5);
  }

  overlayCtx.shadowBlur  = 0;
  overlayCtx.shadowColor = "transparent";
}

function drawRoundRect(ctx, x, y, w, h, radii, method) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radii);
  } else {
    const r = typeof radii === "number" ? radii : (Array.isArray(radii) ? radii[0] : 4);
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  if (method === "fill")   ctx.fill();
  if (method === "stroke") ctx.stroke();
}

// ─────────────────────────────────────────────────────────────────────────────
// Event log
// ─────────────────────────────────────────────────────────────────────────────

function addEventLog(decision, detail) {
  const item = document.createElement("li");
  item.classList.toggle("log-violation", decision === "VIOLATION");
  const now = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  item.innerHTML =
    `<strong><b>${decision}</b><time>${now}</time></strong><span>${detail}</span>`;
  eventLog.prepend(item);
  while (eventLog.children.length > MAX_LOG_ENTRIES) eventLog.lastElementChild.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset / error
// ─────────────────────────────────────────────────────────────────────────────

function resetDecision() {
  processingTime.textContent  = "--";
  detectionCount.textContent  = "0";
  genderDisplay.textContent   = "--";
  decisionCard.className      = "decision-card neutral";
  decisionText.textContent    = "WAITING";
  reasonCount.textContent     = "0";
  reasonList.innerHTML        = "<li>No active check</li>";
  labelCount.textContent      = "0";
  labelList.innerHTML         = '<span class="muted-chip">No detections</span>';
  violationFlash.classList.remove("active");
}

function renderError(message) {
  renderDecision({ decision: "ERROR" });
  reasonCount.textContent = "1";
  reasonList.innerHTML    = "";
  const li                = document.createElement("li");
  li.textContent          = message;
  li.classList.add("violation");
  reasonList.append(li);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

function saveSettings() {
  localStorage.setItem(
    "gate-check-settings",
    JSON.stringify({ projectId: roboflowProjectId.value.trim() })
  );
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("gate-check-settings") || "{}");
    if (s.projectId) roboflowProjectId.value = s.projectId;
  } catch {
    localStorage.removeItem("gate-check-settings");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function formatLabel(label) {
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pct(confidence) {
  return Math.round(confidence * 100);
}

function formatReasons(result) {
  return result.reasons.length ? result.reasons.join(" | ") : "No details.";
}

// ─────────────────────────────────────────────────────────────────────────────
// Event wiring
// ─────────────────────────────────────────────────────────────────────────────

confirmApiButton.addEventListener("click",  confirmApiConfig);
startButton.addEventListener("click",       startCamera);
stopButton.addEventListener("click",        stopCamera);
saveButton.addEventListener("click",        () => sendFrame(true));
roboflowProjectId.addEventListener("input", saveSettings);
clearLogButton.addEventListener("click",    () => { eventLog.innerHTML = ""; });
video.addEventListener("loadedmetadata",    syncOverlaySize);
window.addEventListener("resize", syncOverlaySize);

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
loadSettings();
renderControls();
loadStatus();
