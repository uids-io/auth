CREATE INDEX IF NOT EXISTS idx_user_identities_provider_subject
  ON auth.user_identities (provider, provider_subject);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id
  ON auth.user_identities (user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id_status
  ON auth.sessions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_device_id
  ON auth.sessions (device_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id
  ON auth.refresh_tokens (session_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON auth.refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created_at
  ON auth.login_attempts (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_magic_links_email
  ON auth.magic_links (email);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_expires_at
  ON auth.oauth_authorization_codes (expires_at);

CREATE INDEX IF NOT EXISTS idx_devices_user_id_status
  ON auth.devices (user_id, status);

CREATE INDEX IF NOT EXISTS idx_devices_device_id
  ON auth.devices (device_id);

CREATE INDEX IF NOT EXISTS idx_pending_auth_context_expires_at
  ON auth.pending_auth_context (expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_session_token_hash
  ON auth.sessions (session_token_hash);
