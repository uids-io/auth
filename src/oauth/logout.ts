import type { AuthKit } from '../config.js';

export async function handleLogout(
  kit: AuthKit,
  params: {
    sessionToken?: string;
    refreshToken?: string;
    userId?: number;
  },
): Promise<void> {
  if (params.sessionToken) {
    const session = await kit.sessions.getSessionByToken(params.sessionToken);
    if (session) {
      await kit.sessions.revokeSession(session.id);
      await kit.config.hooks.onLogout?.(session.userId, session.id);
    }
  }

  if (params.refreshToken) {
    const tokenHash = (await import('../crypto/tokens.js')).hashToken(params.refreshToken);
    const { rows } = await kit.pool.query<{ session_id: string; user_id: string }>(
      `SELECT rt.session_id, s.user_id FROM auth.refresh_tokens rt
       JOIN auth.sessions s ON s.id = rt.session_id
       WHERE rt.token_hash = $1`,
      [tokenHash],
    );
    if (rows[0]) {
      await kit.sessions.revokeSession(Number(rows[0].session_id));
      await kit.config.hooks.onLogout?.(Number(rows[0].user_id), Number(rows[0].session_id));
    }
  }
}
