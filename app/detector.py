from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np
import requests

from .rules import GroomingRules
from .schemas import Detection, DetectionBox


ROBOFLOW_DETECT_URL = "https://detect.roboflow.com/{project_id}/{version}"


def decode_image(image_bytes: bytes) -> np.ndarray:
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode uploaded image frame.")
    return frame


class RoboflowHostedDetector:
    def __init__(self, rules: GroomingRules) -> None:
        self.rules = rules
        self.endpoint_template = ROBOFLOW_DETECT_URL

    def detect(
        self,
        image_bytes: bytes,
        *,
        api_key: str,
        project_id: str,
        version: str,
        content_type: str | None = None,
    ) -> list[Detection]:
        clean_api_key = api_key.strip()
        clean_project_id = project_id.strip().strip("/")
        clean_version = version.strip().strip("/")
        if not clean_api_key or not clean_project_id or not clean_version:
            raise ValueError("Roboflow API key, project ID, and version are required.")

        url = self.endpoint_template.format(project_id=clean_project_id, version=clean_version)
        params = {
            "api_key": clean_api_key,
            "confidence": int(self.rules.confidence_threshold * 100),
            "overlap": 30,
        }
        encoded_image = base64.b64encode(image_bytes)
        response = requests.post(
            url,
            params=params,
            data=encoded_image,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        if response.status_code >= 400:
            raise ValueError(self._roboflow_error_message(response))

        payload = response.json()
        return self._detections_from_payload(payload, image_bytes)

    def _detections_from_payload(self, payload: dict[str, Any], image_bytes: bytes) -> list[Detection]:
        predictions = payload.get("predictions", [])
        if isinstance(predictions, dict):
            predictions = list(predictions.values())
        if not isinstance(predictions, list):
            return []

        image_info = payload.get("image", {}) if isinstance(payload.get("image"), dict) else {}
        image_width = _safe_float(image_info.get("width"))
        image_height = _safe_float(image_info.get("height"))
        if image_width <= 0 or image_height <= 0:
            frame = decode_image(image_bytes)
            image_height, image_width = frame.shape[:2]

        detections: list[Detection] = []
        for prediction in predictions:
            if not isinstance(prediction, dict):
                continue

            confidence = _safe_float(prediction.get("confidence"))
            if confidence > 1:
                confidence = confidence / 100
            if confidence < self.rules.confidence_threshold:
                continue

            label = str(prediction.get("class") or prediction.get("label") or "unknown")
            category = self.rules.category_for_label(label)
            box = self._box_from_prediction(prediction, image_width, image_height)
            detections.append(
                Detection(
                    label=label,
                    category=category,
                    confidence=confidence,
                    box=box,
                )
            )

        return detections

    @staticmethod
    def _box_from_prediction(
        prediction: dict[str, Any],
        image_width: float,
        image_height: float,
    ) -> DetectionBox:
        if all(key in prediction for key in ("x", "y", "width", "height")):
            width = _safe_float(prediction.get("width"))
            height = _safe_float(prediction.get("height"))
            center_x = _safe_float(prediction.get("x"))
            center_y = _safe_float(prediction.get("y"))
            x1 = center_x - width / 2
            y1 = center_y - height / 2
            x2 = center_x + width / 2
            y2 = center_y + height / 2
        else:
            x1 = _safe_float(prediction.get("x1"))
            y1 = _safe_float(prediction.get("y1"))
            x2 = _safe_float(prediction.get("x2"), image_width)
            y2 = _safe_float(prediction.get("y2"), image_height)

        return DetectionBox(
            x1=_clamp(x1, 0, image_width),
            y1=_clamp(y1, 0, image_height),
            x2=_clamp(x2, 0, image_width),
            y2=_clamp(y2, 0, image_height),
        )

    @staticmethod
    def _roboflow_error_message(response: requests.Response) -> str:
        try:
            payload = response.json()
            detail = payload.get("message") or payload.get("error") or payload
        except ValueError:
            detail = response.text.strip()
        return f"Roboflow request failed ({response.status_code}): {detail}"


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))
