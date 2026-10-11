--
-- PostgreSQL database dump
--

\restrict o7mnDXnFyY1kskgqNXLog7c6vWcrWhepoc3BCqhWNoVHOhYAvH02DROugo6HFhR

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: attachment_kind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.attachment_kind AS ENUM (
    'image',
    'repair_after'
);


ALTER TYPE public.attachment_kind OWNER TO postgres;

--
-- Name: event_priority; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.event_priority AS ENUM (
    'department',
    'faculty',
    'university'
);


ALTER TYPE public.event_priority OWNER TO postgres;

--
-- Name: lost_found_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.lost_found_status AS ENUM (
    'lost',
    'found',
    'returned'
);


ALTER TYPE public.lost_found_status OWNER TO postgres;

--
-- Name: permission_scope; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.permission_scope AS ENUM (
    'own',
    'faculty',
    'any'
);


ALTER TYPE public.permission_scope OWNER TO postgres;

--
-- Name: post_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.post_status AS ENUM (
    'active',
    'removed'
);


ALTER TYPE public.post_status OWNER TO postgres;

--
-- Name: post_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.post_type AS ENUM (
    'general',
    'announcement',
    'event',
    'repair',
    'lost_found'
);


ALTER TYPE public.post_type OWNER TO postgres;

--
-- Name: priority_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.priority_level AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


ALTER TYPE public.priority_level OWNER TO postgres;

--
-- Name: removal_reason; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.removal_reason AS ENUM (
    'author',
    'admin',
    'moderation',
    'lost_found_expired'
);


ALTER TYPE public.removal_reason OWNER TO postgres;

--
-- Name: repair_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.repair_status AS ENUM (
    'open',
    'assigned',
    'in_progress',
    'resolved'
);


ALTER TYPE public.repair_status OWNER TO postgres;

--
-- Name: report_reason; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.report_reason AS ENUM (
    'profanity',
    'spam',
    'harassment',
    'misinformation',
    'other'
);


ALTER TYPE public.report_reason OWNER TO postgres;

--
-- Name: report_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.report_status AS ENUM (
    'reported',
    'under_review',
    'upheld',
    'content_removed',
    'dismissed'
);


ALTER TYPE public.report_status OWNER TO postgres;

--
-- Name: role_name; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.role_name AS ENUM (
    'student',
    'teacher',
    'technician',
    'building_staff',
    'student_club',
    'admin'
);


ALTER TYPE public.role_name OWNER TO postgres;

--
-- Name: violation_action; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.violation_action AS ENUM (
    'warning',
    'suspension'
);


