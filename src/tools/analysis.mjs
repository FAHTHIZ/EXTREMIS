// Quantitative analysis tools: statistics, experiments, finance, decisions,
// project scheduling, reliability budgets and release versioning.

import { mean, variance, quantile, round, normalCdf, normalInv, tTwoSidedP, tCritical, chiSquareP, parseNumber, loadTable, readTextInput, ToolInputError } from './util.mjs';

const NUMBERS = { type: 'array', items: { type: ['number', 'string'] }, minItems: 1 };
function nums(list) { return list.map(parseNumber).filter((v) => v !== null); }

export function describe(values) {
  const xs = nums(values).sort((a, b) => a - b);
  if (!xs.length) throw new ToolInputError('no numeric values');
  const m = mean(xs); const sd = Math.sqrt(variance(xs)); const n = xs.length;
  const skew = n > 2 && sd > 0 ? (n / ((n - 1) * (n - 2))) * xs.reduce((a, x) => a + ((x - m) / sd) ** 3, 0) : 0;
  const se = sd / Math.sqrt(n);
  const t = n > 1 ? tCritical(0.05, n - 1) : null;
  return {
    n, mean: round(m), std: round(sd), se: round(se), min: xs[0], p05: round(quantile(xs, 0.05)), p25: round(quantile(xs, 0.25)),
    median: round(quantile(xs, 0.5)), p75: round(quantile(xs, 0.75)), p95: round(quantile(xs, 0.95)), p99: round(quantile(xs, 0.99)), max: xs[n - 1],
    sum: round(xs.reduce((a, b) => a + b, 0)), skewness: round(skew), cv: m ? round(sd / Math.abs(m)) : null,
    ci95_mean: t ? [round(m - t * se), round(m + t * se)] : null,
  };
}

function rankWithTies(values) {
  const sorted = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length); let tieCorrection = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i; while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j += 1;
    const r = (i + j) / 2 + 1; const t = j - i + 1; tieCorrection += t ** 3 - t;
    for (let k = i; k <= j; k += 1) ranks[sorted[k][1]] = r;
    i = j + 1;
  }
  return { ranks, tieCorrection };
}

export function compareSamples(aIn, bIn, { paired = false, alpha = 0.05 } = {}) {
  const a = nums(aIn), b = nums(bIn);
  if (a.length < 2 || b.length < 2) throw new ToolInputError('each sample needs at least 2 numeric values');
  const out = { n_a: a.length, n_b: b.length, mean_a: round(mean(a)), mean_b: round(mean(b)), median_a: round(quantile([...a].sort((x, y) => x - y), 0.5)), median_b: round(quantile([...b].sort((x, y) => x - y), 0.5)) };
  if (paired) {
    if (a.length !== b.length) throw new ToolInputError('paired samples must have equal length');
    const d = a.map((x, i) => b[i] - x); const md = mean(d); const sd = Math.sqrt(variance(d)); const se = sd / Math.sqrt(d.length);
    const t = se === 0 ? (md === 0 ? 0 : Infinity) : md / se; const df = d.length - 1;
    const p = Number.isFinite(t) ? tTwoSidedP(t, df) : 0;
    const tc = tCritical(alpha, df);
    Object.assign(out, { test: 'paired t-test', mean_difference: round(md), t: round(t), df, p_value: round(p, 6), ci: [round(md - tc * se), round(md + tc * se)], cohens_dz: sd ? round(md / sd) : null });
  } else {
    const va = variance(a), vb = variance(b); const se = Math.sqrt(va / a.length + vb / b.length);
    const diff = mean(b) - mean(a); const t = se === 0 ? 0 : diff / se;
    const df = se === 0 ? a.length + b.length - 2 : (va / a.length + vb / b.length) ** 2 / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
    const p = tTwoSidedP(t, df); const tc = tCritical(alpha, df);
    const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
    // Mann-Whitney U with normal approximation and tie correction.
    const { ranks, tieCorrection } = rankWithTies([...a, ...b]);
    const ra = ranks.slice(0, a.length).reduce((x, y) => x + y, 0);
    const u = ra - (a.length * (a.length + 1)) / 2; const n = a.length + b.length;
    const mu = (a.length * b.length) / 2;
    const sigma = Math.sqrt(((a.length * b.length) / 12) * (n + 1 - tieCorrection / (n * (n - 1))));
    const z = sigma ? (u - mu - Math.sign(u - mu) * 0.5) / sigma : 0;
    Object.assign(out, {
      test: "Welch's t-test", mean_difference: round(diff), relative_difference: mean(a) ? round(diff / Math.abs(mean(a))) : null,
      t: round(t), df: round(df, 2), p_value: round(p, 6), ci: [round(diff - tc * se), round(diff + tc * se)], cohens_d: pooled ? round(diff / pooled) : null,
      mann_whitney: { u: round(u), z: round(z), p_value: round(2 * (1 - normalCdf(Math.abs(z))), 6) },
    });
  }
  out.significant = out.p_value < alpha;
  out.alpha = alpha;
  out.interpretation = `${out.significant ? 'Statistically significant' : 'No statistically significant'} difference at alpha=${alpha} (p=${out.p_value}). Check effect size and practical significance, not only the p-value.`;
  return out;
}

