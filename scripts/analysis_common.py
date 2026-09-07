"""Shared mm/N exchange validation, axes and cross-language fingerprints (stdlib)."""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import tempfile


class ModelError(ValueError):
    pass


def finite(value, label, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ModelError(f"{label}: expected finite number")
    if positive and value <= 0:
        raise ModelError(f"{label}: expected positive number")
    return float(value)


def fingerprint(model):
    """Hash typed JSON, using binary64 hex so Python and JS number spelling agrees."""
    model = copy.deepcopy(model)
    for key in ("generatedAt", "generator"):
        model.get("meta", {}).pop(key, None)

    def encode(value):
        if value is None or isinstance(value, (str, bool)):
            return value
        if isinstance(value, (int, float)):
            finite(value, "fingerprint number")
            return ["number", struct.pack(">d", float(value) if value else 0.0).hex()]
        if isinstance(value, list):
            return ["array", [encode(v) for v in value]]
        if isinstance(value, dict):
            return ["object", [[k, encode(value[k])] for k in
                               sorted(value, key=lambda k: k.encode("utf-16-be"))]]
        raise ModelError("fingerprint: expected JSON values")

    payload = json.dumps(encode(model), ensure_ascii=False, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def read_model(path):
    def reject(value):
        raise ModelError(f"Non-JSON numeric constant: {value}")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ModelError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    with open(path, encoding="utf-8") as stream:
        return json.load(stream, parse_constant=reject, object_pairs_hook=unique)


def write_json(path, data):
    atomic_write(path, json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def atomic_write(path, text):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, encoding="utf-8", delete=False) as stream:
        temporary = stream.name
        try:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def indexed(rows, label, key="id"):
    if not isinstance(rows, list):
        raise ModelError(f"{label}: expected array")
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ModelError(f"{label}: expected objects")
        identity = row.get(key)
        if key == "id":
            if isinstance(identity, bool) or not isinstance(identity, int) or not 0 < identity <= 2147483647:
                raise ModelError(f"{label}: IDs must be positive 32-bit integers")
        elif not isinstance(identity, str) or not identity:
            raise ModelError(f"{label}: {key} must be a nonempty string")
        if identity in result:
            raise ModelError(f"{label}: duplicate {key} {identity}")
        result[identity] = row
    return result


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def axes(start, end):
    delta = [b-a for a, b in zip(start, end)]
    length = math.sqrt(sum(v*v for v in delta))
    if length <= 1e-9:
        raise ModelError("Zero-length member")
    x = [v/length for v in delta]
    reference = [0., 0., 1.] if abs(x[2]) < 0.999 else [0., 1., 0.]
    y = cross(reference, x)
    norm = math.sqrt(sum(v*v for v in y))
    y = [v/norm for v in y]
    return {"x": x, "y": y, "z": cross(x, y), "length": length}


def point(node):
    return [finite(node.get(k), f"node {node.get('id')}.{k}") for k in ("x", "y", "z")]


def geometry(model):
    if not isinstance(model, dict) or model.get("format") != "element-modeler-analysis" or model.get("version") != 2:
        raise ModelError("Expected element-modeler-analysis version 2 JSON")
    expected = {"length": "mm", "force": "N", "moment": "N*mm", "area": "mm2",
                "elasticModulus": "N/mm2", "shearModulus": "N/mm2",
                "secondMomentOfArea": "mm4", "torsionConstant": "mm4"}
    for key, value in expected.items():
        if model.get("units", {}).get(key) != value:
            raise ModelError(f"units.{key}: expected {value}")
    if model.get("meta", {}).get("coordinates") != {"verticalAxis": "z", "handedness": "right"}:
        raise ModelError("Expected right-handed Z-up coordinates")
    nodes = indexed(model.get("nodes"), "nodes")
    elements = indexed(model.get("elements"), "elements")
    sections = indexed(model.get("sections"), "sections")
    if not nodes or not elements:
        raise ModelError("At least two nodes and one member are required")
    for node in nodes.values():
        point(node)
    sources = set()
    for element in elements.values():
        tag = f"element {element['id']}"
        if not isinstance(element.get("sourceId"), str) or not element["sourceId"]:
            raise ModelError(f"{tag}: sourceId required")
        if element.get("sourceBranch") not in ("primary", "cross"):
            raise ModelError(f"{tag}: sourceBranch must be primary or cross")
        source = (element["sourceId"], element["sourceBranch"])
        if source in sources:
            raise ModelError(f"{tag}: duplicate sourceId/sourceBranch")
        sources.add(source)
        if element.get("nodeI") not in nodes or element.get("nodeJ") not in nodes:
            raise ModelError(f"{tag}: missing endpoint node")
        axes(point(nodes[element["nodeI"]]), point(nodes[element["nodeJ"]]))
        if element.get("sectionId") not in sections:
            raise ModelError(f"{tag}: missing sectionId")
        for key in ("rotation", "sectionRotation", "offsetI", "offsetJ", "localAxis"):
            if key in element:
                raise ModelError(f"{tag}: unsupported {key}; no orientation/offset overrides in this subset")
    return nodes, elements, sections
