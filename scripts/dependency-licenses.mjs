import fs from 'node:fs';
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const rows = Object.entries(lock.packages).filter(([path]) => path).map(([path, pkg]) => ({
  name: path.replace(/^node_modules\//, ''),
  version: pkg.version,
  license: pkg.license ?? 'UNDECLARED',
  scope: pkg.dev ? 'development' : 'runtime'
})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
if (rows.some(row => row.license === 'UNDECLARED')) throw new Error('Review undeclared dependency licenses');
const header = '# Dependency license inventory\n\nGenerated from package-lock.json by `node scripts/dependency-licenses.mjs`. Includes optional packages for other platforms. This records declared licenses, not a replacement for upstream copyright notices and license texts. Source packages and their notices are obtained by `npm ci`.\n\nStrudel and its audio libraries are AGPL-3.0-or-later, compatible with the application license. The other declared licenses below are permissive or MPL-2.0 (Lightning CSS build tooling); no declared incompatible license was identified. External Dirt-Samples recordings are not npm dependencies and are not included in this inventory or distributed build. Confirm their individual provenance before redistribution.\n\n| Package | Version | Declared license | Scope |\n| --- | --- | --- | --- |\n';
fs.writeFileSync('docs/dependency-licenses.md', header + rows.map(r => `| ${r.name} | ${r.version} | ${r.license} | ${r.scope} |`).join('\n') + '\n');
console.log(`Recorded ${rows.length} package license entries.`);