ALTER TYPE public.violation_action OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- Name: attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attachments (
    id integer NOT NULL,
    post_id integer,
    uploaded_by integer NOT NULL,
    storage_key character varying(100) NOT NULL,
    mime_type character varying(30) NOT NULL,
    size_bytes integer NOT NULL,
    kind public.attachment_kind NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_attachments_mime_type_allowed CHECK (((mime_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/png'::character varying, 'image/webp'::character varying])::text[]))),
    CONSTRAINT ck_attachments_size_limit CHECK (((size_bytes > 0) AND (size_bytes <= 5242880)))
);


ALTER TABLE public.attachments OWNER TO postgres;

--
-- Name: attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attachments_id_seq OWNER TO postgres;

--
-- Name: attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attachments_id_seq OWNED BY public.attachments.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    actor_id integer,
    action character varying(50) NOT NULL,
    entity character varying(50) NOT NULL,
    entity_id integer,
    meta jsonb,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_verification_tokens (
    token_hash character varying(64) NOT NULL,
    user_id integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


ALTER TABLE public.email_verification_tokens OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    post_id integer NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    venue character varying(200),
    priority_level public.event_priority NOT NULL,
    CONSTRAINT ck_events_ends_after_starts CHECK (((ends_at IS NULL) OR (ends_at > starts_at)))
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: faculties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.faculties (
    id integer NOT NULL,
    code character varying(16) NOT NULL,
    name_th character varying(200) NOT NULL,
    name_en character varying(200)
);


ALTER TABLE public.faculties OWNER TO postgres;

--
-- Name: faculties_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.faculties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.faculties_id_seq OWNER TO postgres;

--
-- Name: faculties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.faculties_id_seq OWNED BY public.faculties.id;


--
-- Name: lost_found_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lost_found_items (
    post_id integer NOT NULL,
    location character varying(200) NOT NULL,
    status public.lost_found_status NOT NULL,
    occurred_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.lost_found_items OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    body text,
    link character varying(300),
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    code character varying(64) NOT NULL,
    description text
);


ALTER TABLE public.permissions OWNER TO postgres;

--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permissions_id_seq OWNER TO postgres;

--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: post_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.post_categories (
    id integer NOT NULL,
    slug character varying(50) NOT NULL,
    name_th character varying(100) NOT NULL,
    allowed_type public.post_type
);


ALTER TABLE public.post_categories OWNER TO postgres;

--
-- Name: post_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.post_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.post_categories_id_seq OWNER TO postgres;

--
-- Name: post_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.post_categories_id_seq OWNED BY public.post_categories.id;


--
-- Name: posting_suspensions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.posting_suspensions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    violation_id integer,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    reason character varying(200) NOT NULL,
    lifted_at timestamp with time zone,
    lifted_by integer,
    CONSTRAINT ck_posting_suspensions_ends_after_starts CHECK ((ends_at > starts_at))
);


ALTER TABLE public.posting_suspensions OWNER TO postgres;

--
-- Name: posting_suspensions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.posting_suspensions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.posting_suspensions_id_seq OWNER TO postgres;

--
-- Name: posting_suspensions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.posting_suspensions_id_seq OWNED BY public.posting_suspensions.id;


--
-- Name: posting_violations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.posting_violations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    previous_post_id integer NOT NULL,
    post_type public.post_type NOT NULL,
    action public.violation_action NOT NULL,
    window_seconds integer NOT NULL,
    reason character varying(200) NOT NULL,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.posting_violations OWNER TO postgres;

--
-- Name: posting_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.posting_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.posting_violations_id_seq OWNER TO postgres;

--
-- Name: posting_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.posting_violations_id_seq OWNED BY public.posting_violations.id;


--
-- Name: posts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.posts (
    id integer NOT NULL,
    type public.post_type NOT NULL,
    title character varying(150) NOT NULL,
    content text NOT NULL,
    category_id integer NOT NULL,
    author_id integer NOT NULL,
    faculty_id integer,
    priority public.priority_level NOT NULL,
    status public.post_status NOT NULL,
    pinned_at timestamp with time zone,
    pinned_until timestamp with time zone,
    pinned_by integer,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    removal_reason public.removal_reason,
    CONSTRAINT ck_posts_content_length CHECK (((char_length(content) >= 1) AND (char_length(content) <= 5000))),
    CONSTRAINT ck_posts_pin_fields_together CHECK ((((pinned_at IS NULL) = (pinned_until IS NULL)) AND ((pinned_at IS NULL) = (pinned_by IS NULL)))),
    CONSTRAINT ck_posts_pin_window_max_72h CHECK (((pinned_until IS NULL) OR ((pinned_until > pinned_at) AND (pinned_until <= (pinned_at + '72:00:00'::interval))))),
    CONSTRAINT ck_posts_title_length CHECK (((char_length((title)::text) >= 3) AND (char_length((title)::text) <= 150)))
);


ALTER TABLE public.posts OWNER TO postgres;

--
-- Name: posts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.posts_id_seq OWNER TO postgres;

--
-- Name: posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.posts_id_seq OWNED BY public.posts.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    token_hash character varying(64) NOT NULL,
    user_id integer NOT NULL,
    family_id character varying(36) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: repair_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.repair_requests (
    post_id integer NOT NULL,
    location character varying(200) NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    status public.repair_status NOT NULL,
    assigned_technician_id integer,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_repair_requests_latitude_range CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT ck_repair_requests_longitude_range CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))
);


ALTER TABLE public.repair_requests OWNER TO postgres;

--
-- Name: repair_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.repair_status_history (
    id integer NOT NULL,
    repair_id integer NOT NULL,
    from_status public.repair_status,
    to_status public.repair_status NOT NULL,
    changed_by integer,
    note character varying(500),
    changed_at timestamp with time zone NOT NULL
);


ALTER TABLE public.repair_status_history OWNER TO postgres;

--
-- Name: repair_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.repair_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.repair_status_history_id_seq OWNER TO postgres;

--
-- Name: repair_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.repair_status_history_id_seq OWNED BY public.repair_status_history.id;


--
-- Name: report_actions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_actions (
    id integer NOT NULL,
    report_id integer NOT NULL,
    admin_id integer NOT NULL,
    from_status public.report_status NOT NULL,
    to_status public.report_status NOT NULL,
    note character varying(1000),
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.report_actions OWNER TO postgres;

--
-- Name: report_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.report_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.report_actions_id_seq OWNER TO postgres;

--
-- Name: report_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.report_actions_id_seq OWNED BY public.report_actions.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    post_id integer NOT NULL,
    reporter_id integer NOT NULL,
    reason public.report_reason NOT NULL,
    detail character varying(1000),
    status public.report_status NOT NULL,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reports_id_seq OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    role_id smallint NOT NULL,
    permission_id integer NOT NULL,
    scope public.permission_scope NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    name public.role_name NOT NULL,
    weight smallint NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.roles_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_seq OWNER TO postgres;

--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: technicians; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.technicians (
    id integer NOT NULL,
    user_id integer NOT NULL,
    specialty character varying(100),
    zone character varying(100),
    is_available boolean NOT NULL
);


ALTER TABLE public.technicians OWNER TO postgres;

--
-- Name: technicians_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.technicians_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.technicians_id_seq OWNER TO postgres;

--
-- Name: technicians_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.technicians_id_seq OWNED BY public.technicians.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email public.citext NOT NULL,
    password_hash text,
    display_name character varying(60) NOT NULL,
    role_id smallint NOT NULL,
    faculty_id integer,
    is_verified boolean NOT NULL,
    is_active boolean NOT NULL,
    token_version integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    supabase_user_id uuid,
    posting_suspended_until timestamp with time zone,
    year_of_study smallint,
    profile_completed_at timestamp with time zone,
    CONSTRAINT ck_users_email_up_domain CHECK ((email OPERATOR(public.~*) '^[A-Za-z0-9._%+-]+@up\.ac\.th$'::public.citext)),
    CONSTRAINT ck_users_year_of_study_range CHECK (((year_of_study >= 1) AND (year_of_study <= 8)))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: attachments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments ALTER COLUMN id SET DEFAULT nextval('public.attachments_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: faculties id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.faculties ALTER COLUMN id SET DEFAULT nextval('public.faculties_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: post_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_categories ALTER COLUMN id SET DEFAULT nextval('public.post_categories_id_seq'::regclass);


--
-- Name: posting_suspensions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_suspensions ALTER COLUMN id SET DEFAULT nextval('public.posting_suspensions_id_seq'::regclass);


--
-- Name: posting_violations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_violations ALTER COLUMN id SET DEFAULT nextval('public.posting_violations_id_seq'::regclass);


--
-- Name: posts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass);


--
-- Name: repair_status_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_status_history ALTER COLUMN id SET DEFAULT nextval('public.repair_status_history_id_seq'::regclass);


--
-- Name: report_actions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_actions ALTER COLUMN id SET DEFAULT nextval('public.report_actions_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: technicians id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.technicians ALTER COLUMN id SET DEFAULT nextval('public.technicians_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alembic_version (version_num) FROM stdin;
0003
\.


--
-- Data for Name: attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attachments (id, post_id, uploaded_by, storage_key, mime_type, size_bytes, kind, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, actor_id, action, entity, entity_id, meta, created_at) FROM stdin;
1	9	user.register_google	user	9	null	2026-10-09 15:59:39.83582+00
2	9	user.login_google	user	9	null	2026-10-09 17:32:38.325573+00
3	9	user.login_google	user	9	null	2026-10-09 17:34:22.670414+00
\.


--
-- Data for Name: email_verification_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_verification_tokens (token_hash, user_id, expires_at, used_at) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.events (post_id, starts_at, ends_at, venue, priority_level) FROM stdin;
1	2026-10-08 15:43:03.77993+00	\N	อาคาร ICT ห้อง 1101	faculty
\.


--
-- Data for Name: faculties; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.faculties (id, code, name_th, name_en) FROM stdin;
1	CENTRAL	ส่วนกลางมหาวิทยาลัย / กองอาคารสถานที่	Central Administration / Facilities
2	AGRI	คณะเกษตรศาสตร์และทรัพยากรธรรมชาติ	School of Agriculture and Natural Resources
3	SENV	คณะพลังงานและสิ่งแวดล้อม	School of Energy and Environment
4	ICT	คณะเทคโนโลยีสารสนเทศและการสื่อสาร	School of Information and Communication Technology
5	LAW	คณะนิติศาสตร์	School of Law
6	BUSCOM	คณะบริหารธุรกิจและนิเทศศาสตร์	School of Business and Communication Arts
7	NURSE	คณะพยาบาลศาสตร์	School of Nursing
8	MED	คณะแพทยศาสตร์	School of Medicine
9	DENT	คณะทันตแพทยศาสตร์	School of Dentistry
10	PHARM	คณะเภสัชศาสตร์	School of Pharmaceutical Sciences
11	SCI	คณะวิทยาศาสตร์	School of Science
12	MEDSCI	คณะวิทยาศาสตร์การแพทย์	School of Medical Sciences
13	ENG	คณะวิศวกรรมศาสตร์	School of Engineering
14	LA	คณะศิลปศาสตร์	School of Liberal Arts
15	ARCH	คณะสถาปัตยกรรมศาสตร์และศิลปกรรมศาสตร์	School of Architecture and Fine Arts
16	AHS	คณะสหเวชศาสตร์	School of Allied Health Sciences
17	PH	คณะสาธารณสุขศาสตร์	School of Public Health
18	POLSCI	คณะรัฐศาสตร์และสังคมศาสตร์	School of Political and Social Sciences
19	EDU	วิทยาลัยการศึกษา	School of Education
\.


--
-- Data for Name: lost_found_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lost_found_items (post_id, location, status, occurred_at, updated_at) FROM stdin;
6	โรงอาหารกลาง (CE)	lost	\N	2026-10-05 15:43:03.940686+00
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, type, title, body, link, read_at, created_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.permissions (id, code, description) FROM stdin;
2	post:update	Edit posts
3	post:delete	Soft-delete posts
5	post:priority_urgent	Use the 'urgent' priority
6	repair:create	Create repair requests
7	repair:read_private	See reporter, GPS, technician and internal notes of repairs
10	lost_found:create	Create lost & found posts
11	lost_found:update_status	Change lost & found status
12	report:create	Report a post to moderators
13	report:manage	Review reports and remove content
14	user:manage	Manage users, roles and faculties
15	technician:list	List technicians
4	post:pin	Pin own posts (student_club: one active pin, events 3 days before the start)
8	repair:update_status	Change the status of any repair (building staff)
9	repair:assign	Assign / reassign technicians to repairs
1	post:create	Create general posts
16	post:announce	Create announcements
17	post:create_event	Create events
18	post:set_priority	Choose the priority of own posts (otherwise always 'normal')
19	repair:set_priority	Set the urgency of repair requests (reporters cannot)
\.


--
-- Data for Name: post_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.post_categories (id, slug, name_th, allowed_type) FROM stdin;
1	activities	กิจกรรม	\N
2	urgent	เรื่องเร่งด่วน	\N
3	recommendations	บอกต่อของดี	\N
4	general	ประกาศทั่วไป	\N
5	lost-found	ของหาย / พบของ	lost_found
6	repair	แจ้งซ่อม	repair
\.


--
-- Data for Name: posting_suspensions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.posting_suspensions (id, user_id, violation_id, starts_at, ends_at, reason, lifted_at, lifted_by) FROM stdin;
\.


--
-- Data for Name: posting_violations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.posting_violations (id, user_id, previous_post_id, post_type, action, window_seconds, reason, created_at) FROM stdin;
\.


--
-- Data for Name: posts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.posts (id, type, title, content, category_id, author_id, faculty_id, priority, status, pinned_at, pinned_until, pinned_by, created_at, updated_at, deleted_at, removal_reason) FROM stdin;
2	general	ปิดถนนหน้าหอประชุมพญางำเมือง	งดใช้ถนนหน้าหอประชุมชั่วคราวเนื่องจากซ่อมท่อประปา กรุณาใช้เส้นทางเลี่ยง	2	4	1	urgent	active	\N	\N	\N	2026-10-05 10:43:03.77993+00	2026-10-05 15:43:03.829171+00	\N	\N
3	general	ร้านข้าวมันไก่หน้ามอ อร่อยมาก	แนะนำร้านข้าวมันไก่ตรงข้ามประตูหน้า ราคานิสิต อิ่มคุ้ม	3	2	4	normal	active	\N	\N	\N	2026-10-05 14:43:03.77993+00	2026-10-05 15:43:03.839909+00	\N	\N
4	general	ประกาศเก่า (เกิน 24 ชม.)	โพสต์นี้ไม่แสดงบนหน้าแรกแล้ว แต่ยังค้นหาได้ในหน้าหมวดหมู่	4	2	4	normal	active	\N	\N	\N	2026-10-04 09:43:03.77993+00	2026-10-05 15:43:03.843889+00	\N	\N
5	repair	กระเบื้องทางเดินแตก มีน้ำขัง	ทางเดินเชื่อมอาคาร ICT ชั้น 1 กระเบื้องแตกและมีน้ำขัง เสี่ยงลื่นล้ม	6	2	4	high	active	\N	\N	\N	2026-10-05 15:03:03.77993+00	2026-10-05 15:43:03.854195+00	\N	\N
6	lost_found	ทำบัตรนิสิตหาย	ทำบัตรนิสิตหายแถวโรงอาหารกลาง ใครพบรบกวนติดต่อกลับด้วยครับ	5	2	4	normal	active	\N	\N	\N	2026-10-05 12:43:03.77993+00	2026-10-05 15:43:03.915512+00	\N	\N
1	event	ICT Open House 2026	ขอเชิญนิสิตทุกชั้นปีร่วมงาน Open House คณะ ICT พบกับนิทรรศการโปรเจกต์และกิจกรรมมากมาย	1	3	4	high	active	\N	\N	\N	2026-10-05 13:43:03.77993+00	2026-10-05 15:43:03.787522+00	\N	\N
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (token_hash, user_id, family_id, expires_at, revoked_at, created_at) FROM stdin;
6fbc44cfaa57dcea61014870b5ead8451cb37c279b96e9fba14229a80ec9d222	6	5e86472b-8257-4f6b-88ae-2d8eda82aa8a	2026-10-12 15:52:08.934823+00	2026-10-09 15:14:19.030751+00	2026-10-05 15:52:08.975805+00
d94404dd336044d8c26f58c5df0c790a8d235292b8500b6e16fa3af930f6e5b3	6	5e86472b-8257-4f6b-88ae-2d8eda82aa8a	2026-10-16 15:14:19.206649+00	2026-10-09 15:14:34.173133+00	2026-10-09 15:14:19.21026+00
97228ea3c4fb89ae4f99c76f99d62d885ef72dc0ab93626e705e24c9fd5c0d38	9	862bd97e-e51f-4c0e-96eb-8cfc1d0acbc0	2026-10-16 15:59:39.831976+00	2026-10-09 16:10:35.58496+00	2026-10-09 15:59:39.854511+00
366778121571a52596dbb972c6dfa8836718165861a1fa173a6e26944811c136	2	93390561-8887-403b-b3a3-a9d984a54d57	2026-10-16 16:10:34.150825+00	2026-10-09 16:10:37.128181+00	2026-10-09 16:10:34.158772+00
47f2b647df1803ef572079bd13a412d99770dd9e426a256ccba9b8dfb0744f28	9	862bd97e-e51f-4c0e-96eb-8cfc1d0acbc0	2026-10-16 16:10:35.662914+00	2026-10-09 16:14:33.005854+00	2026-10-09 16:10:35.673577+00
45599d51ae35198cd5b23307460a2ce59b288f9ba55f2f4b4e525a11e4d67930	9	862bd97e-e51f-4c0e-96eb-8cfc1d0acbc0	2026-10-16 16:14:33.017457+00	2026-10-09 16:14:34.072315+00	2026-10-09 16:14:33.019112+00
fe3b198d8b53674bc310fd0156a8b0ea862b033e73bf6cd1454d4acfa519bca6	9	862bd97e-e51f-4c0e-96eb-8cfc1d0acbc0	2026-10-16 16:14:34.081403+00	2026-10-09 16:14:34.430679+00	2026-10-09 16:14:34.082999+00
14de629fdafd644963bf93c52aac38ce7ded6e55237778eaee14bb90cf35e01e	2	93390561-8887-403b-b3a3-a9d984a54d57	2026-10-16 16:10:37.140088+00	2026-10-09 16:26:37.563817+00	2026-10-09 16:10:37.143007+00
f2601b777b475346d0054177bcbaea87a4132ea1fad0fb54398a4e4463517e72	2	93390561-8887-403b-b3a3-a9d984a54d57	2026-10-16 16:26:37.614833+00	2026-10-09 16:42:38.438837+00	2026-10-09 16:26:37.649969+00
a49300af796b22cef194972161c14ca9399b7ed5f3389ca231d4292643507cdc	2	93390561-8887-403b-b3a3-a9d984a54d57	2026-10-16 16:42:38.483864+00	\N	2026-10-09 16:42:38.506457+00
8ffc9213d1d6cf6fdeb38fcff4ebcc1c112bac3a9a166c70e0eb4655c5ff0cc2	9	862bd97e-e51f-4c0e-96eb-8cfc1d0acbc0	2026-10-16 16:14:34.436106+00	2026-10-09 17:32:27.842349+00	2026-10-09 16:14:34.437753+00
7034ba330f1a9fbdc4c91f1a5b3588c85e1db19fe0e77017844789523b96d03b	9	862bd97e-e51f-4c0e-96eb-8cfc1d0acbc0	2026-10-16 17:32:31.317533+00	2026-10-09 17:32:36.602172+00	2026-10-09 17:32:32.409766+00
0d34c11113fabecd2f03a9a1244caf47b089e7db8e06285dbd83b0f6a02393bb	9	862bd97e-e51f-4c0e-96eb-8cfc1d0acbc0	2026-10-16 17:32:36.645283+00	\N	2026-10-09 17:32:36.649199+00
8fcddbd9e7dd6254f35f2fb169e53021d9df59eb6eeec354a97312477711f3af	9	b685f181-0b8b-4c40-94bc-9aa3fd57ccee	2026-10-16 17:32:38.321729+00	2026-10-09 17:32:47.238987+00	2026-10-09 17:32:38.338083+00
2bc0a4001629caaf581191730d018d37ed0d291677a548ec09bb1f1ba4026506	7	0eb77164-2b95-4fed-938f-bcbed997c8d1	2026-10-16 17:34:04.972+00	2026-10-09 17:34:14.899838+00	2026-10-09 17:34:04.97429+00
ae26be52e4660b85dbaa741b0169aeafaad44c83abcc21f479e51fb065900822	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:34:22.66946+00	2026-10-09 17:55:33.178752+00	2026-10-09 17:34:22.680514+00
82df4798f99fbcbffbde8be435b8897b65b2a5d9bb7b5db563ccef7448451079	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:55:33.323946+00	2026-10-09 17:55:35.472541+00	2026-10-09 17:55:33.337491+00
f5a23d007fbc4e6c20b7d83bb6b3f35c4a1c5b2bf470887c7431e41ac4a188a0	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:55:35.494415+00	2026-10-09 17:55:36.650696+00	2026-10-09 17:55:35.496303+00
d5ba47a02af36a2d56f084899b8a1b69104c1a9df1e6bd6ebcd7f3def9c944cc	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:55:36.659117+00	2026-10-09 17:55:37.481966+00	2026-10-09 17:55:36.660875+00
f61ed79cda602e05ec6acc11847e8e931c42fa6521b9bb1453b2573e437f87d6	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:55:37.4898+00	2026-10-09 17:55:38.360566+00	2026-10-09 17:55:37.491277+00
3cfff3a6af522cee20e3893d02aab52f726d43a0023c3f5ec350c978290533ba	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:55:38.369374+00	2026-10-09 17:55:46.845696+00	2026-10-09 17:55:38.37085+00
d0f0d29dc7fc3452f723f53c864971ef358bf4d4c891cd6b668e4f52cf0301a5	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:55:46.854675+00	2026-10-09 17:56:13.208267+00	2026-10-09 17:55:46.856172+00
664a9d08c0ab769972528a73a2b8b28fd78748593800542fa35d83c97bdeccf8	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:56:13.220655+00	2026-10-09 17:56:14.010431+00	2026-10-09 17:56:13.222217+00
a2b2b0a84217da4a20e2dc9af95bb88937ea4ce91ec99e15edd1cd914f4f7685	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:56:14.017847+00	2026-10-09 17:56:15.887472+00	2026-10-09 17:56:14.01964+00
f55687e2d539c394ed33e564545f85b06222b7a84e26a4f569f242f318ea55ee	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:56:15.896224+00	2026-10-09 17:56:23.762947+00	2026-10-09 17:56:15.90238+00
952b0ae1236382a24d3acb67cc50bec7fc5699fc19ce9667778df554306b7527	9	9995c4e2-f6b2-4a3d-872e-7061e380bba1	2026-10-16 17:56:23.771043+00	\N	2026-10-09 17:56:23.772685+00
\.


--
-- Data for Name: repair_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.repair_requests (post_id, location, latitude, longitude, status, assigned_technician_id, updated_at) FROM stdin;
5	ทางเดินเชื่อมอาคาร ICT ชั้น 1	\N	\N	open	\N	2026-10-05 15:43:03.904961+00
\.


--
-- Data for Name: repair_status_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.repair_status_history (id, repair_id, from_status, to_status, changed_by, note, changed_at) FROM stdin;
1	5	\N	open	2	\N	2026-10-05 15:43:03.919876+00
\.


--
-- Data for Name: report_actions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.report_actions (id, report_id, admin_id, from_status, to_status, note, created_at) FROM stdin;
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reports (id, post_id, reporter_id, reason, detail, status, created_at) FROM stdin;
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_permissions (role_id, permission_id, scope) FROM stdin;
1	1	any
1	2	own
1	3	own
1	6	any
1	7	own
1	10	any
1	11	own
1	12	any
3	1	any
3	2	any
3	3	any
3	5	any
3	6	any
3	7	any
3	10	any
3	11	any
3	12	any
3	13	any
3	14	any
3	15	any
4	1	any
4	2	own
4	3	own
4	6	any
4	7	own
4	10	any
4	11	own
4	12	any
4	5	any
5	1	any
5	2	own
5	3	own
5	6	any
5	7	own
5	10	any
5	11	own
5	12	any
6	1	any
6	2	own
6	3	own
6	6	any
6	7	any
6	10	any
6	11	own
6	12	any
6	5	any
6	8	any
6	9	any
6	15	any
7	2	own
7	3	own
7	6	any
7	7	own
7	10	any
7	11	own
7	12	any
7	4	own
1	18	any
4	18	any
4	16	any
4	17	any
5	18	any
6	18	any
6	16	any
6	17	any
6	19	any
7	17	any
3	18	any
3	16	any
3	17	any
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, weight) FROM stdin;
1	student	0
3	admin	15
4	teacher	5
5	technician	0
6	building_staff	10
7	student_club	5
\.


--
-- Data for Name: technicians; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.technicians (id, user_id, specialty, zone, is_available) FROM stdin;
1	5	ไฟฟ้า / ประปา	โซน ICT - ตึก PKY	t
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, display_name, role_id, faculty_id, is_verified, is_active, token_version, created_at, supabase_user_id, posting_suspended_until, year_of_study, profile_completed_at) FROM stdin;
9	67024830@up.ac.th	\N	PEERADA SOMTEM	1	4	t	t	0	2026-10-09 15:59:39.804923+00	a9bc564b-9085-434a-ae55-03b8804f9f09	\N	\N	\N
1	admin@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$b4DqRGJZ5v33BA49xV+vsg$/OFzIdl7Bcug1qRBPHrrRR2lN3SNH7mJDYG/hQogrBs	ผู้ดูแลระบบ	3	1	t	t	0	2026-10-05 15:43:02.55435+00	\N	\N	\N	2026-10-05 15:43:02.55435+00
6	demo.admin@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$fIxX8rTEB4DHyOP0ywgRFg$SwnsS59/g0dzq4sAxLKLdLatYIqKJoe2YfYMIwPv7xs	สมชาย มั่นคง	3	1	t	t	0	2026-10-05 15:43:03.71571+00	\N	\N	\N	2026-10-05 15:43:03.71571+00
5	demo.technician@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$nVOsYfridJyr9ae1Brj2eQ$yPQcjLH80L4q6xsODfUHPv6/pnHjppLGj+aU+q6rk1A	วิชัย ช่างทอง	5	1	t	t	0	2026-10-05 15:43:03.52328+00	\N	\N	\N	2026-10-05 15:43:03.52328+00
7	demo.teacher@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$nWhbigpsHC5OzRb8UhgRCA$JbtU/jV6GcWproPqBpsjXnPbs6DdnytgfJ5RGx7NIiQ	อาจารย์ ICT	4	4	t	t	0	2026-10-09 15:13:46.014882+00	\N	\N	\N	2026-10-09 15:13:46.014882+00
4	demo.facilities@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$+bJtJWsWlwpUP7cG673tqg$eK8/rv5OUotk9qpU4RZ85X8iDhbhGdewyKqcS/OGe74	อาทร ศรีสุข	6	1	t	t	0	2026-10-05 15:43:03.328793+00	\N	\N	\N	2026-10-05 15:43:03.328793+00
8	demo.club@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$vEs2yxUp9AEhfQr5HdXsmw$aX6Mx4F7nZYawjcQxQuP+oLJDuKkdfKucdruq8oxTkA	สโมสรนิสิต ICT	7	4	t	t	0	2026-10-09 15:13:46.13313+00	\N	\N	\N	2026-10-09 15:13:46.13313+00
3	demo.staff@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$o5/RersGVvWwMINyoZwGBA$COpKavPur3vkW72xlFoFAke2rDcM2ScwXHyyC4FT2IU	อาจารย์ ICT	4	4	t	t	0	2026-10-05 15:43:03.152028+00	\N	\N	\N	2026-10-05 15:43:03.152028+00
2	demo.student@up.ac.th	$argon2id$v=19$m=19456,t=2,p=1$fEBaTD7Ej8uOh79kIqMtuA$/L3t96Xg2kH8E8c4iOYLgyXmtp57QY7TN/ybBXOqId0	อานนท์ สายรุ้ง	1	4	t	t	0	2026-10-05 15:43:02.794307+00	\N	\N	2	2026-10-05 15:43:02.794307+00
\.


--
-- Name: attachments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attachments_id_seq', 1, false);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 3, true);


--
-- Name: faculties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.faculties_id_seq', 19, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.permissions_id_seq', 19, true);


