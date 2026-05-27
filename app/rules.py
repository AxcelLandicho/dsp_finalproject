from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .schemas import Detection


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RULES_PATH = PROJECT_ROOT / "config" / "grooming_rules.json"

# Maps detection category → inferred gender
GENDER_CATEGORY_MAP: dict[str, str] = {
    "improper_haircut_male": "male",
    "proper_haircut_male": "male",
    "improper_haircut_female": "female",
    "proper_haircut_female": "female",
    "male": "male",
    "female": "female",
}

# Categories that always count as a grooming violation
VIOLATION_CATEGORIES: frozenset[str] = frozenset(
    {
        "improper_haircut_male",
        "improper_haircut_female",
        "headwear",
        "bright_dyed_hair",
    }
)


def normalize_label(label: str) -> str:
    cleaned = label.strip().lower()
    cleaned = re.sub(r"[\s\-]+", "_", cleaned)
    cleaned = re.sub(r"[^a-z0-9_]+", "", cleaned)
    return cleaned


class GroomingRules:
    def __init__(self, config_path: Path = DEFAULT_RULES_PATH) -> None:
        self.config_path = config_path
        self.config = self._load_config(config_path)
        self.labels = self._normalize_label_config(self.config.get("labels", {}))
        self.messages = self.config.get("messages", {})
        self.confidence_threshold = float(self.config.get("confidence_threshold", 0.35))

    @staticmethod
    def _load_config(config_path: Path) -> dict[str, Any]:
        with config_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @staticmethod
    def _normalize_label_config(labels: dict[str, list[str]]) -> dict[str, set[str]]:
        normalized: dict[str, set[str]] = {}
        for category, aliases in labels.items():
            normalized[category] = {normalize_label(alias) for alias in aliases}
        return normalized

    def category_for_label(self, label: str) -> str:
        normalized_label = normalize_label(label)
        for category, aliases in self.labels.items():
            if normalized_label in aliases:
                return category
        # Fallback: return the normalized label itself as the category
        return normalized_label

    def infer_gender(self, detections: list[Detection]) -> str:
        """Infer gender from haircut-specific detection categories."""
        candidates: list[tuple[Detection, str]] = [
            (d, GENDER_CATEGORY_MAP[d.category])
            for d in detections
            if d.category in GENDER_CATEGORY_MAP
        ]
        if not candidates:
            return "unknown"
        strongest = max(candidates, key=lambda x: x[0].confidence)
        return strongest[1]

    def is_detection_violation(self, detection: Detection, gender: str) -> bool:  # noqa: ARG002
        """Return True when this detection represents a grooming violation."""
        return detection.category in VIOLATION_CATEGORIES

    def evaluate(
        self,
        detections: list[Detection],
        gender: str,
    ) -> tuple[str, list[str], list[Detection]]:
        reasons: list[str] = []
        seen_reasons: set[str] = set()
        evaluated: list[Detection] = []

        for detection in detections:
            detection.violation = self.is_detection_violation(detection, gender)
            evaluated.append(detection)
            if not detection.violation:
                continue

            message = self.messages.get(
                detection.category, f"{detection.label.replace('_', ' ').title()} detected."
            )
            if message not in seen_reasons:
                reasons.append(message)
                seen_reasons.add(message)

        decision = "VIOLATION" if reasons else "PASS"
        return decision, reasons, evaluated
