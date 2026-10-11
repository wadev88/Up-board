BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE faculties (
    id SERIAL NOT NULL, 
    code VARCHAR(16) NOT NULL, 
    name_th VARCHAR(200) NOT NULL, 
    name_en VARCHAR(200), 
    CONSTRAINT pk_faculties PRIMARY KEY (id), 
    CONSTRAINT uq_faculties_code UNIQUE (code)
);

CREATE TABLE permissions (
    id SERIAL NOT NULL, 
    code VARCHAR(64) NOT NULL, 
    description TEXT, 
    CONSTRAINT pk_permissions PRIMARY KEY (id), 
    CONSTRAINT uq_permissions_code UNIQUE (code)
);

CREATE TYPE post_type AS ENUM ('general', 'announcement', 'repair', 'lost_found');

CREATE TABLE post_categories (
    id SERIAL NOT NULL, 
    slug VARCHAR(50) NOT NULL, 
    name_th VARCHAR(100) NOT NULL, 
    allowed_type post_type, 
    CONSTRAINT pk_post_categories PRIMARY KEY (id), 
    CONSTRAINT uq_post_categories_slug UNIQUE (slug)
);

CREATE TYPE role_name AS ENUM ('student', 'staff', 'admin');

CREATE TABLE roles (
    id SMALLSERIAL NOT NULL, 
    name role_name NOT NULL, 
    weight SMALLINT NOT NULL, 
    CONSTRAINT pk_roles PRIMARY KEY (id), 
    CONSTRAINT uq_roles_name UNIQUE (name)
);

CREATE TYPE permission_scope AS ENUM ('own', 'faculty', 'any');

