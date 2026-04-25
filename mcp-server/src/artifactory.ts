const BASE_URL = process.env.ARTIFACTORY_URL ?? 'http://localhost:8082';
const USER = process.env.ARTIFACTORY_USER ?? 'admin';
const PASS = process.env.ARTIFACTORY_PASSWORD ?? 'password';
const REPO = process.env.ARTIFACTORY_REPO ?? 'skills-registry';

const CHARACTER_LIMIT = 25_000;
const FETCH_TIMEOUT_MS = 10_000;

interface FetchOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

interface ArtifactoryFile {
  uri: string;
}

interface ArtifactoryStorageResponse {
  files?: ArtifactoryFile[];
}

export interface SkillEntry {
  name: string;
  versions: string[];
}

export interface SearchResult {
  name: string;
  description: string;
  tags: string[];
  versions: string[];
}

export interface PaginatedResult<T> {
  total: number;
  count: number;
  offset: number;
  items: T[];
  has_more: boolean;
  next_offset?: number;
  truncated?: boolean;
  truncation_message?: string;
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
}

async function apiFetch(path: string, options: FetchOptions = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...options,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Artifactory ${res.status} ${res.statusText}: ${body}`);
  }
  return res;
}

function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
    }
    return 0;
  });
}

function matchesSemverConstraint(version: string, constraint: string): boolean {
  if (constraint === 'latest') return true;

  const [vMaj, vMin, vPat] = version.split('.').map(Number);

  // ~X.Y.Z  →  >=X.Y.Z  <X.(Y+1).0  (patch-compatible within same minor)
  const tildeMatch = constraint.match(/^~(\d+)\.(\d+)\.(\d+)$/);
  if (tildeMatch) {
    const cMaj = Number(tildeMatch[1]);
    const cMin = Number(tildeMatch[2]);
    const cPat = Number(tildeMatch[3]);
    return vMaj === cMaj && vMin === cMin && vPat >= cPat;
  }

  // ^X.Y.Z  →  >=X.Y.Z  <(X+1).0.0  (minor-compatible within same major)
  const caretMatch = constraint.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  if (caretMatch) {
    const cMaj = Number(caretMatch[1]);
    const cMin = Number(caretMatch[2]);
    const cPat = Number(caretMatch[3]);
    if (vMaj !== cMaj) return false;
    if (vMin > cMin) return true;
    return vMin === cMin && vPat >= cPat;
  }

  return version === constraint;
}

function paginateAndLimit<T>(all: T[], limit: number, offset: number): PaginatedResult<T> {
  const total = all.length;
  const page = all.slice(offset, offset + limit);
  const hasMore = offset + page.length < total;

  const result: PaginatedResult<T> = {
    total,
    count: page.length,
    offset,
    items: page,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + page.length } : {}),
  };

  if (JSON.stringify(result).length > CHARACTER_LIMIT) {
    const half = Math.max(1, Math.floor(page.length / 2));
    const truncated = page.slice(0, half);
    return {
      total,
      count: truncated.length,
      offset,
      items: truncated,
      has_more: true,
      next_offset: offset + truncated.length,
      truncated: true,
      truncation_message:
        `Response truncated from ${page.length} to ${truncated.length} items. ` +
        `Use the 'offset' parameter to page through results.`,
    };
  }

  return result;
}

async function listVersions(name: string): Promise<string[]> {
  const res = await apiFetch(
    `/artifactory/api/storage/${REPO}/skills/${name}?list&listFolders=1`
  );
  const data = await res.json() as ArtifactoryStorageResponse;
  return [...new Set(
    (data.files ?? [])
      .map((f) => f.uri.match(/^\/([^/]+)\/?$/)?.[1])
      .filter((v): v is string => Boolean(v))
  )];
}

async function fetchFile(name: string, version: string, filePath: string): Promise<string> {
  const res = await apiFetch(
    `/artifactory/${REPO}/skills/${name}/${version}/${filePath}`,
    { headers: { 'Content-Type': 'text/plain' } }
  );
  return res.text();
}

async function fetchAllSkills(): Promise<SkillEntry[]> {
  const res = await apiFetch(
    `/artifactory/api/storage/${REPO}/skills?list&deep=1&listFolders=0`
  );
  const data = await res.json() as ArtifactoryStorageResponse;
  const files = data.files ?? [];

  const skillMap = new Map<string, SkillEntry>();
  for (const file of files) {
    const match = file.uri.match(/^\/([^/]+)\/([^/]+)\/skill\.md$/);
    if (match) {
      const [, name, version] = match;
      if (!skillMap.has(name)) {
        skillMap.set(name, { name, versions: [] });
      }
      skillMap.get(name)!.versions.push(version);
    }
  }

  return Array.from(skillMap.values());
}

export async function checkHealth(): Promise<void> {
  await apiFetch('/artifactory/api/v1/system/ping');
}

export async function listSkills(limit = 20, offset = 0): Promise<PaginatedResult<SkillEntry>> {
  const all = await fetchAllSkills();
  return paginateAndLimit(all, limit, offset);
}

// Resolves a version constraint to an exact version string.
// Constraints: 'latest', exact '1.2.3', patch-range '~1.2.0', minor-range '^1.0.0'
export async function resolveVersion(name: string, constraint = 'latest'): Promise<string> {
  if (constraint !== 'latest' && !constraint.startsWith('~') && !constraint.startsWith('^')) {
    return constraint; // exact version — no Artifactory lookup needed
  }

  const versions = await listVersions(name);
  if (versions.length === 0) {
    throw new Error(`No versions found for skill: ${name}`);
  }

  const matching = sortVersionsDesc(versions).filter((v) =>
    matchesSemverConstraint(v, constraint)
  );

  if (matching.length === 0) {
    throw new Error(
      `No version of skill '${name}' satisfies constraint '${constraint}'. ` +
      `Available: ${sortVersionsDesc(versions).join(', ')}`
    );
  }

  return matching[0];
}

// Fetches all files in the skill bundle for an exact version.
// Pass the result of resolveVersion() as the version argument.
export async function getSkill(name: string, version: string): Promise<string> {
  const listRes = await apiFetch(
    `/artifactory/api/storage/${REPO}/skills/${name}/${version}?list&deep=1&listFolders=0`
  );
  const listData = await listRes.json() as ArtifactoryStorageResponse;
  const files = (listData.files ?? []).map((f) => f.uri.replace(/^\//, ''));

  if (files.length === 0) {
    throw new Error(`No files found for skill: ${name}@${version}`);
  }

  const fetched = await Promise.all(
    files.map(async (filePath) => {
      const content = await fetchFile(name, version, filePath);
      return `=== ${filePath} ===\n${content}`;
    })
  );

  return fetched.join('\n\n');
}

export async function searchSkills(
  query: string,
  limit = 20,
  offset = 0
): Promise<PaginatedResult<SearchResult>> {
  const skills = await fetchAllSkills();
  const lowerQuery = query.toLowerCase();
  const allResults: SearchResult[] = [];

  for (const skill of skills) {
    try {
      const version = sortVersionsDesc(skill.versions)[0];
      const content = await fetchFile(skill.name, version, 'skill.md');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const fm = fmMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m);

      const skillName = nameMatch?.[1]?.trim() ?? '';
      const description = descMatch?.[1]?.trim() ?? '';
      const tags = tagsMatch ? tagsMatch[1].split(',').map((t) => t.trim()) : [];

      const searchTarget = `${skillName} ${description} ${tags.join(' ')}`.toLowerCase();
      if (searchTarget.includes(lowerQuery)) {
        allResults.push({ name: skillName, description, tags, versions: skill.versions });
      }
    } catch {
      // Skip skills that can't be fetched
    }
  }

  return paginateAndLimit(allResults, limit, offset);
}
