#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, pool } = require('../src/config/database');

async function run() {
    console.log('[migrate-school-geo-profile] migration started');

    const statements = [
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS region_code VARCHAR(64)`,
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS city_code VARCHAR(64)`,
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_type VARCHAR(64)`,
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS ownership VARCHAR(64)`,
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS language_model VARCHAR(64)`,
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS study_shift VARCHAR(64)`,
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS capacity INTEGER`,
        `ALTER TABLE schools ADD COLUMN IF NOT EXISTS opened_year INTEGER`,
        `CREATE INDEX IF NOT EXISTS idx_schools_region_code ON schools(region_code)`,
        `CREATE INDEX IF NOT EXISTS idx_schools_city_code ON schools(city_code)`,
        `CREATE INDEX IF NOT EXISTS idx_schools_school_type ON schools(school_type)`,
        `CREATE INDEX IF NOT EXISTS idx_schools_ownership ON schools(ownership)`,
        `CREATE INDEX IF NOT EXISTS idx_schools_language_model ON schools(language_model)`,
        `CREATE INDEX IF NOT EXISTS idx_schools_study_shift ON schools(study_shift)`
    ];

    for (const statement of statements) {
        await query(statement);
        console.log(`[migrate-school-geo-profile] OK: ${statement}`);
    }

    console.log('[migrate-school-geo-profile] migration completed');
}

run()
    .catch((error) => {
        console.error('[migrate-school-geo-profile] migration failed', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await pool.end();
        } catch (error) {
            // noop
        }
    });
