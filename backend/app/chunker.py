"""AST-aware code chunking.

Splits source into semantically meaningful units (functions, classes, methods)
using tree-sitter. Falls back to a sliding line-window for unsupported files.
Each chunk keeps its file + line span so answers can cite file:line.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

try:
    from tree_sitter_language_pack import get_parser
    _HAS_TS = True
except Exception:  # pragma: no cover - optional dep at runtime
    _HAS_TS = False


# file extension -> tree-sitter language name
LANG_BY_EXT = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".dart": "dart",
}

# node types that make good standalone chunks, across language families.
# Matching is by string, so listing a name a grammar doesn't have is harmless.
SPLIT_NODES = {
    # python / js / ts
    "function_definition",
    "function_declaration",
    "method_definition",
    "class_definition",
    "class_declaration",
    "method_declaration",
    "arrow_function",
    "interface_declaration",     # ts
    "type_alias_declaration",    # ts
    "enum_declaration",          # ts / java
    # go / rust / java type + func declarations
    "type_declaration",          # go (struct/interface)
    "function_item",             # rust
    "impl_item",                 # rust
    "struct_item",               # rust
    "trait_item",                # rust
    "enum_item",                 # rust
    # ruby (note: NOT "module" — that is Python's tree-sitter root node type,
    # which would capture the whole file as one symbol-less chunk)
    "method",
    "singleton_method",
    "class",
}

MAX_CHUNK_LINES = 120     # split oversized nodes with the window fallback
WINDOW = 60
OVERLAP = 10


# We treat only CALL CALLEES and TYPE references as graph edges — never bare
# identifier reads (variables, attribute names, keyword args) or prose. This is
# what makes edges "call-site aware": an attribute assignment like `self.total`
# or a docstring word no longer forges an edge to a same-named symbol.
_CALL_TYPES = {
    "call", "call_expression", "function_call",
    "method_invocation", "method_call",
}
_TYPE_TYPES = {"type_identifier"}
_ID_LEAVES = {"identifier", "field_identifier", "type_identifier", "constant"}
_CALL_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*\(")   # `name(` call sites


@dataclass
class Chunk:
    file: str            # repo-relative path
    start_line: int      # 1-indexed, inclusive
    end_line: int
    symbol: str | None
    text: str
    refs: list[str] = field(default_factory=list)  # symbols this chunk references


def _rightmost_id(node, raw: bytes) -> str | None:
    """Last identifier token in a subtree — the actual callee of `a.b.c()`."""
    best, best_pos = None, -1
    stack = [node]
    while stack:
        n = stack.pop()
        if n.type in _ID_LEAVES and not n.children and n.start_byte > best_pos:
            best_pos = n.start_byte
            best = raw[n.start_byte:n.end_byte].decode("utf8", "replace")
        stack.extend(n.children)
    return best


def _references(node, raw: bytes) -> list[str]:
    """Call callees + type references in a node's subtree (AST chunks)."""
    refs: set[str] = set()
    stack = [node]
    while stack:
        n = stack.pop()
        if n.type in _CALL_TYPES:
            fn = (n.child_by_field_name("function")
                  or n.child_by_field_name("name")
                  or n.child_by_field_name("method")
                  or (n.children[0] if n.children else None))
            rid = _rightmost_id(fn, raw) if fn is not None else None
            if rid:
                refs.add(rid)
        elif n.type in _TYPE_TYPES and not n.children:
            refs.add(raw[n.start_byte:n.end_byte].decode("utf8", "replace"))
        stack.extend(n.children)
    return list(refs)


def _regex_references(text: str) -> list[str]:
    """Call-site scan for window chunks with no AST — skips prose/attributes."""
    return list({m for m in _CALL_RE.findall(text) if len(m) > 1})


def _symbol_name(node, src: bytes) -> str | None:
    for child in node.children:
        if child.type in ("identifier", "name", "type_identifier"):
            return src[child.start_byte:child.end_byte].decode("utf8", "replace")
    return None


def _window_chunks(rel: str, lines: list[str], base: int = 0) -> list[Chunk]:
    out: list[Chunk] = []
    i = 0
    while i < len(lines):
        seg = lines[i:i + WINDOW]
        if not "".join(seg).strip():
            i += WINDOW - OVERLAP
            continue
        text = "".join(seg)
        out.append(Chunk(
            file=rel,
            start_line=base + i + 1,
            end_line=base + i + len(seg),
            symbol=None,
            text=text,
            refs=_regex_references(text),
        ))
        i += WINDOW - OVERLAP
    return out


def chunk_file(root: Path, path: Path) -> list[Chunk]:
    rel = str(path.relative_to(root))
    try:
        raw = path.read_bytes()
    except Exception:
        return []
    lines = raw.decode("utf8", "replace").splitlines(keepends=True)

    lang = LANG_BY_EXT.get(path.suffix.lower())
    if not (_HAS_TS and lang):
        return _window_chunks(rel, lines)

    try:
        parser = get_parser(lang)
        tree = parser.parse(raw)
    except Exception:
        return _window_chunks(rel, lines)

    chunks: list[Chunk] = []
    covered: list[tuple[int, int]] = []  # 0-indexed line spans captured as symbols

    def visit(node):
        if node.type in SPLIT_NODES:
            start = node.start_point[0]
            end = node.end_point[0]
            covered.append((start, end))
            span = end - start + 1
            body = raw[node.start_byte:node.end_byte].decode("utf8", "replace")
            if span > MAX_CHUNK_LINES:
                sub = body.splitlines(keepends=True)
                chunks.extend(_window_chunks(rel, sub, base=start))
            else:
                name = _symbol_name(node, raw)
                refs = [r for r in _references(node, raw) if r != name]
                chunks.append(Chunk(
                    file=rel,
                    start_line=start + 1,
                    end_line=end + 1,
                    symbol=name,
                    text=body,
                    refs=refs,
                ))
            return  # don't descend into an already-captured symbol
        for c in node.children:
            visit(c)

    visit(tree.root_node)

    # nothing matched (config/script/unknown grammar) -> window the whole thing
    if not chunks:
        return _window_chunks(rel, lines)

    # window the lines NOT inside any captured symbol so module-level code
    # (docstrings, imports, top-level constants) is still searchable.
    covered.sort()
    cursor = 0
    for start, end in covered:
        if start > cursor:
            chunks.extend(_window_chunks(rel, lines[cursor:start], base=cursor))
        cursor = max(cursor, end + 1)
    if cursor < len(lines):
        chunks.extend(_window_chunks(rel, lines[cursor:], base=cursor))

    return chunks
