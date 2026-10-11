import { writeFile } from 'node:fs/promises';
import { bundleDashboard } from './github-updates.mjs';
const [tag, output = 'dashboard-bundle.json'] = process.argv.slice(2);
await writeFile(output, JSON.stringify(await bundleDashboard(new URL('./dist/', import.meta.url).pathname, tag)));
console.log(`Prepared ${tag}: ${output}`);
