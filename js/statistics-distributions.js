const ProbabilityCalc = (() => {

  /* ── Re-use Stats.normCdf ── */
  const normCdf = (z) => Stats.normCdf(z);

  /* ── Standard Normal Z-table (Abramowitz & Stegun 26.2.17)
     Table stores P(Z ≤ z) for z = 0.00..3.99 in steps of 0.01.
     Row = tenths digit (e.g. 1.9), Column = hundredths digit (e.g. .06) → 1.96
     Only first 4 decimals shown here (matches textbook Z-tables).
     Lookup is done via the exact-computation normCdf when available,
     and the prebuilt table is used when user explicitly selects "Z Table" mode.
  ── */
  const Z_TABLE = (() => {
    // Build a compact lookup: key = "R.C" where R*10+C = z*100
    // We generate the table from normCdf to guarantee accuracy and avoid
    // a 400-entry hard-coded array.  This is run once at startup.
    const tbl = {};
    for (let ri = 0; ri <= 39; ri++) {
      for (let ci = 0; ci <= 9; ci++) {
        const z = (ri * 10 + ci) / 100;   // 0.00 to 3.99
        const p = normCdf(z);
        tbl[`${ri}.${ci}`] = parseFloat(p.toFixed(4));
        // Also store negative keys (use symmetry)
        tbl[`-${ri}.${ci}`] = parseFloat((1 - p).toFixed(4));
      }
    }
    return tbl;
  })();

  /* ── Lookup P(Z ≤ z) from table, precision to 0.01 ── */
  function tablelookup(z) {
    const z2 = Math.abs(z);
    if (z2 > 3.99) return z >= 0 ? 1 : 0;
    const ri = Math.round(Math.floor(z2 * 10));    // tenths
    const ci = Math.round(Math.round((z2 * 100) % 10)); // hundredths
    const key = `${ri}.${ci}`;
    const p = Z_TABLE[key] != null ? Z_TABLE[key] : parseFloat(normCdf(z2).toFixed(4));
    return z >= 0 ? p : parseFloat((1 - p).toFixed(4));
  }

  /* ── Inverse Normal (probit) — needed for critical Z ── */
  function normInv(p) {
    if (typeof jStat !== 'undefined') return jStat.normal.inv(p, 0, 1);
    // Rational approximation (Abramowitz & Stegun 26.2.23)
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p > 0.5) return -normInv(1 - p);
    const t = Math.sqrt(-2 * Math.log(p));
    const c = [2.515517, 0.802853, 0.010328];
    const d = [1.432788, 0.189269, 0.001308];
    return -(t - (c[0] + c[1]*t + c[2]*t*t) / (1 + d[0]*t + d[1]*t*t + d[2]*t*t*t));
  }

  /* ── Core calculation ── */
  function calculateNormal(opts) {
    /*
      opts = {
        mode:       'z' | 'raw',        // Z-score or raw X
        z:          number,              // used when mode='z'
        x:          number,              // used when mode='raw'
        mean:       number,              // used when mode='raw'
        sd:         number,              // used when mode='raw' (must be > 0)
        tailType:   'left'|'right'|'between'|'two',
        z1:         number,              // used for 'between'
        z2:         number,              // used for 'between'
        x1:         number,              // raw X1 for 'between' in raw mode
        x2:         number,              // raw X2 for 'between' in raw mode
        method:     'exact'|'table',
      }
    */
    const { mode='z', tailType='left', method='exact' } = opts;

    // ── Validate ──
    const errors = [];
    let z = null, z1 = null, z2 = null;

    if (tailType === 'between') {
      if (mode === 'raw') {
        // Validate raw-between inputs
        if (opts.x1 == null || isNaN(Number(opts.x1))) errors.push('x1 must be numeric');
        if (opts.x2 == null || isNaN(Number(opts.x2))) errors.push('x2 must be numeric');
        if (opts.mean == null || isNaN(Number(opts.mean))) errors.push('Mean must be numeric');
        if (opts.sd == null || isNaN(Number(opts.sd))) errors.push('Standard deviation must be numeric');
        if (Number(opts.sd) <= 0) errors.push('Standard deviation must be greater than 0');
        if (errors.length) return { error: errors.join('; ') };
        z1 = (Number(opts.x1) - Number(opts.mean)) / Number(opts.sd);
        z2 = (Number(opts.x2) - Number(opts.mean)) / Number(opts.sd);
      } else {
        if (opts.z1 == null || isNaN(Number(opts.z1))) errors.push('z1 must be numeric');
        if (opts.z2 == null || isNaN(Number(opts.z2))) errors.push('z2 must be numeric');
        if (errors.length) return { error: errors.join('; ') };
        z1 = Number(opts.z1);
        z2 = Number(opts.z2);
      }
      // ensure z1 < z2
      if (z1 > z2) { [z1, z2] = [z2, z1]; }
    } else {
      if (mode === 'raw') {
        if (opts.x == null || isNaN(Number(opts.x))) errors.push('X must be numeric');
        if (opts.mean == null || isNaN(Number(opts.mean))) errors.push('Mean must be numeric');
        if (opts.sd == null || isNaN(Number(opts.sd))) errors.push('Standard deviation must be numeric');
        if (Number(opts.sd) <= 0) errors.push('Standard deviation must be greater than 0');
        if (errors.length) return { error: errors.join('; ') };
        z = (Number(opts.x) - Number(opts.mean)) / Number(opts.sd);
      } else {
        if (opts.z == null || isNaN(Number(opts.z))) errors.push('Z must be numeric');
        if (errors.length) return { error: errors.join('; ') };
        z = Number(opts.z);
      }
    }

    // ── Compute probabilities ──
    function getP(zVal) {
      return method === 'table' ? tableloop(zVal) : normCdf(zVal);
    }
    function tableloop(zVal) { return tableloop_inner(zVal); }
    function tableloop_inner(zVal) { return tableonly(zVal); }
    function tableonly(zVal) {
      const z2 = Math.abs(zVal);
      if (z2 > 3.99) return zVal >= 0 ? 1 : 0;
      const ri = Math.floor(z2 * 10);
      const ci = Math.round((z2 * 100) % 10);
      const key = `${ri}.${ci}`;
      const p = Z_TABLE[key] != null ? Z_TABLE[key] : parseFloat(normCdf(z2).toFixed(4));
      return zVal >= 0 ? p : parseFloat((1 - p).toFixed(4));
    }

    let probability, leftP, rightP, betweenP;

    if (tailType === 'between') {
      leftP = getP(z1);
      rightP = 1 - getP(z2);
      betweenP = 1 - leftP - rightP;
      probability = Math.max(0, Math.min(1, betweenP));
    } else if (tailType === 'left') {
      probability = getP(z);
      leftP = probability;
      rightP = 1 - probability;
    } else if (tailType === 'right') {
      probability = 1 - getP(z);
      leftP = getP(z);
      rightP = probability;
    } else if (tailType === 'two') {
      // P(|Z| >= |z|)
      leftP = getP(-Math.abs(z));
      rightP = 1 - getP(Math.abs(z));
      probability = leftP + rightP;
    }

    // ── Table value (always 4 decimal places) ──
    let tableValue = null;
    if (tailType === 'between') {
      tableValue = parseFloat((tableonly(z2) - tableonly(z1)).toFixed(4));
    } else if (tailType === 'left') {
      tableValue = tableonly(z);
    } else if (tailType === 'right') {
      tableValue = parseFloat((1 - tableonly(z)).toFixed(4));
    } else if (tailType === 'two') {
      tableValue = parseFloat((2 * tableonly(-Math.abs(z))).toFixed(4));
    }

    // ── Build result object ──
    const result = {
      distribution: 'normal',
      mode,
      z: tailType === 'between' ? null : parseFloat((z || 0).toFixed(6)),
      z1: tailType === 'between' ? parseFloat(z1.toFixed(6)) : null,
      z2: tailType === 'between' ? parseFloat(z2.toFixed(6)) : null,
      type: tailType,
      probability: parseFloat(Math.max(0, Math.min(1, probability)).toFixed(7)),
      percentage: parseFloat((Math.max(0, Math.min(1, probability)) * 100).toFixed(5)),
      tableValue,
      method,
    };

    if (mode === 'raw') {
      result.x = tailType === 'between' ? null : parseFloat(Number(opts.x).toFixed(6));
      result.x1 = tailType === 'between' ? parseFloat(Number(opts.x1).toFixed(6)) : null;
      result.x2 = tailType === 'between' ? parseFloat(Number(opts.x2).toFixed(6)) : null;
      result.mean = parseFloat(Number(opts.mean).toFixed(6));
      result.sd = parseFloat(Number(opts.sd).toFixed(6));
    }

    // Additional breakdown for convenience
    result.leftTail  = parseFloat(Math.max(0, Math.min(1, tailType === 'between' ? leftP : getP(tailType === 'two' ? -Math.abs(z) : z))).toFixed(7));
    result.rightTail = parseFloat(Math.max(0, Math.min(1, tailType === 'between' ? rightP : 1 - getP(tailType === 'two' ? Math.abs(z) : z))).toFixed(7));

    return result;
  }

  /* ── Critical Value: given probability, find Z ── */
  function criticalZ(opts) {
    /*
      opts = {
        probability: number (0 < p < 1),
        tailType: 'left' | 'right' | 'two-confidence' | 'two-alpha'
      }
      'two-confidence': p is confidence level (e.g. 0.95) → Z for each tail = normInv((1+p)/2)
      'two-alpha':      p is alpha (e.g. 0.05) → Z_crit = normInv(1 - p/2)
      'left':           p is left-tail probability → Z = normInv(p)
      'right':          p is right-tail probability → Z = normInv(1-p)
    */
    const p = Number(opts.probability);
    const tailType = opts.tailType || 'left';
    if (isNaN(p) || p <= 0 || p >= 1) return { error: 'Probability must be between 0 and 1 (exclusive)' };

    let z, label;
    if (tailType === 'left') {
      z = normInv(p);
      label = `Z for P(Z ≤ z) = ${p}`;
    } else if (tailType === 'right') {
      z = normInv(1 - p);
      label = `Z for P(Z > z) = ${p}`;
    } else if (tailType === 'two-confidence') {
      z = normInv((1 + p) / 2);
      label = `Z_α/2 for ${(p*100).toFixed(0)}% CI`;
    } else {  // two-alpha
      z = normInv(1 - p / 2);
      label = `Z_α/2 for α = ${p}`;
    }

    return {
      distribution: 'normal',
      mode: 'critical',
      inputProbability: p,
      tailType,
      z: parseFloat(z.toFixed(6)),
      label,
      verification: parseFloat(normCdf(z).toFixed(7)),
    };
  }

  /* ── P-value from Z ── */
  function pValueFromZ(opts) {
    /*
      opts = { z: number, alternative: 'two-sided'|'left'|'right' }
    */
    const z = Number(opts.z);
    const alt = opts.alternative || 'two-sided';
    if (isNaN(z)) return { error: 'Z must be numeric' };

    let pValue;
    if (alt === 'two-sided') pValue = 2 * Math.min(normCdf(z), normCdf(-z));
    else if (alt === 'left')  pValue = normCdf(z);
    else                      pValue = 1 - normCdf(z);

    return {
      distribution: 'normal',
      mode: 'pvalue',
      z: parseFloat(z.toFixed(6)),
      alternative: alt,
      pValue: parseFloat(Math.max(0, Math.min(1, pValue)).toFixed(7)),
      significant_05: pValue < 0.05,
      significant_01: pValue < 0.01,
      significant_001: pValue < 0.001,
    };
  }

  /* ── Store last result (for Output export) ── */
  let _lastResult = null;
  function getLastResult() { return _lastResult; }
  function setLastResult(r) { _lastResult = r; }

  return { calculateNormal, criticalZ, pValueFromZ, normInv, normCdf, tableonly: (z) => {
    const z2=Math.abs(z); if(z2>3.99)return z>=0?1:0;
    const ri=Math.floor(z2*10); const ci=Math.round((z2*100)%10);
    const key=`${ri}.${ci}`; const p=Z_TABLE[key]!=null?Z_TABLE[key]:parseFloat(Stats.normCdf(z2).toFixed(4));
    return z>=0?p:parseFloat((1-p).toFixed(4));
  }, getLastResult, setLastResult };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 4C: STUDENT'S t DISTRIBUTION ENGINE
   ══════════════════════════════════════════════════════════════════ */

const StudentTCalc = (() => {

  /* ── Reference table from "t Student" sheet (Tabel_Nilai_Kritis)
     Keys: df → { 0.25, 0.10, 0.05, 0.025, 0.01 }  (one-tailed alphas)
  ── */
  const T_TABLE = {
    1:  { 0.25: 1.000, 0.10: 3.078, 0.05: 6.314, 0.025: 12.706, 0.01: 31.821 },
    2:  { 0.25: 0.816, 0.10: 1.886, 0.05: 2.920, 0.025:  4.303, 0.01:  6.965 },
    3:  { 0.25: 0.765, 0.10: 1.638, 0.05: 2.353, 0.025:  3.182, 0.01:  4.541 },
    4:  { 0.25: 0.741, 0.10: 1.533, 0.05: 2.132, 0.025:  2.776, 0.01:  3.747 },
    5:  { 0.25: 0.727, 0.10: 1.476, 0.05: 2.015, 0.025:  2.571, 0.01:  3.365 },
    6:  { 0.25: 0.718, 0.10: 1.440, 0.05: 1.943, 0.025:  2.447, 0.01:  3.143 },
    7:  { 0.25: 0.711, 0.10: 1.415, 0.05: 1.895, 0.025:  2.365, 0.01:  2.998 },
    8:  { 0.25: 0.706, 0.10: 1.397, 0.05: 1.860, 0.025:  2.306, 0.01:  2.896 },
    9:  { 0.25: 0.703, 0.10: 1.383, 0.05: 1.833, 0.025:  2.262, 0.01:  2.821 },
    10: { 0.25: 0.700, 0.10: 1.372, 0.05: 1.812, 0.025:  2.228, 0.01:  2.764 },
    11: { 0.25: 0.697, 0.10: 1.363, 0.05: 1.796, 0.025:  2.201, 0.01:  2.718 },
    12: { 0.25: 0.695, 0.10: 1.356, 0.05: 1.782, 0.025:  2.179, 0.01:  2.681 },
    13: { 0.25: 0.694, 0.10: 1.350, 0.05: 1.771, 0.025:  2.160, 0.01:  2.650 },
    14: { 0.25: 0.692, 0.10: 1.345, 0.05: 1.761, 0.025:  2.145, 0.01:  2.624 },
    15: { 0.25: 0.691, 0.10: 1.341, 0.05: 1.753, 0.025:  2.131, 0.01:  2.602 },
    16: { 0.25: 0.690, 0.10: 1.337, 0.05: 1.746, 0.025:  2.120, 0.01:  2.583 },
    17: { 0.25: 0.689, 0.10: 1.333, 0.05: 1.740, 0.025:  2.110, 0.01:  2.567 },
    18: { 0.25: 0.688, 0.10: 1.330, 0.05: 1.734, 0.025:  2.101, 0.01:  2.552 },
    19: { 0.25: 0.688, 0.10: 1.328, 0.05: 1.729, 0.025:  2.093, 0.01:  2.539 },
    20: { 0.25: 0.687, 0.10: 1.325, 0.05: 1.725, 0.025:  2.086, 0.01:  2.528 },
    21: { 0.25: 0.686, 0.10: 1.323, 0.05: 1.721, 0.025:  2.080, 0.01:  2.518 },
    22: { 0.25: 0.686, 0.10: 1.321, 0.05: 1.717, 0.025:  2.074, 0.01:  2.508 },
    23: { 0.25: 0.685, 0.10: 1.319, 0.05: 1.714, 0.025:  2.069, 0.01:  2.500 },
    24: { 0.25: 0.685, 0.10: 1.318, 0.05: 1.711, 0.025:  2.064, 0.01:  2.492 },
    25: { 0.25: 0.684, 0.10: 1.316, 0.05: 1.708, 0.025:  2.060, 0.01:  2.485 },
    26: { 0.25: 0.684, 0.10: 1.315, 0.05: 1.706, 0.025:  2.056, 0.01:  2.479 },
    27: { 0.25: 0.684, 0.10: 1.314, 0.05: 1.703, 0.025:  2.052, 0.01:  2.473 },
    28: { 0.25: 0.683, 0.10: 1.313, 0.05: 1.701, 0.025:  2.048, 0.01:  2.467 },
    29: { 0.25: 0.683, 0.10: 1.311, 0.05: 1.699, 0.025:  2.045, 0.01:  2.462 },
    30: { 0.25: 0.683, 0.10: 1.310, 0.05: 1.697, 0.025:  2.042, 0.01:  2.457 },
    40: { 0.25: 0.681, 0.10: 1.303, 0.05: 1.684, 0.025:  2.021, 0.01:  2.423 },
    60: { 0.25: 0.679, 0.10: 1.296, 0.05: 1.671, 0.025:  2.000, 0.01:  2.390 },
    120:{ 0.25: 0.677, 0.10: 1.289, 0.05: 1.658, 0.025:  1.980, 0.01:  2.358 },
    // ∞ (large df)
    999:{ 0.25: 0.674, 0.10: 1.282, 0.05: 1.645, 0.025:  1.960, 0.01:  2.326 },
  };

  const T_TABLE_ALPHAS = [0.25, 0.10, 0.05, 0.025, 0.01];
  const T_TABLE_DFS = Object.keys(T_TABLE).map(Number);

  /* ── Regularised Incomplete Beta (Lentz continued-fraction fallback) ── */
  function _betaCf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) <= EPS) break;
    }
    return h;
  }

  function _lnGamma(x) {
    const c = [76.18009172947146,-86.50532032941677,24.01409824083091,
               -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  function _ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lbeta = _lnGamma(a) + _lnGamma(b) - _lnGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
    if (x < (a + 1) / (a + b + 2)) return front * _betaCf(a, b, x);
    return 1 - Math.exp(Math.log(1 - x) * b + Math.log(x) * a - lbeta) / b * _betaCf(b, a, 1 - x);
  }

  /* ── t CDF — P(T ≤ t) for T~t(df) ── */
  function tCdf(t, df) {
    if (typeof jStat !== 'undefined') return jStat.studentt.cdf(t, df);
    // Regularised incomplete beta fallback
    const x = df / (df + t * t);
    const ibx = _ibeta(x, df / 2, 0.5);
    return t < 0 ? ibx / 2 : 1 - ibx / 2;
  }

  /* ── t PPF — inverse CDF (quantile): P(T ≤ t) = p ── */
  function tPpf(p, df) {
    if (typeof jStat !== 'undefined') return jStat.studentt.inv(p, df);
    // Bisection fallback (accurate to ~8 dp)
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (Math.abs(p - 0.5) < 1e-12) return 0;
    let lo = -1000, hi = 1000;
    // Bracket
    while (tCdf(lo, df) > p) lo *= 2;
    while (tCdf(hi, df) < p) hi *= 2;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (tCdf(mid, df) < p) lo = mid; else hi = mid;
      if (hi - lo < 1e-10) break;
    }
    return (lo + hi) / 2;
  }

  /* ── Table lookup: find exact row for df ── */
  function tableRow(df) {
    if (T_TABLE[df]) return { df, row: T_TABLE[df], exact: true };
    // No interpolation — reference table only has specific df values
    return { df, row: null, exact: false };
  }

  /* ── Validate inputs ── */
  function validateInputs(opts) {
    const errors = [];
    const df = Number(opts.df);
    if (opts.df == null || opts.df === '' || isNaN(df)) errors.push('Degrees of freedom (df) must be a number');
    else if (df <= 0) errors.push('Degrees of freedom must be greater than 0');

    if (opts.alpha != null) {
      const alpha = Number(opts.alpha);
      if (isNaN(alpha)) errors.push('α (alpha) must be a number');
      else if (alpha <= 0 || alpha >= 1) errors.push('α must be between 0 and 1 (exclusive)');
    }

    if (opts.t != null) {
      const tv = Number(opts.t);
      if (isNaN(tv)) errors.push('t statistic must be numeric');
    }

    return errors;
  }

  /* ── Mode A: Find Critical t ── */
  function criticalT(opts) {
    /*
      opts: { df, alpha, tail: 'left'|'right'|'two-tailed' }
    */
    const errors = validateInputs(opts);
    if (errors.length) return { error: errors.join('; ') };

    const df = Number(opts.df);
    const alpha = Number(opts.alpha);
    const tail = opts.tail || 'two-tailed';

    // Determine the one-tailed alpha to use for ppf
    let tableAlpha, ppfP, critSign;
    if (tail === 'two-tailed') {
      tableAlpha = alpha / 2;
      ppfP = 1 - tableAlpha;          // P(T ≤ t) = 1 - α/2
    } else if (tail === 'right') {
      tableAlpha = alpha;
      ppfP = 1 - alpha;               // P(T ≤ t) = 1 - α
    } else { // left
      tableAlpha = alpha;
      ppfP = alpha;                   // P(T ≤ t) = α  → negative critical value
    }

    const exactCrit = tPpf(ppfP, df);

    // Table lookup
    const { row } = tableRow(df);
    let tableValue = null;
    let tableAvailable = false;
    if (row) {
      // Find nearest supported alpha in table
      const nearestAlpha = T_TABLE_ALPHAS.reduce((best, a) =>
        Math.abs(a - tableAlpha) < Math.abs(best - tableAlpha) ? a : best, T_TABLE_ALPHAS[0]);
      if (Math.abs(nearestAlpha - tableAlpha) < 1e-9) {
        tableValue = row[tableAlpha];
        tableAvailable = true;
      }
    }

    const criticalValue = tail === 'left' ? -Math.abs(exactCrit) : Math.abs(exactCrit);

    return {
      distribution: 'student_t',
      mode: 'critical',
      df,
      alpha,
      tail,
      tableAlpha,
      criticalValue: parseFloat(criticalValue.toFixed(6)),
      criticalValueAbs: parseFloat(Math.abs(exactCrit).toFixed(6)),
      tableValue: tableAvailable ? tableValue : null,
      tableAvailable,
      tableDF: T_TABLE[df] ? true : false,
      method: tableAvailable ? 'reference-table+exact' : 'exact',
    };
  }

  /* ── Mode B: Calculate probability / p-value ── */
  function probability(opts) {
    /*
      opts: { df, t, tail: 'left'|'right'|'two-tailed' }
    */
    const errors = validateInputs({ df: opts.df, t: opts.t });
    if (errors.length) return { error: errors.join('; ') };

    const df = Number(opts.df);
    const t = Number(opts.t);
    const tail = opts.tail || 'two-tailed';

    const leftP  = tCdf(t, df);          // P(T ≤ t)
    const rightP = 1 - leftP;            // P(T ≥ t)

    let prob;
    if (tail === 'left')         prob = leftP;
    else if (tail === 'right')   prob = rightP;
    else /* two-tailed */        prob = 2 * Math.min(leftP, rightP);

    prob = Math.max(0, Math.min(1, prob));

    return {
      distribution: 'student_t',
      mode: 'probability',
      df,
      t: parseFloat(t.toFixed(6)),
      tail,
      probability: parseFloat(prob.toFixed(7)),
      percentage: parseFloat((prob * 100).toFixed(5)),
      leftTail:  parseFloat(leftP.toFixed(7)),
      rightTail: parseFloat(rightP.toFixed(7)),
      pValue: parseFloat(prob.toFixed(7)),
    };
  }

  /* ── Mode C: Test a t statistic ── */
  function testStatistic(opts) {
    /*
      opts: { df, t, alpha, tail }
    */
    const errors = validateInputs(opts);
    if (errors.length) return { error: errors.join('; ') };

    const df = Number(opts.df);
    const tObs = Number(opts.t);
    const alpha = Number(opts.alpha);
    const tail = opts.tail || 'two-tailed';

    const critResult = criticalT({ df, alpha, tail });
    if (critResult.error) return critResult;

    const probResult = probability({ df, t: tObs, tail });
    if (probResult.error) return probResult;

    const pValue = probResult.pValue;
    const tCrit = critResult.criticalValue;
    const tCritAbs = critResult.criticalValueAbs;
    const tObsAbs = Math.abs(tObs);

    let reject;
    if (tail === 'two-tailed') reject = tObsAbs >= tCritAbs;
    else if (tail === 'right') reject = tObs >= tCritAbs;
    else                       reject = tObs <= -tCritAbs;

    return {
      distribution: 'student_t',
      mode: 'test',
      df,
      tObserved: parseFloat(tObs.toFixed(6)),
      alpha,
      tail,
      tableAlpha: critResult.tableAlpha,
      tCritical: parseFloat(tCrit.toFixed(6)),
      tCriticalAbs: parseFloat(tCritAbs.toFixed(6)),
      tableValue: critResult.tableValue,
      tableAvailable: critResult.tableAvailable,
      pValue: parseFloat(pValue.toFixed(7)),
      reject,
      decision: reject ? 'Reject H₀' : 'Fail to reject H₀',
    };
  }

  /* ── Reference comparison: compute exact vs table for all entries ── */
  function referenceComparison() {
    const TOLERANCE = 0.005; // table values are rounded to 3 dp
    const results = [];
    T_TABLE_DFS.forEach(df => {
      const row = T_TABLE[df];
      T_TABLE_ALPHAS.forEach(alpha => {
        const tableVal = row[alpha];
        // one-tailed: t = ppf(1 - alpha, df)
        const exactVal = tPpf(1 - alpha, df);
        const diff = Math.abs(exactVal - tableVal);
        results.push({
          df, alpha, tableValue: tableVal,
          exactValue: parseFloat(exactVal.toFixed(6)),
          diff: parseFloat(diff.toFixed(6)),
          pass: diff <= TOLERANCE,
        });
      });
    });
    return results;
  }

  /* ── Golden test runner ── */
  function runGoldenTests() {
    const tests = [
      { name: 'TEST 1: df=1, one-tailed, α=.05', call: () => criticalT({ df:1, alpha:0.05, tail:'right' }), check: r => Math.abs(r.criticalValue - 6.314) < 0.01, expected: 6.314 },
      { name: 'TEST 2: df=10, one-tailed, α=.05', call: () => criticalT({ df:10, alpha:0.05, tail:'right' }), check: r => Math.abs(r.criticalValue - 1.812) < 0.01, expected: 1.812 },
      { name: 'TEST 3: df=10, two-tailed, α=.05 (+)', call: () => criticalT({ df:10, alpha:0.05, tail:'two-tailed' }), check: r => Math.abs(r.criticalValue - 2.228) < 0.01, expected: 2.228 },
      { name: 'TEST 4: df=10, one-tailed, α=.01', call: () => criticalT({ df:10, alpha:0.01, tail:'right' }), check: r => Math.abs(r.criticalValue - 2.764) < 0.01, expected: 2.764 },
      { name: 'TEST 5: df=10, two-tailed, α=.02 (→ α/2=.01)', call: () => criticalT({ df:10, alpha:0.02, tail:'two-tailed' }), check: r => Math.abs(r.criticalValue - 2.764) < 0.01, expected: 2.764 },
      { name: 'TEST 6: df=10, t=2.228, two-tailed p≈.05', call: () => probability({ df:10, t:2.228, tail:'two-tailed' }), check: r => Math.abs(r.pValue - 0.05) < 0.005, expected: '~0.05' },
      { name: 'TEST 7: df=10, t=0, left P(T≤0)=.5', call: () => probability({ df:10, t:0, tail:'left' }), check: r => Math.abs(r.probability - 0.5) < 1e-6, expected: 0.5 },
      { name: 'TEST 8: df=10, t=-2.228, two-tailed p≈.05', call: () => probability({ df:10, t:-2.228, tail:'two-tailed' }), check: r => Math.abs(r.pValue - 0.05) < 0.005, expected: '~0.05' },
    ];

    return tests.map(test => {
      try {
        const result = test.call();
        const pass = !result.error && test.check(result);
        return { name: test.name, pass, result, expected: test.expected };
      } catch(e) {
        return { name: test.name, pass: false, error: e.message, expected: test.expected };
      }
    });
  }

  let _lastResult = null;
  function getLastResult() { return _lastResult; }
  function setLastResult(r) { _lastResult = r; }

  return {
    tCdf, tPpf, criticalT, probability, testStatistic,
    referenceComparison, runGoldenTests, tableRow,
    T_TABLE, T_TABLE_ALPHAS, T_TABLE_DFS,
    getLastResult, setLastResult
  };
})();

/* ── Student's t Distribution UI ─────────────────────────────────── */