--
-- Name: post_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.post_categories_id_seq', 6, true);


--
-- Name: posting_suspensions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.posting_suspensions_id_seq', 1, false);


--
-- Name: posting_violations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.posting_violations_id_seq', 1, false);


--
-- Name: posts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.posts_id_seq', 6, true);


--
-- Name: repair_status_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.repair_status_history_id_seq', 1, true);


--
-- Name: report_actions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.report_actions_id_seq', 1, false);


--
-- Name: reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reports_id_seq', 1, false);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roles_id_seq', 1, false);


--
-- Name: technicians_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.technicians_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 9, true);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: events ck_events_ends_at_required; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.events
    ADD CONSTRAINT ck_events_ends_at_required CHECK ((ends_at IS NOT NULL)) NOT VALID;


--
-- Name: attachments pk_attachments; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT pk_attachments PRIMARY KEY (id);


--
-- Name: audit_logs pk_audit_logs; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT pk_audit_logs PRIMARY KEY (id);


--
-- Name: email_verification_tokens pk_email_verification_tokens; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT pk_email_verification_tokens PRIMARY KEY (token_hash);


--
-- Name: events pk_events; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT pk_events PRIMARY KEY (post_id);


--
-- Name: faculties pk_faculties; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.faculties
    ADD CONSTRAINT pk_faculties PRIMARY KEY (id);


