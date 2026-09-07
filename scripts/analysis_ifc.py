#!/usr/bin/env python3
"""Limited IFC4 physical beams/columns exporter and round-trip geometry validator."""
import argparse
import json
import math
from pathlib import Path
import sys
import uuid

from analysis_common import ModelError, atomic_write, axes, finite, fingerprint, geometry, point, read_model, write_json


def profile_data(section):
    shape = section.get("shape")
    b, h = [finite(section.get(k), f"section {section['id']}.{k}", True) for k in ("b", "h")]
    data = {"ProfileType": "AREA", "ProfileName": str(section.get("name", section["id"]))}
    if shape == "rectangle":
        return "IfcRectangleProfileDef", {**data, "XDim": b, "YDim": h}, b*h
    if shape == "hSection":
        tf = finite(section.get("flangeThickness"), "flangeThickness", True)
        tw = finite(section.get("webThickness"), "webThickness", True)
        if 2*tf >= h or tw >= b:
            raise ModelError("Invalid H profile thickness/dimensions")
        return "IfcIShapeProfileDef", {**data, "OverallWidth": b, "OverallDepth": h,
                                       "WebThickness": tw, "FlangeThickness": tf}, 2*b*tf+(h-2*tf)*tw
    if shape == "boxSection":
        t = finite(section.get("boxThickness"), "boxThickness", True)
        if 2*t >= min(b, h):
            raise ModelError("Invalid box profile thickness/dimensions")
        return "IfcRectangleHollowProfileDef", {**data, "XDim": b, "YDim": h, "WallThickness": t}, b*h-(b-2*t)*(h-2*t)
    raise ModelError(f"section {section['id']}: unsupported IFC profile {shape!r}")


def validate_input(model, project_id):
    if not isinstance(project_id, str) or not project_id.strip():
        raise ModelError("A stable nonempty --project-id is required for GUID identity")
    nodes, elements, sections = geometry(model)
    levels = {}
    if not isinstance(model.get("levels"), list):
        raise ModelError("levels: expected array")
    for level in model["levels"]:
        identity = level.get("id")
        if not isinstance(identity, str) or not identity or identity in levels:
            raise ModelError("levels: unique nonempty string IDs required")
        finite(level.get("z"), f"level {identity}.z")
        levels[identity] = level
    for e in elements.values():
        if e.get("type") not in ("beam", "column"):
            raise ModelError(f"element {e['id']}: IFC subset exports only beams/columns; explicitly filter other members")
        if e.get("levelId") not in levels:
            raise ModelError(f"element {e['id']}: missing storey {e.get('levelId')}")
        profile_data(sections[e["sectionId"]])
    return nodes, elements, sections, levels


