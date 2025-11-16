import http from 'node:http';
import https from 'node:https';
import readline from 'node:readline';
import dns from 'node:dns';
import { randomUUID } from 'node:crypto';
import zlib from 'node:zlib';
import unzipper from 'unzipper';
import type { File as ZipFileEntry } from 'unzipper';
import { createScenarioStore } from './scenarioStore.ts';

const PORT = Number(process.env.PORT ?? 4000);
const store = createScenarioStore();
const CMHC_ENDPOINT = 'https://www03.cmhc-schl.gc.ca/hmip-pimh/en/TableMapChart/ExportTable';
const VACANCY_CACHE_MS = 1000 * 60 * 60; // 1 hour

try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch {
  // Ignore environments that do not support overriding the resolution order.
}

type ScenarioRequestBody = {
  name?: unknown;
  assumptions?: unknown;
};

const defaultHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Season = 'October' | 'April';

type VacancyPoint = {
  date: string;
  year: number;
  quarter: number;
  season: string;
  label: string;
  rate: number;
  quality: string | null;
};

type VacancyResponse = {
  metroCode: string;
  seasons: Season[];
  retrievedAt: string;
  points: VacancyPoint[];
};

type CrimeRateEntry = {
  code: string;
  level: 'CMA' | 'PR';
  geographyName: string;
  latestYear: number;
  latestValue: number;
};

type CrimeDataset = {
  updatedAt: string;
  records: Map<string, CrimeRateEntry>;
};

type DemographicSummary = {
  postalCode: string;
  location: { latitude: number; longitude: number; label?: string };
  censusRegion: { level: string; geoid: string; name: string; label: string };
  householdIncome: number | null;
  englishPercent: number | null;
  englishDetails: { englishOnly: number; englishAndFrench: number; total: number };
  crimeRate: {
    per100k: number | null;
    referenceYear: number | null;
    geographyName: string;
    level: string | null;
    code: string | null;
  } | null;
  sources: { census: string; crime: string };
};

class RequestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const vacancyCache = new Map<string, { expiresAt: number; payload: VacancyResponse }>();
const DEFAULT_SEASONS: Season[] = ['October', 'April'];
const CANCENSUS_API_KEY = process.env.CANCENSUS_API_KEY ?? 'CensusMapper_c7463a09a1868e5f0547af6fdbc38fc7';
const CANCENSUS_BASE_URL = 'https://censusmapper.ca/api/v1';
const CANCENSUS_DATASET = 'CA21';
const CENSUS_VECTOR_KEYS = {
  medianHouseholdIncome: 'v_CA21_907',
  languageTotal: 'v_CA21_1144',
  englishOnly: 'v_CA21_1147',
  englishAndFrench: 'v_CA21_1153',
} as const;
const CRIME_DATASET_URL = 'https://www150.statcan.gc.ca/n1/tbl/csv/35100177-eng.zip';
const GEOCODER_BASE_URL = 'https://nominatim.openstreetmap.org';
const GEOCODER_USER_AGENT = '8plex-market-data/1.0 (+https://github.com/rajanchopra/8plex)';

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.stack && error.message && !error.stack.includes(error.message)) {
      return `${error.message}\n${error.stack}`;
    }
    return error.stack ?? error.message ?? error.name ?? 'Unknown error';
  }
  try {
    return typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

const sendJson = (res: http.ServerResponse, status: number, payload: unknown): void => {
  res.writeHead(status, { ...defaultHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const parseRequestBody = (req: http.IncomingMessage): Promise<ScenarioRequestBody> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      })
      .on('end', () => {
        if (!chunks.length) {
          resolve({});
          return;
        }
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('Invalid JSON payload'));
        }
      })
      .on('error', reject);
  });

const monthLookup: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

type ParsedDate = {
  iso: string;
  year: number;
  quarter: number;
  season: string;
};

