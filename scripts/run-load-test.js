/**
 * RideFlow Distributed Performance & Load Test Runner
 * Automatically detects local portable k6, system k6, or falls back to Docker k6.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const testFile = process.argv[2] || 'tests/k6/suite.js';
const fullTestPath = path.resolve(rootDir, testFile);

if (!fs.existsSync(fullTestPath)) {
  console.error(`\x1b[31m[ERROR] Load test script not found:\x1b[0m ${fullTestPath}`);
  process.exit(1);
}

// Check 1: Local portable k6 binary in bin/
const localK6Win = path.join(rootDir, 'bin', 'k6.exe');
const localK6Linux = path.join(rootDir, 'bin', 'k6');

let command = '';
let args = [];

if (fs.existsSync(localK6Win)) {
  command = localK6Win;
  args = ['run', fullTestPath];
} else if (fs.existsSync(localK6Linux)) {
  command = localK6Linux;
  args = ['run', fullTestPath];
} else {
  // Check 2: Global k6 on system PATH
  const checkGlobal = spawnSync('k6', ['version'], { shell: true });
  if (checkGlobal.status === 0) {
    command = 'k6';
    args = ['run', fullTestPath];
  } else {
    // Check 3: Docker containerized k6
    console.log('\x1b[33m[INFO] Local k6 not found on PATH. Executing via Docker grafana/k6...\x1b[0m');
    command = 'docker';
    args = [
      'run', '--rm',
      '-v', `${rootDir}:/scripts`,
      '-w', '/scripts',
      '-e', 'TARGET_URL=http://host.docker.internal:5000',
      'grafana/k6',
      'run',
      `/scripts/${testFile.replace(/\\/g, '/')}`
    ];
  }
}

console.log(`\n\x1b[36m============================================================\x1b[0m`);
console.log(`\x1b[36m🚀 EXECUTING K6 LOAD TEST: ${path.basename(testFile)}\x1b[0m`);
console.log(`\x1b[36m   Runner: ${command}\x1b[0m`);
console.log(`\x1b[36m============================================================\x1b[0m\n`);

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: true,
  cwd: rootDir,
});

process.exit(result.status ?? 0);
