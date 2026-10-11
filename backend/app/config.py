from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (ADR-001: no secrets in Git)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://upboard:upboard@localhost:5432/upboard"
    # Sync endpoints run in AnyIO's threadpool (40 threads). Keep >= 40 persistent connections:
    # overflow connections are closed on return, and re-opening them (fork + SCRAM auth) burned
    # PostgreSQL CPU under load (NFR-11 load test). Overflow is only a small safety margin.
    db_pool_size: int = 40
    db_max_overflow: int = 10
    db_pool_timeout: int = 10

    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    stream_ticket_ttl_seconds: int = 60

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    frontend_url: str = "http://localhost:3000"
    public_api_url: str = "http://localhost:8000"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    storage_backend: Literal["local", "s3"] = "local"
    upload_dir: str = "./uploads"
    max_upload_bytes: int = 5 * 1024 * 1024
    max_attachments_per_post: int = 4
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_public_base_url: str = ""

    rate_limit_enabled: bool = True

    # Google sign-in through Supabase Auth (ADR-003). The backend only VERIFIES Supabase access
    # tokens (JWKS, or the legacy HS256 secret) — it never needs the service_role key.
    supabase_url: str = ""
    supabase_jwt_secret: str = ""  # only for projects still on the legacy shared JWT secret
    allowed_email_domain: str = "up.ac.th"
    # Self-service email/password sign-up. Off by default: new users sign in with Google;
    # passwords remain for the bootstrap admin and demo accounts.
    password_signup_enabled: bool = True

    # Business rules (ADR-002 / ADR-003)
    dashboard_window_hours: int = 24  # general posts stay on the dashboard for 24 h
    announcement_window_days: int = 7  # announcements stay in the feeds for 7 days
    dashboard_section_limit: int = 20
    pinned_display_limit: Annotated[int, Field(ge=3, le=5)] = 5
    pin_rotation_minutes: int = 10
    pin_default_hours: int = 48  # allowed choices: expiration.PIN_HOUR_CHOICES
    lost_found_archive_days: int = 7
    repair_cooldown_seconds: int = 120  # minimum gap between two repair requests of one user
    spam_policy_enabled: bool = True  # tests switch it off except in the spam tests

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def google_login_enabled(self) -> bool:
        return bool(self.supabase_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
