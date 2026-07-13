from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "ollama"

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5-coder:7b"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    embed_model: str = "BAAI/bge-small-en-v1.5"
    chroma_dir: str = "./.chroma"
    top_k: int = 8

    # --- graph-aware retrieval ---
    graph_enabled: bool = True
    graph_dir: str = "./.graph"        # sqlite code-graph sidecar
    seed_k: int = 12                   # vector seeds before graph expansion
    graph_out_cap: int = 3             # max callees/definitions pulled per seed
    graph_in_cap: int = 2              # max callers pulled per seed
    graph_decay: float = 0.8           # neighbor score = seed_sim * decay

    # --- token efficiency ---
    context_token_budget: int = 6000   # hard cap on assembled context (est.)
    dedup_overlap: float = 0.72        # token-overlap ratio treated as duplicate
    neighbor_head_lines: int = 25      # head-trim graph-only neighbor chunks

    # --- ingest safety limits (this endpoint reads local files) ---
    # If set, only paths inside this directory may be ingested. Empty = any
    # path (fine for a single-user localhost tool; set it if ever exposed).
    ingest_root: str = ""
    max_files: int = 5000            # cap files per repo (DoS guard)
    max_total_bytes: int = 200_000_000  # cap bytes per repo (~200MB)


settings = Settings()
