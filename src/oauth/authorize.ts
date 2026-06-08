import type { AuthKit } from "../config.js";
import { generateOpaqueToken } from "../crypto/random.js";
import { InvalidRequestError, UnauthorizedError } from "../errors.js";
import { buildIssuerUrl } from "../issuerUrl.js";
import {
	type AuthLoginProviderId,
	isLoginProviderEnabled,
	parseLoginProvider,
} from "../oidc/providers.js";
import type { DevicePlatform, PendingAuthContext } from "../types.js";
import { startSocialLogin } from "./callback.js";
import { parseScope, validateAuthorizeParams } from "./clients.js";

export interface AuthorizeResult {
	type: "redirect_login" | "redirect_portal";
	url: string;
}

export async function handleAuthorize(
	kit: AuthKit,
	params: {
		query: Record<string, unknown>;
		sessionToken?: string;
		deviceId?: string;
		platform?: DevicePlatform;
	},
): Promise<AuthorizeResult> {
	const parsed = validateAuthorizeParams(params.query);
	const client = await kit.oauthClients.requireClient(parsed.clientId);

	kit.oauthClients.validateRedirectUri(client, parsed.redirectUri);
	kit.oauthClients.validateScopes(client, parsed.scopes);

	if (kit.config.devices.requireDeviceId && !params.deviceId) {
		throw new UnauthorizedError("device_id required", "device_required");
	}

	let devicePk: number | undefined;
	if (params.deviceId && params.platform) {
		const device = await kit.devices.registerDevice({
			deviceId: params.deviceId,
			clientId: parsed.clientId,
			platform: params.platform,
		});

		devicePk = device.id;
	}

	if (params.sessionToken) {
		const session = await kit.sessions.getSessionByToken(params.sessionToken);

		if (session) {
			const user = await kit.users.findById(session.userId);

			if (user) {
				const code = await kit.tokens.createAuthorizationCode({
					clientId: parsed.clientId,
					userId: user.id,
					redirectUri: parsed.redirectUri,
					scopes: parsed.scopes,
					codeChallenge: parsed.codeChallenge,
					codeChallengeMethod: parsed.codeChallengeMethod,
					state: parsed.state,
					nonce: parsed.nonce,
					devicePk,
				});

				const url = new URL(parsed.redirectUri);
				url.searchParams.set("code", code);

				if (parsed.state) {
					url.searchParams.set("state", parsed.state);
				}

				return { type: "redirect_portal", url: url.toString() };
			}
		}
	}

	const state = parsed.state ?? generateOpaqueToken(16);
	const pending: PendingAuthContext = {
		type: "oauth_authorize",
		clientId: parsed.clientId,
		redirectUri: parsed.redirectUri,
		scopes: parsed.scopes,
		state: parsed.state,
		codeChallenge: parsed.codeChallenge,
		codeChallengeMethod: parsed.codeChallengeMethod,
		nonce: parsed.nonce,
		deviceId: params.deviceId,
		platform: params.platform,
	};
	await kit.auth.savePendingContext(state, pending);

	const loginProvider = parseLoginProvider(params.query.login_provider);
	if (loginProvider) {
		if (!isLoginProviderEnabled(kit, loginProvider)) {
			throw new InvalidRequestError(
				`Login provider not enabled: ${loginProvider}`,
				"provider_not_configured",
			);
		}
		const url = await resolveLoginProviderUrl(kit, loginProvider, state);
		return { type: "redirect_login", url };
	}

	const loginUrl = buildIssuerUrl(kit.config.issuer, "/login");
	loginUrl.searchParams.set("state", state);

	return { type: "redirect_login", url: loginUrl.toString() };
}

async function resolveLoginProviderUrl(
	kit: AuthKit,
	provider: AuthLoginProviderId,
	state: string,
): Promise<string> {
	if (provider === "google" || provider === "microsoft") {
		return startSocialLogin(kit, provider, { pendingState: state });
	}

	const loginUrl = buildIssuerUrl(kit.config.issuer, "/login");
  
	loginUrl.searchParams.set("state", state);
	return loginUrl.toString();
}

export async function completePendingAuthorize(
	kit: AuthKit,
	userId: number,
	pending: PendingAuthContext,
): Promise<string | null> {
	if (
		pending.type !== "oauth_authorize" ||
		!pending.clientId ||
		!pending.redirectUri
	) {
		return null;
	}

	let devicePk: number | undefined;
	if (pending.deviceId && pending.platform) {
		const device = await kit.devices.bindDeviceToUser(
			pending.deviceId,
			pending.clientId,
			userId,
		);
		devicePk = device.id;
	}

	const code = await kit.tokens.createAuthorizationCode({
		clientId: pending.clientId,
		userId,
		redirectUri: pending.redirectUri,
		scopes: pending.scopes ?? parseScope(),
		codeChallenge: pending.codeChallenge || "",
		codeChallengeMethod: pending.codeChallengeMethod ?? "S256",
		state: pending.state,
		nonce: pending.nonce,
		devicePk,
	});

	const url = new URL(pending.redirectUri);
	url.searchParams.set("code", code);
	if (pending.state) {
		url.searchParams.set("state", pending.state);
	}
	return url.toString();
}