export function abTest({ control, variants, alpha = 0.05, correction = 'holm' }) {
  const groups = [{ name: control.name || 'control', ...control }, ...variants.map((v, i) => ({ name: v.name || `variant_${i + 1}`, ...v }))];
  for (const g of groups) if (!(g.visitors > 0) || g.conversions < 0 || g.conversions > g.visitors) throw new ToolInputError(`invalid counts for ${g.name}`);
  const c = groups[0]; const pc = c.conversions / c.visitors;
  const results = groups.slice(1).map((v) => {
    const pv = v.conversions / v.visitors;
    const pooled = (c.conversions + v.conversions) / (c.visitors + v.visitors);
    const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / c.visitors + 1 / v.visitors));
    const z = sePooled ? (pv - pc) / sePooled : 0;
    const p = 2 * (1 - normalCdf(Math.abs(z)));
    const se = Math.sqrt((pc * (1 - pc)) / c.visitors + (pv * (1 - pv)) / v.visitors);
    const zc = normalInv(1 - alpha / 2);
    return { variant: v.name, rate: round(pv, 6), absolute_lift: round(pv - pc, 6), relative_lift: pc ? round((pv - pc) / pc, 4) : null, z: round(z, 4), p_value: round(p, 6), ci_absolute: [round(pv - pc - zc * se, 6), round(pv - pc + zc * se, 6)] };
  });
  // Multiple-comparison correction.
  const m = results.length;
  const order = results.map((r, i) => [r.p_value, i]).sort((a, b) => a[0] - b[0]);
  let running = 0;
  order.forEach(([p, i], rank) => {
    let adj = correction === 'bonferroni' ? Math.min(1, p * m) : correction === 'none' ? p : Math.min(1, Math.max(running, p * (m - rank)));
    running = Math.max(running, adj);
    results[i].p_adjusted = round(adj, 6);
    results[i].significant = adj < alpha;
  });
  // Sample ratio mismatch (assumes an even split unless expected_split is given).
  const totals = groups.map((g) => g.visitors); const sum = totals.reduce((a, b) => a + b, 0);
  const expected = groups.map((g) => (g.expected_share ?? 1 / groups.length) * sum);
  const chi = totals.reduce((a, o, i) => a + (o - expected[i]) ** 2 / expected[i], 0);
  const srmP = chiSquareP(chi, groups.length - 1);
  return { control: { name: c.name, rate: round(pc, 6), visitors: c.visitors, conversions: c.conversions }, results, correction, alpha, sample_ratio_mismatch: { chi_square: round(chi, 4), p_value: round(srmP, 6), suspected: srmP < 0.001 } };
}

