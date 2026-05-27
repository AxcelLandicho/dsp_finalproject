from __future__ import annotations

import csv
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .detector import RoboflowHostedDetector, ROBOFLOW_DETECT_URL
from .rules import GroomingRules, VIOLATION_CATEGORIES
from .schemas import AnalysisResponse, LogEventRequest, StatusResponse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = PROJECT_ROOT / "static"
LOG_PATH = PROJECT_ROOT / "logs" / "gate_events.csv"

rules = GroomingRules()
roboflow_detector = RoboflowHostedDetector(rules=rules)

app = FastAPI(
    title="Student Head Grooming Detection System",
    description="Live gate camera system for student head grooming compliance.",
    version="2.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status", response_model=StatusResponse)
async def status() -> StatusResponse:
    return StatusResponse(
        app_name="Student Head Grooming Detection System",
        confidence_threshold=rules.confidence_threshold,
        rules={category: sorted(labels) for category, labels in rules.labels.items()},
        roboflow_endpoint=ROBOFLOW_DETECT_URL,
        violation_categories=sorted(VIOLATION_CATEGORIES),
    )


@app.post("/api/analyze-frame", response_model=AnalysisResponse)
async def analyze_frame(
    image: Annotated[UploadFile, File()],
    record_event: Annotated[bool, Form()] = False,
    roboflow_api_key: Annotated[str | None, Form()] = None,
    roboflow_project_id: Annotated[str | None, Form()] = None,
    roboflow_version: Annotated[str | None, Form()] = "1",
) -> AnalysisResponse:
    started = time.perf_counter()
    timestamp = datetime.now(timezone.utc).isoformat()
    image_bytes = await image.read()

    if not _has_roboflow_config(
        roboflow_api_key,
        roboflow_project_id,
        roboflow_version,
    ):
        return AnalysisResponse(
            timestamp=timestamp,
            decision="MODEL_REQUIRED",
            gender="unknown",
            provider="roboflow",
            reasons=["Enter and confirm the Roboflow API key and project ID."],
            detections=[],
            model_loaded=False,
            model_path="Roboflow Hosted API",
            model_error=None,
            roboflow_model=_roboflow_model_name(roboflow_project_id, roboflow_version),
            processing_ms=_elapsed_ms(started),
            event_logged=False,
        )

    try:
        detections = roboflow_detector.detect(
            image_bytes,
            api_key=roboflow_api_key or "",
            project_id=roboflow_project_id or "",
            version=roboflow_version or "",
            content_type=image.content_type,
        )
        inferred_gender = rules.infer_gender(detections)
        decision, reasons, evaluated = rules.evaluate(detections, inferred_gender)
    except ValueError as exc:
        return AnalysisResponse(
            timestamp=timestamp,
            decision="ERROR",
            gender="unknown",
            provider="roboflow",
            reasons=[str(exc)],
            detections=[],
            model_loaded=True,
            model_path="Roboflow Hosted API",
            model_error=None,
            roboflow_model=_roboflow_model_name(roboflow_project_id, roboflow_version),
            processing_ms=_elapsed_ms(started),
            event_logged=False,
        )
    except Exception as exc:  # pragma: no cover
        return AnalysisResponse(
            timestamp=timestamp,
            decision="ERROR",
            gender="unknown",
            provider="roboflow",
            reasons=[str(exc)],
            detections=[],
            model_loaded=True,
            model_path="Roboflow Hosted API",
            model_error=None,
            roboflow_model=_roboflow_model_name(roboflow_project_id, roboflow_version),
            processing_ms=_elapsed_ms(started),
            event_logged=False,
        )

    response = AnalysisResponse(
        timestamp=timestamp,
        decision=decision,
        gender=inferred_gender,
        provider="roboflow",
        reasons=reasons,
        detections=evaluated,
        model_loaded=True,
        model_path="Roboflow Hosted API",
        model_error=None,
        roboflow_model=_roboflow_model_name(roboflow_project_id, roboflow_version),
        processing_ms=_elapsed_ms(started),
        event_logged=False,
    )

    if record_event:
        _append_event(response)
        response.event_logged = True

    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@app.post("/api/log-event")
async def log_event(payload: LogEventRequest) -> dict[str, bool | str]:
    """Persist a browser-side detection result to the CSV log."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    is_new_file = not LOG_PATH.exists()
    with LOG_PATH.open("a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        if is_new_file:
            writer.writerow(
                ["timestamp", "decision", "gender", "provider",
                 "model", "reasons", "detections", "processing_ms"]
            )
        writer.writerow(
            [
                payload.timestamp,
                payload.decision,
                payload.gender,
                "roboflow.js",
                payload.roboflow_model or "roboflow.js",
                " | ".join(payload.reasons),
                " | ".join(
                    f"{d.label}:{d.confidence:.2f}:{d.category}:{'V' if d.violation else 'P'}"
                    for d in payload.detections
                ),
                payload.processing_ms,
            ]
        )
    return {"logged": True}


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def _has_roboflow_config(
    api_key: str | None,
    project_id: str | None,
    version: str | None,
) -> bool:
    return bool(api_key and api_key.strip() and project_id and project_id.strip())


def _roboflow_model_name(project_id: str | None, version: str | None) -> str | None:
    if not project_id or not version:
        return None
    clean_project_id = project_id.strip().strip("/")
    clean_version = version.strip().strip("/")
    if not clean_project_id or not clean_version:
        return None
    return f"{clean_project_id}/{clean_version}"


def _append_event(response: AnalysisResponse) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    is_new_file = not LOG_PATH.exists()
    with LOG_PATH.open("a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        if is_new_file:
            writer.writerow(
                [
                    "timestamp",
                    "decision",
                    "gender",
                    "provider",
                    "model",
                    "reasons",
                    "detections",
                    "processing_ms",
                ]
            )
        writer.writerow(
            [
                response.timestamp,
                response.decision,
                response.gender,
                response.provider,
                response.roboflow_model or response.model_path,
                " | ".join(response.reasons),
                " | ".join(
                    f"{item.label}:{item.confidence:.2f}:{item.category}:{'V' if item.violation else 'P'}"
                    for item in response.detections
                ),
                response.processing_ms,
            ]
        )
