// E2E stacks are named after the PID of the run that started them
// (scripts/e2e/run.mjs): containers `rate-e2e-<pid>-db` and `rate-e2e-<pid>-rest`
// on network `rate-e2e-<pid>`. A run killed without running its cleanup (no
// signal handler fires on Windows TerminateProcess or a command timeout) leaves
// them running. These helpers find stacks whose owning process is gone.

import { spawnSync } from 'node:child_process';

const STACK_NAME = /^rate-e2e-(\d+)(?:-(?:db|rest))?$/;

/** PIDs of stacks among `names` whose owner is not alive, excluding `selfPid`. */
export function staleStackPids(names, isAlive, selfPid = process.pid) {
  const pids = new Set();
  for (const name of names) {
    const match = STACK_NAME.exec(name.trim());
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid !== selfPid && !isAlive(pid)) pids.add(pid);
  }
  return [...pids].sort((a, b) => a - b);
}

/** Whether a process with this PID exists on this machine. */
export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists but belongs to another user.
    return err.code === 'EPERM';
  }
}

function dockerNames(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) return [];
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** Removes stacks left by dead runs; returns the PIDs whose stacks it removed. */
export function pruneStaleStacks({ log = console.log } = {}) {
  const containers = dockerNames([
    'ps',
    '--all',
    '--filter',
    'name=^rate-e2e-',
    '--format',
    '{{.Names}}',
  ]);
  const networks = dockerNames([
    'network',
    'ls',
    '--filter',
    'name=^rate-e2e-',
    '--format',
    '{{.Name}}',
  ]);
  const pids = staleStackPids([...containers, ...networks], isProcessAlive);
  for (const pid of pids) {
    const id = `rate-e2e-${pid}`;
    log(`Removing E2E stack ${id}: the run that started it is gone`);
    const names = containers.filter((n) => n.startsWith(`${id}-`));
    if (names.length)
      spawnSync('docker', ['rm', '--force', ...names], { timeout: 30_000 });
    if (networks.includes(id))
      spawnSync('docker', ['network', 'rm', id], { timeout: 30_000 });
  }
  return pids;
}
