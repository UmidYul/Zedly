// Utility functions for database table column operations
const { query } = require('../config/database');

const COLUMN_CACHE = {};

async function getTableColumns(tableName) {
    if (COLUMN_CACHE[tableName]) {
        return COLUMN_CACHE[tableName];
    }
    const result = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );
    const columns = new Set(result.rows.map(row => row.column_name));
    COLUMN_CACHE[tableName] = columns;
    return columns;
}

function pickColumn(columns, candidates, fallback = null) {
    for (const candidate of candidates) {
        if (columns.has(candidate)) {
            return candidate;
        }
    }
    return fallback;
}

module.exports = {
    getTableColumns,
    pickColumn,
    COLUMN_CACHE,
    getSchoolNameExpr
};

// Returns the best SQL expression for the school name column
async function getSchoolNameExpr() {
    const { query } = require('../config/database');
    const result = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schools'`
    );
    const columns = new Set(result.rows.map(row => row.column_name));
    if (columns.has('name_ru')) return 's.name_ru';
    if (columns.has('name_uz')) return 's.name_uz';
    return 's.name';
}
