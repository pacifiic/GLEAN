# Copyright (c) 2026 GLEAN contributors. All rights reserved.
# Released under Apache 2.0 license as described in the file LICENSE.

"""Compile the bounded propositional graph language to explicit Lean proof terms."""

from collections import deque
from dataclasses import dataclass
import math
import re


MAX_NODES = 256
MAX_EDGES = 512
MAX_ASSUMPTIONS = 256
MAX_PROPOSITIONS = 64
MAX_ID_LENGTH = 128
MAX_TYPE_LENGTH = 512
MAX_TYPE_DEPTH = 64
MAX_TYPE_SIZE = 1024
MAX_CODE_LENGTH = 1_000_000
MAX_MODULES = 32
MAX_MODULE_INPUTS = 16
_PREAMBLE = ["module", "", "public section", ""]
_PROPOSITION = re.compile(r"[A-Z][A-Z0-9_]{0,63}\Z", re.ASCII)
_TOKEN = re.compile(r"[ \t\r\n]+|->|/\\|[→∧()]|[A-Z][A-Z0-9_]*", re.ASCII)
_INPUTS = {
    "assumption": (),
    "apply": ("fn", "arg"),
    "pair": ("left", "right"),
    "left": ("value",),
    "right": ("value",),
    "goal": ("proof",),
}


@dataclass(frozen=True)
class _Type:
    kind: str
    name: str = ""
    left: "_Type | None" = None
    right: "_Type | None" = None
    size: int = 1
    depth: int = 1


class _TypeError(ValueError):
    def __init__(self, message, position=None):
        super().__init__(message)
        self.position = position


def _binary(kind, left, right):
    size = 1 + left.size + right.size
    depth = 1 + max(left.depth, right.depth)
    if size > MAX_TYPE_SIZE or depth > MAX_TYPE_DEPTH:
        raise _TypeError("The inferred type exceeds the prototype's size or depth limit.")
    return _Type(kind, left=left, right=right, size=size, depth=depth)


def _parse_type(source, propositions):
    if not isinstance(source, str) or not source:
        raise _TypeError("명제 타입을 입력해 주세요 (예: P → Q).", 1)
    if len(source) > MAX_TYPE_LENGTH:
        raise _TypeError(f"타입은 {MAX_TYPE_LENGTH}자 이하여야 합니다.", MAX_TYPE_LENGTH + 1)
    tokens = []
    positions = []
    position = 0
    while position < len(source):
        token = _TOKEN.match(source, position)
        if token is None:
            raise _TypeError(f"{position + 1}번째 문자부터 지원하지 않는 문법입니다.", position + 1)
        position = token.end()
        value = token.group()
        if not value.isspace():
            tokens.append({"->": "→", "/\\": "∧"}.get(value, value))
            positions.append(token.start() + 1)
    index = 0

    def current_position():
        return positions[index] if index < len(positions) else len(source) + 1

    def expression(minimum=0, depth=0):
        nonlocal index
        if depth >= MAX_TYPE_DEPTH:
            raise _TypeError("타입의 괄호 또는 연결이 너무 깊습니다. 더 작은 명제로 나누어 주세요.", current_position())
        if index >= len(tokens):
            raise _TypeError("이 위치에 명제 이름이나 괄호로 묶은 타입이 필요합니다.", current_position())
        token = tokens[index]
        token_position = positions[index]
        index += 1
        if token == "(":
            left = expression(depth=depth + 1)
            if index >= len(tokens) or tokens[index] != ")":
                raise _TypeError("닫는 괄호 ')'를 추가해 주세요.", current_position())
            index += 1
        elif token in propositions:
            left = _Type("atom", name=token)
        else:
            raise _TypeError(f"{token!r} 대신 선언한 명제 이름을 입력해 주세요.", token_position)
        while index < len(tokens) and tokens[index] in ("→", "∧"):
            operator = tokens[index]
            precedence = 10 if operator == "→" else 20
            if precedence < minimum:
                break
            operator_position = positions[index]
            index += 1
            right = expression(precedence, depth + 1)
            try:
                left = _binary("arrow" if operator == "→" else "and", left, right)
            except _TypeError as error:
                raise _TypeError("타입이 너무 크거나 깊습니다. 더 작은 명제로 나누어 주세요.", operator_position) from error
        return left

    result = expression()
    if index != len(tokens):
        raise _TypeError(f"타입 뒤의 {tokens[index]!r}를 확인해 주세요. 명제 사이에는 → 또는 ∧가 필요합니다.", current_position())
    return result