CREATE TABLE role_permissions (
    role_id SMALLINT NOT NULL, 
    permission_id INTEGER NOT NULL, 
    scope permission_scope NOT NULL, 
    CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id), 
    CONSTRAINT fk_role_permissions_permission_id_permissions FOREIGN KEY(permission_id) REFERENCES permissions (id) ON DELETE CASCADE, 
    CONSTRAINT fk_role_permissions_role_id_roles FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE users (
    id SERIAL NOT NULL, 
    email CITEXT NOT NULL, 
    password_hash TEXT NOT NULL, 
    display_name VARCHAR(60) NOT NULL, 
    role_id SMALLINT NOT NULL, 
    faculty_id INTEGER, 
    is_verified BOOLEAN NOT NULL, 
    is_active BOOLEAN NOT NULL, 
    token_version INTEGER NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_users PRIMARY KEY (id), 
    CONSTRAINT ck_users_email_up_domain CHECK (email ~* '^[A-Za-z0-9._%+-]+@up\.ac\.th$'), 
    CONSTRAINT fk_users_faculty_id_faculties FOREIGN KEY(faculty_id) REFERENCES faculties (id), 
    CONSTRAINT fk_users_role_id_roles FOREIGN KEY(role_id) REFERENCES roles (id), 
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE audit_logs (
    id SERIAL NOT NULL, 
    actor_id INTEGER, 
    action VARCHAR(50) NOT NULL, 
    entity VARCHAR(50) NOT NULL, 
    entity_id INTEGER, 
    meta JSONB, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_audit_logs PRIMARY KEY (id), 
    CONSTRAINT fk_audit_logs_actor_id_users FOREIGN KEY(actor_id) REFERENCES users (id)
);

CREATE INDEX ix_audit_logs_action ON audit_logs (action);

CREATE INDEX ix_audit_logs_actor_id ON audit_logs (actor_id);

CREATE TABLE email_verification_tokens (
    token_hash VARCHAR(64) NOT NULL, 
    user_id INTEGER NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    used_at TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_email_verification_tokens PRIMARY KEY (token_hash), 
    CONSTRAINT fk_email_verification_tokens_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_email_verification_tokens_user_id ON email_verification_tokens (user_id);

CREATE TABLE notifications (
    id SERIAL NOT NULL, 
    user_id INTEGER NOT NULL, 
    type VARCHAR(50) NOT NULL, 
    title VARCHAR(200) NOT NULL, 
    body TEXT, 
    link VARCHAR(300), 
    read_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_notifications PRIMARY KEY (id), 
    CONSTRAINT fk_notifications_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

CREATE INDEX ix_notifications_user_id ON notifications (user_id);

CREATE TYPE priority_level AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE post_status AS ENUM ('active', 'removed');

CREATE TABLE posts (
    id SERIAL NOT NULL, 
    type post_type NOT NULL, 
    title VARCHAR(150) NOT NULL, 
    content TEXT NOT NULL, 
    category_id INTEGER NOT NULL, 
    author_id INTEGER NOT NULL, 
    faculty_id INTEGER, 
    priority priority_level NOT NULL, 
    status post_status NOT NULL, 
    first_pinned_at TIMESTAMP WITH TIME ZONE, 
    pinned_at TIMESTAMP WITH TIME ZONE, 
    pinned_until TIMESTAMP WITH TIME ZONE, 
    pinned_by INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    deleted_at TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_posts PRIMARY KEY (id), 
    CONSTRAINT ck_posts_pin_max_72h CHECK (pinned_until IS NULL OR (first_pinned_at IS NOT NULL AND pinned_until <= first_pinned_at + INTERVAL '72 hours')), 
    CONSTRAINT ck_posts_pin_pair CHECK ((pinned_at IS NULL) = (pinned_until IS NULL)), 
    CONSTRAINT ck_posts_content_length CHECK (char_length(content) BETWEEN 1 AND 5000), 
    CONSTRAINT ck_posts_title_length CHECK (char_length(title) BETWEEN 3 AND 150), 
    CONSTRAINT fk_posts_author_id_users FOREIGN KEY(author_id) REFERENCES users (id), 
    CONSTRAINT fk_posts_category_id_post_categories FOREIGN KEY(category_id) REFERENCES post_categories (id), 
    CONSTRAINT fk_posts_faculty_id_faculties FOREIGN KEY(faculty_id) REFERENCES faculties (id), 
    CONSTRAINT fk_posts_pinned_by_users FOREIGN KEY(pinned_by) REFERENCES users (id)
);

CREATE INDEX ix_posts_author_id ON posts (author_id);

CREATE INDEX ix_posts_category_created_at ON posts (category_id, created_at DESC);

CREATE INDEX ix_posts_faculty_id ON posts (faculty_id);

CREATE INDEX ix_posts_pinned_until ON posts (pinned_until) WHERE pinned_until IS NOT NULL;

CREATE INDEX ix_posts_search ON posts USING gin (to_tsvector('simple', title || ' ' || content));

CREATE INDEX ix_posts_status_created_at ON posts (status, created_at DESC);

CREATE INDEX ix_posts_type ON posts (type);

CREATE TABLE refresh_tokens (
    token_hash VARCHAR(64) NOT NULL, 
    user_id INTEGER NOT NULL, 
    family_id VARCHAR(36) NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    revoked_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_refresh_tokens PRIMARY KEY (token_hash), 
    CONSTRAINT fk_refresh_tokens_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_refresh_tokens_family_id ON refresh_tokens (family_id);

CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE TABLE technicians (
    id SERIAL NOT NULL, 
    user_id INTEGER NOT NULL, 
    specialty VARCHAR(100), 
    zone VARCHAR(100), 
    is_available BOOLEAN NOT NULL, 
    CONSTRAINT pk_technicians PRIMARY KEY (id), 
    CONSTRAINT fk_technicians_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT uq_technicians_user_id UNIQUE (user_id)
);

CREATE TYPE attachment_kind AS ENUM ('image', 'repair_after');

CREATE TABLE attachments (
    id SERIAL NOT NULL, 
    post_id INTEGER, 
    uploaded_by INTEGER NOT NULL, 
    storage_key VARCHAR(100) NOT NULL, 
    mime_type VARCHAR(30) NOT NULL, 
    size_bytes INTEGER NOT NULL, 
    kind attachment_kind NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_attachments PRIMARY KEY (id), 
    CONSTRAINT ck_attachments_mime_type_allowed CHECK (mime_type IN ('image/jpeg','image/png','image/webp')), 
    CONSTRAINT ck_attachments_size_limit CHECK (size_bytes > 0 AND size_bytes <= 5242880), 
    CONSTRAINT fk_attachments_post_id_posts FOREIGN KEY(post_id) REFERENCES posts (id) ON DELETE CASCADE, 
    CONSTRAINT fk_attachments_uploaded_by_users FOREIGN KEY(uploaded_by) REFERENCES users (id), 
    CONSTRAINT uq_attachments_storage_key UNIQUE (storage_key)
);

CREATE INDEX ix_attachments_post_id ON attachments (post_id);

CREATE INDEX ix_attachments_uploaded_by ON attachments (uploaded_by);

CREATE TABLE events (
    post_id INTEGER NOT NULL, 
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    ends_at TIMESTAMP WITH TIME ZONE, 
    venue VARCHAR(200), 
    CONSTRAINT pk_events PRIMARY KEY (post_id), 
    CONSTRAINT ck_events_ends_after_starts CHECK (ends_at IS NULL OR ends_at > starts_at), 
    CONSTRAINT fk_events_post_id_posts FOREIGN KEY(post_id) REFERENCES posts (id) ON DELETE CASCADE
);

CREATE INDEX ix_events_starts_at ON events (starts_at);

CREATE TYPE lost_found_status AS ENUM ('lost', 'found', 'returned');

CREATE TABLE lost_found_items (
    post_id INTEGER NOT NULL, 
    location VARCHAR(200) NOT NULL, 
    status lost_found_status NOT NULL, 
    occurred_at TIMESTAMP WITH TIME ZONE, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_lost_found_items PRIMARY KEY (post_id), 
    CONSTRAINT fk_lost_found_items_post_id_posts FOREIGN KEY(post_id) REFERENCES posts (id) ON DELETE CASCADE
);

CREATE INDEX ix_lost_found_items_status ON lost_found_items (status);

CREATE TYPE repair_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed');

CREATE TABLE repair_requests (
    post_id INTEGER NOT NULL, 
    location VARCHAR(200) NOT NULL, 
    latitude NUMERIC(9, 6), 
    longitude NUMERIC(9, 6), 
    status repair_status NOT NULL, 
    assigned_technician_id INTEGER, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_repair_requests PRIMARY KEY (post_id), 
    CONSTRAINT ck_repair_requests_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90), 
    CONSTRAINT ck_repair_requests_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180), 
    CONSTRAINT fk_repair_requests_assigned_technician_id_technicians FOREIGN KEY(assigned_technician_id) REFERENCES technicians (id), 
    CONSTRAINT fk_repair_requests_post_id_posts FOREIGN KEY(post_id) REFERENCES posts (id) ON DELETE CASCADE
);

CREATE INDEX ix_repair_requests_assigned_technician_id ON repair_requests (assigned_technician_id);

CREATE INDEX ix_repair_requests_status ON repair_requests (status);

CREATE TYPE report_reason AS ENUM ('profanity', 'spam', 'harassment', 'misinformation', 'other');

CREATE TYPE report_status AS ENUM ('reported', 'under_review', 'upheld', 'content_removed', 'dismissed');

CREATE TABLE reports (
    id SERIAL NOT NULL, 
    post_id INTEGER NOT NULL, 
    reporter_id INTEGER NOT NULL, 
    reason report_reason NOT NULL, 
    detail VARCHAR(1000), 
    status report_status NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_reports PRIMARY KEY (id), 
    CONSTRAINT fk_reports_post_id_posts FOREIGN KEY(post_id) REFERENCES posts (id), 
    CONSTRAINT fk_reports_reporter_id_users FOREIGN KEY(reporter_id) REFERENCES users (id), 
    CONSTRAINT uq_reports_post_reporter UNIQUE (post_id, reporter_id)
);

CREATE INDEX ix_reports_post_id ON reports (post_id);

CREATE INDEX ix_reports_reporter_id ON reports (reporter_id);

CREATE INDEX ix_reports_status ON reports (status);

CREATE TABLE repair_status_history (
    id SERIAL NOT NULL, 
    repair_id INTEGER NOT NULL, 
    from_status repair_status, 
    to_status repair_status NOT NULL, 
    changed_by INTEGER, 
    note VARCHAR(500), 
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_repair_status_history PRIMARY KEY (id), 
    CONSTRAINT fk_repair_status_history_changed_by_users FOREIGN KEY(changed_by) REFERENCES users (id), 
    CONSTRAINT fk_repair_status_history_repair_id_repair_requests FOREIGN KEY(repair_id) REFERENCES repair_requests (post_id) ON DELETE CASCADE
);

CREATE INDEX ix_repair_status_history_repair_id ON repair_status_history (repair_id);

CREATE TABLE report_actions (
    id SERIAL NOT NULL, 
    report_id INTEGER NOT NULL, 
    admin_id INTEGER NOT NULL, 
    from_status report_status NOT NULL, 
    to_status report_status NOT NULL, 
    note VARCHAR(1000), 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_report_actions PRIMARY KEY (id), 
    CONSTRAINT fk_report_actions_admin_id_users FOREIGN KEY(admin_id) REFERENCES users (id), 
    CONSTRAINT fk_report_actions_report_id_reports FOREIGN KEY(report_id) REFERENCES reports (id) ON DELETE CASCADE
);

CREATE INDEX ix_report_actions_report_id ON report_actions (report_id);

INSERT INTO alembic_version (version_num) VALUES ('0001') RETURNING alembic_version.version_num;

-- Running upgrade 0001 -> 0002

ALTER TYPE role_name RENAME TO role_name_old;

CREATE TYPE role_name AS ENUM ('student', 'teacher', 'technician', 'faculty_staff', 'building_staff', 'student_club', 'admin');

ALTER TABLE roles ALTER COLUMN name TYPE role_name USING ((CASE name::text WHEN 'staff' THEN 'faculty_staff' ELSE name::text END))::role_name;

DROP TYPE role_name_old;

INSERT INTO roles (id, name, weight) SELECT (SELECT MAX(id) + 1 FROM roles), 'teacher', 5 WHERE EXISTS (SELECT 1 FROM roles) AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'teacher');

INSERT INTO roles (id, name, weight) SELECT (SELECT MAX(id) + 1 FROM roles), 'technician', 0 WHERE EXISTS (SELECT 1 FROM roles) AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'technician');

