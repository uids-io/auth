import type { AuthKit } from "../config.js";
import { InvalidRequestError } from "../errors.js";

export async function handleTokenExchange(
	kit: AuthKit,
	body: Record<string, unknown>,
): Promise<import("../types.js").TokenResponse> {
	const grantType = body.grant_type;
	if (grantType !== "authorization_code") {
		throw new InvalidRequestError(
			"Unsupported grant_type",
			"unsupported_grant_type",
		);
	}

	const code = body.code;
	const clientId = body.client_id;
	const redirectUri = body.redirect_uri;
	const codeVerifier = body.code_verifier;

	if (typeof code !== "string" || typeof clientId !== "string") {
		throw new InvalidRequestError(
			"Missing required parameters",
			"invalid_request",
		);
	}
	if (typeof redirectUri !== "string") {
		throw new InvalidRequestError("Missing redirect_uri", "invalid_request");
	}
	if (typeof codeVerifier !== "string") {
		throw new InvalidRequestError("Missing code_verifier", "invalid_request");
	}

	await kit.oauthClients.requireClient(clientId);
	const exchange = await kit.tokens.exchangeAuthorizationCode({
		code,
		clientId,
		redirectUri,
		codeVerifier,
	});

	const user = await kit.users.findById(exchange.userId);
	if (!user) {
		throw new InvalidRequestError("User not found", "invalid_grant");
	}

	let device = null;
	if (exchange.devicePk) {
		device = await kit.devices.findById(exchange.devicePk);
	}

	const { session } = await kit.sessions.createSession({
		userId: user.id,
		clientId,
		devicePk: exchange.devicePk,
	});

	await kit.config.hooks.onLogin?.(user, "oauth");

	return kit.tokens.issueTokens({
		user,
		clientId,
		scopes: exchange.scopes,
		sessionId: session.id,
		device,
		nonce: exchange.nonce,
	});
}