def _type_diagnostic(error, field, assumption=None, label=None):
    label = label or ("목표" if field == "goal" else "가정 타입")
    result = {
        "message": f"{label}: {error} 그래프 모드는 선언한 명제(P, Q), 괄호, →·∧만 지원합니다. "
                   "Irrational Real.pi, 양화사·등식 같은 수식은 Lean 소스 모드에서 .lean 파일로 여세요.",
        "field": field, "position": error.position or 1,
    }
    if assumption is not None:
        result["assumptionId"] = assumption
    return result


def _format_type(value, names=None, minimum=0, left_operand=False):
    if value.kind == "atom":
        return value.name if names is None else names[value.name]
    precedence = 10 if value.kind == "arrow" else 20
    operator = "→" if value.kind == "arrow" else "∧"
    result = (
        f"{_format_type(value.left, names, precedence, True)} {operator} "
        f"{_format_type(value.right, names, precedence)}"
    )
    if precedence < minimum or (left_operand and precedence == minimum):
        return f"({result})"
    return result


def _identifier(value):
    return isinstance(value, str) and 0 < len(value) <= MAX_ID_LENGTH


def _validate_groups(groups, nodes, diagnose):
    if not isinstance(groups, list) or len(groups) > MAX_NODES:
        diagnose(f"groups must be an array with at most {MAX_NODES} entries.")
        return
    group_ids = set()
    grouped_nodes = set()
    for group in groups:
        if not isinstance(group, dict) or not _identifier(group.get("id")):
            diagnose("Each visual group needs a nonempty string ID of at most 128 characters.")
            continue
        identifier = group["id"]
        if identifier in group_ids:
            diagnose("Duplicate visual group ID.")
        group_ids.add(identifier)
        if not _identifier(group.get("name")):
            diagnose("Each visual group needs a nonempty name of at most 128 characters.")
        if type(group.get("collapsed")) is not bool:
            diagnose("A visual group's collapsed state must be a boolean.")
        for coordinate in ("x", "y"):
            if coordinate in group:
                value = group[coordinate]
                if type(value) not in (int, float) or not -1_000_000 <= value <= 1_000_000 or not math.isfinite(value):
                    diagnose("Group coordinates must be finite numbers between −1000000 and 1000000.")
        members = group.get("nodeIds")
        if not isinstance(members, list) or not 1 <= len(members) <= MAX_NODES:
            diagnose(f"Visual groups need between 1 and {MAX_NODES} member nodes.")
            continue
        for member in members:
            if not _identifier(member) or member not in nodes:
                diagnose("A visual group refers to an unknown member node.")
            elif member in grouped_nodes:
                diagnose("Visual groups cannot contain repeated or overlapping member nodes.", member)
            else:
                grouped_nodes.add(member)