--
-- Name: lost_found_items pk_lost_found_items; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lost_found_items
    ADD CONSTRAINT pk_lost_found_items PRIMARY KEY (post_id);


--
-- Name: notifications pk_notifications; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT pk_notifications PRIMARY KEY (id);


--
-- Name: permissions pk_permissions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT pk_permissions PRIMARY KEY (id);


--
-- Name: post_categories pk_post_categories; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_categories
    ADD CONSTRAINT pk_post_categories PRIMARY KEY (id);


--
-- Name: posting_suspensions pk_posting_suspensions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_suspensions
    ADD CONSTRAINT pk_posting_suspensions PRIMARY KEY (id);


--
-- Name: posting_violations pk_posting_violations; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_violations
    ADD CONSTRAINT pk_posting_violations PRIMARY KEY (id);


--
-- Name: posts pk_posts; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT pk_posts PRIMARY KEY (id);


--
-- Name: refresh_tokens pk_refresh_tokens; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT pk_refresh_tokens PRIMARY KEY (token_hash);


--
-- Name: repair_requests pk_repair_requests; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_requests
    ADD CONSTRAINT pk_repair_requests PRIMARY KEY (post_id);


--
-- Name: repair_status_history pk_repair_status_history; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_status_history
    ADD CONSTRAINT pk_repair_status_history PRIMARY KEY (id);


