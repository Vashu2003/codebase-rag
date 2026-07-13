from pathlib import Path

from app.chunker import chunk_file


def test_python_ast_symbols_and_spans(sample_repo: Path):
    chunks = chunk_file(sample_repo, sample_repo / "calc.py")
    symbols = {c.symbol for c in chunks}
    assert "add" in symbols
    assert "Calculator" in symbols

    add = next(c for c in chunks if c.symbol == "add")
    assert "return a + b" in add.text
    assert add.start_line >= 1
    assert add.end_line >= add.start_line

    # a class chunk captures its methods (we don't descend into a captured node)
    calc = next(c for c in chunks if c.symbol == "Calculator")
    assert "multiply" in calc.text


def test_typescript_symbols(sample_repo: Path):
    chunks = chunk_file(sample_repo, sample_repo / "app.ts")
    symbols = {c.symbol for c in chunks}
    assert "greet" in symbols
    assert "Widget" in symbols


def test_oversized_node_falls_back_to_window(tmp_path: Path):
    body = "\n".join(f"    x{i} = {i}" for i in range(200))
    src = f"def huge():\n{body}\n"
    f = tmp_path / "huge.py"
    f.write_text(src)

    chunks = chunk_file(tmp_path, f)
    # too big for one chunk -> multiple window chunks, none carrying a symbol
    assert len(chunks) > 1
    assert all(c.symbol is None for c in chunks)
    assert all(c.file == "huge.py" for c in chunks)


def test_module_level_code_is_indexed(sample_repo: Path):
    # top-level constants/docstrings live outside any function/class; they must
    # still be searchable via the gap-windowing pass, not silently dropped
    chunks = chunk_file(sample_repo, sample_repo / "calc.py")
    assert any("CONST = 42" in c.text for c in chunks)


def test_oversized_window_spans_are_contiguous(tmp_path: Path):
    body = "\n".join(f"    x{i} = {i}" for i in range(200))
    src = f"def huge():\n{body}\n"
    f = tmp_path / "huge.py"
    f.write_text(src)

    chunks = sorted(chunk_file(tmp_path, f), key=lambda c: c.start_line)
    assert chunks[0].start_line == 1                 # base offset applied correctly
    for c in chunks:
        assert c.end_line >= c.start_line
    # windows advance through the file, staying within its line count
    assert chunks[-1].end_line <= src.count("\n") + 1


def test_unsupported_extension_uses_window(tmp_path: Path):
    f = tmp_path / "data.xyz"
    f.write_text("alpha\nbeta\ngamma\n")
    chunks = chunk_file(tmp_path, f)
    assert len(chunks) == 1
    assert chunks[0].symbol is None
    assert "beta" in chunks[0].text


def test_refs_extracted_from_calls(tmp_path: Path):
    f = tmp_path / "s.py"
    f.write_text("def total():\n    return add(1, 2)\n")
    total = next(c for c in chunk_file(tmp_path, f) if c.symbol == "total")
    assert "add" in total.refs          # references the called function
    assert "total" not in total.refs    # a chunk doesn't reference its own name


def test_unreadable_file_returns_empty(tmp_path: Path):
    missing = tmp_path / "nope.py"  # never created
    assert chunk_file(tmp_path, missing) == []


def test_line_spans_are_one_indexed(sample_repo: Path):
    chunks = chunk_file(sample_repo, sample_repo / "calc.py")
    add = next(c for c in chunks if c.symbol == "add")
    # `def add` is the 6th line of calc.py (1-indexed)
    lines = (sample_repo / "calc.py").read_text().splitlines()
    assert lines[add.start_line - 1].startswith("def add")
