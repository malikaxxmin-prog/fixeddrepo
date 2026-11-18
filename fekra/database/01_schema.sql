-- =========================================================
-- ENUM TYPES
-- =========================================================

-- Defines the roles available to registered users.
CREATE TYPE user_role AS ENUM (
    'entrepreneur',
    'investor'
);

-- Defines the development stages of a business idea.
CREATE TYPE idea_stage AS ENUM (
    'idea',
    'prototype',
    'mvp',
    'early_revenue',
    'growth'
);

-- Defines the publication status of a business idea.
CREATE TYPE idea_status AS ENUM (
    'draft',
    'published',
    'closed'
);

-- Defines the status of an investor's interest in an idea.
CREATE TYPE interest_status AS ENUM (
    'active',
    'withdrawn'
);

-- Defines the status of an entrepreneur-investor connection.
CREATE TYPE connection_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'closed'
);


-- =========================================================
-- TABLE 1: USER_PROFILES
-- Stores public profile information for Supabase users.
-- References the existing Supabase auth.users table.
-- Deleting an authentication account deletes its profile.
-- =========================================================

CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    city VARCHAR(100) NOT NULL DEFAULT 'Cairo',
    role user_role NOT NULL,
    avatar_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- TABLE 2: ENTREPRENEUR_PROFILES
-- Stores additional information for entrepreneurs.
-- Deleting the associated user deletes the entrepreneur profile.
-- =========================================================

CREATE TABLE public.entrepreneur_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES public.user_profiles(id)
        ON DELETE CASCADE,

    website_url VARCHAR(500),
    bio TEXT
);


-- =========================================================
-- TABLE 3: INVESTOR_PROFILES
-- Stores investor information and overall funding preferences.
-- Deleting the associated user deletes the investor profile.
-- =========================================================

CREATE TABLE public.investor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES public.user_profiles(id)
        ON DELETE CASCADE,

    investor_bio TEXT,

    min_funding NUMERIC(15, 2),
    max_funding NUMERIC(15, 2),

    preferred_idea_stage idea_stage,
    currency CHAR(3) NOT NULL DEFAULT 'EGP',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT investor_funding_nonnegative
        CHECK (
            (min_funding IS NULL OR min_funding >= 0)
            AND
            (max_funding IS NULL OR max_funding >= 0)
        ),

    CONSTRAINT investor_funding_range_valid
        CHECK (
            min_funding IS NULL
            OR max_funding IS NULL
            OR min_funding <= max_funding
        )
);


-- =========================================================
-- TABLE 4: INDUSTRIES
-- Stores the industries used to classify business ideas
-- and define investor industry preferences.
-- =========================================================

CREATE TABLE public.industries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);


-- =========================================================
-- TABLE 5: IDEA_TYPES
-- Stores categories of business ideas separately from industries.
-- Used by entrepreneurs when submitting ideas and by investors
-- when selecting their preferred idea types.
-- =========================================================

CREATE TABLE public.idea_types (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);


-- =========================================================
-- TABLE 6: BUSINESS_IDEAS
-- Stores ideas submitted by entrepreneurs.
-- Each idea belongs to one entrepreneur, one industry,
-- and one idea type.
-- Deleting the entrepreneur deletes their submitted ideas.
-- Industry and idea type deletion is restricted while referenced.
-- =========================================================

CREATE TABLE public.business_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    entrepreneur_id UUID NOT NULL
        REFERENCES public.entrepreneur_profiles(id)
        ON DELETE CASCADE,

    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,

    industry_id BIGINT NOT NULL
        REFERENCES public.industries(id)
        ON DELETE RESTRICT,

    idea_type_id BIGINT NOT NULL
        REFERENCES public.idea_types(id)
        ON DELETE RESTRICT,

    funding_needed NUMERIC(15, 2) NOT NULL
        CHECK (funding_needed >= 0),

    currency CHAR(3) NOT NULL DEFAULT 'EGP',

    target_market TEXT NOT NULL,
    business_name VARCHAR(200),

    idea_stage idea_stage NOT NULL DEFAULT 'idea',
    status idea_status NOT NULL DEFAULT 'draft',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- TABLE 7: INVESTOR_INDUSTRY_PREFERENCES
