const BASE_URL = process.env.ARTIFACTORY_URL ?? 'http://localhost:8082';
const USER = process.env.ARTIFACTORY_USER ?? 'admin';
const PASS = process.env.ARTIFACTORY_PASSWORD ?? 'password';
const REPO = process.env.ARTIFACTORY_REPO ?? 'skills-registry';

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

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
}

async function apiFetch(path: string, options: FetchOptions = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
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

export async function checkHealth(): Promise<void> {
  await apiFetch('/artifactory/api/v1/system/ping');
}

export async function listSkills(): Promise<SkillEntry[]> {
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

export async function searchSkills(query: string): Promise<SearchResult[]> {
  const skills = await listSkills();
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

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
        results.push({ name: skillName, description, tags, versions: skill.versions });
      }
    } catch {
      // Skip skills that can't be fetched
    }
  }

  return results;
}
