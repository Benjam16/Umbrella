import { memory } from './memory.js';
import { Toolset } from './tools.js';

export class UmbrellaVerifier {
  async verify(taskResult: string): Promise<boolean> {
    const cmd = process.env.UMBRELLA_VERIFY_COMMAND?.trim();

    if (cmd) {
      console.log('☂️ Verifier: running UMBRELLA_VERIFY_COMMAND…');
      const out = await Toolset.shell(cmd);
      const shellFail =
        out.startsWith('❌ Shell Error:') || out.startsWith('❌ Error:');
      const heuristic = this.heuristicOk(taskResult);
      const success = !shellFail && heuristic;
      await this.record(success, taskResult, `verify_cmd output: ${out.slice(0, 800)}`);
      console.log(success ? '☂️ Verifier: ✅ PASS (command + heuristic)' : '☂️ Verifier: ❌ FAIL');
      return success;
    }

    const success = this.heuristicOk(taskResult);
    await this.record(success, taskResult);
    console.log(success ? '☂️ Verifier: ✅ PASS' : '☂️ Verifier: ❌ FAIL (will retry next heartbeat)');
    return success;
  }

  private heuristicOk(taskResult: string): boolean {
    const lower = taskResult.toLowerCase();
    return (
      !lower.includes('error') &&
      !lower.includes('failed') &&
      !lower.includes('❌')
    );
  }

  private async record(
    success: boolean,
    taskResult: string,
    extra?: string,
  ): Promise<void> {
    const note = extra ? `${taskResult}\n${extra}` : taskResult;
    if (success) {
      await memory.ingest('lesson', `Task succeeded: ${note}`);
    } else {
      await memory.ingest('lesson', `Task failed — needs retry: ${note}`);
    }
  }
}

export const verifier = new UmbrellaVerifier();
