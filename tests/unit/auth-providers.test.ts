import { describe, expect, it } from "vitest";
import {
	getAuthProviders,
	isLoginProviderEnabled,
	parseLoginProvider,
} from "../../src/oidc/providers.js";

describe("auth providers", () => {
	const kit = {
		config: {
			issuer: "https://auth.example.com",
			providers: {
				google: { clientId: "g", clientSecret: "s", callbackUrl: "https://auth.example.com/oauth/google/callback" },
				microsoft: undefined,
			},
		},
	} as Parameters<typeof getAuthProviders>[0];

	it("lists provider enablement", () => {
		const res = getAuthProviders(kit);
		expect(res.providers.find((p) => p.id === "google")?.enabled).toBe(true);
		expect(res.providers.find((p) => p.id === "microsoft")?.enabled).toBe(
			false,
		);
		expect(res.providers.find((p) => p.id === "email")?.enabled).toBe(true);
	});

	it("includes IdP console redirect URIs for social providers", () => {
		const res = getAuthProviders(kit);
		const google = res.providers.find((p) => p.id === "google");
		expect(google?.idpConsole).toBe("google_cloud");
		expect(google?.authorizedRedirectUris).toEqual([
			"https://auth.example.com/oauth/google/callback",
		]);

		const microsoft = res.providers.find((p) => p.id === "microsoft");
		expect(microsoft?.idpConsole).toBe("microsoft_entra");
		expect(microsoft?.authorizedRedirectUris).toEqual([
			"https://auth.example.com/oauth/microsoft/callback",
		]);

		const email = res.providers.find((p) => p.id === "email");
		expect(email?.authorizedRedirectUris).toBeUndefined();
		expect(email?.idpConsole).toBeUndefined();
	});

	it("parses login_provider query values", () => {
		expect(parseLoginProvider("google")).toBe("google");
		expect(parseLoginProvider("invalid")).toBeUndefined();
	});

	it("checks enablement", () => {
		expect(isLoginProviderEnabled(kit, "google")).toBe(true);
		expect(isLoginProviderEnabled(kit, "microsoft")).toBe(false);
	});

	it("uses configured callbackUrl when provider is enabled", () => {
		const customKit = {
			...kit,
			config: {
				...kit.config,
				providers: {
					google: {
						clientId: "g",
						clientSecret: "s",
						callbackUrl:
							"https://auth.example.com/custom/google/callback",
					},
				},
			},
		} as Parameters<typeof getAuthProviders>[0];
		const google = getAuthProviders(customKit).providers.find(
			(p) => p.id === "google",
		);
		expect(google?.authorizedRedirectUris).toEqual([
			"https://auth.example.com/custom/google/callback",
		]);
	});
});