export function sampleSize({ baseline_rate, mde, relative = true, alpha = 0.05, power = 0.8, variants = 1, std, two_sided = true }) {
  const za = normalInv(1 - (two_sided ? alpha / 2 : alpha) / (variants > 1 ? variants : 1));
  const zb = normalInv(power);
  if (std !== undefined) {
    const n = Math.ceil((2 * (za + zb) ** 2 * std ** 2) / mde ** 2);
    return { per_group: n, total: n * (variants + 1), metric: 'continuous', alpha, power, mde };
  }
  if (!(baseline_rate > 0 && baseline_rate < 1)) throw new ToolInputError('baseline_rate must be between 0 and 1');
  const p1 = baseline_rate; const p2 = relative ? p1 * (1 + mde) : p1 + mde;
  if (!(p2 > 0 && p2 < 1)) throw new ToolInputError('baseline plus effect must stay between 0 and 1');
  const pbar = (p1 + p2) / 2;
  const n = Math.ceil(((za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / (p2 - p1) ** 2);
  return { per_group: n, total: n * (variants + 1), metric: 'proportion', baseline_rate: p1, target_rate: round(p2, 6), alpha, power, bonferroni_variants: variants };
}

export function correlation(x, y) {
  const n = Math.min(x.length, y.length);
  const pairs = []; for (let i = 0; i < n; i += 1) { const a = parseNumber(x[i]), b = parseNumber(y[i]); if (a !== null && b !== null) pairs.push([a, b]); }
  if (pairs.length < 3) throw new ToolInputError('need at least 3 numeric pairs');
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (const [a, b] of pairs) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy);
  const df = pairs.length - 2; const t = r * Math.sqrt(df / Math.max(1e-12, 1 - r * r));
  const slope = sxy / sxx; const intercept = my - slope * mx;
  const { ranks: rx } = rankWithTies(xs); const { ranks: ry } = rankWithTies(ys);
  const mrx = mean(rx), mry = mean(ry); let a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < rx.length; i += 1) { a1 += (rx[i] - mrx) * (ry[i] - mry); a2 += (rx[i] - mrx) ** 2; a3 += (ry[i] - mry) ** 2; }
  return { n: pairs.length, pearson_r: round(r), r_squared: round(r * r), p_value: round(tTwoSidedP(t, df), 6), spearman_rho: round(a1 / Math.sqrt(a2 * a3)), regression: { slope: round(slope), intercept: round(intercept) }, note: 'Correlation does not establish causation.' };
}

// ------------------------------------------------------------ finance

export function npv(rate, flows) { return flows.reduce((a, f, t) => a + f / (1 + rate) ** t, 0); }
export function irr(flows) {
  if (!(flows.some((f) => f < 0) && flows.some((f) => f > 0))) return null;
  let lo = -0.9999, hi = 10; let flo = npv(lo, flows), fhi = npv(hi, flows);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 300; i += 1) { const mid = (lo + hi) / 2; const fm = npv(mid, flows); if (Math.abs(fm) < 1e-10) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
  return (lo + hi) / 2;
}

export function cashflowAnalysis({ cash_flows, discount_rate, reinvest_rate }) {
  const flows = cash_flows;
  const r = irr(flows);
  let cumulative = 0, payback = null, discounted = 0, dpayback = null;
  flows.forEach((f, t) => {
    const prev = cumulative; cumulative += f;
    if (payback === null && t > 0 && prev < 0 && cumulative >= 0) payback = round(t - 1 + -prev / f, 3);
    const prevD = discounted; discounted += f / (1 + discount_rate) ** t;
    if (dpayback === null && t > 0 && prevD < 0 && discounted >= 0) dpayback = round(t - 1 + -prevD / (f / (1 + discount_rate) ** t), 3);
  });
  let mirr = null;
  if (flows.some((f) => f < 0) && flows.some((f) => f > 0)) {
    const n = flows.length - 1; const fr = discount_rate; const rr = reinvest_rate ?? discount_rate;
    const pvNeg = flows.reduce((a, f, t) => a + (f < 0 ? f / (1 + fr) ** t : 0), 0);
    const fvPos = flows.reduce((a, f, t) => a + (f > 0 ? f * (1 + rr) ** (n - t) : 0), 0);
    mirr = round((fvPos / -pvNeg) ** (1 / n) - 1, 6);
  }
  const signChanges = flows.slice(1).filter((f, i) => Math.sign(f) !== Math.sign(flows[i]) && f !== 0 && flows[i] !== 0).length;
  const invested = -flows.filter((f) => f < 0).reduce((a, b) => a + b, 0);
  return {
    npv: round(npv(discount_rate, flows), 2), irr: r === null ? null : round(r, 6), mirr, payback_period: payback, discounted_payback_period: dpayback,
    profitability_index: invested ? round((npv(discount_rate, flows) + invested) / invested, 4) : null,
    total_inflows: round(flows.filter((f) => f > 0).reduce((a, b) => a + b, 0), 2), total_outflows: round(-invested, 2),
    warnings: signChanges > 1 ? ['cash flows change sign more than once; IRR may not be unique — prefer NPV/MIRR'] : [],
  };
}