-- Junction table connecting investors with preferred industries.
-- Deleting an investor or industry preference target removes
-- the associated preference record.
-- =========================================================

CREATE TABLE public.investor_industry_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    investor_id UUID NOT NULL
        REFERENCES public.investor_profiles(id)
        ON DELETE CASCADE,

    industry_id BIGINT NOT NULL
        REFERENCES public.industries(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_investor_industry
        UNIQUE (investor_id, industry_id)
);


-- =========================================================
-- TABLE 8: INVESTOR_IDEA_TYPE_PREFERENCES
-- Junction table connecting investors with preferred idea types.
-- Deleting an investor or idea type removes the associated
-- preference record.
-- =========================================================

CREATE TABLE public.investor_idea_type_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    investor_id UUID NOT NULL
        REFERENCES public.investor_profiles(id)
        ON DELETE CASCADE,

    idea_type_id BIGINT NOT NULL
        REFERENCES public.idea_types(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_investor_idea_type
        UNIQUE (investor_id, idea_type_id)
);


-- =========================================================
-- TABLE 9: IDEA_INTERESTS
-- Records investors expressing interest in business ideas.
-- Each investor can express interest in a particular idea once.
-- Deleting an idea or investor removes the associated interests.
-- =========================================================

CREATE TABLE public.idea_interests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    idea_id UUID NOT NULL
        REFERENCES public.business_ideas(id)
        ON DELETE CASCADE,

    investor_id UUID NOT NULL
        REFERENCES public.investor_profiles(id)
        ON DELETE CASCADE,

    message TEXT,

    status interest_status NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_idea_investor_interest
        UNIQUE (idea_id, investor_id)
);


-- =========================================================
-- TABLE 10: CONNECTIONS
-- Tracks contact requests resulting from investor interest.
-- Each interest can lead to at most one connection.
-- initiated_by identifies the user who started the connection.
-- Deleting the interest or initiating user deletes the connection.
-- =========================================================

CREATE TABLE public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    interest_id UUID NOT NULL UNIQUE
        REFERENCES public.idea_interests(id)
        ON DELETE CASCADE,

    initiated_by UUID NOT NULL
        REFERENCES public.user_profiles(id)
        ON DELETE CASCADE,

    status connection_status NOT NULL DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- TABLE 11: CONNECTION_MESSAGES
-- Stores messages exchanged within a connection.
-- Deleting a connection deletes its messages.
-- Deleting the sender's user account deletes their messages.
-- =========================================================

CREATE TABLE public.connection_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    connection_id UUID NOT NULL
        REFERENCES public.connections(id)
        ON DELETE CASCADE,

    sender_id UUID NOT NULL
        REFERENCES public.user_profiles(id)
        ON DELETE CASCADE,

    message_body TEXT NOT NULL
        CHECK (LENGTH(TRIM(message_body)) > 0),

    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);


-- =========================================================
-- INDEXES
-- Improve performance for common discovery and lookup queries.
-- UNIQUE constraints already create indexes for their columns.
-- =========================================================

CREATE INDEX idx_business_ideas_entrepreneur
    ON public.business_ideas (entrepreneur_id);

CREATE INDEX idx_business_ideas_industry
    ON public.business_ideas (industry_id);

CREATE INDEX idx_business_ideas_type
    ON public.business_ideas (idea_type_id);

CREATE INDEX idx_business_ideas_discovery
    ON public.business_ideas (status, funding_needed, created_at DESC);

CREATE INDEX idx_investor_industry_preferences_industry
    ON public.investor_industry_preferences (industry_id);

CREATE INDEX idx_investor_idea_type_preferences_type
    ON public.investor_idea_type_preferences (idea_type_id);

CREATE INDEX idx_idea_interests_investor
    ON public.idea_interests (investor_id);

CREATE INDEX idx_connections_initiated_by
    ON public.connections (initiated_by);

CREATE INDEX idx_connection_messages_connection
    ON public.connection_messages (connection_id, sent_at);