def compile_graph(graph: object, *, structure_only=False) -> dict:
    """Compile independently checked scopes into bounded, reusable Lean functions."""
    if isinstance(graph, dict) and type(graph.get("version")) is int and graph["version"] == 1:
        return {**_compile_scope(graph, structure_only=structure_only), "moduleNodeTypes": {},
                "moduleTypes": {}, "moduleSourceMaps": {}, "modulePortTypes": {}}

    response = {"status": "invalid", "generatedCode": None, "nodeTypes": {},
                "moduleNodeTypes": {}, "moduleTypes": {}, "diagnostics": [],
                "sourceMap": {}, "moduleSourceMaps": {}, "portTypes": {}, "modulePortTypes": {}}

    def diagnose(message, module=None, node=None, **location):
        entry = {"severity": "error", "message": message, **location}
        if module is not None:
            entry["moduleId"] = module
        if node is not None:
            entry["nodeId"] = node
        response["diagnostics"].append(entry)

    if not isinstance(graph, dict):
        diagnose("The graph must be a JSON object.")
        return response
    if type(graph.get("version")) is not int or graph["version"] != 2:
        diagnose("The graph must use version 1 or 2.")
        return response
    for field, maximum in (("propositions", MAX_PROPOSITIONS), ("assumptions", MAX_ASSUMPTIONS),
                           ("nodes", MAX_NODES), ("edges", MAX_EDGES), ("modules", MAX_MODULES),
                           ("groups", MAX_NODES)):
        value = graph.get(field)
        if not isinstance(value, list) or len(value) > maximum:
            diagnose(f"{field} must be an array with at most {maximum} entries.")
    if response["diagnostics"]:
        return response
    propositions = set()
    for name in graph["propositions"]:
        if not isinstance(name, str) or _PROPOSITION.fullmatch(name) is None:
            diagnose("Proposition names must start with A–Z and contain only A–Z, 0–9 or _, up to 64 characters.")
        elif name in propositions:
            diagnose(f"Duplicate proposition {name!r}.")
        else:
            propositions.add(name)
    if response["diagnostics"]:
        return response

    definitions = {}
    signatures = {}
    total_nodes, total_edges = len(graph["nodes"]), len(graph["edges"])
    for definition in graph["modules"]:
        if not isinstance(definition, dict) or not _identifier(definition.get("id")):
            diagnose("Each function module needs a nonempty string ID of at most 128 characters.")
            continue
        identifier = definition["id"]
        if identifier in definitions:
            diagnose("Duplicate function module ID.", identifier)
            continue
        definitions[identifier] = definition
        if not _identifier(definition.get("name")):
            diagnose("Each function module needs a nonempty name of at most 128 characters.", identifier)
        for field, maximum in (("inputs", MAX_MODULE_INPUTS), ("nodes", MAX_NODES), ("edges", MAX_EDGES)):
            value = definition.get(field)
            if not isinstance(value, list) or len(value) > maximum:
                diagnose(f"Module {field} must be an array with at most {maximum} entries.", identifier)
        if isinstance(definition.get("nodes"), list):
            total_nodes += len(definition["nodes"])
        if isinstance(definition.get("edges"), list):
            total_edges += len(definition["edges"])
        if not isinstance(definition.get("inputs"), list) or len(definition["inputs"]) > MAX_MODULE_INPUTS:
            continue
        parameters = {}
        parameter_ids = set()
        for parameter in definition["inputs"]:
            if not isinstance(parameter, dict) or not _identifier(parameter.get("id")):
                diagnose("Each module input needs a nonempty string ID of at most 128 characters.", identifier)
                continue
            parameter_id = parameter["id"]
            if parameter_id in parameter_ids:
                diagnose("Duplicate function module input ID.", identifier)
                continue
            parameter_ids.add(parameter_id)
            if not _identifier(parameter.get("name")):
                diagnose("Each module input needs a nonempty name of at most 128 characters.", identifier)
            try:
                parameters[parameter_id] = _parse_type(parameter.get("type"), propositions)
            except _TypeError as error:
                diagnose(module=identifier, **_type_diagnostic(error, "assumption", parameter_id, "함수 입력 타입"))
        try:
            output = _parse_type(definition.get("outputType"), propositions)
        except _TypeError as error:
            diagnose(module=identifier, **_type_diagnostic(error, "goal", label="함수 출력 타입"))
            continue
        signatures[identifier] = {"inputs": parameters, "output": output}
        response["moduleTypes"][identifier] = " → ".join(
            [*(_format_type(value, minimum=10, left_operand=True) for value in parameters.values()), _format_type(output)])
    if total_nodes > MAX_NODES or total_edges > MAX_EDGES:
        diagnose(f"The total across root and module bodies must not exceed {MAX_NODES} nodes or {MAX_EDGES} edges.")
    if response["diagnostics"]:
        return response

    dependencies = {identifier: set() for identifier in definitions}
    followers = {identifier: [] for identifier in definitions}
    for identifier, definition in definitions.items():
        for node in definition["nodes"]:
            if not isinstance(node, dict) or node.get("kind") != "module":
                continue
            reference = node.get("ref")
            if not _identifier(reference) or reference not in definitions:
                diagnose("Unknown function module reference.", identifier,
                         node.get("id") if _identifier(node.get("id")) else None)
            else:
                dependencies[identifier].add(reference)
        for dependency in dependencies[identifier]:
            followers[dependency].append(identifier)
    if response["diagnostics"]:
        return response
    degree = {identifier: len(dependencies[identifier]) for identifier in definitions}
    queue = deque(identifier for identifier in definitions if degree[identifier] == 0)
    ordered = []
    while queue:
        identifier = queue.popleft()
        ordered.append(identifier)
        for follower in followers[identifier]:
            degree[follower] -= 1
            if degree[follower] == 0:
                queue.append(follower)
    if len(ordered) != len(definitions):
        for identifier, count in degree.items():
            if count:
                diagnose("This function module is in or depends on a cycle. Recursive modules are unsupported.", identifier)
        return response

    module_names = {identifier: f"glean_module_{index}" for index, identifier in enumerate(definitions)}
    declarations = []
    for identifier in ordered:
        definition = definitions[identifier]
        scope = {"version": 1, "name": definition["name"], "propositions": graph["propositions"],
                 "assumptions": definition["inputs"], "goal": definition["outputType"],
                 "nodes": definition["nodes"], "edges": definition["edges"], "groups": definition.get("groups", [])}
        compiled = _compile_scope(scope, signatures, module_names, module_names[identifier], structure_only=structure_only)
        response["moduleNodeTypes"][identifier] = compiled["nodeTypes"]
        response["modulePortTypes"][identifier] = compiled["portTypes"]
        response["diagnostics"].extend({**entry, "moduleId": identifier} for entry in compiled["diagnostics"])
        if compiled["generatedCode"]:
            declarations.append((identifier, compiled["generatedCode"], compiled["sourceMap"]))
    compiled = _compile_scope({**graph, "version": 1}, signatures, module_names, structure_only=structure_only)
    response["nodeTypes"] = compiled["nodeTypes"]
    response["portTypes"] = compiled["portTypes"]
    response["diagnostics"].extend(compiled["diagnostics"])
    if response["diagnostics"]:
        response["status"] = "invalid" if any(d["severity"] == "error" for d in response["diagnostics"]) else "incomplete"
        return response
    if structure_only:
        response["status"] = "valid"
        return response
    source = compiled["generatedCode"]
    source_map = compiled["sourceMap"]
    module_maps = {}
    if declarations:
        offset = len(_PREAMBLE)
        for identifier, declaration, mapping in declarations:
            module_maps[identifier] = {node: {key: line + offset for key, line in span.items()}
                                       for node, span in mapping.items()}
            offset += declaration.count("\n") + 1
        block = "\n".join(declaration for _, declaration, _ in declarations) + "\n"
        source = "\n".join(_PREAMBLE) + "\n" + block + source.split("\n", len(_PREAMBLE))[-1]
        source_map = {node: {key: line + offset - len(_PREAMBLE) for key, line in span.items()}
                      for node, span in source_map.items()}
    if len(source) > MAX_CODE_LENGTH:
        diagnose("The generated module exceeds the prototype's source size limit.")
        return response
    response.update(status="ready", generatedCode=source, sourceMap=source_map, moduleSourceMaps=module_maps)
    return response