const parseDateLabel = (label: string): ParsedDate | null => {
  const trimmed = label.trim();
  if (!trimmed) {
    return null;
  }
  const monthMatch = trimmed.match(/^(\d{4})\s+([A-Za-z]+)$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const season = monthMatch[2];
    const monthNumber = monthLookup[season.toLowerCase()];
    if (!Number.isFinite(year) || !monthNumber) {
      return null;
    }
    const date = new Date(Date.UTC(year, monthNumber - 1, 1));
    const quarter = Math.floor((monthNumber - 1) / 3) + 1;
    return {
      iso: date.toISOString(),
      year,
      quarter,
      season,
    };
  }
  const quarterMatch = trimmed.match(/^(\d{4})\/Q(\d)$/i);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const quarter = Number(quarterMatch[2]);
    if (!Number.isFinite(year) || !Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
      return null;
    }
    const monthNumber = (quarter - 1) * 3 + 1;
    const date = new Date(Date.UTC(year, monthNumber - 1, 1));
    const seasonNames = ['Q1', 'Q2', 'Q3', 'Q4'];
    return {
      iso: date.toISOString(),
      year,
      quarter,
      season: seasonNames[quarter - 1],
    };
  }
  return null;
};

const parseVacancyCsv = (csv: string): VacancyPoint[] => {
  const sanitized = csv.replace(/\r/g, '');
  const lines = sanitized
    .split('\n')
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter((line) => line.length);
  const headerIndex = lines.findIndex((line) => line.startsWith(','));
  if (headerIndex === -1) {
    return [];
  }
  const headers = lines[headerIndex]
    .split(',')
    .map((cell) => cell.trim().toLowerCase());
  const totalIndex = headers.findIndex((cell) => cell === 'total');
  if (totalIndex === -1) {
    return [];
  }
  const points: VacancyPoint[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const row = lines[index];
    if (row.toLowerCase().startsWith('notes') || row.toLowerCase().startsWith('source')) {
      break;
    }
    const cells = row.split(',').map((cell) => cell.trim());
    const label = cells[0] ?? '';
    const dateInfo = parseDateLabel(label);
    if (!label || !dateInfo) {
      continue;
    }
    const rate = Number(cells[totalIndex] ?? '');
    if (!Number.isFinite(rate)) {
      continue;
    }
    const qualityRaw = cells[totalIndex + 1]?.trim() ?? '';
    let normalizedQuality: string | null = null;
    if (qualityRaw) {
      const cleaned = qualityRaw.replace(/[^a-dA-D+*]/g, '').toUpperCase();
      normalizedQuality = cleaned.length ? cleaned : null;
    }
    points.push({
      date: dateInfo.iso,
      year: dateInfo.year,
      quarter: dateInfo.quarter,
      season: dateInfo.season,
      label,
      rate,
      quality: normalizedQuality,
    });
  }
  return points;
};

const fetchSeasonSeries = async (metroCode: string, season: Season): Promise<VacancyPoint[]> => {
  const params = new URLSearchParams();
  params.set('TableId', '2.2.1');
  params.set('GeographyId', metroCode);
  params.set('GeographyTypeId', '3');
  params.set('exportType', 'csv');
  params.append('AppliedFilters[0].Key', 'dwelling_type_desc_en');
  params.append('AppliedFilters[0].Value', 'Row / Apartment');
  params.append('AppliedFilters[1].Key', 'season');
  params.append('AppliedFilters[1].Value', season);

  const body = params.toString();
  const payload = await new Promise<string>((resolve, reject) => {
    const request = https.request(
      CMHC_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`CMHC request failed with status ${response.statusCode ?? 'unknown'}`));
          response.resume();
          return;
        }
        const responseChunks: Buffer[] = [];
        response.setEncoding('utf8');
        response
          .on('data', (chunk: string) => {
            responseChunks.push(Buffer.from(chunk, 'utf8'));
          })
          .on('end', () => {
            resolve(Buffer.concat(responseChunks).toString('utf8'));
          })
          .on('error', reject);
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });

  return parseVacancyCsv(payload);
};

const fetchCmhcVacancyData = async (metroCode: string, seasons: Season[]): Promise<VacancyResponse> => {
  const uniqueSeasons = Array.from(new Set(seasons));
  const pointArrays = await Promise.all(uniqueSeasons.map((season) => fetchSeasonSeries(metroCode, season)));
  const combinedPoints = pointArrays.flat().sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return aTime - bTime;
  });
  const deduped = combinedPoints.reduce<VacancyPoint[]>((acc, point) => {
    if (!point.date) {
      return acc;
    }
    const hasExisting = acc.some((existing) => existing.date === point.date && existing.season === point.season);
    if (!hasExisting) {
      acc.push(point);
    }
    return acc;
  }, []);
  return {
    metroCode,
    seasons: uniqueSeasons,
    retrievedAt: new Date().toISOString(),
    points: deduped,
  };
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

