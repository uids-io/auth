import type { AuthKit } from "../config.js";
import { InvalidRequestError } from "../errors.js";
import type { TokenResponse } from "../types.js";

export async function handleRefresh(
	kit: AuthKit,
	body: Record<string, unknown>,
): Promise<TokenResponse> {
	const refreshToken = body.refresh_token;

	if (typeof refreshToken !== "string") {
		throw new InvalidRequestError("Missing refresh_token", "invalid_request");
	}

	const result = await kit.tokens.refreshAccessToken(refreshToken);
	return result.tokens;
}