--
-- Name: report_actions pk_report_actions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_actions
    ADD CONSTRAINT pk_report_actions PRIMARY KEY (id);


--
-- Name: reports pk_reports; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT pk_reports PRIMARY KEY (id);


--
-- Name: role_permissions pk_role_permissions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id);


--
-- Name: roles pk_roles; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT pk_roles PRIMARY KEY (id);


--
-- Name: technicians pk_technicians; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT pk_technicians PRIMARY KEY (id);


--
-- Name: users pk_users; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT pk_users PRIMARY KEY (id);


--
-- Name: attachments uq_attachments_storage_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT uq_attachments_storage_key UNIQUE (storage_key);


--
-- Name: faculties uq_faculties_code; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.faculties
    ADD CONSTRAINT uq_faculties_code UNIQUE (code);


--
-- Name: permissions uq_permissions_code; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT uq_permissions_code UNIQUE (code);


--
-- Name: post_categories uq_post_categories_slug; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_categories
    ADD CONSTRAINT uq_post_categories_slug UNIQUE (slug);


--
-- Name: posting_violations uq_posting_violations_user_anchor; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_violations
    ADD CONSTRAINT uq_posting_violations_user_anchor UNIQUE (user_id, previous_post_id);


--
-- Name: reports uq_reports_post_reporter; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT uq_reports_post_reporter UNIQUE (post_id, reporter_id);


