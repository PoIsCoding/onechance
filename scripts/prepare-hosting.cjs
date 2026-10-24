const { cpSync, mkdirSync, readFileSync, rmSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const config = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));

// Only ever remove this generated directory inside the project.
if (path.resolve(root, config.hosting.public) !== publicDir) {
  throw new Error('The hosting output must be the project public directory.');
}

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

for (const entry of ['index.html', 'stats.html', 'assets']) {
  cpSync(path.join(root, entry), path.join(publicDir, entry), { recursive: true });
}

console.log('Firebase Hosting: index.html, stats.html and assets copied to public/.');
