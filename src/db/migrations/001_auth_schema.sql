CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.schema_migrations (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.users (
  id bigserial PRIMARY KEY,
  primary_email text UNIQUE,
  display_name text,
  email_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.oauth_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  client_type text NOT NULL CHECK (client_type IN ('public', 'confidential')),
  client_secret_hash text,
  allowed_redirect_uris text[] NOT NULL,
  allowed_origins text[] NOT NULL DEFAULT '{}',
  allowed_scopes text[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  access_token_ttl_seconds int NOT NULL DEFAULT 900,
  refresh_token_ttl_seconds int NOT NULL DEFAULT 2592000,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.user_identities (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  raw_profile jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS auth.password_credentials (
  user_id bigint PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.signing_keys (
  id bigserial PRIMARY KEY,
  kid text NOT NULL UNIQUE,
  alg text NOT NULL DEFAULT 'RS256',
  public_jwk jsonb NOT NULL,
  private_jwk jsonb,
  private_jwk_encrypted text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth.devices (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL,
  client_id text NOT NULL REFERENCES auth.oauth_clients(id),
  user_id bigint REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android', 'desktop', 'unknown')),
  platform_version text,
  app_version text,
  device_name text,
  user_agent text,
  last_ip inet,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, client_id)
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id bigserial PRIMARY KEY,
  session_token_hash text NOT NULL UNIQUE,
  user_id bigint NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text REFERENCES auth.oauth_clients(id),
  device_id bigint REFERENCES auth.devices(id) ON DELETE SET NULL,
  user_agent text,
  ip inet,
  csrf_token text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth.oauth_authorization_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES auth.oauth_clients(id),
  user_id bigint NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id bigint REFERENCES auth.devices(id) ON DELETE SET NULL,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL CHECK (code_challenge_method IN ('S256')),
  state text,
  nonce text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  parent_token_id bigint REFERENCES auth.refresh_tokens(id),
  rotated_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.login_attempts (
  id bigserial PRIMARY KEY,
  email text,
  provider text,
  device_id text,
  success boolean NOT NULL,
  ip inet,
  user_agent text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.magic_links (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  client_id text REFERENCES auth.oauth_clients(id),
  redirect_uri text,
  state text,
  code_challenge text,
  code_challenge_method text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.pending_auth_context (
  id bigserial PRIMARY KEY,
  state text NOT NULL UNIQUE,
  context jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