export function loanSchedule({ principal, annual_rate, years, payments_per_year = 12, extra_payment = 0, max_rows = 600 }) {
  const n = Math.round(years * payments_per_year); const r = annual_rate / payments_per_year;
  const payment = r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
  let balance = principal; const rows = []; let totalInterest = 0; let period = 0;
  while (balance > 0.005 && period < n) {
    period += 1;
    const interest = balance * r;
    let principalPaid = Math.min(balance, payment - interest + extra_payment);
    balance -= principalPaid; totalInterest += interest;
    rows.push({ period, payment: round(interest + principalPaid, 2), principal: round(principalPaid, 2), interest: round(interest, 2), balance: round(Math.max(0, balance), 2) });
  }
  return { payment: round(payment, 2), periods: period, total_paid: round(principal + totalInterest, 2), total_interest: round(totalInterest, 2), schedule: rows.slice(0, max_rows), schedule_truncated: rows.length > max_rows };
}

const RATIO_DEFS = {
  gross_margin: ['gross_profit', 'revenue'], operating_margin: ['operating_income', 'revenue'], net_margin: ['net_income', 'revenue'],
  ebitda_margin: ['ebitda', 'revenue'], return_on_assets: ['net_income', 'total_assets'], return_on_equity: ['net_income', 'shareholders_equity'],
  current_ratio: ['current_assets', 'current_liabilities'], debt_to_equity: ['total_debt', 'shareholders_equity'], asset_turnover: ['revenue', 'total_assets'],
  interest_coverage: ['operating_income', 'interest_expense'], free_cash_flow_margin: ['free_cash_flow', 'revenue'], net_debt_to_ebitda: ['net_debt', 'ebitda'],
};
export function ratios(fin) {
  const f = { ...fin };
  if (f.gross_profit === undefined && f.revenue !== undefined && f.cost_of_revenue !== undefined) f.gross_profit = f.revenue - f.cost_of_revenue;
  if (f.free_cash_flow === undefined && f.operating_cash_flow !== undefined && f.capex !== undefined) f.free_cash_flow = f.operating_cash_flow - Math.abs(f.capex);
  if (f.net_debt === undefined && f.total_debt !== undefined && f.cash !== undefined) f.net_debt = f.total_debt - f.cash;
  if (f.quick_assets === undefined && f.current_assets !== undefined && f.inventory !== undefined) f.quick_assets = f.current_assets - f.inventory;
  const out = {}; const missing = {};
  for (const [name, [num, den]] of Object.entries(RATIO_DEFS)) {
    if (f[num] !== undefined && f[den] !== undefined && f[den] !== 0) out[name] = round(f[num] / f[den], 4); else missing[name] = [num, den].filter((k) => f[k] === undefined);
  }
  if (f.quick_assets !== undefined && f.current_liabilities) out.quick_ratio = round(f.quick_assets / f.current_liabilities, 4);
  return { ratios: out, derived: { gross_profit: f.gross_profit, free_cash_flow: f.free_cash_flow, net_debt: f.net_debt }, not_computed: missing };
}

// ------------------------------------------------------------ decisions & planning

