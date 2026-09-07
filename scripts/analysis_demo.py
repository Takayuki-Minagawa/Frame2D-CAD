#!/usr/bin/env python3
"""Create a rigid fixed cantilever exchange file, ready for both external CLIs."""
import argparse
import copy
from pathlib import Path
from analysis_common import write_json


def cantilever():
    return {
        "format": "element-modeler-analysis", "version": 2,
        "units": {"length": "mm", "force": "N", "moment": "N*mm", "lineLoad": "N/mm", "areaLoad": "N/mm2",
                  "area": "mm2", "elasticModulus": "N/mm2", "shearModulus": "N/mm2",
                  "secondMomentOfArea": "mm4", "torsionConstant": "mm4"},
        "meta": {"name": "Rigid fixed cantilever", "coordinates": {"verticalAxis": "z", "handedness": "right"}},
        "levels": [{"id": "L0", "name": "Ground", "z": 0}],
        "nodes": [{"id": 1, "x": 0, "y": 0, "z": 0}, {"id": 2, "x": 3000, "y": 0, "z": 0}],
        "elements": [{"id": 1, "sourceId": "DEMO-B1", "sourceBranch": "primary", "type": "beam",
                      "nodeI": 1, "nodeJ": 2, "sectionId": 1, "sectionName": "R100x200", "material": "steel",
                      "levelId": "L0", "endI": {"condition": "rigid"}, "endJ": {"condition": "rigid"}}],
        "sections": [{"id": 1, "name": "R100x200", "shape": "rectangle", "b": 100, "h": 200,
                      "A": 20000, "Iy": 100*200**3/12, "Iz": 200*100**3/12, "J": 45776041.666666664}],
        "materials": [{"name": "steel", "E": 205000, "G": 79000, "density": 7850}],
        "supports": [{"id": 1, "sourceId": "DEMO-S1", "nodeId": 1,
                      "dx": True, "dy": True, "dz": True, "rx": True, "ry": True, "rz": True}],
        "loads": [{"id": 1, "sourceId": "DEMO-P1", "type": "pointLoad", "loadCase": "LL", "levelId": "L0",
                   "x1": 3000, "y1": 0, "z": 0, "fx": 0, "fy": 0, "fz": -1000, "mx": 0, "my": 0, "mz": 0}],
        "loadCases": ["DL", "LL"], "loadCombinations": [], "springs": [],
        "selfWeight": {"mode": "includedInDL"}, "massSources": {},
    }


def ifc_exchange_sample(include_box=True):
    """Three profiles, two storeys, translated origin, column and inclined beam."""
    model = cantilever()
    model["meta"]["name"] = "IFC independent exchange sample"
    model["levels"].append({"id": "L1", "name": "1階", "z": 3000})
    model["nodes"] = [{"id": 1, "x": 100, "y": -200, "z": 0},
                      {"id": 2, "x": 3100, "y": -200, "z": 0},
                      {"id": 3, "x": 3100, "y": -200, "z": 3000},
                      {"id": 4, "x": 5100, "y": 800, "z": 4000}]
    model["loads"][0].update(x1=3100, y1=-200)
    for identity, shape in ((2, "hSection"), (3, "boxSection")):
        model["sections"].append({"id": identity, "name": shape, "shape": shape, "b": 150, "h": 300,
                                  "flangeThickness": 12, "webThickness": 8, "boxThickness": 10})
        member = copy.deepcopy(model["elements"][0])
        member.update(id=identity, sourceId=f"M{identity}", type="column" if identity == 2 else "beam",
                      nodeI=identity, nodeJ=identity+1, sectionId=identity, levelId="L0" if identity == 2 else "L1")
        model["elements"].append(member)
    if not include_box:
        model["sections"][2].update(shape="rectangle", name="R150x300")
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--kind", choices=("cantilever", "ifc-exchange", "ifc-web-exchange"), default="cantilever")
    args = parser.parse_args()
    write_json(args.output, cantilever() if args.kind == "cantilever" else ifc_exchange_sample(include_box=args.kind == "ifc-exchange"))
    print(f"Wrote {args.output}; demo kind: {args.kind}.")
