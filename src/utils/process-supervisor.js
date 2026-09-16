import { exec } from 'node:child_process';

export function terminateProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (process.platform === 'win32') {
      exec(`taskkill /PID ${pid} /T /F`, () => resolve());
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
      resolve();
    }
  });
}