export function weightedMatrix({ criteria, options, scale_max = 5 }) {
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0);
  if (!(totalWeight > 0)) throw new ToolInputError('criteria weights must sum to more than 0');
  const scoreOf = (opt, crit) => {
    const raw = opt.scores[crit.name];
    if (raw === undefined) throw new ToolInputError(`option "${opt.name}" has no score for "${crit.name}"`);
    return crit.direction === 'lower_is_better' ? scale_max - raw + (crit.min ?? 1) : raw;
  };
  const results = options.map((o) => {
    const contributions = Object.fromEntries(criteria.map((c) => [c.name, round((scoreOf(o, c) * c.weight) / totalWeight, 4)]));
    return { option: o.name, score: round(Object.values(contributions).reduce((a, b) => a + b, 0), 4), contributions };
  }).sort((a, b) => b.score - a.score);
  // Sensitivity: does the winner change if any single weight moves ±50%?
  const flips = [];
  for (const c of criteria) for (const factor of [0.5, 1.5]) {
    const tweaked = criteria.map((x) => (x.name === c.name ? { ...x, weight: x.weight * factor } : x));
    const tw = tweaked.reduce((a, x) => a + x.weight, 0);
    const best = options.map((o) => [o.name, tweaked.reduce((a, x) => a + scoreOf(o, x) * x.weight, 0) / tw]).sort((a, b) => b[1] - a[1])[0][0];
    if (best !== results[0].option) flips.push({ criterion: c.name, weight_factor: factor, winner: best });
  }
  const margin = results.length > 1 ? round(results[0].score - results[1].score, 4) : null;
  return { ranking: results, winner: results[0].option, margin, robust: flips.length === 0, sensitivity_flips: flips };
}

export function criticalPath(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, { ...t, deps: t.depends_on || [] }]));
  for (const t of byId.values()) for (const d of t.deps) if (!byId.has(d)) throw new ToolInputError(`task ${t.id} depends on unknown task ${d}`);
  const order = []; const state = new Map();
  const visit = (id, trail = []) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new ToolInputError(`dependency cycle: ${[...trail, id].join(' -> ')}`);
    state.set(id, 1); for (const d of byId.get(id).deps) visit(d, [...trail, id]); state.set(id, 2); order.push(id);
  };
  for (const id of byId.keys()) visit(id);
  const dur = (t) => (t.optimistic !== undefined && t.pessimistic !== undefined ? (t.optimistic + 4 * (t.most_likely ?? t.duration) + t.pessimistic) / 6 : t.duration);
  const varOf = (t) => (t.optimistic !== undefined && t.pessimistic !== undefined ? ((t.pessimistic - t.optimistic) / 6) ** 2 : 0);
  const es = {}, ef = {};
  for (const id of order) { const t = byId.get(id); es[id] = Math.max(0, ...t.deps.map((d) => ef[d])); ef[id] = es[id] + dur(t); }
  const finish = Math.max(...order.map((id) => ef[id]));
  const lf = {}, ls = {};
  const successors = new Map(order.map((id) => [id, []]));
  for (const t of byId.values()) for (const d of t.deps) successors.get(d).push(t.id);
  for (const id of [...order].reverse()) { const succ = successors.get(id); lf[id] = succ.length ? Math.min(...succ.map((s) => ls[s])) : finish; ls[id] = lf[id] - dur(byId.get(id)); }
  const schedule = order.map((id) => ({ id, name: byId.get(id).name, duration: round(dur(byId.get(id)), 3), earliest_start: round(es[id], 3), earliest_finish: round(ef[id], 3), latest_start: round(ls[id], 3), slack: round(ls[id] - es[id], 3), critical: Math.abs(ls[id] - es[id]) < 1e-9 }));
  const path = []; let cur = order.filter((id) => Math.abs(ef[id] - finish) < 1e-9 && Math.abs(ls[id] - es[id]) < 1e-9)[0];
  while (cur) { path.unshift(cur); cur = byId.get(cur).deps.find((d) => Math.abs(ef[d] - es[cur]) < 1e-9 && Math.abs(ls[d] - es[d]) < 1e-9); }
  const variance2 = path.reduce((a, id) => a + varOf(byId.get(id)), 0);
  return { project_duration: round(finish, 3), critical_path: path, schedule, ...(variance2 ? { duration_std: round(Math.sqrt(variance2), 3), p85_duration: round(finish + 1.036 * Math.sqrt(variance2), 3) } : {}) };
}

