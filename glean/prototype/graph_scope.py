# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Select a goal's dependency graph after validating the entire document's structure."""

from copy import deepcopy

from .graph import compile_graph


def _ancestors(scope):
    goal = next(node["id"] for node in scope["nodes"] if node["kind"] == "goal")
    predecessors = {node["id"]: [] for node in scope["nodes"]}
    for edge in scope["edges"]:
        predecessors[edge["target"]].append(edge["source"])
    active = set()
    pending = [goal]
    while pending:
        node = pending.pop()
        if node not in active:
            active.add(node)
            pending.extend(predecessors[node])
    return active


def _restrict(scope, active):
    scope["nodes"] = [node for node in scope["nodes"] if node["id"] in active]
    scope["edges"] = [edge for edge in scope["edges"] if edge["source"] in active and edge["target"] in active]
    if "groups" in scope:
        scope["groups"] = [{**group, "nodeIds": [node for node in group["nodeIds"] if node in active]}
                           for group in scope["groups"] if any(node in active for node in group["nodeIds"])]


def compile_for_scope(graph, scope="all"):
    """Compile all nodes, or only the goal proof with separate workspace diagnostics.

    Every mode rejects malformed syntax, unknown references, size violations, and
    cycles anywhere in the document. Only inference failures and missing inputs
    outside the goal's dependency closure can remain unfinished in goal mode.
    """
    if scope == "all":
        return compile_graph(graph)
    if scope != "goal":
        raise ValueError("The verification scope must be 'all' or 'goal'.")
    structural = compile_graph(graph, structure_only=True)
    if structural["status"] != "valid":
        return {**structural, "scope": "goal", "workspaceDiagnostics": [], "includedNodes": [], "includedModules": []}

    active_root = _ancestors(graph)
    definitions = {definition["id"]: definition for definition in graph["modules"]} if graph["version"] == 2 else {}
    active_modules = {}
    pending = [node["ref"] for node in graph["nodes"] if node["id"] in active_root and node["kind"] == "module"]
    while pending:
        identifier = pending.pop()
        if identifier in active_modules:
            continue
        definition = definitions[identifier]
        active = active_modules[identifier] = _ancestors(definition)
        pending.extend(node["ref"] for node in definition["nodes"] if node["id"] in active and node["kind"] == "module")

    selected = deepcopy(graph)
    _restrict(selected, active_root)
    if selected["version"] == 2:
        selected["modules"] = [definition for definition in selected["modules"] if definition["id"] in active_modules]
        for definition in selected["modules"]:
            _restrict(definition, active_modules[definition["id"]])
    complete_workspace = compile_graph(graph)
    result = compile_graph(selected)
    workspace = []
    for diagnostic in complete_workspace["diagnostics"]:
        module = diagnostic.get("moduleId")
        nodes = active_root if module is None else active_modules.get(module, set())
        if diagnostic.get("nodeId") not in nodes and diagnostic not in result["diagnostics"]:
            workspace.append({**diagnostic, "scope": "workspace"})
    result["nodeTypes"] = {**complete_workspace["nodeTypes"], **result["nodeTypes"]}
    result["moduleNodeTypes"] = {
        identifier: {**complete_workspace["moduleNodeTypes"].get(identifier, {}), **result["moduleNodeTypes"].get(identifier, {})}
        for identifier in complete_workspace["moduleNodeTypes"]
    }
    result["moduleTypes"] = complete_workspace["moduleTypes"]
    return {**result, "scope": "goal", "workspaceDiagnostics": workspace,
            "includedNodes": [node["id"] for node in graph["nodes"] if node["id"] in active_root],
            "includedModules": [identifier for identifier in definitions if identifier in active_modules]}
