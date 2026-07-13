import os
import tempfile
from pathlib import Path

# Point the vector store + code graph at throwaway dirs BEFORE any app module
# is imported, so tests never touch the real ./.chroma or ./.graph. Settings
# reads these env vars at import.
_tmp = tempfile.mkdtemp(prefix="codebase-rag-test-")
os.environ["CHROMA_DIR"] = _tmp + "/chroma"
os.environ["GRAPH_DIR"] = _tmp + "/graph"
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")  # quiet chromadb posthog noise

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
