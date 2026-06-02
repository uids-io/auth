import type { AuthKit } from "../config.js";
import { InvalidRequestError } from "../errors.js";
import { isDevicePlatform, type Device, type DevicePlatform } from "../types.js";

export async function handleDeviceRegister(
	kit: AuthKit,
	body: Record<string, unknown>,
	meta: { ip?: string; userAgent?: string },
): Promise<Device> {
	const clientId = body.client_id;
	const deviceId = body.device_id;
	const platform = body.platform;

	if (typeof clientId !== "string") {
		throw new InvalidRequestError("Missing client_id", "invalid_request");
	}
	if (typeof deviceId !== "string") {
		throw new InvalidRequestError("Missing device_id", "invalid_request");
	}
	if (typeof platform !== "string") {
		throw new InvalidRequestError("Missing platform", "invalid_request");
	}
	if (!isDevicePlatform(platform)) {
		throw new InvalidRequestError("Invalid platform", "invalid_request");
	}

	await kit.oauthClients.requireClient(clientId);

	return kit.devices.registerDevice({
		deviceId,
		clientId,
		platform: platform as DevicePlatform,
		platformVersion:
			typeof body.platform_version === "string"
				? body.platform_version
				: undefined,
		appVersion:
			typeof body.app_version === "string" ? body.app_version : undefined,
		deviceName:
			typeof body.device_name === "string" ? body.device_name : undefined,
		userAgent: meta.userAgent,
		ip: meta.ip,
	});
}

export async function handleDeviceList(
	kit: AuthKit,
	userId: number,
): Promise<Device[]> {
	return kit.devices.listUserDevices(userId);
}

export async function handleDeviceRevoke(
	kit: AuthKit,
	userId: number,
	body: Record<string, unknown>,
): Promise<void> {
	const deviceId = body.device_id;
	if (typeof deviceId !== "string") {
		throw new InvalidRequestError("Missing device_id", "invalid_request");
	}
	await kit.devices.revokeDevice(userId, deviceId);
}
