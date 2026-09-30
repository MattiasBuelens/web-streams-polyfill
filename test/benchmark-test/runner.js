import { fork } from 'node:child_process';
import { Suite } from 'bench-node';

const {
  BENCH_PROCESSES = '6',
  BENCH_ROUNDS = '3',
  BENCH_MAX_TIME = '0.1',
  BENCH_MIN_SAMPLES = '5',
  BENCH_WORKER_COMPARISON
} = process.env;

/**
 * Compares multiple implementations against a baseline implementation.
 *
 * Instead of running each benchmark many times back-to-back, we run multiple rounds.
 * In each round, every (case, implementation) pair is run once, in a random order.
 * Every implementation is then compared against the baseline *from the same round*
 * (a paired comparison), so slow drift in machine performance (noisy neighbours,
 * CPU frequency scaling, heap growth...) affects both sides equally and cancels out.
 *
 * Rounds within a single process are not independent: V8's optimization decisions
 * (inlining, feedback, code layout...) are made once per process and persist across rounds,
 * which can consistently favour one implementation over another. Therefore, we spread the
 * rounds across multiple fresh processes (run one after another), average the log-ratios
 * within each process, and treat each process as one independent sample.
 *
 * For each comparison, we report the geometric mean of the ops/sec ratio,
 * with a 95% confidence interval from a t-test on the per-process mean log-ratios.
 *
 * The calling script is re-run in each worker process, so it must call `runComparison`
 * with the same arguments and in the same order every time.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {Record<string, any>} options.implementations
 *   The implementations to compare. The first one is the baseline.
 * @param {Array<{ name: string, fn: (impl: any, timer: any) => Promise<void> }>} options.cases
 */
export async function runComparison({ title, implementations, cases }) {
  if (BENCH_WORKER_COMPARISON !== undefined) {
    // Worker process: only run the requested comparison.
    if (BENCH_WORKER_COMPARISON === title) {
      await runWorker({ title, implementations, cases });
    }
    return;
  }

  const processes = Number(BENCH_PROCESSES);
  const rounds = Number(BENCH_ROUNDS);
  const maxTime = Number(BENCH_MAX_TIME);
  const implNames = Object.keys(implementations);
  const baselineName = implNames[0];

  // opsSec[process][name][round]
  const opsSec = [];
  for (let i = 1; i <= processes; i++) {
    opsSec.push(await runInWorker(title, `process ${i}/${processes}`));
  }

  const rows = [];
  for (const testCase of cases) {
    const baselineKey = benchmarkName(testCase.name, baselineName);
    for (const implName of implNames) {
      const key = benchmarkName(testCase.name, implName);
      const row = [testCase.name, implName, formatOps(median(opsSec.flatMap(p => p[key])))];
      if (implName === baselineName) {
        row.push('(baseline)', '');
      } else {
        const { ratio, lower, upper } = pairedRatio(opsSec.map(p => [p[key], p[baselineKey]]));
        row.push(
          `${formatPercent(ratio)} [${formatPercent(lower)}, ${formatPercent(upper)}]`,
          lower > 1 ? 'faster' : upper < 1 ? 'slower' : ''
        );
      }
      rows.push(row);
    }
  }

  console.log(`${title} (${processes} processes × ${rounds} rounds, maxTime=${maxTime}s)`);
  console.log();
  printTable(['case', 'impl', 'ops/sec (median)', `vs. ${baselineName} (95% CI)`, ''], rows);
  console.log();
  console.log(`  "faster" or "slower" means the 95% CI excludes 0%.`);
  console.log();
}

/**
 * Re-runs the current script in a fresh process, which runs only the given comparison.
 * @returns {Promise<Record<string, number[]>>} The ops/sec of each benchmark, for each round.
 */
function runInWorker(title, label) {
  return new Promise((resolve, reject) => {
    const child = fork(process.argv[1], process.argv.slice(2), {
      execArgv: process.execArgv,
      env: { ...process.env, BENCH_WORKER_COMPARISON: title, BENCH_WORKER_LABEL: label },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    });
    let result;
    child.on('message', message => {
      result = message;
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0 || result === undefined) {
        reject(new Error(`${title}: ${label} failed with exit code ${code}`));
      } else {
        resolve(result);
      }
    });
  });
}

async function runWorker({ title, implementations, cases }) {
  const rounds = Number(BENCH_ROUNDS);
  const maxTime = Number(BENCH_MAX_TIME);
  const minSamples = Number(BENCH_MIN_SAMPLES);
  const label = process.env.BENCH_WORKER_LABEL;

  const benchmarks = [];
  for (const testCase of cases) {
    for (const [implName, impl] of Object.entries(implementations)) {
      benchmarks.push({
        name: benchmarkName(testCase.name, implName),
        fn: async timer => testCase.fn(impl, timer)
      });
    }
  }

  // opsSec[name][round]
  const opsSec = Object.fromEntries(benchmarks.map(({ name }) => [name, []]));

  // The first round is a warm-up round, and is discarded.
  for (let round = 0; round <= rounds; round++) {
    process.stderr.write(`${title}: ${label}, round ${round}/${rounds}${round === 0 ? ' (warm-up)' : ''}
`);
    const suite = new Suite({ reporter: false, minSamples });
    for (const { name, fn } of shuffle(benchmarks)) {
      suite.add(name, { maxTime }, fn);
    }
    const results = await suite.run();
    if (round === 0) {
      continue;
    }
    for (const result of results) {
      opsSec[result.name].push(result.opsSec);
    }
  }

  process.send(opsSec, () => process.disconnect());
}

function benchmarkName(caseName, implName) {
  return caseName ? `${caseName}/${implName}` : implName;
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes the geometric mean of `a[i] / b[i]` and its 95% confidence interval.
 * The log-ratios are first averaged within each process,
 * and then a one-sample t-test is done on those per-process means.
 * @param {Array<[number[], number[]]>} pairsPerProcess
 */
function pairedRatio(pairsPerProcess) {
  const diffs = pairsPerProcess.map(([a, b]) => mean(a.map((value, i) => Math.log(value / b[i]))));
  const n = diffs.length;
  const m = mean(diffs);
  const variance = diffs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (n - 1);
  const halfWidth = tQuantile975(n - 1) * Math.sqrt(variance / n);
  return {
    ratio: Math.exp(m),
    lower: Math.exp(m - halfWidth),
    upper: Math.exp(m + halfWidth)
  };
}

function mean(values) {
  return values.reduce((sum, x) => sum + x, 0) / values.length;
}

/**
 * Returns the 97.5% quantile of Student's t-distribution.
 * For df >= 4, this is approximated using a Cornish-Fisher expansion
 * around the normal quantile, which is accurate to within 0.01.
 */
function tQuantile975(df) {
  if (df < 4) {
    return [NaN, 12.706, 4.303, 3.182][df] ?? NaN;
  }
  const z = 1.959964;
  const z3 = z ** 3;
  const z5 = z ** 5;
  const z7 = z ** 7;
  return z
    + (z3 + z) / (4 * df)
    + (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2)
    + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3);
}

function formatOps(value) {
  return Math.round(value).toLocaleString('en-US');
}

function formatPercent(ratio) {
  const percent = (ratio - 1) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function printTable(header, rows) {
  const widths = header.map((cell, i) => Math.max(cell.length, ...rows.map(row => row[i].length)));
  const format = row => row.map((cell, i) => (i === 2 ? cell.padStart(widths[i]) : cell.padEnd(widths[i])))
    .join('  ')
    .trimEnd();
  console.log(`  ${format(header)}`);
  for (const row of rows) {
    console.log(`  ${format(row)}`);
  }
}