export function sloBudget({ slo, window_days = 30, total_events, bad_events, elapsed_days, observed_availability }) {
  if (!(slo > 0 && slo < 1)) throw new ToolInputError('slo must be a fraction such as 0.999');
  const minutes = window_days * 24 * 60;
  const out = { slo, window_days, allowed_downtime_minutes: round(minutes * (1 - slo), 2), allowed_downtime_per_day_seconds: round(86400 * (1 - slo), 1) };
  if (total_events !== undefined && bad_events !== undefined) {
    const allowedBad = total_events * (1 - slo);
    const consumed = allowedBad ? bad_events / allowedBad : Infinity;
    const elapsed = elapsed_days ?? window_days;
    const burnRate = consumed / (elapsed / window_days);
    Object.assign(out, {
      allowed_bad_events: round(allowedBad, 2), bad_events, budget_consumed: round(consumed, 4), budget_remaining: round(1 - consumed, 4),
      burn_rate: round(burnRate, 3), sli: round(1 - bad_events / total_events, 6),
      projected_exhaustion_day: burnRate > 0 ? round(window_days / burnRate, 2) : null,
      alert: burnRate >= 14.4 ? 'page (fast burn ≥14.4x)' : burnRate >= 6 ? 'page (≥6x)' : burnRate >= 1 ? 'ticket (burning faster than budget)' : 'ok',
    });
  }
  if (observed_availability !== undefined) out.observed_meets_slo = observed_availability >= slo;
  out.multiwindow_alerts = [{ burn_rate: 14.4, long_window: '1h', short_window: '5m', budget_spent: '2%' }, { burn_rate: 6, long_window: '6h', short_window: '30m', budget_spent: '5%' }, { burn_rate: 1, long_window: '3d', short_window: '6h', budget_spent: '10%' }];
  return out;
}

const CC_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;
const SECTIONS = { feat: 'Features', fix: 'Bug Fixes', perf: 'Performance', refactor: 'Refactoring', docs: 'Documentation', test: 'Tests', build: 'Build', ci: 'CI', chore: 'Chores', style: 'Style', revert: 'Reverts' };
export function conventionalChangelog({ commits, current_version = '0.0.0', include = ['feat', 'fix', 'perf', 'revert'] }) {
  const parsed = []; const nonConforming = [];
  for (const c of commits) {
    const message = typeof c === 'string' ? c : c.message; const hash = typeof c === 'string' ? null : c.hash;
    const [subject, ...bodyLines] = String(message).split('\n'); const body = bodyLines.join('\n');
    const m = CC_RE.exec(subject.trim());
    if (!m) { nonConforming.push(subject); continue; }
    const breaking = Boolean(m[3]) || /^BREAKING[ -]CHANGE:/m.test(body);
    parsed.push({ type: m[1].toLowerCase(), scope: m[2] || null, breaking, description: m[4], hash, breaking_note: (/^BREAKING[ -]CHANGE:\s*(.+)$/m.exec(body) || [])[1] });
  }
  const [maj, min, pat] = current_version.replace(/^v/, '').split(/[.-]/).map(Number);
  let bump = 'none';
  if (parsed.some((p) => p.breaking)) bump = 'major'; else if (parsed.some((p) => p.type === 'feat')) bump = 'minor'; else if (parsed.some((p) => ['fix', 'perf', 'revert'].includes(p.type))) bump = 'patch';
  if (bump === 'major' && maj === 0) bump = 'minor (pre-1.0 breaking)';
  const next = bump === 'major' ? `${maj + 1}.0.0` : bump.startsWith('minor') ? `${maj}.${min + 1}.0` : bump === 'patch' ? `${maj}.${min}.${pat + 1}` : current_version;
  const lines = [`## ${next}`, ''];
  const breaking = parsed.filter((p) => p.breaking);
  if (breaking.length) { lines.push('### BREAKING CHANGES', ''); for (const p of breaking) lines.push(`- ${p.scope ? `**${p.scope}:** ` : ''}${p.breaking_note || p.description}${p.hash ? ` (${p.hash.slice(0, 7)})` : ''}`); lines.push(''); }
  for (const [type, title] of Object.entries(SECTIONS)) {
    if (!include.includes(type)) continue;
    const items = parsed.filter((p) => p.type === type);
    if (!items.length) continue;
    lines.push(`### ${title}`, '');
    for (const p of items) lines.push(`- ${p.scope ? `**${p.scope}:** ` : ''}${p.description}${p.hash ? ` (${p.hash.slice(0, 7)})` : ''}`);
    lines.push('');
  }
  return { current_version, next_version: next, bump, commits: parsed.length, non_conforming: nonConforming, markdown: lines.join('\n').trim() + '\n' };
}