const stripCellQuotes = (value: string): string => value.replace(/^"|"$/g, '').trim();

const readResponseBuffer = (response: http.IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response
      .on('data', (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      })
      .on('end', () => {
        try {
          let buffer = Buffer.concat(chunks);
          const encoding = (response.headers['content-encoding'] ?? '').toLowerCase();
          if (encoding.includes('gzip')) {
            buffer = zlib.gunzipSync(buffer);
          } else if (encoding.includes('deflate')) {
            buffer = zlib.inflateSync(buffer);
          }
          resolve(buffer);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });

const getBuffer = (
  url: string,
  headers: Record<string, string> = {},
): Promise<{ buffer: Buffer; headers: http.IncomingHttpHeaders }> =>
  new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'Accept-Encoding': 'gzip,deflate',
          ...headers,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 400) {
          readResponseBuffer(response)
            .then((body) => reject(new Error(`Request failed with status ${status}: ${body.toString('utf8')}`)))
            .catch(reject);
          return;
        }
        readResponseBuffer(response)
          .then((buffer) => resolve({ buffer, headers: response.headers }))
          .catch(reject);
      },
    );
    request.on('error', reject);
  });

const postFormBuffer = (
  url: string,
  params: URLSearchParams,
): Promise<{ buffer: Buffer; headers: http.IncomingHttpHeaders }> =>
  new Promise((resolve, reject) => {
    const body = params.toString();
    const request = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body).toString(),
          'Accept-Encoding': 'gzip,deflate',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 400) {
          readResponseBuffer(response)
            .then((payload) => reject(new Error(`Request failed with status ${status}: ${payload.toString('utf8')}`)))
            .catch(reject);
          return;
        }
        readResponseBuffer(response)
          .then((buffer) => resolve({ buffer, headers: response.headers }))
          .catch(reject);
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });

const fetchJson = async (url: string): Promise<unknown> => {
  const { buffer } = await getBuffer(url, { 'User-Agent': GEOCODER_USER_AGENT });
  return JSON.parse(buffer.toString('utf8'));
};

let crimeDatasetPromise: Promise<CrimeDataset> | null = null;

const downloadCrimeDataset = async (): Promise<CrimeDataset> => {
  const { buffer } = await getBuffer(CRIME_DATASET_URL);
  const directory = await unzipper.Open.buffer(buffer);
  const csvEntry = directory.files.find(
    (file: ZipFileEntry) => file.path.toLowerCase().endsWith('.csv') && !file.path.toLowerCase().includes('metadata'),
  );
  if (!csvEntry) {
    throw new Error('Crime dataset is missing CSV content');
  }
  const stream = await csvEntry.stream();
  return new Promise((resolve, reject) => {
    const records = new Map<string, CrimeRateEntry>();
    const rl = readline.createInterface({ input: stream });
    let headers: string[] | null = null;
    rl.on('line', (line) => {
      if (!headers) {
        headers = parseCsvLine(line).map((cell) => stripCellQuotes(cell).replace(/^\uFEFF/, ''));
        return;
      }
      const cells = parseCsvLine(line).map(stripCellQuotes);
      if (!cells.length) {
        return;
      }
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? '';
      });
      if (row.Statistics !== 'Rate per 100,000 population' || row.Violations !== 'Total, all violations [0]') {
        return;
      }
      const geoLabel = row.GEO ?? '';
      const codeMatch = geoLabel.match(/\[(\d+)\]$/);
      if (!codeMatch) {
        return;
      }
      const code = codeMatch[1];
      let level: CrimeRateEntry['level'];
      if (code.length === 5) {
        level = 'CMA';
      } else if (code.length === 2) {
        level = 'PR';
      } else {
        return;
      }
      const value = Number(row.VALUE);
      const year = Number(row['REF_DATE']);
      if (!Number.isFinite(value) || !Number.isFinite(year)) {
        return;
      }
      const geographyName = geoLabel.replace(/\s*\[\d+\]\s*$/, '');
      const existing = records.get(code);
      if (!existing || year > existing.latestYear) {
        const entry: CrimeRateEntry = existing ?? {
          code,
          level,
          geographyName,
          latestYear: year,
          latestValue: value,
        };
        entry.latestYear = year;
        entry.latestValue = value;
        entry.geographyName = geographyName;
        records.set(code, entry);
        const normalizedCode = code.replace(/^0+/, '');
        if (normalizedCode && normalizedCode !== code) {
          records.set(normalizedCode, entry);
        }
      }
    });
    rl.on('close', () => {
      resolve({
        updatedAt: new Date().toISOString(),
        records,
      });
    });
    rl.on('error', reject);
    stream.on('error', reject);
  });
};

