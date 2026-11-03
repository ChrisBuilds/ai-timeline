// Turns `vitest bench --outputJson` output into a Markdown table.
//   node bench/summarize-core.mjs bench-core.json
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const rows = ['| Group | Benchmark | Mean (ms) | p99 (ms) |', '| --- | --- | --: | --: |']
for (const file of report.files) {
  for (const group of file.groups) {
    const name = group.fullName.split(' > ').pop()
    for (const b of group.benchmarks) rows.push(`| ${name} | ${b.name} | ${b.mean.toFixed(3)} | ${b.p99.toFixed(3)} |`)
  }
}
console.log(rows.join('\n'))