--
-- Name: roles uq_roles_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT uq_roles_name UNIQUE (name);


--
-- Name: technicians uq_technicians_user_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT uq_technicians_user_id UNIQUE (user_id);


--
-- Name: users uq_users_email; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_users_email UNIQUE (email);


--
-- Name: users uq_users_supabase_user_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_users_supabase_user_id UNIQUE (supabase_user_id);


--
-- Name: ix_attachments_post_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_attachments_post_id ON public.attachments USING btree (post_id);


--
-- Name: ix_attachments_uploaded_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_attachments_uploaded_by ON public.attachments USING btree (uploaded_by);


--
-- Name: ix_audit_logs_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: ix_audit_logs_actor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_audit_logs_actor_id ON public.audit_logs USING btree (actor_id);


--
-- Name: ix_email_verification_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_email_verification_tokens_user_id ON public.email_verification_tokens USING btree (user_id);


--
-- Name: ix_events_ends_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_events_ends_at ON public.events USING btree (ends_at);


--
-- Name: ix_events_starts_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_events_starts_at ON public.events USING btree (starts_at);


--
-- Name: ix_lost_found_items_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_lost_found_items_status ON public.lost_found_items USING btree (status);


--
-- Name: ix_notifications_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_notifications_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: ix_notifications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: ix_posting_suspensions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posting_suspensions_user_id ON public.posting_suspensions USING btree (user_id);