const loadCrimeDataset = (): Promise<CrimeDataset> => {
  if (!crimeDatasetPromise) {
    crimeDatasetPromise = downloadCrimeDataset().catch((error) => {
      crimeDatasetPromise = null;
      throw error;
    });
  }
  return crimeDatasetPromise;
};

const lookupCrimeRateRecord = async (codes: Array<string | null | undefined>): Promise<CrimeRateEntry | null> => {
  const dataset = await loadCrimeDataset();
  for (const code of codes) {
    if (!code) {
      continue;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = trimmed.replace(/^0+/, '') || trimmed;
    const entry = dataset.records.get(trimmed) ?? dataset.records.get(normalized);
    if (entry) {
      return entry;
    }
  }
  return null;
};

const lookupPostalCoordinates = async (postalCode: string) => {
  const params = new URLSearchParams();
  params.set('format', 'json');
  params.set('country', 'Canada');
  params.set('postalcode', postalCode);
  params.set('limit', '5');
  const payload = (await fetchJson(`${GEOCODER_BASE_URL}/search?${params.toString()}`)) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    addresstype?: string;
  }>;
  if (!Array.isArray(payload) || !payload.length) {
    throw new RequestError(404, 'Unable to geocode postal code');
  }
  const candidate =
    payload.find((entry) => entry?.addresstype === 'postcode' && entry?.display_name?.includes('Canada')) ?? payload[0];
  const latitude = Number(candidate?.lat);
  const longitude = Number(candidate?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new RequestError(502, 'Geocoder returned invalid coordinates');
  }
  return {
    latitude,
    longitude,
    label: candidate?.display_name ?? postalCode,
  };
};

const fetchCensusRegionForLevel = async (geometry: string, level: string): Promise<string | null> => {
  if (!CANCENSUS_API_KEY) {
    throw new RequestError(500, 'CensusMapper API key is not configured');
  }
  const params = new URLSearchParams();
  params.set('dataset', CANCENSUS_DATASET);
  params.set('level', level);
  params.set('geometry', geometry);
  params.set('area', '0');
  params.set('api_key', CANCENSUS_API_KEY);
  const { buffer } = await postFormBuffer(`${CANCENSUS_BASE_URL}/intersecting_geographies`, params);
  const payload = JSON.parse(buffer.toString('utf8')) as Record<string, string[]>;
  const matches = payload[level];
  if (Array.isArray(matches) && matches.length > 0) {
    return matches[0];
  }
  return null;
};

