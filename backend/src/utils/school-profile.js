const { UZ_LOCATIONS } = require('../constants/uz-locations');

const UNKNOWN_CODE = 'unknown';
const MIN_OPENED_YEAR = 1800;
const MAX_CAPACITY = 50000;

const SCHOOL_PROFILE_ENUMS = Object.freeze({
    school_type: [
        'general',
        'specialized',
        'private_school',
        'presidential',
        'vocational',
        'academic_lyceum',
        'other'
    ],
    ownership: ['state', 'private', 'public_private', 'other'],
    language_model: ['uzbek', 'russian', 'karakalpak', 'tajik', 'kazakh', 'mixed', 'other'],
    study_shift: ['single', 'double', 'triple', 'flexible', 'other']
});

const SCHOOL_PROFILE_LABELS = Object.freeze({
    school_type: {
        general: { ru: 'Общеобразовательная', uz: "Umumta'lim" },
        specialized: { ru: 'Специализированная', uz: 'Ixtisoslashgan' },
        private_school: { ru: 'Частная', uz: 'Xususiy' },
        presidential: { ru: 'Президентская', uz: 'Prezident maktabi' },
        vocational: { ru: 'Профессиональная', uz: 'Kasb-hunar' },
        academic_lyceum: { ru: 'Академический лицей', uz: 'Akademik litsey' },
        other: { ru: 'Другое', uz: 'Boshqa' }
    },
    ownership: {
        state: { ru: 'Государственная', uz: 'Davlat' },
        private: { ru: 'Частная', uz: 'Xususiy' },
        public_private: { ru: 'ГЧП', uz: 'DXSh' },
        other: { ru: 'Другое', uz: 'Boshqa' }
    },
    language_model: {
        uzbek: { ru: 'Узбекский', uz: 'O`zbekcha' },
        russian: { ru: 'Русский', uz: 'Ruscha' },
        karakalpak: { ru: 'Каракалпакский', uz: "Qoraqalpoqcha" },
        tajik: { ru: 'Таджикский', uz: 'Tojikcha' },
        kazakh: { ru: 'Казахский', uz: 'Qozoqcha' },
        mixed: { ru: 'Смешанная', uz: 'Aralash' },
        other: { ru: 'Другое', uz: 'Boshqa' }
    },
    study_shift: {
        single: { ru: '1 смена', uz: '1 smena' },
        double: { ru: '2 смены', uz: '2 smena' },
        triple: { ru: '3 смены', uz: '3 smena' },
        flexible: { ru: 'Гибкая', uz: 'Moslashuvchan' },
        other: { ru: 'Другое', uz: 'Boshqa' }
    }
});

const REGION_MAP = new Map();
const CITY_MAP_BY_REGION = new Map();

for (const region of UZ_LOCATIONS.regions) {
    const regionCode = String(region.code || '').toLowerCase();
    REGION_MAP.set(regionCode, region);

    const cityMap = new Map();
    for (const city of region.cities || []) {
        cityMap.set(String(city.code || '').toLowerCase(), city);
    }
    CITY_MAP_BY_REGION.set(regionCode, cityMap);
}

function normalizeGeoCode(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    return text
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_');
}

function normalizeNullableString(value, { toLower = true } = {}) {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const text = String(value).trim();
    if (!text) return null;
    return toLower ? text.toLowerCase() : text;
}

