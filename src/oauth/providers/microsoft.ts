export function getMicrosoftEndpoints(tenant: string): {
	authorize: string;
	token: string;
	userInfo: string;
} {
	const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
	return {
		authorize: `${base}/authorize`,
		token: `${base}/token`,
		userInfo: "https://graph.microsoft.com/oidc/userinfo",
	};
}

export function mapMicrosoftProfile(profile: Record<string, unknown>): {
	providerSubject: string;
	email?: string;
	emailVerified: boolean;
	displayName?: string;
	rawProfile: Record<string, unknown>;
} {
	let providerSubject: string | undefined;
	if (typeof profile.sub === "string") {
		providerSubject = profile.sub;
	} else if (
		typeof profile.oid === "string" &&
		typeof profile.tid === "string"
	) {
		providerSubject = `${profile.oid}:${profile.tid}`;
	}

	if (!providerSubject) {
		throw new Error("Microsoft profile missing sub or oid+tid");
	}

	const email =
		(typeof profile.email === "string" ? profile.email : undefined) ??
		(typeof profile.preferred_username === "string"
			? profile.preferred_username
			: undefined);

	return {
		providerSubject,
		email,
		emailVerified: profile.email_verified === true,
		displayName:
			(typeof profile.name === "string" ? profile.name : undefined) ??
			(typeof profile.displayName === "string"
				? profile.displayName
				: undefined),
		rawProfile: profile,
	};
}

export function buildMicrosoftAuthUrl(params: {
	tenant: string;
	clientId: string;
	redirectUri: string;
	state: string;
	nonce?: string;
}): string {
	const { authorize } = getMicrosoftEndpoints(params.tenant);
	const url = new URL(authorize);
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "openid profile email");
	url.searchParams.set("state", params.state);
	if (params.nonce) {
		url.searchParams.set("nonce", params.nonce);
	}
	url.searchParams.set("response_mode", "query");
	return url.toString();
}

export async function exchangeMicrosoftCode(params: {
	tenant: string;
	code: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}): Promise<{ accessToken: string; idToken?: string }> {
	const { token } = getMicrosoftEndpoints(params.tenant);
	const body = new URLSearchParams({
		code: params.code,
		client_id: params.clientId,
		client_secret: params.clientSecret,
		redirect_uri: params.redirectUri,
		grant_type: "authorization_code",
	});

	const response = await fetch(token, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});

	if (!response.ok) {
		throw new Error(`Microsoft token exchange failed: ${response.status}`);
	}

	const data = (await response.json()) as {
		access_token: string;
		id_token?: string;
	};
	return { accessToken: data.access_token, idToken: data.id_token };
}

export async function fetchMicrosoftUserInfo(
	accessToken: string,
): Promise<Record<string, unknown>> {
	const response = await fetch("https://graph.microsoft.com/oidc/userinfo", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) {
		const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!graphResponse.ok) {
			throw new Error(`Microsoft profile fetch failed: ${response.status}`);
		}
		return (await graphResponse.json()) as Record<string, unknown>;
	}
	return (await response.json()) as Record<string, unknown>;
}