--
-- Name: ix_posting_violations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posting_violations_user_id ON public.posting_violations USING btree (user_id);


--
-- Name: ix_posts_author_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_author_created_at ON public.posts USING btree (author_id, created_at DESC);


--
-- Name: ix_posts_author_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_author_id ON public.posts USING btree (author_id);


--
-- Name: ix_posts_category_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_category_created_at ON public.posts USING btree (category_id, created_at DESC);


--
-- Name: ix_posts_faculty_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_faculty_id ON public.posts USING btree (faculty_id);


--
-- Name: ix_posts_pinned_until; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_pinned_until ON public.posts USING btree (pinned_until) WHERE (pinned_until IS NOT NULL);


--
-- Name: ix_posts_search; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_search ON public.posts USING gin (to_tsvector('simple'::regconfig, (((title)::text || ' '::text) || content)));


--
-- Name: ix_posts_status_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_status_created_at ON public.posts USING btree (status, created_at DESC);


--
-- Name: ix_posts_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_posts_type ON public.posts USING btree (type);


--
-- Name: ix_refresh_tokens_family_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_refresh_tokens_family_id ON public.refresh_tokens USING btree (family_id);


--
-- Name: ix_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: ix_repair_requests_assigned_technician_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_repair_requests_assigned_technician_id ON public.repair_requests USING btree (assigned_technician_id);


