import os
from pathlib import Path
from typing import Literal

import psycopg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from psycopg.rows import dict_row

api = FastAPI()


class IncidentInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=5, max_length=100)
    description: str = Field(min_length=1, max_length=1000)
    category: Literal["facility", "safety", "academic", "general"]
    urgency_level: int = Field(strict=True, ge=1, le=5)


def get_db_connection():
    password_file = os.getenv("POSTGRES_PASSWORD_FILE")
    password = (
        Path(password_file).read_text(encoding="utf-8").strip()
        if password_file
        else os.getenv("POSTGRES_PASSWORD")
    )
    if not password:
        raise RuntimeError("PostgreSQL password is not configured")

    return psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        user=os.environ["POSTGRES_USER"],
        dbname=os.environ["POSTGRES_DB"],
        password=password,
        row_factory=dict_row,
    )


def insert_incident(incident: IncidentInput):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO incidents (title, description, category, urgency_level)
                VALUES (%s, %s, %s, %s)
                RETURNING id, title, description, category, urgency_level, created_at
                """,
                (
                    incident.title,
                    incident.description,
                    incident.category,
                    incident.urgency_level,
                ),
            )
            incident_row = cursor.fetchone()
            connection.commit()
            return incident_row
    finally:
        connection.close()


@api.get("/")
def read_root():
    return {"status": "success", "message": "Welcome to Stats Service API!"}


@api.post("/incidents", status_code=201)
def create_incident(incident: IncidentInput):
    try:
        return insert_incident(incident)
    except psycopg.Error as error:
        raise HTTPException(
            status_code=503,
            detail="Incident storage is unavailable",
        ) from error
