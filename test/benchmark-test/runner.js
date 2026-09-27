import { Suite } from 'bench-node';

const {
  BENCH_ROUNDS = '20',
  BENCH_MAX_TIME = '0.1',
  BENCH_MIN_SAMPLES = '5'
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
 * For each comparison, we report the geometric mean of the ops/sec ratio across rounds,
 * with a 95% confidence interval from a paired t-test on the log-ratios.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {Record<string, any>} options.implementations
 *   The implementations to compare. The first one is the baseline.
 * @param {Array<{ name: string, fn: (impl: any, timer: any) => Promise<void> }>} options.cases
 */
export async function runComparison({ title, implementations, cases }) {
  const rounds = Number(BENCH_ROUNDS);
  const maxTime = Number(BENCH_MAX_TIME);
  const minSamples = Number(BENCH_MIN_SAMPLES);
  const implNames = Object.keys(implementations);
  const baselineName = implNames[0];

  const benchmarks = [];
  for (const testCase of cases) {
    for (const implName of implNames) {
      const impl = implementations[implName];
      benchmarks.push({
        name: benchmarkName(testCase.name, implName),
        fn: async timer => testCase.fn(impl, timer)
      });
    }
  }

  // opsSec[name][round]
  const opsSec = new Map(benchmarks.map(({ name }) => [name, []]));

  // The first round is a warm-up round, and is discarded.
  for (let round = 0; round <= rounds; round++) {
    process.stderr.write(`${title}: round ${round}/${rounds}${round === 0 ? ' (warm-up)' : ''}\n`);
    const suite = new Suite({ reporter: false, minSamples });
    for (const { name, fn } of shuffle(benchmarks)) {
      suite.add(name, { maxTime }, fn);
    }
    const results = await suite.run();
    if (round === 0) {
      continue;
    }
    for (const result of results) {
      opsSec.get(result.name).push(result.opsSec);
    }
  }

  const rows = [];
  for (const testCase of cases) {
    const baselineOps = opsSec.get(benchmarkName(testCase.name, baselineName));
    for (const implName of implNames) {
      const ops = opsSec.get(benchmarkName(testCase.name, implName));
      const row = [testCase.name, implName, formatOps(median(ops))];
      if (implName === baselineName) {
        row.push('(baseline)', '');
      } else {
        const { ratio, lower, upper } = pairedRatio(ops, baselineOps);
        row.push(
          `${formatPercent(ratio)} [${formatPercent(lower)}, ${formatPercent(upper)}]`,
          lower > 1 ? 'faster' : upper < 1 ? 'slower' : ''
        );
      }
      rows.push(row);
    }
  }

  console.log(`${title} (${rounds} rounds, maxTime=${maxTime}s)`);
  console.log();
  printTable(['case', 'impl', 'ops/sec (median)', `vs. ${baselineName} (95% CI)`, ''], rows);
  console.log();
  console.log(`  "faster" or "slower" means the 95% CI excludes 0%.`);
  console.log();
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
 * Computes the geometric mean of `a[i] / b[i]` and its 95% confidence interval,
 * using a paired t-test on the log-ratios.
 */
function pairedRatio(a, b) {
  const diffs = a.map((value, i) => Math.log(value / b[i]));
  const n = diffs.length;
  const mean = diffs.reduce((sum, x) => sum + x, 0) / n;
  const variance = diffs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
  const halfWidth = tQuantile975(n - 1) * Math.sqrt(variance / n);
  return {
    ratio: Math.exp(mean),
    lower: Math.exp(mean - halfWidth),
    upper: Math.exp(mean + halfWidth)
  };
}

/**
 * Approximates the 97.5% quantile of Student's t-distribution
 * using a Cornish-Fisher expansion around the normal quantile.
 * Accurate to within 0.01 for df >= 3.
 */
function tQuantile975(df) {
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
