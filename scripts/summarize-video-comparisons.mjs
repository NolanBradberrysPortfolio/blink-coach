import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) throw new Error('Pass output.json comparison.json ...');
const clips = await Promise.all(inputs.map(async input => ({ name: path.basename(input), ...JSON.parse(await readFile(input, 'utf8')) })));
function aggregate(key) {
  const values = clips.map(clip => clip[key]);
  const sum = field => values.reduce((total, item) => total + item[field], 0);
  const truePositives = sum('truePositives'), falsePositives = sum('falsePositives'), falseNegatives = sum('falseNegatives');
  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  return { actualCount: sum('actualCount'), truePositives, falsePositives, falseNegatives, precision, recall,
    f1: 2 * precision * recall / (precision + recall) || 0,
    meanTimingErrorMs: truePositives ? values.reduce((total, item) => total + (item.meanTimingErrorMs ?? 0) * item.truePositives, 0) / truePositives : null };
}
const before = aggregate('before'), after = aggregate('after');
const report = { clips, before, after, delta: Object.fromEntries(['precision', 'recall', 'f1', 'falsePositives', 'falseNegatives'].map(key => [key, after[key] - before[key]])) };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ before, after, delta: report.delta }, null, 2));