INSERT INTO roles (id, name, weight) SELECT (SELECT MAX(id) + 1 FROM roles), 'building_staff', 10 WHERE EXISTS (SELECT 1 FROM roles) AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'building_staff');

INSERT INTO roles (id, name, weight) SELECT (SELECT MAX(id) + 1 FROM roles), 'student_club', 5 WHERE EXISTS (SELECT 1 FROM roles) AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'student_club');

UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'technician') FROM technicians t WHERE t.user_id = users.id AND t.is_available AND users.role_id = (SELECT id FROM roles WHERE name = 'faculty_staff');

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN supabase_user_id UUID;

ALTER TABLE users ADD COLUMN posting_suspended_until TIMESTAMP WITH TIME ZONE;

ALTER TABLE users ADD CONSTRAINT uq_users_supabase_user_id UNIQUE (supabase_user_id);

ALTER TYPE post_type RENAME TO post_type_old;

CREATE TYPE post_type AS ENUM ('general', 'announcement', 'event', 'repair', 'lost_found');

ALTER TABLE posts ALTER COLUMN type TYPE post_type USING (type::text)::post_type;

ALTER TABLE post_categories ALTER COLUMN allowed_type TYPE post_type USING (allowed_type::text)::post_type;

DROP TYPE post_type_old;

