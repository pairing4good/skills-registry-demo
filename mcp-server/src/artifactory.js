const BASE_URL = process.env.ARTIFACTORY_URL || 'http://localhost:8082';
const USER = process.env.ARTIFACTORY_USER || 'admin';
const PASS = process.env.ARTIFACTORY_PASSWORD || 'password';
const REPO = process.env.ARTIFACTORY_REPO || 'skills-registry';

function authHeader() {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
}

async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Artifactory ${res.status} ${res.statusText}: ${body}`);
  }
  return res;
}

export async function checkHealth() {
  await apiFetch('/artifactory/api/v1/system/ping');
}

export async function listSkills() {
  const res = await apiFetch(
    `/artifactory/api/storage/${REPO}/skills?list&deep=1&listFolders=0`
  );
  const data = await res.json();
  const files = data.files || [];

  // Extract unique skill names from paths: /skills/{name}/{version}/skill.md
  const skillMap = new Map();
  for (const file of files) {
    const match = file.uri.match(/^\/([^/]+)\/([^/]+)\/skill\.md$/);
    if (match) {
      const [, name, version] = match;
      if (!skillMap.has(name)) {
        skillMap.set(name, { name, versions: [] });
      }
      skillMap.get(name).versions.push(version);
    }
  }

  return Array.from(skillMap.values());
}

export async function getSkill(name, version = 'latest') {
  if (version === 'latest') {
    // List available versions and pick the highest semver
    const res = await apiFetch(
      `/artifactory/api/storage/${REPO}/skills/${name}?list`
    );
    const data = await res.json();
    const versions = (data.files || [])
      .map((f) => f.uri.match(/^\/([^/]+)\//)?.[1])
      .filter(Boolean)
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
        }
        return 0;
      });

    if (versions.length === 0) {
      throw new Error(`No versions found for skill: ${name}`);
    }
    version = versions[0];
  }

  const res = await apiFetch(
    `/artifactory/${REPO}/skills/${name}/${version}/skill.md`,
    { headers: { 'Content-Type': 'text/plain' } }
  );
  return res.text();
}

export async function searchSkills(query) {
  const skills = await listSkills();
  const lowerQuery = query.toLowerCase();
  const results = [];

  for (const skill of skills) {
    try {
      const content = await getSkill(skill.name);
      // Parse YAML front-matter between --- delimiters
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const fm = fmMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m);

      const skillName = nameMatch?.[1]?.trim() || '';
      const description = descMatch?.[1]?.trim() || '';
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