const fetchCensusDemographics = async (level: string, geoid: string) => {
  if (!CANCENSUS_API_KEY) {
    throw new RequestError(500, 'CensusMapper API key is not configured');
  }
  const params = new URLSearchParams();
  params.set('dataset', CANCENSUS_DATASET);
  params.set('regions', JSON.stringify({ [level]: [geoid] }));
  params.set('vectors', JSON.stringify(Object.values(CENSUS_VECTOR_KEYS)));
  params.set('level', level);
  params.set('geo_hierarchy', 'true');
  params.set('api_key', CANCENSUS_API_KEY);
  const { buffer } = await postFormBuffer(`${CANCENSUS_BASE_URL}/data.csv`, params);
  const text = buffer.toString('utf8').trim();
  const lines = text.split(/\r?\n/).filter((line) => line.length);
  if (lines.length < 2) {
    throw new RequestError(404, 'Census data is unavailable for this region');
  }
  const headers = parseCsvLine(lines[0]).map((cell) => stripCellQuotes(cell).replace(/^\uFEFF/, ''));
  const values = parseCsvLine(lines[1]).map(stripCellQuotes);
  const findVectorValue = (vectorId: string): number | null => {
    const index = headers.findIndex((header) => header.startsWith(vectorId));
    if (index === -1) {
      return null;
    }
    const rawValue = values[index]?.replace(/,/g, '');
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const medianIncome = findVectorValue(CENSUS_VECTOR_KEYS.medianHouseholdIncome);
  const englishOnly = findVectorValue(CENSUS_VECTOR_KEYS.englishOnly) ?? 0;
  const englishAndFrench = findVectorValue(CENSUS_VECTOR_KEYS.englishAndFrench) ?? 0;
  const languageTotal = findVectorValue(CENSUS_VECTOR_KEYS.languageTotal) ?? 0;
  const englishPercent =
    languageTotal > 0 ? Number((((englishOnly + englishAndFrench) / languageTotal) * 100).toFixed(2)) : null;
  const regionNameIndex = headers.indexOf('Region Name');
  const regionTypeIndex = headers.indexOf('Type');
  const regionName = regionNameIndex !== -1 ? values[regionNameIndex] : geoid;
  const regionType = regionTypeIndex !== -1 ? values[regionTypeIndex] : level;
  return {
    regionLevel: level,
    regionGeoId: geoid,
    regionName,
    regionLabel: `${regionType} ${regionName}`.trim(),
    medianIncome: medianIncome ?? null,
    englishOnly,
    englishAndFrench,
    englishTotal: languageTotal,
    englishPercent,
  };
};

const handleDemographicLookup = async (postalCodeRaw: string): Promise<DemographicSummary> => {
  const sanitized = postalCodeRaw.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(sanitized)) {
    throw new RequestError(400, 'Enter a valid Canadian postal code');
  }
  const formattedPostalCode = `${sanitized.slice(0, 3)} ${sanitized.slice(3)}`;
  const coordinates = await lookupPostalCoordinates(formattedPostalCode);
  const geometry = JSON.stringify({
    type: 'Point',
    coordinates: [coordinates.longitude, coordinates.latitude],
  });
  const regionLevels = ['CT', 'CSD'];
  let targetRegion: { level: string; geoid: string } | null = null;
  for (const level of regionLevels) {
    const geoid = await fetchCensusRegionForLevel(geometry, level);
    if (geoid) {
      targetRegion = { level, geoid };
      break;
    }
  }
  if (!targetRegion) {
    throw new RequestError(404, 'Unable to map postal code to a census geography');
  }
  const [demographics, cmaGeoId, provinceGeoId] = await Promise.all([
    fetchCensusDemographics(targetRegion.level, targetRegion.geoid),
    fetchCensusRegionForLevel(geometry, 'CMA'),
    fetchCensusRegionForLevel(geometry, 'PR'),
  ]);
  const crimeRecord = await lookupCrimeRateRecord([cmaGeoId, provinceGeoId]);
  return {
    postalCode: formattedPostalCode,
    location: coordinates,
    censusRegion: {
      level: demographics.regionLevel,
      geoid: demographics.regionGeoId,
      name: demographics.regionName,
      label: demographics.regionLabel,
    },
    householdIncome: demographics.medianIncome,
    englishPercent: demographics.englishPercent,
    englishDetails: {
      englishOnly: demographics.englishOnly,
      englishAndFrench: demographics.englishAndFrench,
      total: demographics.englishTotal,
    },
    crimeRate: crimeRecord
      ? {
          per100k: crimeRecord.latestValue,
          referenceYear: crimeRecord.latestYear,
          geographyName: crimeRecord.geographyName,
          level: crimeRecord.level,
          code: crimeRecord.code,
        }
      : null,
    sources: {
      census: 'CensusMapper CA21',
      crime: 'StatsCan table 35-10-0177-01 (rate per 100k population)',
    },
  };
};