UPDATE posts SET type = 'event' WHERE type = 'announcement' AND EXISTS (SELECT 1 FROM events e WHERE e.post_id = posts.id);

CREATE TYPE event_priority AS ENUM ('department', 'faculty', 'university');

ALTER TABLE events ADD COLUMN priority_level event_priority DEFAULT 'department' NOT NULL;

UPDATE events e SET priority_level = CASE r.name::text WHEN 'admin' THEN 'university'::event_priority WHEN 'faculty_staff' THEN 'faculty'::event_priority ELSE 'department'::event_priority END FROM posts p JOIN users u ON u.id = p.author_id JOIN roles r ON r.id = u.role_id WHERE p.id = e.post_id;

ALTER TABLE events ALTER COLUMN priority_level DROP DEFAULT;

CREATE INDEX ix_events_ends_at ON events (ends_at);

ALTER TABLE events ADD CONSTRAINT ck_events_ends_at_required CHECK (ends_at IS NOT NULL) NOT VALID;

ALTER TABLE repair_requests ALTER COLUMN status DROP DEFAULT;

ALTER TYPE repair_status RENAME TO repair_status_old;

CREATE TYPE repair_status AS ENUM ('open', 'assigned', 'in_progress', 'resolved');

ALTER TABLE repair_requests ALTER COLUMN status TYPE repair_status USING ((CASE status::text WHEN 'pending' THEN 'open' WHEN 'accepted' THEN 'assigned' WHEN 'completed' THEN 'resolved' ELSE status::text END))::repair_status;

