const Stats = (() => {

  /* ── Math helpers ── */
  function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
  function variance(arr, ddof = 1) {
    const m = mean(arr);
    return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - ddof);
  }
  function std(arr, ddof = 1) { return Math.sqrt(variance(arr, ddof)); }
  function sum(arr) { return arr.reduce((s, v) => s + v, 0); }

  /* ── Quantile (linear interpolation, matches numpy) ── */
  function quantile(sorted, p) {
    const n = sorted.length;
    if (n === 0) return NaN;
    const idx = p * (n - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  /* ── Sort array numerically ── */
  function sortNum(arr) { return [...arr].sort((a, b) => a - b); }

  /* ── t-distribution CDF via jStat ── */
  function tCdf(t, df) {
    if (typeof jStat !== 'undefined') return jStat.studentt.cdf(t, df);
    // Fallback approximation (less accurate)
    const x = df / (df + t * t);
    const beta = jStat ? jStat.ibeta(x, df / 2, 0.5) : regularizedIncompleteBeta(x, df / 2, 0.5);
    return t < 0 ? beta / 2 : 1 - beta / 2;
  }

  function tPpf(p, df) {
    if (typeof jStat !== 'undefined') return jStat.studentt.inv(p, df);
    return 1.96; // fallback
  }

  /* ── Chi-square CDF ── */
  function chi2Cdf(x, df) {
    if (typeof jStat !== 'undefined') return jStat.chisquare.cdf(x, df);
    return 0;
  }

  /* ── Normal CDF (standard) ── */
  function normCdf(z) {
    if (typeof jStat !== 'undefined') return jStat.normal.cdf(z, 0, 1);
    // Abramowitz and Stegun approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
    return z < 0 ? p : 1 - p;
  }

  /* ── F-distribution CDF ── */
  function fCdf(x, df1, df2) {
    if (typeof jStat !== 'undefined') return jStat.centralF.cdf(x, df1, df2);
    return 0;
  }

  /* ── Shapiro-Wilk approximation ── */
  function shapiroWilk(arr) {
    const n = arr.length;
    if (n < 3) return { W: null, p: null };
    const sorted = sortNum(arr);
    const m = mean(sorted);
    // W = (Σ aᵢ·x_(i))² / Σ(xᵢ - mean)²
    // Use simplified coefficients via polynomial approximation
    const SS = sorted.reduce((s, v) => s + (v - m) ** 2, 0);
    if (SS === 0) return { W: 1, p: 1 };
    // Royston 1995 algorithm (simplified for n ≤ 50)
    // For larger n, use the Kolmogorov-Smirnov approach
    if (n > 50) {
      // KS test against normal
      const mu = m, sigma = std(sorted);
      if (sigma === 0) return { W: 1, p: 1 };
      let D = 0;
      for (let i = 0; i < n; i++) {
        const z = (sorted[i] - mu) / sigma;
        const expected = normCdf(z);
        const empLo = i / n, empHi = (i + 1) / n;
        D = Math.max(D, Math.abs(empLo - expected), Math.abs(empHi - expected));
      }
      const ksStat = D * Math.sqrt(n);
      // Approximate p-value
      const t = ksStat;
      let pApprox = 2 * Math.exp(-2 * t * t);
      return { W: 1 - D, p: Math.min(1, Math.max(0, pApprox)), test: 'KS' };
    }
    // Simplified W using a_i coefficients for small n
    const half = Math.floor(n / 2);
    // Coefficients a_i from standard tables (first few, approximate rest)
    const A = []; let sumA2 = 0;
    for (let i = 0; i < half; i++) {
      const ai = normCdf((i + 0.375) / (n + 0.25)) * 2 - 1;
      A[i] = ai;
      sumA2 += ai * ai;
    }
    const normA2 = Math.sqrt(sumA2);
    let b = 0;
    for (let i = 0; i < half; i++) {
      b += (A[i] / normA2) * (sorted[n - 1 - i] - sorted[i]);
    }
    const W = Math.min(1, (b * b) / SS);
    // Approximate p-value using log(1-W) regression
    const y = Math.log(1 - W);
    const mu_y = -1.2725 + 1.0521 * Math.log(n);
    const sigma_y = 1.0308 - 0.26763 * Math.log(n);
    const z = (y - mu_y) / sigma_y;
    const p = 1 - normCdf(z);
    return { W: parseFloat(W.toFixed(6)), p: Math.min(1, Math.max(0, parseFloat(p.toFixed(6)))) };
  }

  /* ── Levene's test for equality of variances ── */
  function leveneTest(groups) {
    const k = groups.length;
    const N = groups.reduce((s, g) => s + g.length, 0);
    const Zij = groups.map(g => {
      const med = quantile(sortNum(g), 0.5);
      return g.map(v => Math.abs(v - med));
    });
    const grandMean = mean(Zij.flat());
    const groupMeans = Zij.map(z => mean(z));
    const ni = groups.map(g => g.length);
    const ssB = ni.reduce((s, n, i) => s + n * (groupMeans[i] - grandMean) ** 2, 0);
    const ssW = Zij.reduce((s, z, i) => s + z.reduce((ss, v) => ss + (v - groupMeans[i]) ** 2, 0), 0);
    const dfB = k - 1, dfW = N - k;
    const F = (ssB / dfB) / (ssW / dfW);
    const p = 1 - fCdf(F, dfB, dfW);
    return { F: parseFloat(F.toFixed(6)), p: parseFloat(p.toFixed(6)), df1: dfB, df2: dfW };
  }

  /* ── Pearson Correlation ── */
  function pearsonR(x, y) {
    const n = x.length;
    const mx = mean(x), my = mean(y);
    let num = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      sx += (x[i] - mx) ** 2;
      sy += (y[i] - my) ** 2;
    }
    const denom = Math.sqrt(sx * sy);
    if (denom === 0) return { r: NaN, p: NaN, n };
    const r = num / denom;
    const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
    const p = 2 * (1 - tCdf(Math.abs(t), n - 2));
    return { r: parseFloat(r.toFixed(8)), t: parseFloat(t.toFixed(6)), p: parseFloat(p.toFixed(6)), n };
  }

  /* ── Spearman Correlation ── */
  function ranks(arr) {
    const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array(arr.length);
    let i = 0;
    while (i < arr.length) {
      let j = i;
      while (j < arr.length - 1 && indexed[j + 1].v === indexed[j].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[indexed[k].i] = avg;
      i = j + 1;
    }
    return r;
  }

  function spearmanR(x, y) {
    return pearsonR(ranks(x), ranks(y));
  }

  /* ── Kendall's tau-b ── */
  function kendallTau(x, y) {
    const n = x.length;
    let C = 0, D = 0, tx = 0, ty = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[i] - x[j], dy = y[i] - y[j];
        const sg = Math.sign(dx) * Math.sign(dy);
        if (sg > 0) C++;
        else if (sg < 0) D++;
        else { if (dx !== 0) tx++; if (dy !== 0) ty++; }
      }
    }
    const denom = Math.sqrt((C + D + tx) * (C + D + ty));
    const tau = denom === 0 ? 0 : (C - D) / denom;
    const z = (3 * tau * Math.sqrt(n * (n - 1))) / Math.sqrt(2 * (2 * n + 5));
    const p = 2 * (1 - normCdf(Math.abs(z)));
    return { r: parseFloat(tau.toFixed(8)), z: parseFloat(z.toFixed(4)), p: parseFloat(p.toFixed(6)), n };
  }

  /* ══════════════════════════════════════════════════════════════
     DATA RESOLVER — apply filter, missing values, type coercion
     ══════════════════════════════════════════════════════════════ */
  function resolveDataset(dataset, varNames, opts = {}) {
    const { filter, weight, missingHandling = 'listwise' } = opts;
    const variables = dataset.variables;
    const cases = dataset.cases;
    if (!cases || cases.length === 0) return { data: {}, n: 0, warnings: [] };

    const warnings = [];
    const varIdx = {};
    for (let i = 0; i < variables.length; i++) varIdx[variables[i].name] = i;

    // Build column arrays applying type coercion + user-defined missing
    const rawCols = {};
    for (const vn of varNames) {
      const meta = variables.find(x => x.name === vn);
      if (!meta) { warnings.push(`Variable '${vn}' not found`); rawCols[vn] = []; continue; }
      // missingValues is an array of user-defined missing codes (camelCase from our schema)
      const userMissing = (meta.missingValues || meta.missing_values || []);
      rawCols[vn] = cases.map(row => {
        let v = row[vn];  // cases are objects keyed by variable name
        if (v === null || v === undefined || v === '') return null;
        // Type coercion: ONLY when variable metadata says numeric.
        // Do NOT coerce based solely on measurementLevel — a string variable with
        // measurementLevel='scale' would silently convert all values to NaN → null.
        if (meta.type === 'numeric') {
          if (typeof v === 'number') {
            v = isFinite(v) ? v : null;
          } else if (typeof v === 'string' && v.trim() !== '') {
            // Use full semantic parser (handles currency, locale, percentage).
            // DataTypeConverter may not be defined in isolated test contexts —
            // fall back to normalized Number() coercion.
            if (typeof DataTypeConverter !== 'undefined') {
              const parsed = DataTypeConverter.parseSemanticNumber(v);
              v = parsed !== null ? parsed.value : null;
            } else {
              const raw = v.trim().replace(/\u00a0/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
              const num = Number(raw);
              v = isNaN(num) ? null : num;
            }
          } else {
            v = null;
          }
        }
        // User-defined missing values check
        if (v !== null && userMissing.length > 0) {
          // eslint-disable-next-line eqeqeq
          if (userMissing.some(m => m == v || Number(m) === Number(v))) return null;
        }
        return v;
      });
    }

    // Apply filter expression from dataset.activeFilter (a plain expression string)
    const activeFilter = opts.filter || dataset.activeFilter || null;
    if (activeFilter) {
      const allVarNames = variables.map(v => v.name);
      try {
        const expr = activeFilter
          .replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||')
          .replace(/\bNOT\b/gi, '!');
        // eslint-disable-next-line no-new-func
        const filterFn = new Function(...allVarNames, `"use strict"; return !!(${expr});`);
        // Build inclusion mask indexed by case position
        const mask = cases.map(row => {
          try { return filterFn(...allVarNames.map(vn => row[vn] ?? null)); } catch { return true; }
        });
        // Apply mask to each rawCol
        for (const vn of varNames) rawCols[vn] = rawCols[vn].filter((_, i) => mask[i]);
        if ((rawCols[varNames[0]] || []).length === 0) warnings.push('Filter matched 0 cases.');
      } catch (e) { warnings.push(`Filter error: ${e.message}`); }
    }

    // Listwise deletion
    const n = Object.values(rawCols)[0]?.length || 0;
    let mask = new Array(n).fill(true);
    if (missingHandling === 'listwise') {
      for (const vn of varNames) {
        for (let i = 0; i < n; i++) { if (rawCols[vn][i] === null || rawCols[vn][i] === undefined) mask[i] = false; }
      }
    }

    const data = {};
    for (const vn of varNames) {
      data[vn] = rawCols[vn].filter((_, i) => mask[i]);
    }
    const validN = Object.values(data)[0]?.length || 0;
    const removed = n - validN;
    if (removed > 0) warnings.push(`${removed} case(s) excluded due to missing data (listwise).`);

    return { data, n: validN, warnings };
  }

  /* ══════════════════════════════════════════════════════════════
     PROCEDURE: FREQUENCIES
     ══════════════════════════════════════════════════════════════ */
  function frequencies(dataset, params) {
    const { variables: varNames } = params;
    const warnings = [];
    const tables = {};
    for (const vn of varNames) {
      const { data, n: total, warnings: w } = resolveDataset(dataset, [vn], params);
      warnings.push(...w);
      const col = (dataset.variables.find(v => v.name === vn) || {});
      const values = data[vn] || [];
      const meta = dataset.variables.find(v => v.name === vn) || {};
      const vlMap = {};
      (meta.value_labels || []).forEach(lbl => { vlMap[String(lbl.value)] = lbl.label; });

      // Count
      const counts = new Map();
      let nMissing = 0;
      const allCasesMissing = resolveDataset(dataset, [vn], { ...params, missingHandling: 'none' });
      (allCasesMissing.data[vn] || []).forEach(v => {
        if (v === null || v === undefined) { nMissing++; return; }
        counts.set(String(v), (counts.get(String(v)) || 0) + 1);
      });
      const nTotal = (allCasesMissing.data[vn] || []).length;
      const nValid = nTotal - nMissing;

      const sorted = [...counts.entries()].sort((a, b) => {
        const na = Number(a[0]), nb = Number(b[0]);
        return isNaN(na) || isNaN(nb) ? a[0].localeCompare(b[0]) : na - nb;
      });

      let cumValid = 0;
      const rows = sorted.map(([val, cnt]) => {
        cumValid += cnt;
        return {
          value: val, label: vlMap[val] || '',
          frequency: cnt,
          percent: nTotal > 0 ? parseFloat((cnt / nTotal * 100).toFixed(2)) : 0,
          valid_percent: nValid > 0 ? parseFloat((cnt / nValid * 100).toFixed(2)) : 0,
          cumulative_percent: nValid > 0 ? parseFloat((cumValid / nValid * 100).toFixed(2)) : 0,
        };
      });
      if (nMissing > 0) rows.push({
        value: null, label: 'System Missing',
        frequency: nMissing,
        percent: nTotal > 0 ? parseFloat((nMissing / nTotal * 100).toFixed(2)) : 0,
        valid_percent: null, cumulative_percent: null,
      });
      tables[vn] = { variable: vn, label: meta.label || vn, n_total: nTotal, n_valid: nValid, n_missing: nMissing, rows };
    }
    return { status: 'complete', result: { tables }, warnings };
  }

  /* ══════════════════════════════════════════════════════════════
     PROCEDURE: DESCRIPTIVES
     ══════════════════════════════════════════════════════════════ */
  function descriptives(dataset, params) {
    const { variables: varNames } = params;
    const warnings = [];
    const results = {};
    for (const vn of varNames) {
      const meta = dataset.variables.find(v => v.name === vn) || {};
      if (meta.measurement_level === 'nominal') warnings.push(`'${vn}' is nominal — descriptives may not be meaningful.`);
      const { data, warnings: w } = resolveDataset(dataset, [vn], params);
      warnings.push(...w);
      const x = (data[vn] || []).filter(v => typeof v === 'number' && isFinite(v));
      const n = x.length;
      const allN = resolveDataset(dataset, [vn], { ...params, missingHandling: 'none' }).data[vn]?.length || 0;
      const nMissing = allN - n;
      if (n === 0) { results[vn] = { n: 0, n_missing: nMissing, error: 'No valid numeric cases' }; continue; }
      const sorted = sortNum(x);
      const m = mean(x), v = n > 1 ? variance(x, 1) : null;
      const s = v !== null ? Math.sqrt(v) : null;
      const se = s !== null ? s / Math.sqrt(n) : null;
      const sk = skewness(x), kt = kurtosis(x);
      const seSk = n >= 3 ? Math.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3))) : null;
      const seKt = (seSk && n >= 4) ? 2 * seSk * Math.sqrt((n * n - 1) / ((n - 3) * (n + 5))) : null;
      let ci_lo = null, ci_hi = null;
      if (n > 1 && se !== null) {
        const tc = tPpf(0.975, n - 1);
        ci_lo = parseFloat((m - tc * se).toFixed(8));
        ci_hi = parseFloat((m + tc * se).toFixed(8));
      }
      const pcts = {};
      [5, 10, 25, 50, 75, 90, 95].forEach(p => { pcts[p] = parseFloat(quantile(sorted, p / 100).toFixed(8)); });
      // Mode
      const freq = new Map();
      x.forEach(v => freq.set(v, (freq.get(v) || 0) + 1));
      let modeVal = null, modeCnt = 0;
      freq.forEach((cnt, val) => { if (cnt > modeCnt) { modeCnt = cnt; modeVal = val; } });

      results[vn] = {
        variable: vn, label: meta.label || vn, n, n_missing: nMissing,
        mean: parseFloat(m.toFixed(8)), median: parseFloat(quantile(sorted, 0.5).toFixed(8)),
        mode: modeVal, mode_count: modeCnt,
        std: s !== null ? parseFloat(s.toFixed(8)) : null,
        variance: v !== null ? parseFloat(v.toFixed(8)) : null,
        se_mean: se !== null ? parseFloat(se.toFixed(8)) : null,
        sum: parseFloat(sum(x).toFixed(8)), minimum: sorted[0], maximum: sorted[n - 1],
        range: parseFloat((sorted[n - 1] - sorted[0]).toFixed(8)),
        skewness: sk !== null ? parseFloat(sk.toFixed(8)) : null, se_skewness: seSk !== null ? parseFloat(seSk.toFixed(8)) : null,
        kurtosis: kt !== null ? parseFloat(kt.toFixed(8)) : null, se_kurtosis: seKt !== null ? parseFloat(seKt.toFixed(8)) : null,
        percentiles: pcts, ci_95_lower: ci_lo, ci_95_upper: ci_hi,
      };
    }
    return { status: 'complete', result: { descriptives: results }, warnings };
  }

  function skewness(arr) {
    const n = arr.length;
    if (n < 3) return null;
    const m = mean(arr);
    const s = std(arr, 1);
    if (s === 0) return 0;
    const g1 = arr.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0) / n;
    return g1 * Math.sqrt(n * (n - 1)) / (n - 2);
  }

  function kurtosis(arr) {
    const n = arr.length;
    if (n < 4) return null;
    const m = mean(arr);
    const s = std(arr, 1);
    if (s === 0) return 0;
    const g2 = arr.reduce((acc, v) => acc + ((v - m) / s) ** 4, 0) / n;
    const excess = (g2 * (n + 1) * (n - 1) / ((n - 2) * (n - 3))) - (3 * (n - 1) ** 2 / ((n - 2) * (n - 3)));
    return excess;
  }

  return { pearsonR, spearmanR, kendallTau, leveneTest, shapiroWilk, resolveDataset,
    frequencies, descriptives, mean, std, variance, sum, quantile, sortNum, ranks,
    tCdf, tPpf, chi2Cdf, normCdf, fCdf, skewness, kurtosis };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 4B: STATISTICAL ENGINE — CROSSTABS, T-TESTS, ANOVA
   ══════════════════════════════════════════════════════════════════ */