def export_ifc(model, project_id):
    nodes, elements, sections, levels = validate_input(model, project_id)
    import ifcopenshell
    f = ifcopenshell.file(schema="IFC4")
    namespace = uuid.uuid5(uuid.NAMESPACE_URL, "element-modeler:" + project_id)
    def guid(*parts):
        return ifcopenshell.guid.compress(uuid.uuid5(namespace, json.dumps(parts, ensure_ascii=False)).hex)
    def root(kind, key, **values):
        return f.create_entity(kind, GlobalId=guid(kind, key), **values)
    def direction(v):
        return f.create_entity("IfcDirection", DirectionRatios=tuple(float(x) for x in v))
    def placement(parent=None, xyz=(0, 0, 0), axis=(0, 0, 1), reference=(1, 0, 0)):
        relative = f.create_entity("IfcAxis2Placement3D",
                                  Location=f.create_entity("IfcCartesianPoint", Coordinates=tuple(float(v) for v in xyz)),
                                  Axis=direction(axis), RefDirection=direction(reference))
        return f.create_entity("IfcLocalPlacement", PlacementRelTo=parent, RelativePlacement=relative)
    world = placement().RelativePlacement
    context = f.create_entity("IfcGeometricRepresentationContext", ContextIdentifier="Model", ContextType="Model",
                             CoordinateSpaceDimension=3, Precision=1e-7, WorldCoordinateSystem=world)
    body = f.create_entity("IfcGeometricRepresentationSubContext", ContextIdentifier="Body", ContextType="Model",
                          ParentContext=context, TargetView="MODEL_VIEW")
    units = f.create_entity("IfcUnitAssignment", Units=[f.create_entity("IfcSIUnit", UnitType="LENGTHUNIT", Prefix="MILLI", Name="METRE")])
    project = root("IfcProject", "project", Name=str(model.get("meta", {}).get("name", "Element Modeler")),
                   RepresentationContexts=[context], UnitsInContext=units)
    site = root("IfcSite", "site", Name="Site", CompositionType="ELEMENT", ObjectPlacement=placement())
    building = root("IfcBuilding", "building", Name="Building", CompositionType="ELEMENT", ObjectPlacement=placement(site.ObjectPlacement))
    root("IfcRelAggregates", "project-site", RelatingObject=project, RelatedObjects=[site])
    root("IfcRelAggregates", "site-building", RelatingObject=site, RelatedObjects=[building])
    storeys = {}
    for key, level in levels.items():
        storeys[key] = root("IfcBuildingStorey", key, Name=str(level.get("name", key)), Elevation=float(level["z"]),
                           CompositionType="ELEMENT", ObjectPlacement=placement(building.ObjectPlacement, (0, 0, level["z"])))
    root("IfcRelAggregates", "building-storeys", RelatingObject=building, RelatedObjects=list(storeys.values()))
    profiles = {}
    contents = {key: [] for key in levels}
    rows = []
    model_hash = fingerprint(model)
    for e in elements.values():
        section = sections[e["sectionId"]]
        profile_type, attributes, area = profile_data(section)
        if section["id"] not in profiles:
            # IFC permits omitted profile placement; an explicit identity also
            # interoperates with consumers which expect a placement reference.
            profile_position = f.create_entity("IfcAxis2Placement2D",
                Location=f.create_entity("IfcCartesianPoint", Coordinates=(0., 0.)))
            profiles[section["id"]] = f.create_entity(profile_type, Position=profile_position, **attributes)
        profile = profiles[section["id"]]
        a, b = point(nodes[e["nodeI"]]), point(nodes[e["nodeJ"]])
        orientation = axes(a, b)
        storey = storeys[e["levelId"]]
        local_start = [a[0], a[1], a[2]-levels[e["levelId"]]["z"]]
        product = root("IfcBeam" if e["type"] == "beam" else "IfcColumn", [e["sourceId"], e["sourceBranch"]],
                       Name=e["sourceId"] + "/" + e["sourceBranch"], Tag=e["sourceId"],
                       PredefinedType="BEAM" if e["type"] == "beam" else "COLUMN",
                       ObjectPlacement=placement(storey.ObjectPlacement, local_start, orientation["x"], orientation["y"]))
        solid = f.create_entity("IfcExtrudedAreaSolid", SweptArea=profile, Position=world,
                                ExtrudedDirection=direction((0, 0, 1)), Depth=orientation["length"])
        representation = f.create_entity("IfcShapeRepresentation", ContextOfItems=body, RepresentationIdentifier="Body",
                                         RepresentationType="SweptSolid", Items=[solid])
        product.Representation = f.create_entity("IfcProductDefinitionShape", Representations=[representation])
        properties = {"SourceId": e["sourceId"], "SourceBranch": e["sourceBranch"], "AnalysisElementId": str(e["id"]),
                      "SectionId": str(section["id"]), "SectionName": str(section.get("name", "")),
                      "LevelId": e["levelId"], "ModelFingerprint": model_hash, "ProjectIdentity": project_id,
                      "MaterialName": str(e.get("material", "")), "AxisConvention": "IFC Z=member x; IFC X=member y; IFC Y=member z"}
        pset = root("IfcPropertySet", [e["sourceId"], e["sourceBranch"]], Name="Pset_ElementModeler",
                    HasProperties=[f.create_entity("IfcPropertySingleValue", Name=k,
                                   NominalValue=f.create_entity("IfcText", v)) for k, v in properties.items()])
        root("IfcRelDefinesByProperties", [e["sourceId"], e["sourceBranch"]], RelatedObjects=[product], RelatingPropertyDefinition=pset)
        contents[e["levelId"]].append(product)
        rows.append({"elementId": e["id"], "sourceId": e["sourceId"], "sourceBranch": e["sourceBranch"],
                     "guid": product.GlobalId, "ifcClass": product.is_a(), "levelId": e["levelId"],
                     "start": a, "end": b, "length": orientation["length"], "profile": profile_type,
                     "profileDimensions": {k: v for k, v in attributes.items() if isinstance(v, (float, int))},
                     "volumeMm3": area*orientation["length"]})
    for key, products in contents.items():
        if products:
            root("IfcRelContainedInSpatialStructure", key, RelatedElements=products, RelatingStructure=storeys[key])
    return f, {"format": "element-modeler-ifc-report", "version": 1, "schema": "IFC4", "projectId": project_id,
               "modelFingerprint": model_hash, "lengthUnit": "mm", "members": rows,
               "consumerWarnings": (["web-ifc 0.0.77 correctly parses IfcRectangleHollowProfileDef WallThickness, "
                                     "but tessellates half the declared wall thickness. Hollow-section rendering in that consumer "
                                     "is not validated; keep the correct IFC thickness. See docs/analysis-tools.md."]
                                    if any(row["profile"] == "IfcRectangleHollowProfileDef" for row in rows) else []),
               "storeys": [{"levelId": key, "guid": value.GlobalId, "elevation": levels[key]["z"]} for key, value in storeys.items()],
               "limitations": ["Physical beams/columns only; no structural analysis entities, loads, supports, slabs, roofs or braces.",
                               "Sharp-corner rectangle, I and hollow rectangle extrusions; no fillets, joins, eccentricity or section rotation.",
                               "IfcOpenShell round-trip/schema/geometry checks are not independent BIM-product interoperability certification."]}