ALTER TABLE repair_status_history ALTER COLUMN from_status TYPE repair_status USING ((CASE from_status::text WHEN 'pending' THEN 'open' WHEN 'accepted' THEN 'assigned' WHEN 'completed' THEN 'resolved' ELSE from_status::text END))::repair_status;

ALTER TABLE repair_status_history ALTER COLUMN to_status TYPE repair_status USING ((CASE to_status::text WHEN 'pending' THEN 'open' WHEN 'accepted' THEN 'assigned' WHEN 'completed' THEN 'resolved' ELSE to_status::text END))::repair_status;

DROP TYPE repair_status_old;

ALTER TABLE posts DROP CONSTRAINT ck_posts_pin_max_72h;

ALTER TABLE posts DROP CONSTRAINT ck_posts_pin_pair;

UPDATE posts SET pinned_at = NULL, pinned_until = NULL, pinned_by = NULL;

ALTER TABLE posts DROP COLUMN first_pinned_at;

ALTER TABLE posts ADD CONSTRAINT ck_posts_pin_fields_together CHECK ((pinned_at IS NULL) = (pinned_until IS NULL) AND (pinned_at IS NULL) = (pinned_by IS NULL));

ALTER TABLE posts ADD CONSTRAINT ck_posts_pin_window_max_72h CHECK (pinned_until IS NULL OR (pinned_until > pinned_at AND pinned_until <= pinned_at + INTERVAL '72 hours'));

CREATE UNIQUE INDEX uq_posts_pinned_by ON posts (pinned_by) WHERE pinned_by IS NOT NULL;

CREATE INDEX ix_posts_author_created_at ON posts (author_id, created_at DESC);

CREATE TYPE removal_reason AS ENUM ('author', 'admin', 'moderation', 'lost_found_expired');

ALTER TABLE posts ADD COLUMN removal_reason removal_reason;

CREATE TYPE violation_action AS ENUM ('warning', 'suspension');

CREATE TABLE posting_violations (
    id SERIAL NOT NULL, 
    user_id INTEGER NOT NULL, 
    previous_post_id INTEGER NOT NULL, 
    post_type post_type NOT NULL, 
    action violation_action NOT NULL, 
    window_seconds INTEGER NOT NULL, 
    reason VARCHAR(200) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_posting_violations PRIMARY KEY (id), 
    CONSTRAINT fk_posting_violations_previous_post_id_posts FOREIGN KEY(previous_post_id) REFERENCES posts (id) ON DELETE CASCADE, 
    CONSTRAINT fk_posting_violations_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT uq_posting_violations_user_anchor UNIQUE (user_id, previous_post_id)
);

CREATE INDEX ix_posting_violations_user_id ON posting_violations (user_id);

CREATE TABLE posting_suspensions (
    id SERIAL NOT NULL, 
    user_id INTEGER NOT NULL, 
    violation_id INTEGER, 
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    reason VARCHAR(200) NOT NULL, 
    lifted_at TIMESTAMP WITH TIME ZONE, 
    lifted_by INTEGER, 
    CONSTRAINT pk_posting_suspensions PRIMARY KEY (id), 
    CONSTRAINT ck_posting_suspensions_ends_after_starts CHECK (ends_at > starts_at), 
    CONSTRAINT fk_posting_suspensions_lifted_by_users FOREIGN KEY(lifted_by) REFERENCES users (id), 
    CONSTRAINT fk_posting_suspensions_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
    CONSTRAINT fk_posting_suspensions_violation_id_posting_violations FOREIGN KEY(violation_id) REFERENCES posting_violations (id) ON DELETE SET NULL
);

CREATE INDEX ix_posting_suspensions_user_id ON posting_suspensions (user_id);

DO $$
        DECLARE t record;
        BEGIN
          FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
          END LOOP;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
            EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
            EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
          END IF;
        END $$;;

UPDATE alembic_version SET version_num='0002' WHERE alembic_version.version_num = '0001';

-- Running upgrade 0002 -> 0003

UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'teacher') WHERE role_id = (SELECT id FROM roles WHERE name = 'faculty_staff');

DELETE FROM roles WHERE name = 'faculty_staff';

ALTER TYPE role_name RENAME TO role_name_old;

CREATE TYPE role_name AS ENUM ('student', 'teacher', 'technician', 'building_staff', 'student_club', 'admin');

ALTER TABLE roles ALTER COLUMN name TYPE role_name USING (name::text)::role_name;

DROP TYPE role_name_old;

ALTER TABLE users ADD COLUMN year_of_study SMALLINT;

ALTER TABLE users ADD CONSTRAINT ck_users_year_of_study_range CHECK (year_of_study BETWEEN 1 AND 8);

ALTER TABLE users ADD COLUMN profile_completed_at TIMESTAMP WITH TIME ZONE;

UPDATE users SET profile_completed_at = created_at WHERE password_hash IS NOT NULL OR role_id <> (SELECT id FROM roles WHERE name = 'student');

UPDATE alembic_version SET version_num='0003' WHERE alembic_version.version_num = '0002';

-- Running upgrade 0003 -> 0004

UPDATE users SET year_of_study = NULL WHERE year_of_study > 6;

ALTER TABLE users DROP CONSTRAINT ck_users_year_of_study_range;

ALTER TABLE users ADD CONSTRAINT ck_users_year_of_study_range CHECK (year_of_study BETWEEN 1 AND 6);

UPDATE alembic_version SET version_num='0004' WHERE alembic_version.version_num = '0003';

-- Running upgrade 0004 -> 0005

ALTER TABLE repair_requests ALTER COLUMN status DROP DEFAULT;

ALTER TYPE repair_status RENAME TO repair_status_old;

CREATE TYPE repair_status AS ENUM ('open', 'assigned', 'in_progress', 'pending_review', 'closed', 'rejected');

ALTER TABLE repair_requests ALTER COLUMN status TYPE repair_status USING ((CASE status::text WHEN 'resolved' THEN 'closed' ELSE status::text END))::repair_status;

ALTER TABLE repair_status_history ALTER COLUMN from_status TYPE repair_status USING ((CASE from_status::text WHEN 'resolved' THEN 'closed' ELSE from_status::text END))::repair_status;

ALTER TABLE repair_status_history ALTER COLUMN to_status TYPE repair_status USING ((CASE to_status::text WHEN 'resolved' THEN 'closed' ELSE to_status::text END))::repair_status;

DROP TYPE repair_status_old;

ALTER TABLE faculties ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;

CREATE TABLE programs (
    id SERIAL NOT NULL, 
    faculty_id INTEGER NOT NULL, 
    code VARCHAR(32) NOT NULL, 
    name_th VARCHAR(200) NOT NULL, 
    name_en VARCHAR(200), 
    is_active BOOLEAN DEFAULT true NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    CONSTRAINT pk_programs PRIMARY KEY (id), 
    CONSTRAINT fk_programs_faculty_id_faculties FOREIGN KEY(faculty_id) REFERENCES faculties (id), 
    CONSTRAINT uq_programs_code UNIQUE (code)
);

CREATE INDEX ix_programs_faculty_id ON programs (faculty_id);

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

ALTER TABLE users DROP CONSTRAINT ck_users_year_of_study_range;

ALTER TABLE users DROP COLUMN year_of_study;

ALTER TABLE users DROP CONSTRAINT ck_users_email_up_domain;

ALTER TABLE users ADD COLUMN program_id INTEGER;

ALTER TABLE users ADD CONSTRAINT fk_users_program_id_programs FOREIGN KEY(program_id) REFERENCES programs (id);

CREATE INDEX ix_users_program_id ON users (program_id);

ALTER TABLE users ADD COLUMN contact_facebook VARCHAR(100);

ALTER TABLE users ADD COLUMN contact_instagram VARCHAR(100);

ALTER TABLE users ADD COLUMN contact_line VARCHAR(100);

ALTER TABLE posts DROP CONSTRAINT ck_posts_pin_window_max_72h;

DROP INDEX uq_posts_pinned_by;

ALTER TABLE posts DROP CONSTRAINT ck_posts_pin_fields_together;

