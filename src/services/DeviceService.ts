import type { Pool } from 'pg';
import type { AuthConfig } from '../config.js';
import { ForbiddenError, InvalidRequestError } from '../errors.js';
import type { Device, DevicePlatform, DeviceRegistration } from '../types.js';

interface DeviceRow {
  id: string;
  device_id: string;
  client_id: string;
  user_id: string | null;
  platform: DevicePlatform;
  platform_version: string | null;
  app_version: string | null;
  device_name: string | null;
  user_agent: string | null;
  last_ip: string | null;
  status: Device['status'];
  first_seen_at: Date;
  last_seen_at: Date;
  revoked_at: Date | null;
}

function mapDevice(row: DeviceRow): Device {
  return {
    id: Number(row.id),
    deviceId: row.device_id,
    clientId: row.client_id,
    userId: row.user_id ? Number(row.user_id) : null,
    platform: row.platform,
    platformVersion: row.platform_version,
    appVersion: row.app_version,
    deviceName: row.device_name,
    userAgent: row.user_agent,
    lastIp: row.last_ip,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DeviceService {
  constructor(
    private readonly pool: Pool,
    private readonly config: AuthConfig,
  ) {}

  validateDeviceId(deviceId: string): void {
    if (!UUID_REGEX.test(deviceId)) {
      throw new InvalidRequestError('Invalid device_id format', 'invalid_device_id');
    }
  }

  async registerDevice(input: DeviceRegistration): Promise<Device> {
    this.validateDeviceId(input.deviceId);

    const { rows } = await this.pool.query<DeviceRow>(
      `INSERT INTO auth.devices
         (device_id, client_id, platform, platform_version, app_version, device_name, user_agent, last_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet)
       ON CONFLICT (device_id, client_id) DO UPDATE SET
         platform = EXCLUDED.platform,
         platform_version = COALESCE(EXCLUDED.platform_version, auth.devices.platform_version),
         app_version = COALESCE(EXCLUDED.app_version, auth.devices.app_version),
         device_name = COALESCE(EXCLUDED.device_name, auth.devices.device_name),
         user_agent = COALESCE(EXCLUDED.user_agent, auth.devices.user_agent),
         last_ip = COALESCE(EXCLUDED.last_ip, auth.devices.last_ip),
         last_seen_at = now(),
         updated_at = now()
       RETURNING id, device_id, client_id, user_id, platform, platform_version, app_version,
                 device_name, user_agent, last_ip::text, status, first_seen_at, last_seen_at, revoked_at`,
      [
        input.deviceId,
        input.clientId,
        input.platform,
        input.platformVersion ?? null,
        input.appVersion ?? null,
        input.deviceName ?? null,
        input.userAgent ?? null,
        input.ip ?? null,
      ],
    );

    const device = mapDevice(rows[0]!);
    await this.config.hooks.onDeviceRegistered?.({
      device,
      clientId: input.clientId,
      userId: device.userId ?? undefined,
    });
    return device;
  }

  async findByExternalId(deviceId: string, clientId: string): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT id, device_id, client_id, user_id, platform, platform_version, app_version,
              device_name, user_agent, last_ip::text, status, first_seen_at, last_seen_at, revoked_at
       FROM auth.devices WHERE device_id = $1 AND client_id = $2`,
      [deviceId, clientId],
    );
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async findById(id: number): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT id, device_id, client_id, user_id, platform, platform_version, app_version,
              device_name, user_agent, last_ip::text, status, first_seen_at, last_seen_at, revoked_at
       FROM auth.devices WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async bindDeviceToUser(deviceId: string, clientId: string, userId: number): Promise<Device> {
    const { rows } = await this.pool.query<DeviceRow>(
      `UPDATE auth.devices SET user_id = $3, updated_at = now(), last_seen_at = now()
       WHERE device_id = $1 AND client_id = $2 AND status = 'active'
       RETURNING id, device_id, client_id, user_id, platform, platform_version, app_version,
                 device_name, user_agent, last_ip::text, status, first_seen_at, last_seen_at, revoked_at`,
      [deviceId, clientId, userId],
    );
    if (!rows[0]) {
      throw new InvalidRequestError('Device not found', 'device_not_found');
    }
    return mapDevice(rows[0]);
  }

  async touchDevice(deviceId: string, clientId: string, ip?: string, userAgent?: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth.devices SET last_seen_at = now(), updated_at = now(),
         last_ip = COALESCE($3::inet, last_ip),
         user_agent = COALESCE($4, user_agent)
       WHERE device_id = $1 AND client_id = $2`,
      [deviceId, clientId, ip ?? null, userAgent ?? null],
    );
  }

  async listUserDevices(userId: number): Promise<Device[]> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT id, device_id, client_id, user_id, platform, platform_version, app_version,
              device_name, user_agent, last_ip::text, status, first_seen_at, last_seen_at, revoked_at
       FROM auth.devices WHERE user_id = $1 AND status = 'active'
       ORDER BY last_seen_at DESC`,
      [userId],
    );
    return rows.map(mapDevice);
  }

  async revokeDevice(userId: number, externalDeviceId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `UPDATE auth.devices SET status = 'revoked', revoked_at = now(), updated_at = now()
         WHERE user_id = $1 AND device_id = $2 AND status = 'active'
         RETURNING id`,
        [userId, externalDeviceId],
      );
      if (!rows[0]) {
        throw new ForbiddenError('Device not found or already revoked', 'device_not_found');
      }

      const devicePk = Number(rows[0].id);
      await client.query(
        `UPDATE auth.sessions SET status = 'revoked', revoked_at = now()
         WHERE device_id = $1 AND status = 'active'`,
        [devicePk],
      );
      await client.query(
        `UPDATE auth.refresh_tokens SET revoked_at = now()
         WHERE session_id IN (SELECT id FROM auth.sessions WHERE device_id = $1) AND revoked_at IS NULL`,
        [devicePk],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
