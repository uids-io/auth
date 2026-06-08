import { InvalidRequestError } from "../errors.js";
import type { OAuthClient } from "../types.js";

export function parseScope(scope?: string): string[] {
	if (!scope || scope.trim() === "") {
		return ["openid", "profile", "email"];
	}
	return scope.split(/\s+/).filter(Boolean);
}

export function validateAuthorizeParams(query: Record<string, unknown>): {
	responseType: string;
	clientId: string;
	redirectUri: string;
	scopes: string[];
	state?: string;
	codeChallenge: string;
	codeChallengeMethod: "S256";
	nonce?: string;
} {
	const responseType = query.response_type;
	const clientId = query.client_id;
	const redirectUri = query.redirect_uri;
	const codeChallenge = query.code_challenge;
	const codeChallengeMethod = query.code_challenge_method;

	if (responseType !== "code") {
		throw new InvalidRequestError(
			"Unsupported response_type",
			"unsupported_response_type",
		);
	}
	if (typeof clientId !== "string") {
		throw new InvalidRequestError("Missing client_id", "invalid_request");
	}
	if (typeof redirectUri !== "string") {
		throw new InvalidRequestError("Missing redirect_uri", "invalid_request");
	}
	if (typeof codeChallenge !== "string") {
		throw new InvalidRequestError("Missing code_challenge", "invalid_request");
	}
	if (codeChallengeMethod !== "S256") {
		throw new InvalidRequestError(
			"Unsupported code_challenge_method",
			"invalid_request",
		);
	}

	return {
		responseType,
		clientId,
		redirectUri,
		scopes: parseScope(
			typeof query.scope === "string" ? query.scope : undefined,
		),
		state: typeof query.state === "string" ? query.state : undefined,
		codeChallenge,
		codeChallengeMethod: "S256",
		nonce: typeof query.nonce === "string" ? query.nonce : undefined,
	};
}

export function validateRedirectUri(
	client: OAuthClient,
	redirectUri: string,
): boolean {
	return client.allowedRedirectUris.includes(redirectUri);
}

export function validateOrigin(
	origin: string,
	allowedOrigins: string[],
): boolean {
	return allowedOrigins.includes(origin);
}
