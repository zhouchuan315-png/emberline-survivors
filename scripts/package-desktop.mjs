import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'build/desktop-stage');
const dist = path.join(root, 'dist/desktop');
const web = path.join(root, 'build/web-desktop');
const electronRelease = JSON.parse(await readFile(path.join(root, 'desktop/electron-release.json'), 'utf8'));
const electronVersion = electronRelease.version;
const metadata = JSON.parse(await readFile(path.join(root, 'desktop/package.json'), 'utf8'));
const targets = [
  { platform: 'darwin', arch: 'arm64', label: 'macOS-AppleSilicon' },
  { platform: 'win32', arch: 'x64', label: 'Windows-x64' },
  { platform: 'darwin', arch: 'x64', label: 'macOS-Intel' },
];
const selected = process.argv.slice(2);
if (selected.some(label => !targets.some(target => target.label === label))) {
  throw new Error('Unknown target. Choose macOS-AppleSilicon, Windows-x64, or macOS-Intel.');
}
if (process.platform !== 'darwin') throw new Error('This packaging script requires macOS for signing and ZIP creation.');
await readFile(path.join(web, 'index.html'));
await execFile('python3', [path.join(root, 'scripts/prepare-desktop-icons.py')]);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'desktop'), stage, { recursive: true });
await cp(web, path.join(stage, 'web'), {
  recursive: true,
  filter: source => !source.endsWith('.map') && path.basename(source) !== '.DS_Store',
});

const hash = data => createHash('sha256').update(data).digest('hex');
async function fileManifest(directory, relative = '') {
  const files = [];
  const entries = (await readdir(path.join(directory, relative), { withFileTypes: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await fileManifest(directory, name));
    else {
      const bytes = await readFile(path.join(directory, name));
      files.push({ path: name, size: bytes.length, sha256: hash(bytes) });
    }
  }
  return files;
}

const manifest = {
  version: metadata.version, electron: electronVersion, cocos: '3.8.6',
  electronChecksumSource: electronRelease.checksumSource,
  builtAt: new Date().toISOString(), origin: 'emberline://game',
  files: await fileManifest(path.join(stage, 'web')),
  shellSha256: hash(await readFile(path.join(stage, 'main.cjs'))),
  iconSource: 'assets/resources/roster/vanguard-portrait.png',
  iconSourceSha256: hash(await readFile(path.join(root, 'assets/resources/roster/vanguard-portrait.png'))),
};
await writeFile(path.join(stage, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(dist, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const releases = [];
for (const target of targets.filter(target => selected.length === 0 || selected.includes(target.label))) {
  console.log(`Packaging ${target.label} with Electron ${electronVersion}...`);
  const [directory] = await packager({
    dir: stage, out: path.join(dist, 'unpacked'), name: 'Emberline Survivors',
    executableName: 'EmberlineSurvivors', appVersion: metadata.version,
    appBundleId: 'com.emberline.survivors', electronVersion,
    platform: target.platform, arch: target.arch, asar: true, overwrite: true,
    prune: false, download: { quiet: false, checksums: electronRelease.checksums },
    icon: path.join(root, 'build/desktop-icons', target.platform === 'darwin' ? 'icon.icns' : 'icon.ico'),
    darwinDarkModeSupport: true,
    ...(target.platform === 'darwin' ? {
      osxSign: {
        identity: '-', identityValidation: false, preAutoEntitlements: false,
        preEmbedProvisioningProfile: false,
        // Ad hoc identities have no Team ID for hardened library validation.
        optionsForFile: () => ({ timestamp: 'none', hardenedRuntime: false }),
      },
      extendInfo: { CFBundleDisplayName: '余烬防线', LSApplicationCategoryType: 'public.app-category.action-games' },
    } : {
      win32metadata: { CompanyName: 'Emberline Survivors', ProductName: 'Emberline Survivors', FileDescription: '余烬防线' },
    }),
  });
  await cp(path.join(root, 'desktop/README.txt'), path.join(directory, 'README.txt'));
  if (target.platform === 'darwin') {
    await execFile('codesign', ['--verify', '--deep', '--strict', path.join(directory, 'Emberline Survivors.app')]);
  }
  const filename = `EmberlineSurvivors-${metadata.version}-${target.label}.zip`;
  const archive = path.join(dist, filename);
  await rm(archive, { force: true });
  await execFile('ditto', ['-c', '-k', '--norsrc', '--keepParent', directory, archive]);
  const bytes = await readFile(archive);
  const result = { ...target, filename, size: bytes.length, sha256: hash(bytes) };
  releases.push(result);
  console.log(`Ready: ${archive} (${(bytes.length / 1024 / 1024).toFixed(1)} MiB)`);
}
await cp(path.join(root, 'desktop/README.txt'), path.join(dist, 'README.txt'));
await writeFile(path.join(dist, 'release-manifest.json'), JSON.stringify({ ...manifest, files: undefined, releases }, null, 2) + '\n');
await writeFile(path.join(dist, 'SHA256SUMS.txt'), releases.map(release => `${release.sha256}  ${release.filename}`).join('\n') + '\n');
console.log('All requested desktop packages are complete.');
