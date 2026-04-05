import path from 'path';
import chalk from 'chalk';
import {
  runScaffoldShippingCliCore,
} from '../modules/agent-runtime/core/shipping-scaffold.js';

export { deriveBinName } from '../modules/agent-runtime/core/shipping-scaffold.js';

export function runScaffoldShippingCli(
  destDir: string,
  packageName: string,
  binName?: string,
): void {
  const dest = path.resolve(destDir);
  const r = runScaffoldShippingCliCore(dest, packageName, binName);
  if (!r.ok) {
    console.error(chalk.red(r.error));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.green(`☂️ Scaffolded CLI at ${r.dest}`));
  console.log(chalk.cyan(`   package ${r.packageName} · bin ${r.bin}`));
  console.log(
    chalk.gray(
      '   Next: cd there, npm install, npm test, git init — see examples/SHIPPING.md',
    ),
  );
}
