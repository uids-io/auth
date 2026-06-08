import type { AuthKit } from "../config.js";
import { generateOpaqueToken } from "../crypto/random.js";
import { UnauthorizedError } from "../errors.js";
import { buildIssuerUrl } from "../issuerUrl.js";
import type { PendingAuthContext } from "../types.js";
import { completePendingAuthorize } from "./authorize.js";
import {
	buildGoogleAuthUrl,
	exchangeGoogleCode,
	fetchGoogleUserInfo,
	mapGoogleProfile,
} from "./providers/google.js";
import {
	buildMicrosoftAuthUrl,
	exchangeMicrosoftCode,
	fetchMicrosoftUserInfo,
	mapMicrosoftProfile,
} from "./providers/microsoft.js";

export type SocialProvider = "google" | "microsoft";

export async function startSocialLogin(
	kit: AuthKit,
	provider: SocialProvider,
	params: { state?: string; pendingState?: string },
): Promise<string> {
	const state = params.pendingState ?? params.state ?? generateOpaqueToken(16);

	if (provider === "google") {
		const google = kit.config.providers.google;
		if (!google) {
			throw new UnauthorizedError(
				"Google provider not configured",
				"provider_not_configured",
			);
		}

		return buildGoogleAuthUrl({
			clientId: google.clientId,
			redirectUri: google.callbackUrl,
			state,
		});
	}

	const microsoft = kit.config.providers.microsoft;
	if (!microsoft) {
		throw new UnauthorizedError(
			"Microsoft provider not configured",
			"provider_not_configured",
		);
	}

	return buildMicrosoftAuthUrl({
		tenant: microsoft.tenant,
		clientId: microsoft.clientId,
		redirectUri: microsoft.callbackUrl,
		state,
	});
}

export async function handleSocialCallback(
	kit: AuthKit,
	provider: SocialProvider,
	params: { code: string; state: string; ip?: string; userAgent?: string },
): Promise<{ redirectUrl: string; userId: number }> {
	let profile: ReturnType<typeof mapGoogleProfile>;
	let rawProfile: Record<string, unknown>;

	if (provider === "google") {
		const google = kit.config.providers.google;

		if (!google) {
			throw new UnauthorizedError(
				"Google provider not configured",
				"provider_not_configured",
			);
		}

		const tokens = await exchangeGoogleCode({
			code: params.code,
			clientId: google.clientId,
			clientSecret: google.clientSecret,
			redirectUri: google.callbackUrl,
		});
		rawProfile = await fetchGoogleUserInfo(tokens.accessToken);
		profile = mapGoogleProfile(rawProfile);
	} else {
		const microsoft = kit.config.providers.microsoft;

		if (!microsoft) {
			throw new UnauthorizedError(
				"Microsoft provider not configured",
				"provider_not_configured",
			);
		}

		const tokens = await exchangeMicrosoftCode({
			tenant: microsoft.tenant,
			code: params.code,
			clientId: microsoft.clientId,
			clientSecret: microsoft.clientSecret,
			redirectUri: microsoft.callbackUrl,
		});
		rawProfile = await fetchMicrosoftUserInfo(tokens.accessToken);
		profile = mapMicrosoftProfile(rawProfile);
	}

	const user = await kit.users.resolveOrCreateFromProvider({
		provider,
		providerSubject: profile.providerSubject,
		email: profile.email,
		emailVerified: profile.emailVerified,
		displayName: profile.displayName,
		rawProfile,
	});

	await kit.auth.recordLoginAttempt({
		email: profile.email,
		provider,
		success: true,
		ip: params.ip,
		userAgent: params.userAgent,
	});
	await kit.config.hooks.onLogin?.(user, provider);

	const pending = await kit.auth.consumePendingContext(params.state);
	if (pending) {
		const redirectUrl = await completePendingAuthorize(kit, user.id, pending);
		if (redirectUrl) {
			return { redirectUrl, userId: user.id };
		}
	}

	const customRedirect = await kit.config.hooks.resolvePostLoginRedirect?.({
		clientId: pending?.clientId ?? "default",
		redirectUri: pending?.redirectUri ?? kit.config.issuer,
		state: params.state,
	});

	return {
		redirectUrl:
			customRedirect ??
			buildIssuerUrl(kit.config.issuer, "/session").href,
		userId: user.id,
	};
}

export async function storeSocialPendingState(
	kit: AuthKit,
	state: string,
	context: PendingAuthContext,
): Promise<void> {
	await kit.auth.savePendingContext(state, context);
}
