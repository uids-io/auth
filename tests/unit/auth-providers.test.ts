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

	it("parses login_provider query values", () => {
		expect(parseLoginProvider("google")).toBe("google");
		expect(parseLoginProvider("invalid")).toBeUndefined();
	});

	it("checks enablement", () => {
		expect(isLoginProviderEnabled(kit, "google")).toBe(true);
		expect(isLoginProviderEnabled(kit, "microsoft")).toBe(false);
	});
});
