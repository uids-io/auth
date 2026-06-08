import type { AuthKit } from "../config.js";
import { InvalidRequestError } from "../errors.js";
import type { TokenResponse } from "../types.js";
import { getRefreshTokenFromRequest } from "./refreshCookie.js";

export async function handleRefresh(
	kit: AuthKit,
	input: {
		body: Record<string, unknown>;
		headers: { cookie?: string };
	},
): Promise<TokenResponse> {
	const refreshToken = getRefreshTokenFromRequest({
		body: input.body,
		headers: input.headers,
	});

	if (!refreshToken) {
		throw new InvalidRequestError("Missing refresh_token", "invalid_request");
	}

	const result = await kit.tokens.refreshAccessToken(refreshToken);
	return result.tokens;
}