def _compile_scope(graph, signatures=None, module_names=None, declaration=None, *, structure_only=False):
    """Validate a graph without executing user text and return code only if complete.

    Graph IDs are UI labels only. Lean identifiers are generated from list positions.
    Bounded types and let bindings prevent repeated graph fan-out from expanding
    either types or proof terms exponentially.
    """
    diagnostics = []
    node_types = {}
    port_types = {}
    source_map = {}
    signatures = signatures or {}
    module_names = module_names or {}

    def ports(node):
        if node["kind"] == "module":
            return tuple(signatures[node["ref"]]["inputs"])
        return _INPUTS[node["kind"]]

    def diagnose(message, node=None, port=None, severity="error", **location):
        entry = {"severity": severity, "message": message, **location}
        if node is not None:
            entry["nodeId"] = node
        if port is not None:
            entry["port"] = port
        diagnostics.append(entry)

    def result(status="invalid", code=None):
        return {"status": status, "generatedCode": code, "nodeTypes": node_types, "diagnostics": diagnostics,
                "sourceMap": source_map if code is not None else {}, "portTypes": port_types}

    if not isinstance(graph, dict):
        diagnose("The graph must be a JSON object.")
        return result()
    if type(graph.get("version")) is not int or graph["version"] != 1:
        diagnose("The graph must use version 1.")
    if "name" in graph and not _identifier(graph["name"]):
        diagnose(f"The graph name must be a nonempty string of at most {MAX_ID_LENGTH} characters.")
    for field, maximum in (("propositions", MAX_PROPOSITIONS), ("assumptions", MAX_ASSUMPTIONS),
                           ("nodes", MAX_NODES), ("edges", MAX_EDGES)):
        value = graph.get(field)
        if not isinstance(value, list) or len(value) > maximum:
            diagnose(f"{field} must be an array with at most {maximum} entries.")
    if diagnostics:
        return result()

    propositions = set()
    for name in graph["propositions"]:
        if not isinstance(name, str) or _PROPOSITION.fullmatch(name) is None:
            diagnose("Proposition names must start with A–Z and contain only A–Z, 0–9 or _, up to 64 characters.")
        elif name in propositions:
            diagnose(f"Duplicate proposition {name!r}.")
        else:
            propositions.add(name)
    if diagnostics:
        return result()

    assumptions = {}
    bad_assumptions = {}
    for assumption in graph["assumptions"]:
        if not isinstance(assumption, dict) or not _identifier(assumption.get("id")):
            diagnose("Each assumption needs a nonempty string ID of at most 128 characters.")
            continue
        identifier = assumption["id"]
        if identifier in assumptions or identifier in bad_assumptions:
            diagnose(f"Duplicate assumption ID {identifier!r}.")
            continue
        try:
            assumptions[identifier] = _parse_type(assumption.get("type"), propositions)
        except _TypeError as error:
            bad_assumptions[identifier] = error
    try:
        goal_type = _parse_type(graph.get("goal"), propositions)
    except _TypeError as error:
        diagnose(**_type_diagnostic(error, "goal"))
        goal_type = None

    nodes = {}
    goals = []
    for node in graph["nodes"]:
        if not isinstance(node, dict) or not _identifier(node.get("id")):
            diagnose("Each node needs a nonempty string ID of at most 128 characters.")
            continue
        identifier = node["id"]
        if identifier in nodes:
            diagnose("Duplicate node ID.", identifier)
            continue
        kind = node.get("kind")
        if not isinstance(kind, str) or (kind not in _INPUTS and kind != "module"):
            diagnose("Unknown node kind.", identifier)
            continue
        nodes[identifier] = node
        for coordinate in ("x", "y"):
            if coordinate in node:
                value = node[coordinate]
                if type(value) not in (int, float) or not -1_000_000 <= value <= 1_000_000 or not math.isfinite(value):
                    diagnose("Node coordinates must be finite numbers between −1000000 and 1000000.", identifier)
        if kind == "goal":
            goals.append(identifier)
        elif kind == "assumption":
            ref = node.get("ref")
            if not _identifier(ref) or (ref not in assumptions and ref not in bad_assumptions):
                diagnose("Unknown assumption reference.", identifier)
        elif kind == "module":
            ref = node.get("ref")
            if not _identifier(ref) or ref not in signatures:
                diagnose("Unknown function module reference.", identifier)
    for identifier, error in bad_assumptions.items():
        users = [node_id for node_id, node in nodes.items() if node["kind"] == "assumption" and node.get("ref") == identifier]
        if users:
            for node_id in users:
                diagnose(node=node_id, **_type_diagnostic(error, "assumption", identifier))
        else:
            diagnose(**_type_diagnostic(error, "assumption", identifier))
    if len(goals) != 1:
        diagnose("The graph must contain exactly one goal node.")
    elif goal_type is not None:
        node_types[goals[0]] = _format_type(goal_type)
    _validate_groups(graph.get("groups", []), nodes, diagnose)
    if diagnostics:
        return result()

    inputs = {identifier: {} for identifier in nodes}
    followers = {identifier: [] for identifier in nodes}
    indegree = {identifier: 0 for identifier in nodes}
    edge_ids = set()
    for edge in graph["edges"]:
        if not isinstance(edge, dict) or not _identifier(edge.get("id")):
            diagnose("Each edge needs a nonempty string ID of at most 128 characters.")
            continue
        if edge["id"] in edge_ids:
            diagnose("Duplicate edge ID.")
            continue
        edge_ids.add(edge["id"])
        source, target, port = edge.get("source"), edge.get("target"), edge.get("input")
        if not _identifier(source) or source not in nodes:
            diagnose("An edge has an unknown source node.", target if _identifier(target) and target in nodes else None)
            continue
        if not _identifier(target) or target not in nodes:
            diagnose("An edge has an unknown target node.", source)
            continue
        if not isinstance(port, str) or port not in ports(nodes[target]):
            diagnose("An edge targets an unknown input port.", target)
            continue
        if nodes[source]["kind"] == "goal":
            diagnose("A goal node has no output port.", source)
            continue
        if port in inputs[target]:
            diagnose("An input port can have only one incoming edge.", target, port)
            continue
        inputs[target][port] = source
        followers[source].append(target)
        indegree[target] += 1
    if diagnostics:
        return result()

    queue = deque(identifier for identifier in nodes if indegree[identifier] == 0)
    ordered = []
    while queue:
        identifier = queue.popleft()
        ordered.append(identifier)
        for target in followers[identifier]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    if len(ordered) != len(nodes):
        for identifier, degree in indegree.items():
            if degree:
                diagnose("This node is in or depends on a cycle. Proof graphs must be acyclic.", identifier)
        return result()
    if structure_only:
        return result("valid")

    inferred = {}
    for identifier in ordered:
        node = nodes[identifier]
        kind = node["kind"]
        linked = inputs[identifier]
        for port in ports(node):
            if port not in linked:
                diagnose("Connect a proof to this input.", identifier, port, "info")
        values = {port: inferred.get(source) for port, source in linked.items()}
        expected = {}
        if kind == "goal":
            expected["proof"] = goal_type
        elif kind == "module":
            expected.update(signatures[node["ref"]]["inputs"])
        elif kind == "apply" and values.get("fn") is not None and values["fn"].kind == "arrow":
            expected["arg"] = values["fn"].left
        port_types[identifier] = {key: _format_type(value) for key, value in expected.items()}
        value = None
        if kind == "assumption":
            value = assumptions[node["ref"]]
        elif kind == "apply":
            fn, arg = values.get("fn"), values.get("arg")
            if fn is not None and fn.kind != "arrow":
                diagnose(f"Expected an implication, received {_format_type(fn)}.", identifier, "fn")
            elif fn is not None and arg is not None:
                if fn.left != arg:
                    diagnose(f"Expected {_format_type(fn.left)}, received {_format_type(arg)}.", identifier, "arg")
                else:
                    value = fn.right
        elif kind == "pair":
            left, right = values.get("left"), values.get("right")
            if left is not None and right is not None:
                try:
                    value = _binary("and", left, right)
                except _TypeError as error:
                    diagnose(str(error), identifier)
        elif kind in ("left", "right"):
            pair = values.get("value")
            if pair is not None:
                if pair.kind != "and":
                    diagnose(f"Expected a conjunction, received {_format_type(pair)}.", identifier, "value")
                else:
                    value = pair.left if kind == "left" else pair.right
        elif kind == "goal":
            proof = values.get("proof")
            if proof is not None and proof != goal_type:
                diagnose(f"Expected {_format_type(goal_type)}, received {_format_type(proof)}.", identifier, "proof")
        elif kind == "module":
            signature = signatures[node["ref"]]
            valid = True
            for port, expected in signature["inputs"].items():
                actual = values.get(port)
                if actual is None:
                    valid = False
                elif actual != expected:
                    diagnose(f"Expected {_format_type(expected)}, received {_format_type(actual)}.", identifier, port)
                    valid = False
            if valid:
                value = signature["output"]
        if value is not None:
            inferred[identifier] = value
            node_types[identifier] = _format_type(value)
    if diagnostics:
        return result("invalid" if any(d["severity"] == "error" for d in diagnostics) else "incomplete")

    prop_names = {name: f"p{index}" for index, name in enumerate(graph["propositions"])}
    assumption_names = {assumption["id"]: f"h{index}" for index, assumption in enumerate(graph["assumptions"])}
    node_names = {identifier: f"n{index}" for index, identifier in enumerate(nodes)}
    binders = []
    if prop_names:
        binders.append(f"({' '.join(prop_names.values())} : Prop)")
    for identifier, name in assumption_names.items():
        binders.append(f"({name} : {_format_type(assumptions[identifier], prop_names)})")
    declaration_name = f"private theorem {declaration}" if declaration else "theorem glean_proof"
    heading = f"{declaration_name} {' '.join(binders)} : {_format_type(goal_type, prop_names)} :="
    code = [heading] if declaration else [*_PREAMBLE, heading]
    for identifier in ordered:
        node = nodes[identifier]
        kind = node["kind"]
        if kind == "goal":
            continue
        arguments = {port: node_names[source] for port, source in inputs[identifier].items()}
        if kind == "assumption":
            term = assumption_names[node["ref"]]
        elif kind == "apply":
            term = f"{arguments['fn']} {arguments['arg']}"
        elif kind == "pair":
            term = f"And.intro {arguments['left']} {arguments['right']}"
        elif kind == "module":
            applied = [*prop_names.values(), *(arguments[port] for port in ports(node))]
            term = " ".join([module_names[node["ref"]], *applied])
        else:
            term = f"And.{kind} {arguments['value']}"
        source_map[identifier] = {"startLine": len(code) + 1, "endLine": len(code) + 1}
        code.append(f"  let {node_names[identifier]} : {_format_type(inferred[identifier], prop_names)} := {term}")
    source_map[goals[0]] = {"startLine": len(code) + 1, "endLine": len(code) + 1}
    code.extend((f"  {node_names[inputs[goals[0]]['proof']]}", ""))
    if not declaration:
        code.extend(("#print axioms glean_proof", ""))
    source = "\n".join(code)
    if len(source) > MAX_CODE_LENGTH:
        diagnose("The generated module exceeds the prototype's source size limit.")
        return result()
    return result("ready", source)
