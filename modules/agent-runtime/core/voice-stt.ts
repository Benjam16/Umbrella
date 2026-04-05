import { spawn } from 'child_process';

export function voiceSttConfigured(): boolean {
  return !!process.env.UMBRELLA_VOICE_STT?.trim();
}

function sttTimeoutMs(): number {
  const raw = process.env.UMBRELLA_VOICE_STT_TIMEOUT_MS?.trim();
  const n = raw ? parseInt(raw, 10) : 120_000;
  return Number.isFinite(n) && n > 1000 ? n : 120_000;
}

/**
 * Run `UMBRELLA_VOICE_STT` with argv[1] = path to an audio file; stdout = transcript text.
 */
export async function transcribeAudioFile(filePath: string): Promise<string> {
  const cmd = process.env.UMBRELLA_VOICE_STT?.trim();
  if (!cmd) {
    throw new Error('UMBRELLA_VOICE_STT is not set');
  }

  const ms = sttTimeoutMs();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => chunks.push(c));
    child.stderr?.on('data', (c: Buffer) => errChunks.push(c));
    const t = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`UMBRELLA_VOICE_STT timed out after ${ms} ms`));
    }, ms);
    child.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(t);
      const errText = Buffer.concat(errChunks).toString('utf8').trim();
      const out = Buffer.concat(chunks).toString('utf8').trim();
      if (code !== 0) {
        reject(
          new Error(
            errText || out || `UMBRELLA_VOICE_STT exited with code ${code}`,
          ),
        );
        return;
      }
      if (!out) {
        reject(new Error('UMBRELLA_VOICE_STT produced empty stdout'));
        return;
      }
      resolve(out);
    });
  });
}