--
-- Name: ix_repair_requests_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_repair_requests_status ON public.repair_requests USING btree (status);


--
-- Name: ix_repair_status_history_repair_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_repair_status_history_repair_id ON public.repair_status_history USING btree (repair_id);


--
-- Name: ix_report_actions_report_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_report_actions_report_id ON public.report_actions USING btree (report_id);


--
-- Name: ix_reports_post_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reports_post_id ON public.reports USING btree (post_id);


--
-- Name: ix_reports_reporter_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reports_reporter_id ON public.reports USING btree (reporter_id);


--
-- Name: ix_reports_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_reports_status ON public.reports USING btree (status);


--
-- Name: uq_posts_pinned_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_posts_pinned_by ON public.posts USING btree (pinned_by) WHERE (pinned_by IS NOT NULL);


--
-- Name: attachments fk_attachments_post_id_posts; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT fk_attachments_post_id_posts FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: attachments fk_attachments_uploaded_by_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT fk_attachments_uploaded_by_users FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: audit_logs fk_audit_logs_actor_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT fk_audit_logs_actor_id_users FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: email_verification_tokens fk_email_verification_tokens_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT fk_email_verification_tokens_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: events fk_events_post_id_posts; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT fk_events_post_id_posts FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: lost_found_items fk_lost_found_items_post_id_posts; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lost_found_items
    ADD CONSTRAINT fk_lost_found_items_post_id_posts FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: notifications fk_notifications_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notifications_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: posting_suspensions fk_posting_suspensions_lifted_by_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_suspensions
    ADD CONSTRAINT fk_posting_suspensions_lifted_by_users FOREIGN KEY (lifted_by) REFERENCES public.users(id);


--
-- Name: posting_suspensions fk_posting_suspensions_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_suspensions
    ADD CONSTRAINT fk_posting_suspensions_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: posting_suspensions fk_posting_suspensions_violation_id_posting_violations; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_suspensions
    ADD CONSTRAINT fk_posting_suspensions_violation_id_posting_violations FOREIGN KEY (violation_id) REFERENCES public.posting_violations(id) ON DELETE SET NULL;


--
-- Name: posting_violations fk_posting_violations_previous_post_id_posts; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_violations
    ADD CONSTRAINT fk_posting_violations_previous_post_id_posts FOREIGN KEY (previous_post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: posting_violations fk_posting_violations_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posting_violations
    ADD CONSTRAINT fk_posting_violations_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: posts fk_posts_author_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT fk_posts_author_id_users FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: posts fk_posts_category_id_post_categories; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT fk_posts_category_id_post_categories FOREIGN KEY (category_id) REFERENCES public.post_categories(id);


--
-- Name: posts fk_posts_faculty_id_faculties; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT fk_posts_faculty_id_faculties FOREIGN KEY (faculty_id) REFERENCES public.faculties(id);


--
-- Name: posts fk_posts_pinned_by_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT fk_posts_pinned_by_users FOREIGN KEY (pinned_by) REFERENCES public.users(id);


--
-- Name: refresh_tokens fk_refresh_tokens_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: repair_requests fk_repair_requests_assigned_technician_id_technicians; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_requests
    ADD CONSTRAINT fk_repair_requests_assigned_technician_id_technicians FOREIGN KEY (assigned_technician_id) REFERENCES public.technicians(id);


--
-- Name: repair_requests fk_repair_requests_post_id_posts; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_requests
    ADD CONSTRAINT fk_repair_requests_post_id_posts FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: repair_status_history fk_repair_status_history_changed_by_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_status_history
    ADD CONSTRAINT fk_repair_status_history_changed_by_users FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: repair_status_history fk_repair_status_history_repair_id_repair_requests; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.repair_status_history
    ADD CONSTRAINT fk_repair_status_history_repair_id_repair_requests FOREIGN KEY (repair_id) REFERENCES public.repair_requests(post_id) ON DELETE CASCADE;


--
-- Name: report_actions fk_report_actions_admin_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_actions
    ADD CONSTRAINT fk_report_actions_admin_id_users FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- Name: report_actions fk_report_actions_report_id_reports; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_actions
    ADD CONSTRAINT fk_report_actions_report_id_reports FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: reports fk_reports_post_id_posts; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_post_id_posts FOREIGN KEY (post_id) REFERENCES public.posts(id);


--
-- Name: reports fk_reports_reporter_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_reporter_id_users FOREIGN KEY (reporter_id) REFERENCES public.users(id);


--
-- Name: role_permissions fk_role_permissions_permission_id_permissions; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT fk_role_permissions_permission_id_permissions FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions fk_role_permissions_role_id_roles; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT fk_role_permissions_role_id_roles FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: technicians fk_technicians_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT fk_technicians_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users fk_users_faculty_id_faculties; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_faculty_id_faculties FOREIGN KEY (faculty_id) REFERENCES public.faculties(id);


--
-- Name: users fk_users_role_id_roles; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_role_id_roles FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: alembic_version; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY;

--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_verification_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: faculties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.faculties ENABLE ROW LEVEL SECURITY;

--
-- Name: lost_found_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lost_found_items ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: post_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.post_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: posting_suspensions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.posting_suspensions ENABLE ROW LEVEL SECURITY;

--
-- Name: posting_violations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.posting_violations ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: repair_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.repair_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: report_actions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.report_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: technicians; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict o7mnDXnFyY1kskgqNXLog7c6vWcrWhepoc3BCqhWNoVHOhYAvH02DROugo6HFhR