ALTER TABLE posts ADD CONSTRAINT ck_posts_pin_fields_together CHECK ((pinned_at IS NULL) = (pinned_by IS NULL) AND (pinned_until IS NULL OR (pinned_at IS NOT NULL AND pinned_until > pinned_at)));

ALTER TABLE posts ADD COLUMN related_repair_id INTEGER;

ALTER TABLE posts ADD CONSTRAINT fk_posts_related_repair_id_posts FOREIGN KEY(related_repair_id) REFERENCES posts (id) ON DELETE SET NULL;

CREATE INDEX ix_posts_related_repair_id ON posts (related_repair_id);

ALTER TABLE posts ADD CONSTRAINT ck_posts_related_repair_announcements_only CHECK (related_repair_id IS NULL OR type = 'announcement');

ALTER TABLE posting_violations ADD COLUMN post_id INTEGER;

ALTER TABLE posting_violations ADD COLUMN series_count INTEGER;

UPDATE posting_violations SET post_id = previous_post_id, series_count = CASE action::text WHEN 'warning' THEN 3 ELSE 5 END;

ALTER TABLE posting_violations ALTER COLUMN series_count SET NOT NULL;

ALTER TABLE posting_violations ADD CONSTRAINT fk_posting_violations_post_id_posts FOREIGN KEY(post_id) REFERENCES posts (id) ON DELETE SET NULL;

ALTER TABLE posting_violations DROP CONSTRAINT uq_posting_violations_user_anchor;

ALTER TABLE posting_violations DROP COLUMN previous_post_id;

ALTER TABLE posting_violations DROP COLUMN window_seconds;

ALTER TABLE posting_suspensions ADD COLUMN last_day DATE;

UPDATE posting_suspensions SET last_day = ((ends_at - INTERVAL '1 second') AT TIME ZONE 'Asia/Bangkok')::date;

ALTER TABLE posting_suspensions ALTER COLUMN last_day SET NOT NULL;

UPDATE alembic_version SET version_num='0005' WHERE alembic_version.version_num = '0004';

-- Running upgrade 0005 -> 0006

ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE users ADD COLUMN deleted_by INTEGER;

ALTER TABLE users ADD CONSTRAINT fk_users_deleted_by_users FOREIGN KEY(deleted_by) REFERENCES users (id) ON DELETE SET NULL;

INSERT INTO post_categories (slug, name_th, allowed_type)
        SELECT 'general', 'โพสต์ทั่วไป', NULL
        WHERE EXISTS (SELECT 1 FROM post_categories) AND NOT EXISTS (
            SELECT 1 FROM post_categories WHERE slug = 'general');

INSERT INTO post_categories (slug, name_th, allowed_type)
        SELECT 'announcement', 'ประกาศ', 'announcement'
        WHERE EXISTS (SELECT 1 FROM post_categories) AND NOT EXISTS (
            SELECT 1 FROM post_categories WHERE slug = 'announcement');

UPDATE posts SET category_id = (SELECT id FROM post_categories WHERE slug = 'general') WHERE category_id IN (SELECT id FROM post_categories WHERE slug IN ('urgent', 'recommendations'));

DELETE FROM post_categories WHERE slug IN ('urgent', 'recommendations');

UPDATE post_categories SET name_th = 'โพสต์ทั่วไป' WHERE slug = 'general';

UPDATE post_categories SET name_th = 'กิจกรรม', allowed_type = 'event' WHERE slug = 'activities';

UPDATE alembic_version SET version_num='0006' WHERE alembic_version.version_num = '0005';

-- Running upgrade 0006 -> 0007

ALTER TABLE faculties ADD COLUMN admin_only BOOLEAN DEFAULT false NOT NULL;

UPDATE faculties SET admin_only = true WHERE code = 'CENTRAL';

UPDATE alembic_version SET version_num='0007' WHERE alembic_version.version_num = '0006';

-- Running upgrade 0007 -> 0008

ALTER TYPE removal_reason ADD VALUE IF NOT EXISTS 'account_deleted';

UPDATE alembic_version SET version_num='0008' WHERE alembic_version.version_num = '0007';

-- Running upgrade 0008 -> 0009

DROP INDEX ix_email_verification_tokens_user_id;

DROP TABLE email_verification_tokens;

UPDATE alembic_version SET version_num='0009' WHERE alembic_version.version_num = '0008';

COMMIT;