export const handleHttpRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const method = req.method ?? 'GET';
  const requestUrl = req.url ?? '/';

  if (method === 'OPTIONS') {
    res.writeHead(204, defaultHeaders);
    res.end();
    return;
  }

  if (requestUrl.startsWith('/api/cmhc/vacancy')) {
    if (method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }
    const url = new URL(requestUrl, `http://${req.headers.host ?? 'localhost'}`);
    const metroCode = url.searchParams.get('metroCode')?.trim() ?? '';
    if (!/^\d{3,5}$/.test(metroCode)) {
      sendJson(res, 400, { message: 'metroCode query parameter is required' });
      return;
    }
    const seasonParams = url.searchParams.getAll('season');
    const parsedSeasons = seasonParams
      .map((value) => value.trim().toLowerCase())
      .map((value) => {
        if (value === 'april') {
          return 'April';
        }
        if (value === 'october') {
          return 'October';
        }
        return null;
      })
      .filter((value): value is Season => value != null);
    const seasons = parsedSeasons.length ? parsedSeasons : DEFAULT_SEASONS;
    const cacheKey = `${metroCode}:${seasons.slice().sort().join(',')}`;
    const cached = vacancyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      sendJson(res, 200, cached.payload);
      return;
    }
    try {
      const payload = await fetchCmhcVacancyData(metroCode, seasons);
      vacancyCache.set(cacheKey, { expiresAt: Date.now() + VACANCY_CACHE_MS, payload });
      sendJson(res, 200, payload);
    } catch (error) {
      console.error('Failed to fetch CMHC vacancy data:', error);
      sendJson(res, 502, { message: 'Unable to load CMHC vacancy data' });
    }
    return;
  }

  if (requestUrl.startsWith('/api/market-data/demographics')) {
    if (method !== 'GET') {
      sendJson(res, 405, { message: 'Method not allowed' });
      return;
    }
    const url = new URL(requestUrl, `http://${req.headers.host ?? 'localhost'}`);
    const postalCode = url.searchParams.get('postalCode')?.trim() ?? '';
    if (!postalCode) {
      sendJson(res, 400, { message: 'postalCode query parameter is required' });
      return;
    }
    try {
      const payload = await handleDemographicLookup(postalCode);
      sendJson(res, 200, payload);
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(res, error.statusCode, { message: error.message });
      } else {
        console.error('Failed to load demographic data:', error);
        sendJson(res, 502, {
          message: 'Unable to load demographic data',
          detail: formatUnknownError(error),
        });
      }
    }
    return;
  }

  if (requestUrl.startsWith('/api/scenarios')) {
    const url = new URL(requestUrl, `http://${req.headers.host ?? 'localhost'}`);
    if (method === 'GET' && url.pathname === '/api/scenarios') {
      try {
        const scenarios = await store.list();
        sendJson(res, 200, { scenarios });
      } catch (error) {
        console.error('Failed to list scenarios:', error);
        sendJson(res, 500, { message: 'Unable to load scenarios' });
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/scenarios') {
      try {
        const body = await parseRequestBody(req);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          sendJson(res, 400, { message: 'Scenario name is required' });
          return;
        }
        if (name.length > 120) {
          sendJson(res, 400, { message: 'Scenario name is too long' });
          return;
        }
        if (typeof body.assumptions !== 'object' || body.assumptions == null) {
          sendJson(res, 400, { message: 'Assumptions payload is required' });
          return;
        }

        const record = await store.create({
          id: randomUUID(),
          name,
          assumptions: body.assumptions,
          createdAt: new Date().toISOString(),
        });
        sendJson(res, 201, { scenario: record });
      } catch (error) {
        console.error('Failed to create scenario:', error);
        const message = error instanceof Error ? error.message : 'Unable to save scenario';
        sendJson(res, 400, { message });
      }
      return;
    }

    if (method === 'DELETE') {
      const segments = url.pathname.split('/').filter(Boolean);
      const scenarioId = segments[2];
      if (!scenarioId) {
        sendJson(res, 400, { message: 'Scenario id is required' });
        return;
      }
      try {
        const deleted = await store.delete(scenarioId);
        if (!deleted) {
          sendJson(res, 404, { message: 'Scenario not found' });
          return;
        }
        sendJson(res, 200, { success: true });
      } catch (error) {
        console.error('Failed to delete scenario:', error);
        sendJson(res, 500, { message: 'Unable to delete scenario' });
      }
      return;
    }
  }

  sendJson(res, 404, { message: 'Not Found' });
};

if (!process.env.VERCEL) {
  const server = http.createServer((req, res) => {
    handleHttpRequest(req, res).catch((error) => {
      console.error('Unhandled server error:', error);
      if (!res.headersSent) {
        sendJson(res, 500, { message: 'Internal server error' });
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Scenario API listening on http://localhost:${PORT}`);
  });
}
