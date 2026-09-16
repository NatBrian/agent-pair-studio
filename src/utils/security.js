import { realpathSync, statSync } from 'node:fs';
import { parse, isAbsolute } from 'node:path';

export function validateSandboxRoot(sandboxPath) {
  if (!sandboxPath || typeof sandboxPath !== 'string' || sandboxPath.trim() === '') {
    throw new Error("sandbox_path is required");
  }
  if (!isAbsolute(sandboxPath)) {
    throw new Error("sandbox_path must be an absolute path");
  }
  let canonical;
  try {
    canonical = realpathSync(sandboxPath);
  } catch (err) {
    throw new Error(`sandbox_path does not exist: ${sandboxPath}`);
  }
  const stat = statSync(canonical);
  if (!stat.isDirectory()) {
    throw new Error("sandbox_path must be a directory");
  }
  const root = parse(canonical).root;
  if (canonical.toLowerCase() === root.toLowerCase()) {
    throw new Error(`sandbox_path cannot be the filesystem root (${root})`);
  }
  return canonical;
}

const SECRET_PATTERNS = [
  /(sk|pk|ghp|gho|github_pat|glpat|xoxb|xoxp|xai|pplx|r8|tvly)[_-][A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[^]+?-----END[A-Z ]*PRIVATE KEY-----/g
];

export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let clean = text;
  for (const pattern of SECRET_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean;
}