function parseNullableInteger(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getRegionEntry(regionCode) {
    if (!regionCode) return null;
    return REGION_MAP.get(String(regionCode).toLowerCase()) || null;
}

function getCityEntry(regionCode, cityCode) {
    if (!regionCode || !cityCode) return null;
    const cityMap = CITY_MAP_BY_REGION.get(String(regionCode).toLowerCase());
    if (!cityMap) return null;
    return cityMap.get(String(cityCode).toLowerCase()) || null;
}

function isCityInRegion(regionCode, cityCode) {
    return !!getCityEntry(regionCode, cityCode);
}

function getLocationNames(regionCode, cityCode) {
    const region = getRegionEntry(regionCode);
    const city = getCityEntry(regionCode, cityCode);

    return {
        region_name_ru: region ? region.name_ru : null,
        region_name_uz: region ? region.name_uz : null,
        city_name_ru: city ? city.name_ru : null,
        city_name_uz: city ? city.name_uz : null
    };
}

function enrichSchoolLocationNames(school) {
    if (!school || typeof school !== 'object') return school;
    const names = getLocationNames(school.region_code, school.city_code);
    return {
        ...school,
        ...names
    };
}

function getLocationsReference() {
    return {
        regions: UZ_LOCATIONS.regions.map((region) => ({
            code: region.code,
            name_ru: region.name_ru,
            name_uz: region.name_uz,
            cities: (region.cities || []).map((city) => ({
                code: city.code,
                name_ru: city.name_ru,
                name_uz: city.name_uz
            }))
        }))
    };
}

function getSchoolProfileValueName(field, value, lang = 'ru') {
    const fallback = lang === 'uz' ? 'Ko`rsatilmagan' : 'Не указано';
    if (!value || value === UNKNOWN_CODE) return fallback;
    const labelSet = SCHOOL_PROFILE_LABELS[field];
    if (!labelSet || !labelSet[value]) return value;
    return labelSet[value][lang] || labelSet[value].ru || value;
}

function resolveDimensionName(dimension, value, lang = 'ru') {
    const unknown = lang === 'uz' ? 'Ko`rsatilmagan' : 'Не указано';
    if (!value || value === UNKNOWN_CODE) return unknown;

    if (dimension === 'region') {
        const region = getRegionEntry(value);
        return region ? (lang === 'uz' ? region.name_uz : region.name_ru) : unknown;
    }

    if (dimension === 'city') {
        for (const region of UZ_LOCATIONS.regions) {
            const city = (region.cities || []).find((entry) => entry.code === value);
            if (city) {
                return lang === 'uz' ? city.name_uz : city.name_ru;
            }
        }
        return unknown;
    }

    if (['school_type', 'ownership', 'language_model', 'study_shift'].includes(dimension)) {
        return getSchoolProfileValueName(dimension, value, lang);
    }

    return value;
}

function normalizeAndValidateSchoolProfile(input = {}, options = {}) {
    const mode = options.mode === 'update' ? 'update' : 'create';
    const nowYear = new Date().getFullYear();

    const errors = [];
    const values = {};

    const hasRegion = Object.prototype.hasOwnProperty.call(input, 'region_code');
    const hasCity = Object.prototype.hasOwnProperty.call(input, 'city_code');

    const regionCode = hasRegion ? normalizeGeoCode(input.region_code) : undefined;
    const cityCode = hasCity ? normalizeGeoCode(input.city_code) : undefined;

    if (mode === 'create') {
        if (!regionCode) {
            errors.push({
                field: 'region_code',
                code: 'region_required',
                message: 'region_code is required'
            });
        }
        if (!cityCode) {
            errors.push({
                field: 'city_code',
                code: 'city_required',
                message: 'city_code is required'
            });
        }
    } else if (hasRegion || hasCity) {
        if (!regionCode) {
            errors.push({
                field: 'region_code',
                code: 'region_required',
                message: 'region_code is required when city_code is provided'
            });
        }
        if (!cityCode) {
            errors.push({
                field: 'city_code',
                code: 'city_required',
                message: 'city_code is required when region_code is provided'
            });
        }
    }

    if ((mode === 'create' || hasRegion || hasCity) && regionCode && cityCode) {
        const region = getRegionEntry(regionCode);
        if (!region) {
            errors.push({
                field: 'region_code',
                code: 'invalid_region',
                message: 'Unknown region_code'
            });
        } else if (!isCityInRegion(regionCode, cityCode)) {
            errors.push({
                field: 'city_code',
                code: 'city_not_in_region',
                message: 'city_code does not belong to region_code'
            });
        }
    }

    if (mode === 'create' || hasRegion) {
        values.region_code = regionCode || null;
    }
    if (mode === 'create' || hasCity) {
        values.city_code = cityCode || null;
    }

    for (const field of Object.keys(SCHOOL_PROFILE_ENUMS)) {
        if (mode !== 'create' && !Object.prototype.hasOwnProperty.call(input, field)) {
            continue;
        }

        const normalized = normalizeNullableString(input[field], { toLower: true });
        if (normalized !== null && normalized !== undefined && !SCHOOL_PROFILE_ENUMS[field].includes(normalized)) {
            errors.push({
                field,
                code: 'invalid_enum',
                message: `Invalid ${field} value`
            });
        }
        values[field] = normalized === undefined ? null : normalized;
    }

    if (mode === 'create' || Object.prototype.hasOwnProperty.call(input, 'capacity')) {
        const capacity = parseNullableInteger(input.capacity);
        if (Number.isNaN(capacity) || (capacity !== null && capacity < 0) || capacity > MAX_CAPACITY) {
            errors.push({
                field: 'capacity',
                code: 'invalid_range',
                message: `capacity must be an integer between 0 and ${MAX_CAPACITY}`
            });
        }
        values.capacity = Number.isNaN(capacity) ? null : capacity;
    }

    if (mode === 'create' || Object.prototype.hasOwnProperty.call(input, 'opened_year')) {
        const openedYear = parseNullableInteger(input.opened_year);
        if (
            Number.isNaN(openedYear) ||
            (openedYear !== null && (openedYear < MIN_OPENED_YEAR || openedYear > nowYear))
        ) {
            errors.push({
                field: 'opened_year',
                code: 'invalid_range',
                message: `opened_year must be an integer between ${MIN_OPENED_YEAR} and ${nowYear}`
            });
        }
        values.opened_year = Number.isNaN(openedYear) ? null : openedYear;
    }

    return {
        errors,
        values
    };
}

module.exports = {
    UNKNOWN_CODE,
    SCHOOL_PROFILE_ENUMS,
    SCHOOL_PROFILE_LABELS,
    getLocationsReference,
    getRegionEntry,
    getCityEntry,
    getLocationNames,
    enrichSchoolLocationNames,
    normalizeGeoCode,
    resolveDimensionName,
    getSchoolProfileValueName,
    normalizeAndValidateSchoolProfile
};
