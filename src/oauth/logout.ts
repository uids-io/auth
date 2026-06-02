import type { AuthKit } from "../config.js";

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
		const revoked = await kit.sessions.revokeSessionByRefreshToken(
			params.refreshToken,
		);
		if (revoked) {
			await kit.config.hooks.onLogout?.(revoked.userId, revoked.sessionId);
		}
	}
}
