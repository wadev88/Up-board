CREATE TABLE IF NOT EXISTS incidents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 100),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
    category TEXT NOT NULL CHECK (category IN ('facility', 'safety', 'academic', 'general')),
    urgency_level SMALLINT NOT NULL CHECK (urgency_level BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);