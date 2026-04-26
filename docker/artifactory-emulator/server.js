const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DATA_DIR = process.env.DATA_DIR || '/data';
const PORT = parseInt(process.env.PORT || '8082', 10);

fs.mkdirSync(DATA_DIR, { recursive: true });

app.get('/artifactory/api/system/ping', (_req, res) => res.send('OK'));

app.get('/artifactory/api/repositories', (_req, res) => {
  const repos = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ key: e.name, type: 'LOCAL', packageType: 'generic' }));
  res.json(repos);
});

app.patch('/artifactory/api/system/configuration', (_req, res) => res.send(''));

app.put('/artifactory/api/repositories/:repo', express.json(), (req, res) => {
  fs.mkdirSync(path.join(DATA_DIR, req.params.repo), { recursive: true });
  res.send(`Successfully created repository '${req.params.repo}'`);
});

app.get('/artifactory/api/storage/:repo/*', (req, res) => {
  const repoPath = req.params[0] || '';
  const fsPath = path.join(DATA_DIR, req.params.repo, repoPath);

  if (!fs.existsSync(fsPath)) {
    return res.status(404).json({ errors: [{ status: 404, message: 'File not found' }] });
  }

  if (!('list' in req.query)) {
    const stat = fs.statSync(fsPath);
    return res.json({ repo: req.params.repo, path: '/' + repoPath, size: stat.size });
  }

  const deep = req.query.deep === '1';
  const listFolders = req.query.listFolders === '1';
  const files = [];

  function walk(dir, base) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const uri = '/' + (base ? base + '/' : '') + entry.name;
      if (entry.isDirectory()) {
        if (listFolders) files.push({ uri: uri + '/', folder: true });
        if (deep) walk(path.join(dir, entry.name), (base ? base + '/' : '') + entry.name);
      } else {
        files.push({ uri, folder: false });
      }
    }
  }
  walk(fsPath, '');
  res.json({ repo: req.params.repo, path: '/' + repoPath, files });
});

app.get('/artifactory/:repo/*', (req, res) => {
  const fsPath = path.join(DATA_DIR, req.params.repo, req.params[0]);
  if (!fs.existsSync(fsPath) || fs.statSync(fsPath).isDirectory()) {
    return res.status(404).json({ errors: [{ status: 404, message: 'File not found' }] });
  }
  res.sendFile(fsPath);
});

app.put('/artifactory/:repo/*', (req, res) => {
  const fsPath = path.join(DATA_DIR, req.params.repo, req.params[0]);
  fs.mkdirSync(path.dirname(fsPath), { recursive: true });
  const ws = fs.createWriteStream(fsPath);
  req.pipe(ws);
  ws.on('finish', () => {
    const stat = fs.statSync(fsPath);
    res.status(201).json({
      repo: req.params.repo,
      path: '/' + req.params[0],
      created: new Date().toISOString(),
      size: String(stat.size),
      downloadUri: `http://localhost:${PORT}/artifactory/${req.params.repo}/${req.params[0]}`,
    });
  });
  ws.on('error', err => res.status(500).json({ errors: [{ status: 500, message: err.message }] }));
});

app.listen(PORT, () => console.log(`Artifactory mock listening on port ${PORT}`));
