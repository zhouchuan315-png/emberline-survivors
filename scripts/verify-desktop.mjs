import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from '@electron/asar';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist/desktop');
const out = path.resolve(process.env.QA_OUT || path.join(root, 'evidence/desktop-20260928'));
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(dist, 'build-manifest.json'), 'utf8'));
const release = JSON.parse(await readFile(path.join(dist, 'release-manifest.json'), 'utf8'));
assert.equal(release.releases.length, 3);
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(await readFile(path.join(root, 'desktop/main.cjs'))), manifest.shellSha256);
const report = { result: 'pending', checkedAt: new Date().toISOString(), packages: [] };
try {
  for (const target of release.releases) {
    const archive = path.join(dist, target.filename);
    assert.equal(hash(await readFile(archive)), target.sha256);
    await execFile('unzip', ['-tq', archive]);
    const extracted = await mkdtemp(path.join(root, 'build/desktop-integrity-'));
    await execFile('ditto', ['-xk', archive, extracted]);
    const directory = path.join(extracted, `Emberline Survivors-${target.platform}-${target.arch}`);
    const app = path.join(directory, 'Emberline Survivors.app');
    const asar = target.platform === 'darwin'
      ? path.join(app, 'Contents/Resources/app.asar') : path.join(directory, 'resources/app.asar');
    const bundled = JSON.parse(extractFile(asar, 'build-manifest.json').toString());
    assert.deepEqual(bundled, manifest);
    assert.equal(hash(extractFile(asar, 'main.cjs')), manifest.shellSha256);
    for (const file of manifest.files) {
      const bytes = extractFile(asar, 'web/' + file.path);
      assert.equal(bytes.length, file.size, file.path);
      assert.equal(hash(bytes), file.sha256, file.path);
      assert.equal(hash(await readFile(path.join(root, 'build/web-desktop', file.path))), file.sha256, file.path);
    }
    const item = { ...target, webFilesVerified: manifest.files.length, zipIntegrity: true };
    if (target.platform === 'win32') {
      const bytes = await readFile(path.join(directory, 'EmberlineSurvivors.exe'));
      assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
      const offset = bytes.readUInt32LE(0x3c);
      assert.equal(bytes.toString('ascii', offset, offset + 4), 'PE\0\0');
      assert.equal(bytes.readUInt16LE(offset + 4), 0x8664);
      item.executable = 'PE x86-64';
      item.runtimeTested = false;
    } else {
      await execFile('codesign', ['--verify', '--deep', '--strict', app]);
      const { stdout } = await execFile('file', [path.join(app, 'Contents/MacOS/EmberlineSurvivors')]);
      assert(stdout.includes(target.arch === 'arm64' ? 'arm64' : 'x86_64'));
      item.executable = stdout.trim();
      item.minimumOS = (await execFile('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', '-o', '-', path.join(app, 'Contents/Info.plist')])).stdout.trim();
      item.signature = 'Verified ad hoc; no Developer ID or notarization';
      item.runtimeTested = target.arch === 'arm64' ? 'See desktop-runtime-report.json' : false;
    }
    report.packages.push(item);
    console.log(`Verified ${target.label}: architecture, archive, shell, and ${manifest.files.length} game files`);
  }
  await cp(path.join(dist, 'build-manifest.json'), path.join(out, 'build-manifest.json'));
  await cp(path.join(dist, 'release-manifest.json'), path.join(out, 'release-manifest.json'));
  await cp(path.join(root, 'evidence/runtime/build.log'), path.join(out, 'cocos-build.log'));
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = error.stack; throw error;
} finally {
  await writeFile(path.join(out, 'package-integrity-report.json'), JSON.stringify(report, null, 2) + '\n');
}
