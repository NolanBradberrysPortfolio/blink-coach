import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_BLINK_CONFIG } from '../src/domain/types';
import { compareAgainstBaseline, runRegression } from '../src/domain/regression';
import { BlinkTestFixture } from '../src/domain/testLabTypes';

interface BaselineFile {
  version: 1;
  approvedAt: string;
  config: typeof DEFAULT_BLINK_CONFIG;
  metrics: ReturnType<typeof runRegression>['overall']['metrics'];
  validationMetrics: ReturnType<typeof runRegression>['validation']['metrics'];
}

async function main(): Promise<void> {
const args = parseArgs(process.argv.slice(2));
const fixtureDirectory = path.resolve(args.fixtures ?? 'fixtures/blink-regression');
const reportPath = path.resolve(args.report ?? 'reports/blink-regression-latest.json');
const toleranceMs = Number(args.tolerance ?? 350);
const fixtures = await loadFixtures(fixtureDirectory);
const regression = runRegression(fixtures, DEFAULT_BLINK_CONFIG, toleranceMs);
const baselinePath = path.join(fixtureDirectory, 'baseline.json');
const baseline = await loadBaseline(baselinePath);
const baselineComparison = baseline
  ? compareAgainstBaseline(regression, baseline.metrics, baseline.validationMetrics)
  : null;

const report = {
  generatedAt: new Date().toISOString(),
  fixtureDirectory,
  toleranceMs,
  regression,
  baseline: baselineComparison,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
if (args['save-baseline'] !== undefined) {
  const nextBaseline: BaselineFile = {
    version: 1,
    approvedAt: new Date().toISOString(),
    config: DEFAULT_BLINK_CONFIG,
    metrics: regression.overall.metrics,
    validationMetrics: regression.validation.metrics,
  };
  await writeFile(baselinePath, JSON.stringify(nextBaseline, null, 2), 'utf8');
}

printReport(regression, baselineComparison, reportPath);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function loadFixtures(directory: string): Promise<BlinkTestFixture[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json') && name !== 'baseline.json');
  const fixtures: BlinkTestFixture[] = [];
  for (const name of names.sort()) {
    const filePath = path.join(directory, name);
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as BlinkTestFixture;
    if (parsed.version !== 1 || !Array.isArray(parsed.eyeFrames) || !Array.isArray(parsed.events)) {
      throw new Error(`${name} is not a version 1 signal fixture with eyeFrames and events.`);
    }
    fixtures.push(parsed);
  }
  if (fixtures.length === 0) throw new Error(`No signal fixtures found in ${directory}.`);
  return fixtures;
}

async function loadBaseline(filePath: string): Promise<BaselineFile | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as BaselineFile;
  } catch {
    return null;
  }
}

function printReport(
  regression: ReturnType<typeof runRegression>,
  baselineComparison: ReturnType<typeof compareAgainstBaseline> | null,
  reportPath: string,
): void {
  const overall = regression.overall.metrics;
  console.log('Blink Detector Regression Report');
  printMetrics('Overall', overall, regression.fixtures.length);
  printMetrics('Tuning', regression.tuning.metrics, regression.fixtures.filter((fixture) => fixture.split === 'tuning').length);
  printMetrics('Validation', regression.validation.metrics, regression.fixtures.filter((fixture) => fixture.split === 'validation').length);
  for (const fixture of regression.fixtures) {
    printMetrics(fixture.videoId, fixture.comparison.metrics, 1);
    console.log(`  split=${fixture.split} face-not-detected-sections=${fixture.run.faceNotDetectedSections.length} processing-fps=${fixture.run.processingFps.toFixed(1)}`);
  }
  if (baselineComparison) {
    console.log('');
    console.log('CURRENT vs APPROVED BASELINE');
    console.log(`  Δ precision: ${formatDelta(baselineComparison.delta.precision)}`);
    console.log(`  Δ recall:    ${formatDelta(baselineComparison.delta.recall)}`);
    console.log(`  Δ F1:        ${formatDelta(baselineComparison.delta.f1)}`);
    console.log(`  Δ false positives: ${baselineComparison.delta.falsePositives}`);
    console.log(`  Δ false negatives: ${baselineComparison.delta.falseNegatives}`);
    for (const warning of baselineComparison.warnings) console.log(`  WARNING: ${warning}`);
  }
  console.log(`Machine-readable report: ${reportPath}`);
}

function printMetrics(label: string, metrics: ReturnType<typeof runRegression>['overall']['metrics'], videos: number): void {
  console.log(label);
  console.log(`  Videos: ${videos}`);
  console.log(`  Ground-truth blinks: ${metrics.actualCount}`);
  console.log(`  Detected blinks: ${metrics.predictedCount}`);
  console.log(`  True positives: ${metrics.truePositives}`);
  console.log(`  False positives: ${metrics.falsePositives}`);
  console.log(`  False negatives: ${metrics.falseNegatives}`);
  console.log(`  Precision: ${formatPercent(metrics.precision)}`);
  console.log(`  Recall: ${formatPercent(metrics.recall)}`);
  console.log(`  F1: ${formatPercent(metrics.f1)}`);
  console.log(`  Blink count error: ${metrics.blinkCountError}`);
  console.log(`  Mean timing error: ${metrics.meanTimingErrorMs.toFixed(1)} ms`);
  console.log(`  Median timing error: ${metrics.medianTimingErrorMs.toFixed(1)} ms`);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} percentage points`;
}

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const [key, inlineValue] = value.slice(2).split('=', 2);
    if (inlineValue !== undefined) result[key] = inlineValue;
    else if (values[index + 1] && !values[index + 1].startsWith('--')) result[key] = values[++index];
    else result[key] = 'true';
  }
  return result;
}
