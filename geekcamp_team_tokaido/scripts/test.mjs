import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const tests = walk(join(root, 'src/app')).filter((path) => /\.test\.tsx?$/.test(path));
if (!tests.length) throw new Error('No tests found');
const output = mkdtempSync(join(tmpdir(), 'kokomeshi-tests-'));
const run = (args, env = process.env) => {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) throw result.error;
  return result.status ?? 1;
};
try {
  process.exitCode = run([resolve('node_modules/typescript/bin/tsc'), '--target', 'ES2022', '--module', 'commonjs', '--jsx', 'react-jsx', '--esModuleInterop', '--skipLibCheck', '--outDir', output, ...tests]);
  if (!process.exitCode) {
    process.exitCode = run(['--test', ...walk(output).filter((path) => path.endsWith('.test.js'))], {
      ...process.env,
      NODE_PATH: [resolve('node_modules'), process.env.NODE_PATH].filter(Boolean).join(delimiter),
    });
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
