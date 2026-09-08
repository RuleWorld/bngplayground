"""Compare two SBML trajectories with the same libRoadRunner settings.

This intentionally lives outside the Vitest suite: it needs the pinned
``atomizer-sbml-roundtrip`` environment and is the numerical gate for the
cross-format roundtrip harness.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import xml.etree.ElementTree as ET

import numpy as np
import roadrunner


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def canonical_label(name: str, identifier: str) -> str:
    value = (name or identifier or "").strip()
    if "::" in value:
        value = value.rsplit("::", 1)[-1]
    if value.startswith("@") and ":" in value:
        value = value.split(":", 1)[1]
    if "@" in value:
        value = value.split("@", 1)[0]
    value = re.sub(r"^M_", "", value)
    value = re.sub(r"\(\)$", "", value)
    return value.strip()


def species_labels(path: str) -> dict[str, str]:
    root = ET.parse(path).getroot()
    result: dict[str, str] = {}
    for element in root.iter():
        if local_name(element.tag) != "species":
            continue
        identifier = element.attrib.get("id", "")
        result[identifier] = canonical_label(element.attrib.get("name", ""), identifier)
    return result


def configure(rr: roadrunner.RoadRunner) -> None:
    rr.setIntegrator("cvode")
    for key, value in (("relative_tolerance", 1e-10), ("absolute_tolerance", 1e-12)):
        try:
            setattr(rr.integrator, key, value)
        except Exception:
            pass


def simulate(path: str, t_end: float, n_steps: int) -> tuple[list[str], np.ndarray, dict[str, str]]:
    rr = roadrunner.RoadRunner(path)
    configure(rr)
    identifiers = list(rr.model.getFloatingSpeciesIds())
    data = np.asarray(rr.simulate(0.0, t_end, n_steps + 1, selections=["time"] + identifiers), dtype=float)
    return identifiers, data, species_labels(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--t-end", type=float, required=True)
    parser.add_argument("--n-steps", type=int, required=True)
    parser.add_argument("--abs-tol", type=float, default=1e-7)
    parser.add_argument("--rel-tol", type=float, default=1e-7)
    args = parser.parse_args()

    try:
        source_ids, source_data, source_labels = simulate(args.source, args.t_end, args.n_steps)
        target_ids, target_data, target_labels = simulate(args.target, args.t_end, args.n_steps)
        source_by_label = {source_labels.get(identifier, identifier): i + 1 for i, identifier in enumerate(source_ids)}
        target_by_label = {target_labels.get(identifier, identifier): i + 1 for i, identifier in enumerate(target_ids)}
        mapping = "label"
        labels = sorted(set(source_by_label) | set(target_by_label))
        missing = [label for label in labels if label not in source_by_label or label not in target_by_label]
        if missing:
            # Atomizer's useId export intentionally assigns stable SBML ids (s0, s1, ...),
            # while preserving the floating-species order.  If labels are otherwise unusable,
            # compare that explicit order and report the fallback rather than silently treating
            # it as a semantic mismatch.
            if len(source_ids) == len(target_ids) and len(source_by_label) == len(source_ids) and len(target_by_label) == len(target_ids):
                mapping = "order-fallback"
                labels = [f"__ordered_{index}" for index in range(len(source_ids))]
                source_by_label = {label: index + 1 for index, label in enumerate(labels)}
                target_by_label = {label: index + 1 for index, label in enumerate(labels)}
                missing = []
            else:
                print(json.dumps({"ok": False, "error": "species label mismatch", "missing": missing}))
                return 1

        if source_data.shape[0] != target_data.shape[0]:
            print(json.dumps({"ok": False, "error": "time point count mismatch", "source": int(source_data.shape[0]), "target": int(target_data.shape[0])}))
            return 1

        time_abs = float(np.max(np.abs(source_data[:, 0] - target_data[:, 0])))
        max_abs = 0.0
        max_rel = 0.0
        worst = None
        for label in labels:
            left = source_data[:, source_by_label[label]]
            right = target_data[:, target_by_label[label]]
            diff = np.abs(left - right)
            scale = np.maximum(np.maximum(np.abs(left), np.abs(right)), 1e-300)
            rel = diff / scale
            index = int(np.argmax(diff))
            if float(diff[index]) > max_abs:
                max_abs = float(diff[index])
                worst = {"species": label, "time": float(source_data[index, 0]), "source": float(left[index]), "target": float(right[index])}
            max_rel = max(max_rel, float(np.max(rel)))

        ok = time_abs <= args.abs_tol and max_abs <= args.abs_tol + args.rel_tol * max(
            1.0,
            float(np.max(np.abs(source_data[:, 1:]))) if source_data.shape[1] > 1 else 0.0,
        )
        result = {
            "ok": bool(ok),
            "source": args.source,
            "target": args.target,
            "mapping": mapping,
            "species": labels,
            "points": int(source_data.shape[0]),
            "time_max_abs": time_abs,
            "max_abs": max_abs,
            "max_rel": max_rel,
            "worst": worst,
            "abs_tol": args.abs_tol,
            "rel_tol": args.rel_tol,
        }
        print(json.dumps(result, sort_keys=True))
        return 0 if ok else 1
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error), "source": args.source, "target": args.target}, sort_keys=True))
        return 1


if __name__ == "__main__":
    sys.exit(main())
