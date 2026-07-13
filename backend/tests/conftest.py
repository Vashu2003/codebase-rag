import os
import tempfile
from pathlib import Path

# Point the vector store at a throwaway dir BEFORE any app module is imported,
# so tests never touch the real ./.chroma. Settings reads this env at import.
os.environ["CHROMA_DIR"] = tempfile.mkdtemp(prefix="codebase-rag-test-")

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_repo() -> Path:
    return FIXTURES / "sample_repo"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)
