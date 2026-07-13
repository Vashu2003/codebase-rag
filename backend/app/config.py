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


settings = Settings()
