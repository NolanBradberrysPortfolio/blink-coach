import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_BLINK_CONFIG } from '../src/domain/types';
import { searchBlinkParameters } from '../src/domain/parameterSearch';
import { runRegression } from '../src/domain/regression';
import { BlinkTestFixture } from '../src/domain/testLabTypes';

async function main(): Promise<void> {
const fixtureDirectory = path.resolve(process.env.BLINK_FIXTURES ?? 'fixtures/blink-regression');
const reportPath = path.resolve(process.env.BLINK_OPTIMIZATION_REPORT ?? 'reports/blink-optimization-latest.json');
const fixtures = await loadFixtures(fixtureDirectory);
const search = searchBlinkParameters(fixtures, DEFAULT_BLINK_CONFIG, null, { topK: 10 });
const best = search.candidates[0];
if (!best) throw new Error('The parameter search produced no candidate configurations.');
const validation = runRegression(fixtures.filter((fixture) => fixture.metadata.split === 'validation'), best.config);

const report = {
  generatedAt: new Date().toISOString(),
  objective: 'maximize tuning true positives while penalizing each false positive by four points',
  evaluatedCount: search.evaluatedCount,
  best: {
    rank: best.rank,
    score: best.score,
    config: best.config,
    tuning: best.tuning.tuning.metrics,
    validation: validation.validation.metrics,
  },
  candidates: search.candidates.map((candidate) => ({
    rank: candidate.rank,
    score: candidate.score,
    config: candidate.config,
    tuning: candidate.tuning.tuning.metrics,
  })),
  validationRegressionWarning: validation.validation.metrics.f1 + 0.05 < best.tuning.tuning.metrics.f1,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log('Blink Detector Parameter Search');
console.log(`Candidates evaluated: ${search.evaluatedCount}`);
console.log(`Best tuning score: ${best.score}`);
console.log(`Tuning F1: ${(best.tuning.tuning.metrics.f1 * 100).toFixed(2)}%`);
console.log(`Validation F1: ${(validation.validation.metrics.f1 * 100).toFixed(2)}%`);
console.log(`Best config: ${JSON.stringify(best.config)}`);
if (report.validationRegressionWarning) console.log('WARNING: validation performance is meaningfully worse than tuning performance. Do not promote this candidate.');
console.log(`Machine-readable report: ${reportPath}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function loadFixtures(directory: string): Promise<BlinkTestFixture[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json') && name !== 'baseline.json');
  return Promise.all(names.sort().map(async (name) => JSON.parse(await readFile(path.join(directory, name), 'utf8')) as BlinkTestFixture));
}