export default [
  {
    id: 'stats.describe', title: 'Describe a numeric sample',
    description: 'Descriptive statistics for numbers or a table column: n, mean, std, quantiles (p5–p99), skewness, coefficient of variation and 95% CI of the mean.',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { values: NUMBERS, path: { type: 'string' }, content: { type: 'string' }, column: { type: 'string' } } },
    async run(input, ctx) {
      if (input.values) return describe(input.values);
      if (!input.column) throw new ToolInputError('provide values, or a table with column');
      const { records } = await loadTable(ctx, input);
      return { column: input.column, ...describe(records.map((r) => r[input.column])) };
    },
  },
  {
    id: 'stats.compare_samples', title: 'Compare two samples',
    description: "Compare two numeric samples: Welch's t-test (or paired t-test), confidence interval, Cohen's d and Mann-Whitney U.",
    permissions: [],
    input_schema: { type: 'object', required: ['a', 'b'], properties: { a: NUMBERS, b: NUMBERS, paired: { type: 'boolean', default: false }, alpha: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 0.5, default: 0.05 } } },
    async run(input) { return compareSamples(input.a, input.b, input); },
  },
  {
    id: 'stats.correlation', title: 'Correlate two variables',
    description: 'Pearson and Spearman correlation with p-value and a least-squares line for two numeric series.',
    permissions: [],
    input_schema: { type: 'object', required: ['x', 'y'], properties: { x: NUMBERS, y: NUMBERS } },
    async run(input) { return correlation(input.x, input.y); },
  },
  {
    id: 'stats.ab_test', title: 'Analyze an A/B test',
    description: 'Two-proportion z-tests for conversion experiments with lift, confidence intervals, Holm/Bonferroni correction and sample-ratio-mismatch check.',
    permissions: [],
    input_schema: {
      type: 'object', required: ['control', 'variants'],
      properties: {
        control: { $ref: '#/$defs/group' }, variants: { type: 'array', minItems: 1, items: { $ref: '#/$defs/group' } },
        alpha: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 0.5, default: 0.05 }, correction: { enum: ['holm', 'bonferroni', 'none'], default: 'holm' },
      },
      $defs: { group: { type: 'object', required: ['visitors', 'conversions'], properties: { name: { type: 'string' }, visitors: { type: 'integer', minimum: 1 }, conversions: { type: 'integer', minimum: 0 }, expected_share: { type: 'number' } } } },
    },
    async run(input) { return abTest(input); },
  },
  {
    id: 'stats.sample_size', title: 'Experiment sample size',
    description: 'Required sample size per group for a conversion-rate or continuous-metric experiment given baseline, minimum detectable effect, alpha and power.',
    permissions: [],
    input_schema: { type: 'object', required: ['mde'], properties: { baseline_rate: { type: 'number' }, mde: { type: 'number', exclusiveMinimum: 0 }, relative: { type: 'boolean', default: true }, std: { type: 'number', exclusiveMinimum: 0 }, alpha: { type: 'number', default: 0.05 }, power: { type: 'number', default: 0.8 }, variants: { type: 'integer', minimum: 1, default: 1 }, two_sided: { type: 'boolean', default: true } } },
    async run(input) { return sampleSize(input); },
  },
  {
    id: 'finance.cashflow', title: 'Evaluate cash flows',
    description: 'NPV, IRR, MIRR, payback, discounted payback and profitability index for a series of periodic cash flows (period 0 first).',
    permissions: [],
    input_schema: { type: 'object', required: ['cash_flows', 'discount_rate'], properties: { cash_flows: { type: 'array', items: { type: 'number' }, minItems: 2 }, discount_rate: { type: 'number', minimum: -0.99 }, reinvest_rate: { type: 'number' } } },
    async run(input) { return cashflowAnalysis(input); },
  },
  {
    id: 'finance.loan_schedule', title: 'Loan amortization',
    description: 'Fixed-rate loan payment and amortization schedule with total interest and optional extra payments.',
    permissions: [],
    input_schema: { type: 'object', required: ['principal', 'annual_rate', 'years'], properties: { principal: { type: 'number', exclusiveMinimum: 0 }, annual_rate: { type: 'number', minimum: 0 }, years: { type: 'number', exclusiveMinimum: 0 }, payments_per_year: { type: 'integer', minimum: 1, default: 12 }, extra_payment: { type: 'number', minimum: 0, default: 0 }, max_rows: { type: 'integer', minimum: 1, maximum: 1200, default: 600 } } },
    async run(input) { return loanSchedule(input); },
  },
  {
    id: 'finance.ratios', title: 'Financial ratios',
    description: 'Margins, returns, liquidity, leverage and coverage ratios from income statement, balance sheet and cash-flow figures.',
    permissions: [],
    input_schema: { type: 'object', additionalProperties: { type: 'number' }, properties: {} },
    async run(input) { return ratios(input); },
  },
  {
    id: 'decision.weighted_matrix', title: 'Weighted decision matrix',
    description: 'Rank options by weighted criteria scores, show each criterion\'s contribution and test whether the winner survives ±50% weight changes.',
    permissions: [],
    input_schema: {
      type: 'object', required: ['criteria', 'options'],
      properties: {
        criteria: { type: 'array', minItems: 1, items: { type: 'object', required: ['name', 'weight'], properties: { name: { type: 'string' }, weight: { type: 'number', minimum: 0 }, direction: { enum: ['higher_is_better', 'lower_is_better'], default: 'higher_is_better' } } } },
        options: { type: 'array', minItems: 2, items: { type: 'object', required: ['name', 'scores'], properties: { name: { type: 'string' }, scores: { type: 'object', additionalProperties: { type: 'number' } } } } },
        scale_max: { type: 'number', default: 5 },
      },
    },
    async run(input) { return weightedMatrix(input); },
  },
  {
    id: 'pm.critical_path', title: 'Critical path schedule',
    description: 'Compute earliest/latest starts, slack and the critical path for tasks with dependencies; supports three-point (PERT) estimates.',
    permissions: [],
    input_schema: { type: 'object', required: ['tasks'], properties: { tasks: { type: 'array', minItems: 1, items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, name: { type: 'string' }, duration: { type: 'number', minimum: 0 }, optimistic: { type: 'number' }, most_likely: { type: 'number' }, pessimistic: { type: 'number' }, depends_on: { type: 'array', items: { type: 'string' } } }, anyOf: [{ required: ['duration'] }, { required: ['optimistic', 'pessimistic'] }] } } } },
    async run(input) { return criticalPath(input.tasks); },
  },
  {
    id: 'reliability.slo_budget', title: 'SLO error budget',
    description: 'Error budget, allowed downtime, budget consumed, burn rate and multi-window burn-rate alert thresholds for an availability SLO.',
    permissions: [],
    input_schema: { type: 'object', required: ['slo'], properties: { slo: { type: 'number' }, window_days: { type: 'number', default: 30 }, total_events: { type: 'number', minimum: 1 }, bad_events: { type: 'number', minimum: 0 }, elapsed_days: { type: 'number', exclusiveMinimum: 0 }, observed_availability: { type: 'number' } } },
    async run(input) { return sloBudget(input); },
  },
  {
    id: 'release.changelog', title: 'Changelog and version bump',
    description: 'Parse Conventional Commits into a Markdown changelog and the next semantic version (breaking → major, feat → minor, fix → patch).',
    permissions: ['read'],
    input_schema: { type: 'object', properties: { commits: { type: 'array', items: { type: ['string', 'object'] } }, content: { type: 'string', description: 'git log output, one subject per line' }, current_version: { type: 'string', default: '0.0.0' }, include: { type: 'array', items: { type: 'string' } } } },
    async run(input, ctx) {
      let commits = input.commits;
      if (!commits) { const { text } = await readTextInput(ctx, input); commits = text.split('\n').map((l) => l.replace(/^[0-9a-f]{7,40}\s+/, '')).filter(Boolean); }
      return conventionalChangelog({ ...input, commits, include: input.include || ['feat', 'fix', 'perf', 'revert'] });
    },
  },
];