def validate_export(f, report):
    """Readback exchange checks: EXPRESS, placement, identity, profiles, OCC volume."""
    import ifcopenshell.geom
    import ifcopenshell.util.element
    import ifcopenshell.util.placement
    import ifcopenshell.util.shape
    import ifcopenshell.validate
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, logger, express_rules=True)
    if logger.statements:
        raise ModelError("IFC schema validation failed: " + "; ".join(str(s.get("message")) for s in logger.statements[:8]))
    roots = f.by_type("IfcRoot")
    if len({row.GlobalId for row in roots}) != len(roots):
        raise ModelError("Duplicate IFC GUIDs")
    if len(f.by_type("IfcBeam")) + len(f.by_type("IfcColumn")) != len(report["members"]):
        raise ModelError("IFC member count mismatch")
    for level in report["storeys"]:
        storey = f.by_guid(level["guid"])
        if not math.isclose(storey.Elevation, level["elevation"], abs_tol=1e-7):
            raise ModelError("Storey elevation mismatch")
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    for row in report["members"]:
        product = f.by_guid(row["guid"])
        if product.is_a() != row["ifcClass"]:
            raise ModelError("IFC class mismatch")
        props = ifcopenshell.util.element.get_psets(product)["Pset_ElementModeler"]
        for name, expected in (("SourceId", row["sourceId"]), ("SourceBranch", row["sourceBranch"]),
                               ("LevelId", row["levelId"]), ("ModelFingerprint", report["modelFingerprint"])):
            if props[name] != expected:
                raise ModelError(f"IFC property mismatch {name}")
        storey = ifcopenshell.util.element.get_container(product)
        expected_storey = next(s for s in report["storeys"] if s["levelId"] == row["levelId"])
        if storey is None or storey.GlobalId != expected_storey["guid"]:
            raise ModelError("IFC storey containment mismatch")
        transform = ifcopenshell.util.placement.get_local_placement(product.ObjectPlacement)
        solid = product.Representation.Representations[0].Items[0]
        start = transform[:3, 3].tolist()
        end = (transform[:3, 3] + transform[:3, 2]*solid.Depth).tolist()
        if math.dist(start, row["start"]) > 1e-6 or math.dist(end, row["end"]) > 1e-6:
            raise ModelError("IFC endpoint coordinate mismatch")
        orientation = axes(row["start"], row["end"])
        for column, expected in enumerate((orientation["y"], orientation["z"], orientation["x"])):
            if math.dist(transform[:3, column].tolist(), expected) > 1e-9:
                raise ModelError("IFC section orientation mismatch")
        if solid.SweptArea.is_a() != row["profile"]:
            raise ModelError("IFC profile type mismatch")
        for key, value in row["profileDimensions"].items():
            if not math.isclose(getattr(solid.SweptArea, key), value, abs_tol=1e-7):
                raise ModelError(f"IFC profile dimension mismatch {key}")
        # Keep the owning shape alive while reading its SWIG geometry buffer.
        shape = ifcopenshell.geom.create_shape(settings, product)
        mesh = shape.geometry
        volume = abs(ifcopenshell.util.shape.get_volume(mesh))*1e9  # geometry engine uses metres
        if not math.isclose(volume, row["volumeMm3"], rel_tol=1e-6, abs_tol=1e-3):
            raise ModelError(f"IFC tessellated volume mismatch {row['sourceId']}: {volume}")
    return {"schemaExpress": True, "uniqueGuids": True, "properties": True, "storeyContainment": True,
            "coordinates": True, "sectionOrientation": True, "profiles": True, "geometryVolumes": True, "reader": "IfcOpenShell"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--report", type=Path, help="Defaults to OUTPUT.ifc.report.json")
    args = parser.parse_args()
    try:
        report_path = args.report or Path(str(args.output) + ".report.json")
        if len({p.resolve() for p in (args.input, args.output, report_path)}) != 3:
            raise ModelError("Input, IFC and report paths must be distinct")
        model = read_model(args.input)
        f, report = export_ifc(model, args.project_id)
        import ifcopenshell
        # Round-trip the exact serialized IFC before replacing an existing output.
        serialized = f.to_string()
        reread = ifcopenshell.file.from_string(serialized)
        report["validation"] = validate_export(reread, report)
        report["ifcopenshellVersion"] = ifcopenshell.version
        atomic_write(args.output, serialized)
        write_json(report_path, report)
        for warning in report["consumerWarnings"]:
            print("WARNING: " + warning, file=sys.stderr)
        print(f"Exported and validated {len(report['members'])} IFC4 members: {args.output}")
        return 0
    except (ValueError, KeyError, TypeError, OSError, ImportError, RuntimeError) as error:
        print(f"IFC export error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
