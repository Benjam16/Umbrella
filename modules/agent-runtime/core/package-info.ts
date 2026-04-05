import path from 'path';
import fs from 'fs-extra';
import { resolveUmbrellaPackageRoot } from './shipping-scaffold.js';

export async function readUmbrellaPackageMeta(): Promise<{
  name: string;
  version: string;
}> {
  const pkgPath = path.join(resolveUmbrellaPackageRoot(), 'package.json');
  try {
    const j = (await fs.readJson(pkgPath)) as { name?: string; version?: string };
    return {
      name: j.name ?? '@benjam16/umbrella',
      version: j.version ?? '0.0.0',
    };
  } catch {
    return { name: '@benjam16/umbrella', version: '0.0.0' };
  }
}
