import { query } from '../db';
import { PlatformSetting } from '../types';

/**
 * Get platform setting by key
 */
export async function getPlatformSetting(key: string): Promise<any> {
  const result = await query<PlatformSetting>(
    'SELECT value_json FROM platform_settings WHERE key = $1',
    [key]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].value_json;
}

/**
 * Get all platform settings
 */
export async function getAllPlatformSettings(): Promise<Record<string, any>> {
  const result = await query<PlatformSetting>(
    'SELECT key, value_json FROM platform_settings ORDER BY key'
  );

  const settings: Record<string, any> = {};
  for (const row of result.rows) {
    settings[row.key] = row.value_json;
  }

  return settings;
}

/**
 * Set platform setting
 */
export async function setPlatformSetting(key: string, value: any): Promise<PlatformSetting> {
  const result = await query<PlatformSetting>(
    `INSERT INTO platform_settings (key, value_json, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
     SET value_json = $2, updated_at = NOW()
     RETURNING *`,
    [key, JSON.stringify(value)]
  );

  return result.rows[0];
}

/**
 * Update multiple platform settings
 */
export async function updatePlatformSettings(settings: Record<string, any>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    await setPlatformSetting(key, value);
  }
}

/**
 * Delete platform setting
 */
export async function deletePlatformSetting(key: string): Promise<void> {
  await query('DELETE FROM platform_settings WHERE key = $1', [key]);
}
