BEGIN;

-- 1. Add an 'admin' role so the Admin page has an account type (existing values untouched).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- 2. New status type for moderation reports.
DO $$
BEGIN
    CREATE TYPE report_status AS ENUM ('open', 'dismissed', 'actioned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Reusable function that keeps updated_at accurate on every edit.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

-- 4. NEW TABLE: users (own login). Stores a password HASH only, never a plain password.
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,

    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_id_role_key UNIQUE (id, role),

    CONSTRAINT users_email_format
        CHECK (email = LOWER(TRIM(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

    -- Accepts only bcrypt ($2a$/$2b$/$2y$) or argon2 hashes, so plain text is rejected.
    CONSTRAINT users_password_hash_format
        CHECK (password_hash ~ '^\$(2[aby]|argon2(id|i|d))\$')
);

-- 5. Keep updated_at current on the tables whose pages edit data.
CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_business_ideas_updated_at
    BEFORE UPDATE ON public.business_ideas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_idea_interests_updated_at
    BEFORE UPDATE ON public.idea_interests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_connections_updated_at
    BEFORE UPDATE ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Remove the link from user_profiles to Supabase auth.users (constraint only, no data touched).
DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT conname INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'public.user_profiles'::regclass
      AND contype = 'f'
      AND confrelid = 'auth.users'::regclass;

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT %I', fk_name);
    END IF;
END $$;

-- 7. Link user_profiles 1:1 to users (same id) and force the roles to match.
--    NOT VALID = existing rows are not checked, so this cannot fail on old data.
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_id_role_key UNIQUE (id, role);

ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_user_fk
    FOREIGN KEY (id, role) REFERENCES public.users (id, role)
    ON DELETE CASCADE NOT VALID;

-- 8. Entrepreneur profiles can only belong to users whose role is 'entrepreneur'.
ALTER TABLE public.entrepreneur_profiles
    ADD COLUMN role user_role NOT NULL DEFAULT 'entrepreneur';

ALTER TABLE public.entrepreneur_profiles
    ADD CONSTRAINT entrepreneur_profiles_role_check CHECK (role = 'entrepreneur'),
    ADD CONSTRAINT entrepreneur_profiles_user_role_fk
    FOREIGN KEY (user_id, role) REFERENCES public.user_profiles (id, role)
    ON DELETE CASCADE NOT VALID;

-- 9. Investor profiles can only belong to users whose role is 'investor'.
ALTER TABLE public.investor_profiles
    ADD COLUMN role user_role NOT NULL DEFAULT 'investor';

ALTER TABLE public.investor_profiles
    ADD CONSTRAINT investor_profiles_role_check CHECK (role = 'investor'),
    ADD CONSTRAINT investor_profiles_user_role_fk
    FOREIGN KEY (user_id, role) REFERENCES public.user_profiles (id, role)
    ON DELETE CASCADE NOT VALID;

-- 10. NEW TABLE: idea_reports (the "Reported" flags and reasons on the Admin page).
CREATE TABLE IF NOT EXISTS public.idea_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    idea_id UUID NOT NULL
        REFERENCES public.business_ideas(id)
        ON DELETE CASCADE,

    reported_by UUID
        REFERENCES public.users(id)
        ON DELETE SET NULL,

    reason TEXT NOT NULL
        CHECK (LENGTH(TRIM(reason)) > 0),

    status report_status NOT NULL DEFAULT 'open',

    resolved_by UUID
        REFERENCES public.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    CONSTRAINT idea_reports_resolution_consistent
        CHECK (
            (status = 'open' AND resolved_at IS NULL)
            OR (status <> 'open' AND resolved_at IS NOT NULL)
        )
);

-- 11. Rule: only the idea's owner or the interested investor can start a connection.
CREATE OR REPLACE FUNCTION public.check_connection_initiator()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_entrepreneur_user UUID;
    v_investor_user UUID;
BEGIN
    SELECT ep.user_id, ip.user_id
    INTO v_entrepreneur_user, v_investor_user
    FROM public.idea_interests i
    JOIN public.business_ideas b ON b.id = i.idea_id
    JOIN public.entrepreneur_profiles ep ON ep.id = b.entrepreneur_id
    JOIN public.investor_profiles ip ON ip.id = i.investor_id
    WHERE i.id = NEW.interest_id;

    IF NEW.initiated_by NOT IN (v_entrepreneur_user, v_investor_user) THEN
        RAISE EXCEPTION 'initiated_by must be the idea owner or the interested investor';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_connections_initiator
    BEFORE INSERT ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.check_connection_initiator();

-- 12. Rule: only the two people in an ACCEPTED connection can send messages (matches the Chat page).
CREATE OR REPLACE FUNCTION public.check_message_rules()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_status connection_status;
    v_entrepreneur_user UUID;
    v_investor_user UUID;
BEGIN
    SELECT c.status, ep.user_id, ip.user_id
    INTO v_status, v_entrepreneur_user, v_investor_user
    FROM public.connections c
    JOIN public.idea_interests i ON i.id = c.interest_id
    JOIN public.business_ideas b ON b.id = i.idea_id
    JOIN public.entrepreneur_profiles ep ON ep.id = b.entrepreneur_id
    JOIN public.investor_profiles ip ON ip.id = i.investor_id
    WHERE c.id = NEW.connection_id;

    IF v_status IS DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'Messages can only be sent in accepted connections';
    END IF;
    IF NEW.sender_id NOT IN (v_entrepreneur_user, v_investor_user) THEN
        RAISE EXCEPTION 'sender_id must be a participant of this connection';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_connection_messages_rules
    BEFORE INSERT ON public.connection_messages
    FOR EACH ROW EXECUTE FUNCTION public.check_message_rules();

-- 13. The forms only offer EGP, so block other currencies (NOT VALID = old rows are not checked).
ALTER TABLE public.business_ideas
    ADD CONSTRAINT business_ideas_currency_egp CHECK (currency = 'EGP') NOT VALID;

ALTER TABLE public.investor_profiles
    ADD CONSTRAINT investor_profiles_currency_egp CHECK (currency = 'EGP') NOT VALID;

-- 14. Indexes for the new filters, the Admin queue, and message-sender lookups.
CREATE INDEX IF NOT EXISTS idx_business_ideas_published_filter
    ON public.business_ideas (idea_stage, industry_id, funding_needed)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_idea_reports_idea
    ON public.idea_reports (idea_id);

CREATE INDEX IF NOT EXISTS idx_idea_reports_open
    ON public.idea_reports (created_at DESC)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_connection_messages_sender
    ON public.connection_messages (sender_id);

-- 15. Hide password hashes and reports from the public Supabase API (only your backend can read them).
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users FROM anon, authenticated;

ALTER TABLE public.idea_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idea_reports FROM anon, authenticated;

COMMIT;
