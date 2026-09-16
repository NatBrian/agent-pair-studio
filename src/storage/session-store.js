import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../config.js';

export async function saveSession(session, dataDir = config.DATA_DIR) {
  await mkdir(dataDir, { recursive: true });
  const filePath = resolve(dataDir, `${session.id}.json`);
  const payload = {
    ...session,
    updatedAt: new Date().toISOString()
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function loadSession(sessionId, dataDir = config.DATA_DIR) {
  const filePath = resolve(dataDir, `${sessionId}.json`);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function listSessions(dataDir = config.DATA_DIR) {
  try {
    await mkdir(dataDir, { recursive: true });
    const files = await readdir(dataDir);
    const sessions = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await readFile(resolve(dataDir, file), 'utf-8');
          const parsed = JSON.parse(content);
          sessions.push({
            id: parsed.id,
            topic: parsed.topic,
            branch: parsed.branch,
            turns: parsed.history ? parsed.history.length : 0,
            updatedAt: parsed.updatedAt
          });
        } catch {}
      }
    }
    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch {
    return [];
  }
}
