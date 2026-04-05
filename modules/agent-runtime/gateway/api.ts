import http from 'http';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import fs from 'fs-extra';
import { memory } from '../core/memory.js';
import { DASHBOARD_HTML } from './dashboard-html.js';
import { markChaosApproved } from '../core/chaos-approval.js';
import { readLastRun } from '../core/run-log.js';
import { markSkillProposalApproved } from '../core/skill-promotion.js';
import { listMcpToolSummary } from '../mcp/client-manager.js';
import { getUnifiedToolsPayload } from '../core/tool-registry.js';
import {
  transcribeAudioFile,
  voiceSttConfigured,
} from '../core/voice-stt.js';
import {
  clearForegroundGoal,
  getAgentGoalSnapshot,
  setBackgroundPaused,
  setCoreGoal,
  setForegroundGoal,
} from '../core/agent-state.js';
import { readUmbrellaPackageMeta } from '../core/package-info.js';
import { readRunLogTail } from '../core/run-log.js';

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(s),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(s);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const VOICE_MAX_BYTES = 6 * 1024 * 1024;

function readBodyBuffer(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        reject(new Error(`body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extensionFromFilename(name: string): string {
  const ext = path.extname(name || '').toLowerCase();
  if (ext && ext.length <= 8) return ext;
  return '.bin';
}

function inboundAuthorized(req: http.IncomingMessage): boolean {
  const sec = process.env.UMBRELLA_INBOUND_SECRET?.trim();
  if (!sec) return false;
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${sec}`;
}

export type DashboardApiOptions = {
  /** For `/api/health` uptime (ms since agent process start). */
  startedAt?: number;
};

export function startDashboardApi(
  port: number,
  opts?: DashboardApiOptions,
): http.Server {
  const startedAt = opts?.startedAt ?? Date.now();
  let versionCache: Awaited<ReturnType<typeof readUmbrellaPackageMeta>> | null =
    null;

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0] ?? '';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && url === '/api/chaos-approve') {
      try {
        const raw = await readBody(req);
        const j = JSON.parse(raw || '{}') as { nonce?: string };
        const nonce = j.nonce?.trim();
        if (!nonce) {
          json(res, 400, { error: 'missing nonce' });
          return;
        }
        await markChaosApproved(nonce);
        json(res, 200, { ok: true, nonce });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && url === '/api/chaos-logs') {
      try {
        const events = await memory.recallByType('chaos_event', 20);
        json(res, 200, events);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && url === '/api/last-run') {
      try {
        const last = await readLastRun();
        json(res, 200, last ?? { empty: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && url === '/api/mcp-tools') {
      try {
        json(res, 200, { tools: listMcpToolSummary() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && url === '/api/tools') {
      try {
        json(res, 200, getUnifiedToolsPayload());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'POST' && url === '/api/voice-transcribe') {
      try {
        if (!inboundAuthorized(req)) {
          json(res, 401, { error: 'missing or invalid Authorization Bearer' });
          return;
        }
        if (!voiceSttConfigured()) {
          json(res, 503, {
            error:
              'UMBRELLA_VOICE_STT not set (path to executable; argv[1]=audio file, stdout=transcript)',
          });
          return;
        }

        const ct = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        let audio: Buffer;
        let ext = '.bin';
        let setFg = false;

        if (ct === 'application/json') {
          const raw = await readBody(req);
          const j = JSON.parse(raw || '{}') as {
            audioBase64?: string;
            filename?: string;
            setForegroundGoal?: boolean;
          };
          const b64 = j.audioBase64?.trim();
          if (!b64) {
            json(res, 400, { error: 'missing audioBase64' });
            return;
          }
          audio = Buffer.from(b64, 'base64');
          if (audio.length > VOICE_MAX_BYTES) {
            json(res, 400, { error: `audio exceeds ${VOICE_MAX_BYTES} bytes` });
            return;
          }
          ext = extensionFromFilename(j.filename ?? '');
          setFg = j.setForegroundGoal === true;
        } else {
          audio = await readBodyBuffer(req, VOICE_MAX_BYTES);
          if (!audio.length) {
            json(res, 400, { error: 'empty body' });
            return;
          }
          const fn = req.headers['x-umbrella-filename'];
          if (typeof fn === 'string' && fn.trim()) {
            ext = extensionFromFilename(fn.trim());
          }
        }

        const tmp = path.join(
          os.tmpdir(),
          `umb-voice-${randomBytes(8).toString('hex')}${ext}`,
        );
        try {
          await fs.writeFile(tmp, audio);
          const transcript = (await transcribeAudioFile(tmp)).trim();
          if (setFg && transcript) {
            await setForegroundGoal(transcript);
            await memory.ingest('foreground_queued', transcript);
          }
          json(res, 200, {
            ok: true,
            transcript,
            setForegroundGoal: setFg,
          });
        } finally {
          await fs.remove(tmp).catch(() => undefined);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && url === '/api/schedules') {
      try {
        const schedules = await memory.listUmbrellaSchedules();
        json(res, 200, { schedules, count: schedules.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && url === '/api/agent-state') {
      try {
        const state = await getAgentGoalSnapshot();
        json(res, 200, state);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'POST' && url === '/api/agent-state') {
      try {
        if (!inboundAuthorized(req)) {
          json(res, 401, { error: 'missing or invalid Authorization Bearer' });
          return;
        }
        const raw = await readBody(req);
        const j = JSON.parse(raw || '{}') as {
          backgroundPaused?: boolean;
          clearForeground?: boolean;
          coreGoal?: string | null;
          foregroundGoal?: string | null;
        };
        if (j.clearForeground) {
          await clearForegroundGoal();
        }
        if (typeof j.backgroundPaused === 'boolean') {
          await setBackgroundPaused(j.backgroundPaused);
        }
        if (j.coreGoal !== undefined) {
          await setCoreGoal(
            j.coreGoal === null || j.coreGoal === '' ? '' : String(j.coreGoal),
          );
        }
        if (j.foregroundGoal !== undefined) {
          await setForegroundGoal(
            j.foregroundGoal === null ? '' : String(j.foregroundGoal),
          );
        }
        json(res, 200, { ok: true, state: await getAgentGoalSnapshot() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'POST' && url === '/api/core-goal') {
      try {
        if (!inboundAuthorized(req)) {
          json(res, 401, { error: 'missing or invalid Authorization Bearer' });
          return;
        }
        const raw = await readBody(req);
        const j = JSON.parse(raw || '{}') as { goal?: string };
        const goal = j.goal?.trim() ?? '';
        await setCoreGoal(goal);
        json(res, 200, { ok: true, state: await getAgentGoalSnapshot() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'POST' && url === '/api/foreground/clear') {
      try {
        if (!inboundAuthorized(req)) {
          json(res, 401, { error: 'missing or invalid Authorization Bearer' });
          return;
        }
        await clearForegroundGoal();
        json(res, 200, { ok: true, state: await getAgentGoalSnapshot() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'POST' && url === '/api/goal') {
      try {
        if (!inboundAuthorized(req)) {
          json(res, 401, { error: 'missing or invalid Authorization Bearer' });
          return;
        }
        const raw = await readBody(req);
        const j = JSON.parse(raw || '{}') as { goal?: string };
        const goal = j.goal?.trim();
        if (!goal) {
          json(res, 400, { error: 'missing goal' });
          return;
        }
        await setForegroundGoal(goal);
        await memory.ingest('foreground_queued', goal);
        json(res, 200, { ok: true, state: await getAgentGoalSnapshot() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'POST' && url === '/api/skill-approve') {
      try {
        if (!inboundAuthorized(req)) {
          json(res, 401, { error: 'missing or invalid Authorization Bearer' });
          return;
        }
        const raw = await readBody(req);
        const j = JSON.parse(raw || '{}') as { id?: string };
        const id = j.id?.trim();
        if (!id) {
          json(res, 400, { error: 'missing id (proposal folder name, e.g. mem-42)' });
          return;
        }
        await markSkillProposalApproved(id);
        json(res, 200, { ok: true, id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      const html = DASHBOARD_HTML;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
      });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url === '/api/health') {
      json(res, 200, {
        ok: true,
        service: 'umbrella-dashboard',
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      });
      return;
    }

    if (req.method === 'GET' && url === '/api/version') {
      try {
        if (!versionCache) versionCache = await readUmbrellaPackageMeta();
        json(res, 200, {
          name: versionCache.name,
          version: versionCache.version,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    if (req.method === 'GET' && url.startsWith('/api/run-log')) {
      try {
        const q = new URL(req.url ?? '', 'http://localhost').searchParams;
        const lim = parseInt(q.get('limit') || '30', 10);
        const runs = await readRunLogTail(lim);
        const verified = runs.filter((r) => r.verifyOk === true).length;
        const failed = runs.filter((r) => r.verifyOk === false).length;
        json(res, 200, {
          runs,
          scorecard: {
            total: runs.length,
            verifyOk: verified,
            verifyFailed: failed,
            skippedOrPending: runs.length - verified - failed,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        json(res, 500, { error: msg });
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`☂️ Chaos dashboard: http://127.0.0.1:${port}/`);
  });

  return server;
}
