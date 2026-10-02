import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(join(repositoryRoot, 'package-lock.json'), 'utf8'));
const rootPackage = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
const desktopPackage = JSON.parse(
  await readFile(join(repositoryRoot, 'apps/desktop/package.json'), 'utf8'),
);

function findLockEntry(name, startingPath = '') {
  let current = startingPath;
  while (current) {
    const candidate = `${current}/node_modules/${name}`;
    if (lock.packages[candidate]) return candidate;
    const marker = current.lastIndexOf('/node_modules/');
    if (marker === -1) break;
    current = current.slice(0, marker);
  }
  const rootEntry = `node_modules/${name}`;
  return lock.packages[rootEntry] ? rootEntry : null;
}

const included = new Map();
const pending = [
  ...Object.keys(desktopPackage.dependencies ?? {}).map((name) => ({ name, from: 'apps/desktop' })),
  ...Object.keys(rootPackage.dependencies ?? {}).map((name) => ({ name, from: '' })),
];

while (pending.length > 0) {
  const { name, from } = pending.pop();
  const packagePath = findLockEntry(name, from);
  if (!packagePath) throw new Error(`Missing locked package entry for ${name}.`);
  if (included.has(packagePath)) continue;
  const entry = lock.packages[packagePath];
  if (entry.link) continue;
  const packageDirectory = join(repositoryRoot, ...packagePath.split('/'));
  const manifestPath = join(packageDirectory, 'package.json');
  if (!existsSync(manifestPath)) throw new Error(`Missing installed package manifest for ${name}.`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  included.set(packagePath, { name, packageDirectory, manifest, entry });
  pending.push(
    ...Object.keys(entry.dependencies ?? {}).map((dependencyName) => ({
      name: dependencyName,
      from: packagePath,
    })),
  );
  pending.push(
    ...Object.keys(entry.optionalDependencies ?? {}).map((dependencyName) => ({
      name: dependencyName,
      from: packagePath,
    })),
  );
}

const sections = [
  'AURORA MUSIC PLAYER — THIRD-PARTY NOTICES',
  '',
  'Generated from the locked dependency graph and each installed npm package’s published license metadata and license files.',
  'Electron and Chromium runtime notices are shipped beside the executable as LICENSE.electron.txt and LICENSES.chromium.html.',
  'The unmodified SoundTouchJS source form is included at resources/app.asar/node_modules/@soundtouchjs/. The full MPL-2.0 text is available at https://mozilla.org/MPL/2.0/.',
  '',
];

for (const { name, packageDirectory, manifest, entry } of [...included.values()].sort((a, b) =>
  `${a.name}@${a.manifest.version}`.localeCompare(`${b.name}@${b.manifest.version}`),
)) {
  sections.push(
    '======================================================================',
    `${manifest.name ?? name} ${manifest.version ?? entry.version}`,
    `License: ${typeof manifest.license === 'string' ? manifest.license : (entry.license ?? 'Unspecified')}`,
  );

  const files = (await readdir(packageDirectory)).filter((fileName) =>
    /^(licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(fileName),
  );
  if (files.length === 0) {
    sections.push('(No standalone license text file was included in the published package.)', '');
    continue;
  }
  for (const fileName of files.sort((a, b) => a.localeCompare(b))) {
    sections.push(
      `--- ${fileName} ---`,
      await readFile(join(packageDirectory, fileName), 'utf8'),
      '',
    );
  }
}

const output = join(repositoryRoot, 'apps/desktop/THIRD-PARTY-NOTICES.txt');
await writeFile(output, `${sections.join('\n')}\n`, 'utf8');
console.log(`Wrote ${included.size} package notices to apps/desktop/THIRD-PARTY-NOTICES.txt.`);
