from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DetectionBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class Detection(BaseModel):
    label: str
    category: str
    confidence: float = Field(ge=0.0, le=1.0)
    box: DetectionBox
    violation: bool = False


class AnalysisResponse(BaseModel):
    timestamp: str
    decision: Literal["PASS", "VIOLATION", "MODEL_REQUIRED", "ERROR"]
    gender: Literal["male", "female", "unknown"]
    provider: Literal["roboflow"] = "roboflow"
    reasons: list[str]
    detections: list[Detection]
    model_loaded: bool
    model_path: str
    model_error: str | None = None
    roboflow_model: str | None = None
    processing_ms: float
    event_logged: bool = False


class StatusResponse(BaseModel):
    app_name: str
    confidence_threshold: float
    rules: dict[str, list[str]]
    roboflow_endpoint: str
    violation_categories: list[str]


class LogEventRequest(BaseModel):
    """Payload sent by the browser after roboflow.js inference — no image needed."""
    timestamp: str
    decision: str
    gender: str
    reasons: list[str]
    detections: list[Detection]
    processing_ms: float = 0.0
    roboflow_model: str | None = None
