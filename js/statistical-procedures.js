const StatProcs = (() => {

  /* helper aliases */
  const { mean, std, variance, sum, quantile, sortNum, ranks,
          tCdf, tPpf, chi2Cdf, normCdf, fCdf,
          pearsonR, spearmanR, kendallTau,
          leveneTest, shapiroWilk, resolveDataset, skewness, kurtosis } = Stats;

  function _normCheck(arr, label) {
    if (arr.length < 3) return [];
    const sw = shapiroWilk(arr);
    if (!sw || sw.W === null) return [];
    return [{
      id: `norm_${label}`, name: `Normality — ${label} (${sw.test || 'Shapiro-Wilk'})`,
      status: sw.p >= 0.05 ? 'passed' : 'warning',
      test_statistic: sw.W, p_value: sw.p,
      description: 'Residuals/values should be approximately normal.',
      interpretation: `W = ${sw.W}, p = ${sw.p < 0.001 ? '< .001' : sw.p.toFixed(3)}. ${sw.p >= 0.05 ? 'Distribution appears normal.' : 'Deviation from normality detected — consider non-parametric alternatives.'}`,
    }];
  }

  function _err(proc, code, msg, cause, action) {
    return { status: 'error', result: null, warnings: [], assumptions_checked: [],
      error: { procedure: proc, error_code: code, message: msg, likely_cause: cause, suggested_action: action } };
  }

  /* ══════════════════════════════════════════════════════════════
     CROSSTABS
     ══════════════════════════════════════════════════════════════ */
  function crosstabs(dataset, params) {
    const { row_variable: rVn, column_variable: cVn } = params;
    if (!rVn || !cVn) return _err('crosstabs','MISSING_VARS','Row and column variables required.','','');

    const { data, warnings } = resolveDataset(dataset, [rVn, cVn], params);
    const rArr = data[rVn] || [], cArr = data[cVn] || [];
    if (rArr.length === 0) return _err('crosstabs','NO_VALID_CASES','No valid cases after missing removal.','Check missing value definitions.','');

    const meta = {};
    for (const v of dataset.variables) {
      const vl = {};
      (v.value_labels || []).forEach(l => { vl[String(l.value)] = l.label; });
      meta[v.name] = { label: v.label || v.name, valueLabels: vl };
    }
    const rowVals = [...new Set(rArr.map(String))].sort((a,b)=>{ const na=Number(a),nb=Number(b); return isNaN(na)||isNaN(nb)?a.localeCompare(b):na-nb; });
    const colVals = [...new Set(cArr.map(String))].sort((a,b)=>{ const na=Number(a),nb=Number(b); return isNaN(na)||isNaN(nb)?a.localeCompare(b):na-nb; });
    const nr = rowVals.length, nc = colVals.length, N = rArr.length;

    // Build observed matrix
    const obs = Array.from({length: nr}, () => new Array(nc).fill(0));
    for (let i = 0; i < N; i++) {
      const ri = rowVals.indexOf(String(rArr[i]));
      const ci = colVals.indexOf(String(cArr[i]));
      if (ri >= 0 && ci >= 0) obs[ri][ci]++;
    }

    // Row/col/grand sums
    const rowSums = obs.map(r => r.reduce((s,v)=>s+v,0));
    const colSums = colVals.map((_,j) => obs.reduce((s,r)=>s+r[j],0));
    const grand = rowSums.reduce((s,v)=>s+v,0);

    // Expected
    const exp = obs.map((r, i) => r.map((_, j) => rowSums[i] * colSums[j] / grand));

    // Chi-square (no correction)
    let chi2 = 0;
    for (let i=0;i<nr;i++) for (let j=0;j<nc;j++) {
      if (exp[i][j] > 0) chi2 += (obs[i][j] - exp[i][j])**2 / exp[i][j];
    }
    const dof = (nr-1)*(nc-1);
    const pChi2 = 1 - chi2Cdf(chi2, dof);

    // Yates (2x2)
    let chi2Y = null, pY = null;
    if (nr===2 && nc===2) {
      chi2Y = 0;
      for (let i=0;i<2;i++) for (let j=0;j<2;j++) {
        if (exp[i][j]>0) chi2Y += (Math.abs(obs[i][j]-exp[i][j])-0.5)**2 / exp[i][j];
      }
      pY = 1 - chi2Cdf(chi2Y, 1);
    }

    // Fisher exact (2x2) via hypergeometric
    let pFisher = null, oddsRatio = null;
    if (nr===2 && nc===2) {
      const [[a,b],[c,d]] = obs;
      const n1=a+b, n2=c+d, k=a+c;
      const totalHyp = hypergeomCdf(obs[0][0], grand, n1, k);
      pFisher = parseFloat(totalHyp.toFixed(6));
      oddsRatio = (b > 0 && c > 0) ? parseFloat(((a*d)/(b*c)).toFixed(6)) : null;
    }

    // Likelihood ratio G²
    let G2 = 0;
    for (let i=0;i<nr;i++) for (let j=0;j<nc;j++) {
      if (obs[i][j] > 0 && exp[i][j] > 0) G2 += 2 * obs[i][j] * Math.log(obs[i][j] / exp[i][j]);
    }
    const pG2 = 1 - chi2Cdf(G2, dof);

    // Effect sizes
    const phi = (nr===2&&nc===2) ? Math.sqrt(chi2/grand) : null;
    const k = Math.min(nr, nc);
    const cramersV = k > 1 ? parseFloat(Math.sqrt(chi2 / (grand * (k-1))).toFixed(6)) : 0;
    const contCoef = parseFloat(Math.sqrt(chi2 / (chi2 + grand)).toFixed(6));

    // Min expected / % < 5
    const minExp = Math.min(...exp.flat());
    const pctLt5 = exp.flat().filter(v => v < 5).length / (nr * nc) * 100;

    if (minExp < 1) warnings.push({ severity:'HIGH', code:'EXPECTED_LT1', issue:`Min expected count = ${minExp.toFixed(2)} < 1.`, why_it_matters:'Chi-square is invalid when expected count < 1.', recommended_action:'Combine categories or use Fisher Exact (2×2).' });
    else if (pctLt5 > 20) warnings.push({ severity:'MEDIUM', code:'EXPECTED_LT5', issue:`${pctLt5.toFixed(1)}% of cells have expected count < 5.`, why_it_matters:'Chi-square approximation may be unreliable.', recommended_action:'Consider combining categories.' });

    // Table rows
    const tableRows = [];
    for (let i=0;i<nr;i++) for (let j=0;j<nc;j++) {
      const o = obs[i][j], e = exp[i][j];
      tableRows.push({
        row_value: rowVals[i], row_label: meta[rVn]?.valueLabels[rowVals[i]] || rowVals[i],
        col_value: colVals[j], col_label: meta[cVn]?.valueLabels[colVals[j]] || colVals[j],
        observed: o, expected: parseFloat(e.toFixed(3)),
        row_pct: rowSums[i]>0 ? parseFloat((o/rowSums[i]*100).toFixed(2)) : 0,
        col_pct: colSums[j]>0 ? parseFloat((o/colSums[j]*100).toFixed(2)) : 0,
        total_pct: grand>0 ? parseFloat((o/grand*100).toFixed(2)) : 0,
        residual: parseFloat((o-e).toFixed(4)),
        std_residual: e>0 ? parseFloat(((o-e)/Math.sqrt(e)).toFixed(4)) : null,
      });
    }

    const syntax = `CROSSTABS\n  /TABLES=${rVn} BY ${cVn}\n  /STATISTICS=CHISQ PHI CC\n  /CELLS=COUNT EXPECTED ROW COLUMN TOTAL RESID SRESID.`;
    return {
      status:'complete', syntax, warnings,
      assumptions_checked: [{
        id:'chi2_exp', name:'Expected Cell Frequencies ≥ 5',
        status: pctLt5 <= 20 && minExp >= 1 ? 'passed' : 'failed',
        test_statistic: parseFloat(minExp.toFixed(3)), p_value: null,
        description:'All expected cell frequencies ≥ 5 (or at most 20% < 5).',
        interpretation:`Min expected: ${minExp.toFixed(2)}. ${pctLt5.toFixed(1)}% of cells < 5.`,
      }],
      result: {
        row_variable: rVn, col_variable: cVn,
        row_values: rowVals, col_values: colVals,
        row_labels: meta[rVn]?.valueLabels || {}, col_labels: meta[cVn]?.valueLabels || {},
        n_total: grand, table_rows: tableRows,
        statistics: {
          chi_square: parseFloat(chi2.toFixed(6)), chi_square_df: dof, chi_square_p: parseFloat(pChi2.toFixed(6)),
          chi_square_yates: chi2Y !== null ? parseFloat(chi2Y.toFixed(6)) : null,
          chi_square_yates_p: pY !== null ? parseFloat(pY.toFixed(6)) : null,
          likelihood_ratio: parseFloat(G2.toFixed(6)), likelihood_ratio_p: parseFloat(pG2.toFixed(6)),
          fisher_exact_p: pFisher, odds_ratio: oddsRatio,
          phi: phi !== null ? parseFloat(phi.toFixed(6)) : null,
          cramers_v: cramersV, contingency_coefficient: contCoef,
          min_expected_count: parseFloat(minExp.toFixed(4)), pct_cells_expected_lt5: parseFloat(pctLt5.toFixed(2)),
        },
      },
    };
  }

  /* hypergeometric two-tailed Fisher exact */
  function hypergeomCdf(x, N, K, n) {
    // Sum P(X=i) for i where P(X=i) <= P(X=x)
    const pX = hypergeomPmf(x, N, K, n);
    let p = 0;
    for (let i = Math.max(0, n+K-N); i <= Math.min(n, K); i++) {
      const pi = hypergeomPmf(i, N, K, n);
      if (pi <= pX + 1e-10) p += pi;
    }
    return Math.min(1, p);
  }

  function hypergeomPmf(k, N, K, n) {
    return Math.exp(logComb(K,k) + logComb(N-K, n-k) - logComb(N,n));
  }

  function logComb(n, k) {
    if (k < 0 || k > n) return -Infinity;
    if (k === 0 || k === n) return 0;
    let r = 0;
    for (let i = 0; i < k; i++) r += Math.log(n-i) - Math.log(i+1);
    return r;
  }

  /* ══════════════════════════════════════════════════════════════
     T-TESTS
     ══════════════════════════════════════════════════════════════ */
  function ttest(dataset, params) {
    const type = params.type || 'onesample';
    const { data: _d, warnings: _w } = resolveDataset(dataset, [], params);
    if (type === 'onesample') return _ttestOneSample(dataset, params);
    if (type === 'independent') return _ttestIndependent(dataset, params);
    if (type === 'paired') return _ttestPaired(dataset, params);
    return _err('ttest','UNKNOWN_TYPE',`Unknown test type: ${type}`,'','');
  }

  function _ttestOneSample(dataset, params) {
    const { variable: vn, test_value: mu0 = 0, confidence_level: cl = 0.95 } = params;
    const { data, warnings } = resolveDataset(dataset, [vn], params);
    const x = (data[vn]||[]).filter(v=>typeof v==='number'&&isFinite(v));
    const n = x.length;
    if (n < 2) return _err('ttest','INSUFFICIENT_N',`N=${n}. Need ≥ 2 cases.`,'Too few valid cases.','Check variable and missing values.');
    const m = mean(x), s = std(x,1), se = s/Math.sqrt(n);
    const diff = m - mu0;
    const t = diff / se;
    const df = n - 1;
    const p = 2 * (1 - tCdf(Math.abs(t), df));
    const alpha = 1 - cl;
    const tc = tPpf(1 - alpha/2, df);
    const d = diff / s;
    const syntax = `T-TEST\n  /TESTVAL=${mu0}\n  /VARIABLES=${vn}\n  /CRITERIA=CI(${(cl*100).toFixed(0)}).`;
    return {
      status:'complete', syntax, warnings,
      assumptions_checked: _normCheck(x, vn),
      result: {
        test_type:'onesample', variable: vn, test_value: mu0, n,
        mean: parseFloat(m.toFixed(6)), std: parseFloat(s.toFixed(6)), se: parseFloat(se.toFixed(6)),
        mean_difference: parseFloat(diff.toFixed(6)),
        t: parseFloat(t.toFixed(6)), df, p_two_tailed: parseFloat(p.toFixed(6)),
        ci_lower: parseFloat((diff - tc*se).toFixed(6)), ci_upper: parseFloat((diff + tc*se).toFixed(6)),
        cohens_d: parseFloat(d.toFixed(6)),
      },
    };
  }

  function _ttestIndependent(dataset, params) {
    const { variable: vn, grouping_variable: gv, group1, group2, confidence_level: cl=0.95 } = params;
    const { data, warnings } = resolveDataset(dataset, [vn, gv], params);
    const xArr = data[vn]||[], gArr = data[gv]||[];
    const groups = [...new Set(gArr.map(String))];
    const g1key = group1 != null ? String(group1) : groups[0];
    const g2key = group2 != null ? String(group2) : groups[1];
    if (!g2key) return _err('ttest','GROUPS',`Expected 2 groups, found ${groups.length}.`,'','Specify group1 and group2.');
    const g1 = xArr.filter((_,i)=>String(gArr[i])===g1key).filter(v=>typeof v==='number'&&isFinite(v));
    const g2 = xArr.filter((_,i)=>String(gArr[i])===g2key).filter(v=>typeof v==='number'&&isFinite(v));
    if (g1.length < 2 || g2.length < 2) return _err('ttest','INSUFFICIENT_N',`Group 1 n=${g1.length}, Group 2 n=${g2.length}. Both need ≥ 2.`,'','');
    const n1=g1.length, n2=g2.length, m1=mean(g1), m2=mean(g2);
    const s1=std(g1,1), s2=std(g2,1), se1=s1/Math.sqrt(n1), se2=s2/Math.sqrt(n2);
    const diff = m1 - m2;
    // Levene
    const lev = leveneTest([g1,g2]);
    if (lev.p < 0.05) warnings.push({ severity:'MEDIUM', code:'UNEQUAL_VARIANCE', issue:`Levene's test significant (p=${lev.p.toFixed(4)}).`, why_it_matters:'Variances not equal — prefer Welch\'s t-test.', recommended_action:'Use "Equal variances NOT assumed" row.' });
    // Equal variance
    const pooledVar = ((n1-1)*s1**2 + (n2-1)*s2**2) / (n1+n2-2);
    const seEq = Math.sqrt(pooledVar*(1/n1+1/n2));
    const dfEq = n1+n2-2, tEq = diff/seEq, pEq = 2*(1-tCdf(Math.abs(tEq),dfEq));
    const alpha=1-cl, tcEq=tPpf(1-alpha/2,dfEq);
    // Welch
    const seWl = Math.sqrt(se1**2+se2**2);
    const dfWl = (se1**2+se2**2)**2 / (se1**4/(n1-1)+se2**4/(n2-1));
    const tWl = diff/seWl, pWl = 2*(1-tCdf(Math.abs(tWl),dfWl));
    const tcWl=tPpf(1-alpha/2,dfWl);
    const cohensD = diff/Math.sqrt(pooledVar);
    const syntax = `T-TEST GROUPS=${gv}(${g1key} ${g2key})\n  /VARIABLES=${vn}\n  /CRITERIA=CI(${(cl*100).toFixed(0)}).`;
    return {
      status:'complete', syntax, warnings,
      assumptions_checked: [
        ..._normCheck(g1,`${vn}[${g1key}]`),
        ..._normCheck(g2,`${vn}[${g2key}]`),
        { id:'levene', name:"Equality of Variances (Levene's)", status: lev.p>=0.05?'passed':'failed',
          test_statistic: lev.F, p_value: lev.p, description:"Tests equality of group variances.",
          interpretation:`F=${lev.F}, p=${lev.p.toFixed(4)}. ${lev.p>=0.05?'Equal variances assumed.':'Use Welch\'s row.'}` },
      ],
      result: {
        test_type:'independent', variable:vn, grouping_variable:gv, group1:g1key, group2:g2key,
        group1_n:n1, group2_n:n2, group1_mean:parseFloat(m1.toFixed(6)), group2_mean:parseFloat(m2.toFixed(6)),
        group1_std:parseFloat(s1.toFixed(6)), group2_std:parseFloat(s2.toFixed(6)),
        group1_se:parseFloat(se1.toFixed(6)), group2_se:parseFloat(se2.toFixed(6)),
        levene_statistic:lev.F, levene_p:lev.p,
        equal_variance:{ t:parseFloat(tEq.toFixed(6)), df:dfEq, p_two_tailed:parseFloat(pEq.toFixed(6)),
          mean_difference:parseFloat(diff.toFixed(6)), se_difference:parseFloat(seEq.toFixed(6)),
          ci_lower:parseFloat((diff-tcEq*seEq).toFixed(6)), ci_upper:parseFloat((diff+tcEq*seEq).toFixed(6)) },
        unequal_variance:{ t:parseFloat(tWl.toFixed(6)), df:parseFloat(dfWl.toFixed(4)), p_two_tailed:parseFloat(pWl.toFixed(6)),
          mean_difference:parseFloat(diff.toFixed(6)), se_difference:parseFloat(seWl.toFixed(6)),
          ci_lower:parseFloat((diff-tcWl*seWl).toFixed(6)), ci_upper:parseFloat((diff+tcWl*seWl).toFixed(6)) },
        cohens_d:parseFloat(cohensD.toFixed(6)),
      },
    };
  }

  function _ttestPaired(dataset, params) {
    const { variable1: v1n, variable2: v2n, confidence_level: cl=0.95 } = params;
    const { data, warnings } = resolveDataset(dataset, [v1n, v2n], params);
    const x1=(data[v1n]||[]).filter(v=>typeof v==='number'&&isFinite(v));
    const x2=(data[v2n]||[]).filter(v=>typeof v==='number'&&isFinite(v));
    const n=Math.min(x1.length,x2.length);
    if (n < 2) return _err('ttest','INSUFFICIENT_N',`N=${n}. Need ≥ 2 paired cases.`,'','');
    const diff = x1.slice(0,n).map((v,i)=>v-x2[i]);
    const md=mean(diff), sd=std(diff,1), se=sd/Math.sqrt(n);
    const t=md/se, df=n-1;
    const p=2*(1-tCdf(Math.abs(t),df));
    const alpha=1-cl, tc=tPpf(1-alpha/2,df);
    const r=pearsonR(x1.slice(0,n),x2.slice(0,n));
    const cohensD = sd>0 ? md/sd : 0;
    const syntax=`T-TEST PAIRS=${v1n} WITH ${v2n}\n  /CRITERIA=CI(${(cl*100).toFixed(0)}).`;
    return {
      status:'complete', syntax, warnings,
      assumptions_checked: _normCheck(diff,`${v1n}-${v2n} difference`),
      result: {
        test_type:'paired', variable1:v1n, variable2:v2n, n,
        mean1:parseFloat(mean(x1.slice(0,n)).toFixed(6)), mean2:parseFloat(mean(x2.slice(0,n)).toFixed(6)),
        std1:parseFloat(std(x1.slice(0,n),1).toFixed(6)), std2:parseFloat(std(x2.slice(0,n),1).toFixed(6)),
        mean_difference:parseFloat(md.toFixed(6)), std_difference:parseFloat(sd.toFixed(6)),
        se_difference:parseFloat(se.toFixed(6)), r:parseFloat((r.r||0).toFixed(6)), r_p:parseFloat((r.p||0).toFixed(6)),
        t:parseFloat(t.toFixed(6)), df, p_two_tailed:parseFloat(p.toFixed(6)),
        ci_lower:parseFloat((md-tc*se).toFixed(6)), ci_upper:parseFloat((md+tc*se).toFixed(6)),
        cohens_d:parseFloat(cohensD.toFixed(6)),
      },
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ONE-WAY ANOVA
     ══════════════════════════════════════════════════════════════ */
  function anova(dataset, params) {
    const { dependent: dv, factor: fv, post_hoc: phMethods=[], confidence_level: cl=0.95 } = params;
    if (!dv||!fv) return _err('anova','MISSING_VARS','Dependent and factor variables required.','','');
    const { data, warnings } = resolveDataset(dataset, [dv, fv], params);
    const yArr=data[dv]||[], gArr=data[fv]||[];
    const groupKeys=[...new Set(gArr.map(String))].sort();
    if (groupKeys.length < 2) return _err('anova','INSUFFICIENT_GROUPS','At least 2 groups required.','','');
    const groups={};
    for (const k of groupKeys) groups[k]=[];
    yArr.forEach((v,i)=>{ if (typeof v==='number'&&isFinite(v)) groups[String(gArr[i])]?.push(v); });
    const gArrays=groupKeys.map(k=>groups[k]);
    for (const [k,arr] of Object.entries(groups)) {
      if (arr.length < 2) warnings.push({ severity:'HIGH', code:'SMALL_GROUP', issue:`Group '${k}' has only ${arr.length} case(s).`, why_it_matters:'Unstable estimates.', recommended_action:'Check data coding.' });
    }
    const allVals=gArrays.flat(), N=allVals.length, K=gArrays.length;
    const grandMean=mean(allVals);
    const ni=gArrays.map(g=>g.length), mi=gArrays.map(g=>mean(g));
    const ssB=ni.reduce((s,n,i)=>s+n*(mi[i]-grandMean)**2,0);
    const ssW=gArrays.reduce((s,g)=>s+g.reduce((ss,v)=>ss+(v-mean(g))**2,0),0);
    const ssT=ssB+ssW;
    const dfB=K-1, dfW=N-K;
    const msB=ssB/dfB, msW=dfW>0?ssW/dfW:0;
    const F=msW>0?msB/msW:0, pF=1-fCdf(F,dfB,dfW);
    const etaSq=ssT>0?parseFloat((ssB/ssT).toFixed(6)):0;
    const lev=leveneTest(gArrays);
    if (lev.p<0.05) warnings.push({ severity:'MEDIUM', code:'UNEQUAL_VARIANCE', issue:`Levene's F=${lev.F}, p=${lev.p.toFixed(4)} — variances unequal.`, why_it_matters:'ANOVA assumes homogeneity of variance.', recommended_action:'Consider Welch\'s ANOVA.' });

    // Welch ANOVA
    const welch=_welchAnova(gArrays);

    // Group descriptives
    const groupStats={};
    gArrays.forEach((g,i)=>{
      const k=groupKeys[i], n=g.length, m=mean(g), s=n>1?std(g,1):null, se=s?s/Math.sqrt(n):null;
      const tc=se&&n>1?tPpf(1-(1-cl)/2,n-1):0;
      groupStats[k]={ n, mean:parseFloat(m.toFixed(6)), std:s?parseFloat(s.toFixed(6)):null, se:se?parseFloat(se.toFixed(6)):null,
        ci_lower:se?parseFloat((m-tc*se).toFixed(6)):null, ci_upper:se?parseFloat((m+tc*se).toFixed(6)):null,
        minimum:Math.min(...g), maximum:Math.max(...g) };
    });

    // Post hoc
    const postHocResults={};
    if (phMethods.length>0 && msW>0) {
      phMethods.forEach(method=>{
        const comps=[];
        for (let i=0;i<K;i++) for (let j=i+1;j<K;j++) {
          const gi=gArrays[i], gj=gArrays[j];
          const diff=mi[i]-mi[j];
          const se=Math.sqrt(msW*(1/ni[i]+1/ni[j]));
          let p;
          if (method==='bonferroni') {
            const t=diff/se, nComp=K*(K-1)/2;
            p=Math.min(1, 2*(1-tCdf(Math.abs(t),dfW))*nComp);
          } else if (method==='scheffe') {
            const fStat=(diff/se)**2/(K-1);
            p=1-fCdf(fStat,K-1,dfW);
          } else { // tukey (approximate via t)
            const t=diff/se;
            p=Math.min(1, 2*(1-tCdf(Math.abs(t),dfW))*(K*(K-1)/2));
          }
          comps.push({ group1:groupKeys[i], group2:groupKeys[j], mean_difference:parseFloat(diff.toFixed(6)), se:parseFloat(se.toFixed(6)), p:parseFloat(p.toFixed(6)), significant:p<0.05 });
        }
        postHocResults[method]=comps;
      });
    }

    const syntax=`ONEWAY ${dv} BY ${fv}\n  /STATISTICS DESCRIPTIVES HOMOGENEITY WELCH${phMethods.length?'\n  /POSTHOC='+phMethods.map(m=>m.toUpperCase()).join(' '):''}.\n`;
    return {
      status:'complete', syntax, warnings,
      assumptions_checked: [{ id:'levene', name:"Homogeneity of Variances (Levene's)",
        status:lev.p>=0.05?'passed':'warning', test_statistic:lev.F, p_value:lev.p,
        description:"Tests equality of group variances.",
        interpretation:`F=${lev.F}, p=${lev.p.toFixed(4)}. ${lev.p>=0.05?'Homogeneity met.':'Variances unequal — consider Welch.'}` }],
      result: {
        dependent:dv, factor:fv, n_total:N, k_groups:K, grand_mean:parseFloat(grandMean.toFixed(6)),
        group_stats:groupStats,
        anova_table:{ between:{ss:parseFloat(ssB.toFixed(6)),df:dfB,ms:parseFloat(msB.toFixed(6)),f:parseFloat(F.toFixed(6)),p:parseFloat(pF.toFixed(6))},
          within:{ss:parseFloat(ssW.toFixed(6)),df:dfW,ms:parseFloat(msW.toFixed(6))},
          total:{ss:parseFloat(ssT.toFixed(6)),df:N-1} },
        eta_squared:etaSq, levene:{ statistic:lev.F, p:lev.p }, welch, post_hoc:postHocResults,
      },
    };
  }

  function _welchAnova(gArrays) {
    try {
      const K=gArrays.length;
      const ni=gArrays.map(g=>g.length), mi=gArrays.map(g=>mean(g)), vi=gArrays.map(g=>variance(g,1));
      const wi=ni.map((n,i)=>vi[i]>0?n/vi[i]:0);
      const W=wi.reduce((s,v)=>s+v,0);
      const gm=wi.reduce((s,w,i)=>s+w*mi[i],0)/W;
      const num=wi.reduce((s,w,i)=>s+w*(mi[i]-gm)**2,0)/(K-1);
      const h=ni.reduce((s,n,i)=>s+(1-wi[i]/W)**2/(n-1),0);
      const denom=1+2*(K-2)/(K**2-1)*h;
      const F=num/denom, df1=K-1, df2=h>0?(K**2-1)/(3*h):Infinity;
      const p=1-fCdf(F,df1,df2);
      return { f:parseFloat(F.toFixed(6)), df1:parseFloat(df1.toFixed(4)), df2:parseFloat(df2.toFixed(4)), p:parseFloat(p.toFixed(6)) };
    } catch { return null; }
  }

  /* ══════════════════════════════════════════════════════════════
     CORRELATION
     ══════════════════════════════════════════════════════════════ */
  function correlation(dataset, params) {
    const { variables: varNames, method='pearson' } = params;
    if ((varNames||[]).length < 2) return _err('correlation','INSUFFICIENT_VARS','At least 2 variables required.','','');
    const warnings=[];
    const matrix={}, nMatrix={}, pMatrix={};
    for (const v1 of varNames) {
      matrix[v1]={}; nMatrix[v1]={}; pMatrix[v1]={};
      for (const v2 of varNames) {
        if (v1===v2) { matrix[v1][v2]=1; nMatrix[v1][v2]=null; pMatrix[v1][v2]=null; continue; }
        const { data, warnings:w } = resolveDataset(dataset,[v1,v2],params);
        warnings.push(...w);
        const raw1=data[v1]||[], raw2=data[v2]||[];
        // Pairwise: keep only rows where BOTH values are valid numbers
        const pairs=[];
        const len=Math.min(raw1.length,raw2.length);
        for (let i=0;i<len;i++) {
          const a=raw1[i], b=raw2[i];
          if (typeof a==='number'&&isFinite(a)&&typeof b==='number'&&isFinite(b)) pairs.push([a,b]);
        }
        const n=pairs.length;
        nMatrix[v1][v2]=n;
        if (n < 3) { matrix[v1][v2]=null; pMatrix[v1][v2]=null; warnings.push({ severity:'HIGH', code:'INSUFFICIENT_N', issue:`N=${n} for ${v1}×${v2}. Need ≥ 3.`, why_it_matters:'Cannot compute correlation.', recommended_action:'Check missing data.' }); continue; }
        const x=pairs.map(p=>p[0]), y=pairs.map(p=>p[1]);
        let r;
        if (method==='spearman') r=spearmanR(x,y);
        else if (method==='kendall') r=kendallTau(x,y);
        else r=pearsonR(x,y);
        matrix[v1][v2]=r.r; pMatrix[v1][v2]=r.p;
      }
    }
    const syntax=`CORRELATIONS\n  /VARIABLES=${varNames.join(' ')}\n  /PRINT=TWOTAIL\n  /MISSING=PAIRWISE.`;
    return { status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ method, variables:varNames, correlation_matrix:matrix, n_matrix:nMatrix, p_matrix:pMatrix } };
  }

  /* ══════════════════════════════════════════════════════════════
     LINEAR REGRESSION (OLS via normal equations)
     ══════════════════════════════════════════════════════════════ */
  function linearRegression(dataset, params) {
    const { dependent: dv, independent: ivs, include_constant=true, confidence_level:cl=0.95 } = params;
    if (!dv||(ivs||[]).length===0) return _err('regression','MISSING_VARS','Dependent and independent variables required.','','');
    const allVars=[dv,...ivs];
    const { data, warnings } = resolveDataset(dataset,allVars,params);
    const y=(data[dv]||[]).filter(v=>typeof v==='number'&&isFinite(v));
    const n=y.length, k=ivs.length;
    if (n < k+2) return _err('regression','INSUFFICIENT_N',`N=${n} too small for ${k} predictors.`,'','');

    // Build X matrix
    const Xraw = ivs.map(iv=>(data[iv]||[]).slice(0,n).map(v=>typeof v==='number'&&isFinite(v)?v:0));
    const X = include_constant
      ? [new Array(n).fill(1),...Xraw]
      : Xraw;
    const p = X.length; // number of params

    // OLS: β = (X'X)^-1 X'y
    let beta, XtX, XtXinv;
    try {
      XtX = matMul(transpose(X), transpose(Xraw.map((_,i)=>X[i]?.concat?X[i]:X[i])));
      // Correct: XtX[i][j] = sum_k X[i][k]*X[j][k]
      XtX = Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>X[i].reduce((s,_,k)=>s+X[i][k]*X[j][k],0)));
      XtXinv = invertMatrix(XtX);
      if (!XtXinv) return _err('regression','SINGULAR_MATRIX','Matrix inversion failed — perfect multicollinearity detected.','Redundant predictors.','Remove or combine correlated predictors. Check VIF.');
      const Xty = X.map(xi=>xi.reduce((s,v,k2)=>s+v*y[k2],0));
      beta = XtXinv.map(row=>row.reduce((s,v,j)=>s+v*Xty[j],0));
    } catch(e) {
      return _err('regression','COMPUTE_ERROR',e.message,'Numerical error.','Check data.');
    }

    // Fitted & residuals
    const yHat = Array.from({length:n},(_,i)=>X.reduce((s,xi,j)=>s+xi[i]*beta[j],0));
    const resid = y.map((v,i)=>v-yHat[i]);
    const ySd = std(y,1);

    // SS
    const yMean = mean(y);
    const ssRes = resid.reduce((s,r)=>s+r**2,0);
    const ssTot = y.reduce((s,v)=>s+(v-yMean)**2,0);
    const ssReg = ssTot - ssRes;
    const dfReg = include_constant ? k : k, dfRes = n - p;
    const msRes = ssRes/dfRes, msReg = ssReg/dfReg;
    const Fstat = msReg/msRes, pF = 1-fCdf(Fstat,dfReg,dfRes);
    const Rsq = ssTot>0 ? ssReg/ssTot : 0;
    const adjRsq = 1 - (1-Rsq)*(n-1)/dfRes;
    const R = Math.sqrt(Math.max(0,Rsq));

    // Standard errors of coefficients
    const seB = X.map((_,j)=>Math.sqrt(Math.max(0,XtXinv[j][j]*msRes)));
    const tStats = beta.map((b,j)=>seB[j]>0?b/seB[j]:0);
    const pVals = tStats.map(t=>2*(1-tCdf(Math.abs(t),dfRes)));
    const alpha=1-cl, tc=tPpf(1-alpha/2,dfRes);
    const ciLo = beta.map((b,j)=>b-tc*seB[j]);
    const ciHi = beta.map((b,j)=>b+tc*seB[j]);

    // Standardized beta
    const sdY = std(y,1);
    const coefNames = include_constant ? ['(Constant)',...ivs] : ivs;
    const coefficients = coefNames.map((nm,j)=>{
      const isConst = nm==='(Constant)';
      let betaStd = null;
      if (!isConst) {
        const sdX = std((data[nm]||[]).slice(0,n).filter(v=>typeof v==='number'&&isFinite(v)),1);
        betaStd = sdY>0&&sdX>0 ? parseFloat((beta[j]*sdX/sdY).toFixed(6)) : null;
      }
      return { name:nm, b:parseFloat(beta[j].toFixed(6)), se:parseFloat(seB[j].toFixed(6)),
        beta:betaStd, t:parseFloat(tStats[j].toFixed(6)), p:parseFloat(pVals[j].toFixed(6)),
        ci_lower:parseFloat(ciLo[j].toFixed(6)), ci_upper:parseFloat(ciHi[j].toFixed(6)) };
    });

    // VIF (for multiple predictors)
    const vifResults={};
    if (ivs.length > 1) {
      ivs.forEach((iv,idx)=>{
        const others=ivs.filter(v=>v!==iv);
        const { data:d2 } = resolveDataset(dataset,[iv,...others],params);
        const yy=(d2[iv]||[]).slice(0,n).filter(v=>typeof v==='number'&&isFinite(v));
        const XX=others.map(o=>(d2[o]||[]).slice(0,yy.length));
        if (XX.length===0||yy.length<3) return;
        try {
          const rr=_olsR2(yy,XX);
          const vif=rr<1?1/(1-rr):9999;
          const tol=1/vif;
          vifResults[iv]={ vif:parseFloat(vif.toFixed(4)), tolerance:parseFloat(tol.toFixed(4)) };
          if (vif>10) warnings.push({ severity:'HIGH', code:'HIGH_VIF', issue:`VIF for '${iv}' = ${vif.toFixed(2)} > 10.`, why_it_matters:'Severe multicollinearity.', recommended_action:'Remove or combine correlated predictors.' });
          else if (vif>5) warnings.push({ severity:'MEDIUM', code:'MOD_VIF', issue:`VIF for '${iv}' = ${vif.toFixed(2)} (5–10).`, why_it_matters:'Moderate multicollinearity.', recommended_action:'Review predictor correlations.' });
        } catch {}
      });
    }

    // Durbin-Watson
    let dw=2;
    for (let i=1;i<resid.length;i++) dw+=((resid[i]-resid[i-1])**2)/ssRes;

    // Normality of residuals
    const sw=shapiroWilk(resid.slice(0,Math.min(resid.length,5000)));

    const syntax=`REGRESSION\n  /DEPENDENT ${dv}\n  /METHOD=ENTER ${ivs.join(' ')}.`;
    return {
      status:'complete', syntax, warnings,
      assumptions_checked:[
        sw&&sw.W!=null ? { id:'resid_norm', name:'Normality of Residuals (Shapiro-Wilk)',
          status:sw.p>=0.05?'passed':'warning', test_statistic:sw.W, p_value:sw.p,
          description:'Residuals should be approximately normal.',
          interpretation:`W=${sw.W}, p=${sw.p<0.001?'< .001':sw.p.toFixed(3)}. ${sw.p>=0.05?'Residuals appear normal.':'Residuals may not be normal.'}` } : null,
        { id:'dw', name:'Independence of Residuals (Durbin-Watson)', status:dw>=1.5&&dw<=2.5?'passed':'warning',
          test_statistic:parseFloat(dw.toFixed(4)), p_value:null,
          description:'DW ≈ 2 = no autocorrelation.',
          interpretation:`DW = ${dw.toFixed(4)}.` },
      ].filter(Boolean),
      result:{
        dependent:dv, independent:ivs, n,
        model_summary:{ r:parseFloat(R.toFixed(6)), r_squared:parseFloat(Rsq.toFixed(6)), adjusted_r_squared:parseFloat(adjRsq.toFixed(6)), se_estimate:parseFloat(Math.sqrt(msRes).toFixed(6)) },
        anova_table:{ regression:{ss:parseFloat(ssReg.toFixed(6)),df:dfReg,ms:parseFloat(msReg.toFixed(6)),f:parseFloat(Fstat.toFixed(6)),p:parseFloat(pF.toFixed(6))},
          residual:{ss:parseFloat(ssRes.toFixed(6)),df:dfRes,ms:parseFloat(msRes.toFixed(6))},
          total:{ss:parseFloat(ssTot.toFixed(6)),df:n-1} },
        coefficients, vif:vifResults,
        diagnostics:{ durbin_watson:parseFloat(dw.toFixed(4)), residuals_sample:resid.slice(0,50).map(r=>parseFloat(r.toFixed(4))), fitted_sample:yHat.slice(0,50).map(v=>parseFloat(v.toFixed(4))) },
      },
    };
  }

  function _olsR2(y, Xraw) {
    const n=y.length, X=[new Array(n).fill(1),...Xraw];
    const p=X.length;
    const XtX=Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>X[i].reduce((s,_,k)=>s+X[i][k]*X[j][k],0)));
    const inv=invertMatrix(XtX);
    if (!inv) return 0;
    const Xty=X.map(xi=>xi.reduce((s,v,k)=>s+v*y[k],0));
    const beta=inv.map(row=>row.reduce((s,v,j)=>s+v*Xty[j],0));
    const yHat=Array.from({length:n},(_,i)=>X.reduce((s,xi,j)=>s+xi[i]*beta[j],0));
    const yMean=mean(y);
    const ssTot=y.reduce((s,v)=>s+(v-yMean)**2,0);
    const ssRes=y.reduce((s,v,i)=>s+(v-yHat[i])**2,0);
    return ssTot>0?(ssTot-ssRes)/ssTot:0;
  }

  /* Matrix operations */
  function transpose(M) { return M[0].map((_,j)=>M.map(r=>r[j])); }
  function matMul(A,B) {
    const m=A.length,n=B[0].length,k=B.length;
    return Array.from({length:m},(_,i)=>Array.from({length:n},(_,j)=>Array.from({length:k},(_,l)=>A[i][l]*B[l][j]).reduce((s,v)=>s+v,0)));
  }
  function invertMatrix(M) {
    const n=M.length;
    const aug=M.map((r,i)=>[...r,...Array.from({length:n},(_,j)=>i===j?1:0)]);
    for (let col=0;col<n;col++) {
      let pivot=-1, best=0;
      for (let row=col;row<n;row++) { if (Math.abs(aug[row][col])>best) { best=Math.abs(aug[row][col]); pivot=row; } }
      if (pivot<0||best<1e-12) return null;
      [aug[col],aug[pivot]]=[aug[pivot],aug[col]];
      const scale=aug[col][col];
      for (let j=0;j<2*n;j++) aug[col][j]/=scale;
      for (let row=0;row<n;row++) {
        if (row===col) continue;
        const f=aug[row][col];
        for (let j=0;j<2*n;j++) aug[row][j]-=f*aug[col][j];
      }
    }
    return aug.map(r=>r.slice(n));
  }

  /* ══════════════════════════════════════════════════════════════
     LOGISTIC REGRESSION (iterative weighted least squares)
     ══════════════════════════════════════════════════════════════ */
  function logisticRegression(dataset, params) {
    const { dependent:dv, independent:ivs, confidence_level:cl=0.95 } = params;
    if (!dv||(ivs||[]).length===0) return _err('logistic','MISSING_VARS','Dependent and independent required.','','');
    const allVars=[dv,...ivs];
    const { data, warnings } = resolveDataset(dataset,allVars,params);
    const yRaw=data[dv]||[];
    const uniq=[...new Set(yRaw.filter(v=>v!=null))];
    if (uniq.length!==2) return _err('logistic','NON_BINARY',`Dependent '${dv}' has ${uniq.length} unique values. Must be binary.`,'','Recode to 0/1.');
    const [v0,v1]=uniq.sort((a,b)=>Number(a)-Number(b));
    const y=yRaw.map(v=>v===v1||v===String(v1)?1:0);
    const n=y.length, k=ivs.length;
    if (n < k+10) warnings.push({ severity:'HIGH', code:'SMALL_SAMPLE', issue:`N=${n} may be small for ${k} predictors.`, why_it_matters:'Logistic regression needs adequate EPV (≥10 per variable).', recommended_action:'Consider reducing predictors.' });

    // IWLS (Newton-Raphson)
    const Xraw=ivs.map(iv=>(data[iv]||[]).slice(0,n).map(v=>typeof v==='number'&&isFinite(v)?v:0));
    const X=[new Array(n).fill(1),...Xraw]; // p×n
    const p=X.length;
    let beta=new Array(p).fill(0);
    const sigmoid=z=>1/(1+Math.exp(-Math.max(-500,Math.min(500,z))));

    for (let iter=0;iter<200;iter++) {
      const mu=Array.from({length:n},(_,i)=>sigmoid(X.reduce((s,xi,j)=>s+xi[i]*beta[j],0)));
      const W=mu.map((m,i)=>m*(1-m));
      const z=Array.from({length:n},(_,i)=>{
        const eta=X.reduce((s,xi,j)=>s+xi[i]*beta[j],0);
        return eta+(W[i]>0?(y[i]-mu[i])/W[i]:0);
      });
      // Weighted XtX and Xtz
      const XtWX=Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>X[i].reduce((s,_,k)=>s+W[k]*X[i][k]*X[j][k],0)));
      const XtWz=X.map(xi=>xi.reduce((s,v,k)=>s+W[k]*v*z[k],0));
      const inv=invertMatrix(XtWX);
      if (!inv) break;
      const newBeta=inv.map(row=>row.reduce((s,v,j)=>s+v*XtWz[j],0));
      const delta=newBeta.reduce((s,v,i)=>s+Math.abs(v-beta[i]),0);
      beta=newBeta;
      if (delta<1e-8) break;
    }

    const mu=Array.from({length:n},(_,i)=>sigmoid(X.reduce((s,xi,j)=>s+xi[i]*beta[j],0)));
    const W=mu.map((m,i)=>m*(1-m));
    const XtWX=Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>X[i].reduce((s,_,k)=>s+W[k]*X[i][k]*X[j][k],0)));
    const inv=invertMatrix(XtWX);
    const seB=inv?X.map((_,j)=>Math.sqrt(Math.max(0,inv[j][j]))):new Array(p).fill(0);

    // Separation check
    const maxCoef=Math.max(...beta.map(Math.abs));
    if (maxCoef>20) warnings.push({ severity:'HIGH', code:'SEPARATION', issue:`Max |B| = ${maxCoef.toFixed(1)} — possible separation.`, why_it_matters:'MLE estimates unreliable under separation.', recommended_action:'Inspect predictor distributions by outcome.' });

    // Log-likelihoods
    const llFull=y.reduce((s,yi,i)=>s+(yi===1?Math.log(Math.max(1e-15,mu[i])):Math.log(Math.max(1e-15,1-mu[i]))),0);
    const pNull=y.reduce((s,v)=>s+v,0)/n;
    const llNull=y.reduce((s,yi)=>s+(yi===1?Math.log(Math.max(1e-15,pNull)):Math.log(Math.max(1e-15,1-pNull))),0);
    const lrChi2=-2*(llNull-llFull), lrP=1-chi2Cdf(lrChi2,k);
    const coxSnell=1-Math.exp(-2*(llFull-llNull)/n);
    const nagelkerke=coxSnell/(1-Math.exp(2*llNull/n));

    // Classification (threshold 0.5)
    const pred=mu.map(v=>v>=0.5?1:0);
    let tp=0,tn=0,fp=0,fn=0;
    y.forEach((yi,i)=>{ if(yi===1&&pred[i]===1)tp++; else if(yi===0&&pred[i]===0)tn++; else if(yi===0&&pred[i]===1)fp++; else fn++; });

    const alpha=1-cl, tc=tPpf(1-alpha/2,n-p-1);
    const coefNames=['(Constant)',...ivs];
    const coefficients=coefNames.map((nm,j)=>({
      name:nm, b:parseFloat(beta[j].toFixed(6)), se:parseFloat(seB[j].toFixed(6)),
      wald:seB[j]>0?parseFloat((beta[j]/seB[j])**2 .toFixed(6)):0,
      df:1, p:parseFloat((2*(1-normCdf(Math.abs(seB[j]>0?beta[j]/seB[j]:0)))).toFixed(6)),
      exp_b:parseFloat(Math.exp(beta[j]).toFixed(6)),
      exp_b_ci_lower:parseFloat(Math.exp(beta[j]-tc*seB[j]).toFixed(6)),
      exp_b_ci_upper:parseFloat(Math.exp(beta[j]+tc*seB[j]).toFixed(6)),
    }));

    const syntax=`LOGISTIC REGRESSION VARIABLES ${dv}\n  /METHOD=ENTER ${ivs.join(' ')}\n  /PRINT=GOODFIT CI(${(cl*100).toFixed(0)}).`;
    return {
      status:'complete', syntax, warnings, assumptions_checked:[],
      result:{
        dependent:dv, independent:ivs, n, reference_value:v0, event_value:v1,
        coefficients,
        model_fit:{ chi_square:parseFloat(lrChi2.toFixed(6)),df:k,p:parseFloat(lrP.toFixed(6)),
          neg_2ll:parseFloat((-2*llFull).toFixed(6)),cox_snell_r2:parseFloat(coxSnell.toFixed(6)),nagelkerke_r2:parseFloat(nagelkerke.toFixed(6)) },
        classification_table:{ tp,tn,fp,fn,overall_accuracy_pct:parseFloat(((tp+tn)/n*100).toFixed(2)) },
      },
    };
  }

  /* ══════════════════════════════════════════════════════════════
     RELIABILITY (Cronbach's Alpha)
     ══════════════════════════════════════════════════════════════ */
  function reliability(dataset, params) {
    const { items } = params;
    if (!items||items.length<2) return _err('reliability','INSUFFICIENT_ITEMS','At least 2 items required.','','');
    const { data, warnings } = resolveDataset(dataset,items,params);
    const cols=items.map(it=>(data[it]||[]).filter(v=>typeof v==='number'&&isFinite(v)));
    const n=Math.min(...cols.map(c=>c.length));
    if (n<2) {
      // Produce a per-variable diagnostic to help the user identify which
      // columns are causing the problem (null values, strings, etc.).
      const totalRows = dataset.cases ? dataset.cases.length : 0;
      const diag = items.map(it => {
        const raw = data[it] || [];
        const numericCount = raw.filter(v => typeof v === 'number' && isFinite(v)).length;
        const nullCount   = raw.filter(v => v == null).length;
        const strCount    = raw.filter(v => typeof v === 'string').length;
        const parseable   = raw.filter(v => typeof v === 'string' && DataTypeConverter && DataTypeConverter.parseSemanticNumber(v) !== null).length;
        return `  ${it}: ${numericCount} numeric, ${nullCount} missing, ${strCount} string (${parseable} parseable)`;
      }).join('\n');
      const why = `Dataset has ${totalRows} row(s). Resolved counts per variable:\n${diag}\n\nTip: If values were pasted from Excel, ensure the variable type is "Numeric" and values were stored as numbers, not text.`;
      return _err('reliability','INSUFFICIENT_N',`Only ${n} complete case${n===1?'':'s'} across all items.`, why, 'Check the Data View — cells should show numbers, not text. Re-paste data into a Numeric column, or use Data > Define Variable to set the correct type.');
    }
    const k=items.length;
    const mat=items.map((_,i)=>cols[i].slice(0,n));
    const totals=Array.from({length:n},(_,i)=>mat.reduce((s,col)=>s+col[i],0));
    const totalVar=variance(totals,1);
    if (totalVar===0) return _err('reliability','ZERO_VARIANCE','Total score variance is zero.','All items may be identical.','Check item distributions.');
    const itemVars=mat.map(col=>variance(col,1));
    const alpha=(k/(k-1))*(1-itemVars.reduce((s,v)=>s+v,0)/totalVar);
    const interpAlpha=v=>v>=0.9?'Excellent':v>=0.8?'Good':v>=0.7?'Acceptable':v>=0.6?'Questionable':v>=0.5?'Poor':'Unacceptable';
    if (alpha<0.7) warnings.push({ severity:'MEDIUM', code:'LOW_ALPHA', issue:`α = ${alpha.toFixed(3)} < 0.7.`, why_it_matters:'Questionable internal consistency.', recommended_action:'Review item-total correlations. Consider removing items with low corrected r.' });

    const itemStats=items.map((it,idx)=>{
      const col=mat[idx];
      const rest=totals.map((t,i)=>t-col[i]);
      const scaleMeanDel=mean(rest), scaleVarDel=variance(rest,1);
      const r=pearsonR(col,rest);
      // Alpha if deleted
      const redVars=mat.filter((_,i)=>i!==idx);
      const redTot=Array.from({length:n},(_,i)=>redVars.reduce((s,c)=>s+c[i],0));
      const redTotVar=variance(redTot,1);
      const redItemVars=redVars.map(c=>variance(c,1));
      const alphaDel=redTotVar>0?((k-1)/(k-2))*(1-redItemVars.reduce((s,v)=>s+v,0)/redTotVar):null;
      return { item:it, item_mean:parseFloat(mean(col).toFixed(6)), item_std:parseFloat(std(col,1).toFixed(6)),
        scale_mean_if_deleted:parseFloat(scaleMeanDel.toFixed(6)), scale_variance_if_deleted:parseFloat(scaleVarDel.toFixed(6)),
        corrected_item_total_r:parseFloat((r.r||0).toFixed(6)), alpha_if_deleted:alphaDel!==null?parseFloat(alphaDel.toFixed(6)):null };
    });

    const syntax=`RELIABILITY\n  /VARIABLES=${items.join(' ')}\n  /MODEL=ALPHA\n  /STATISTICS=DESCRIPTIVE SCALE CORR\n  /SUMMARY=TOTAL.`;
    return {
      status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ model:'alpha', n_cases:n, n_items:k, alpha:parseFloat(alpha.toFixed(6)), alpha_interpretation:interpAlpha(alpha),
        scale_statistics:{ mean:parseFloat(mean(totals).toFixed(6)), variance:parseFloat(totalVar.toFixed(6)), std:parseFloat(Math.sqrt(totalVar).toFixed(6)) },
        item_statistics:itemStats },
    };
  }

  /* ══════════════════════════════════════════════════════════════
     FACTOR ANALYSIS / PCA
     ══════════════════════════════════════════════════════════════ */
  function factorAnalysis(dataset, params) {
    const { variables:varNames, n_factors:nFactReq=0, rotation='varimax' } = params;
    if (!varNames||varNames.length<3) return _err('factor','INSUFFICIENT_VARS','At least 3 variables required.','','');
    const { data, warnings } = resolveDataset(dataset,varNames,params);
    const p=varNames.length;
    const cols=varNames.map(vn=>(data[vn]||[]).filter(v=>typeof v==='number'&&isFinite(v)));
    const n=Math.min(...cols.map(c=>c.length));
    if (n<p+3) warnings.push({ severity:'HIGH', code:'SMALL_SAMPLE', issue:`N=${n}, p=${p}. Sample may be too small.`, why_it_matters:'Factor analysis needs adequate N/p ratio.', recommended_action:'Collect more data or reduce variables.' });

    // Standardize
    const Xstd=cols.map(col=>{ const m=mean(col.slice(0,n)),s=std(col.slice(0,n),1)||1; return col.slice(0,n).map(v=>(v-m)/s); });

    // Correlation matrix
    const corr=Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>i===j?1:pearsonR(Xstd[i],Xstd[j]).r||0));

    // KMO
    const kmoVal=_kmo(corr);

    // Bartlett
    let detCorr=_det(corr);
    if (detCorr<=0) detCorr=1e-15;
    const bartlettChi2=-(n-1-(2*p+5)/6)*Math.log(detCorr);
    const bartlettDf=p*(p-1)/2;
    const bartlettP=1-chi2Cdf(bartlettChi2,bartlettDf);

    if (kmoVal<0.5) warnings.push({ severity:'HIGH', code:'LOW_KMO', issue:`KMO = ${kmoVal.toFixed(3)} < 0.5.`, why_it_matters:'Variables not suitable for factor extraction.', recommended_action:'Remove variables with low individual KMO.' });

    // Eigendecomposition via power iteration / Jacobi (simple implementation)
    const { eigenvalues, eigenvectors } = _eigenDecomp(corr);
    const sortedIdx=[...eigenvalues.keys()].sort((a,b)=>eigenvalues[b]-eigenvalues[a]);
    const sortedEV=sortedIdx.map(i=>eigenvalues[i]);
    const sortedVecs=sortedIdx.map(i=>eigenvectors[i]);

    // Determine n_factors
    const nFact=nFactReq>0?Math.min(nFactReq,p-1):Math.max(1,sortedEV.filter(ev=>ev>1).length);
    const totalVar=sortedEV.reduce((s,v)=>s+v,0);

    // Eigenvalue table
    const eigenTable=sortedEV.map((ev,i)=>({ component:i+1, eigenvalue:parseFloat(ev.toFixed(6)), pct_variance:parseFloat((ev/totalVar*100).toFixed(4)), cumulative_pct:parseFloat((sortedEV.slice(0,i+1).reduce((s,v)=>s+v,0)/totalVar*100).toFixed(4)), extracted:i<nFact }));

    // Raw loadings = eigenvectors * sqrt(eigenvalues)
    let loadings=Array.from({length:p},(_,vi)=>Array.from({length:nFact},(_,fi)=>sortedVecs[fi][vi]*Math.sqrt(Math.max(0,sortedEV[fi]))));

    // Varimax rotation
    if (rotation==='varimax'&&nFact>1) loadings=_varimax(loadings);

    // Communalities
    const communalities=loadings.map(row=>row.reduce((s,v)=>s+v**2,0));

    // Loading matrix
    const loadingMatrix=varNames.map((vn,vi)=>{
      const row={ variable:vn };
      for (let fi=0;fi<nFact;fi++) row[`factor_${fi+1}`]=parseFloat(loadings[vi][fi].toFixed(6));
      row.communality=parseFloat(communalities[vi].toFixed(6));
      return row;
    });

    // Correlation matrix output
    const corrOut={};
    varNames.forEach((v1,i)=>{ corrOut[v1]={}; varNames.forEach((v2,j)=>{ corrOut[v1][v2]=parseFloat(corr[i][j].toFixed(6)); }); });

    const kmoLabel=v=>v>=0.9?'Marvelous':v>=0.8?'Meritorious':v>=0.7?'Middling':v>=0.6?'Mediocre':v>=0.5?'Miserable':'Unacceptable';
    const syntax=`FACTOR VARIABLES=${varNames.join(' ')}\n  /EXTRACTION=PC\n  /ROTATION=${rotation.toUpperCase()}\n  /PRINT=INITIAL EXTRACTION ROTATION KMO.`;
    return {
      status:'complete', syntax, warnings,
      assumptions_checked:[
        { id:'kmo', name:'Kaiser-Meyer-Olkin (KMO)', status:kmoVal>=0.6?'passed':kmoVal>=0.5?'warning':'failed',
          test_statistic:parseFloat(kmoVal.toFixed(6)), p_value:null,
          description:'KMO ≥ 0.6 acceptable.', interpretation:`KMO = ${kmoVal.toFixed(3)} — ${kmoLabel(kmoVal)}.` },
        { id:'bartlett', name:"Bartlett's Test of Sphericity", status:bartlettP<0.05?'passed':'failed',
          test_statistic:parseFloat(bartlettChi2.toFixed(4)), p_value:parseFloat(bartlettP.toFixed(6)),
          description:'Significant p < .05 indicates correlations among variables.',
          interpretation:`χ²(${bartlettDf}) = ${bartlettChi2.toFixed(2)}, p = ${bartlettP<0.001?'< .001':bartlettP.toFixed(3)}.` },
      ],
      result:{ variables:varNames, n, n_factors_extracted:nFact, extraction:'pca', rotation:nFact>1?rotation:'none',
        kmo:parseFloat(kmoVal.toFixed(6)), bartlett:{ chi_square:parseFloat(bartlettChi2.toFixed(4)), df:bartlettDf, p:parseFloat(bartlettP.toFixed(6)) },
        eigenvalue_table:eigenTable, loading_matrix:loadingMatrix, correlation_matrix:corrOut },
    };
  }

  function _kmo(corr) {
    const p=corr.length;
    const inv=invertMatrix(corr);
    if (!inv) return 0;
    let sumR2=0, sumQ2=0;
    for (let i=0;i<p;i++) for (let j=0;j<p;j++) {
      if (i===j) continue;
      sumR2+=corr[i][j]**2;
      const qi=inv[i][i], qj=inv[j][j];
      if (qi>0&&qj>0) sumQ2+=(inv[i][j]/(Math.sqrt(qi*qj)))**2;
    }
    return sumR2+sumQ2>0?Math.max(0,Math.min(1,sumR2/(sumR2+sumQ2))):0;
  }

  function _det(M) {
    const n=M.length;
    const A=M.map(r=>[...r]);
    let det=1;
    for (let col=0;col<n;col++) {
      let pivot=-1, best=0;
      for (let row=col;row<n;row++) { if (Math.abs(A[row][col])>best) { best=Math.abs(A[row][col]); pivot=row; } }
      if (pivot<0||best<1e-14) return 0;
      if (pivot!==col) { [A[col],A[pivot]]=[A[pivot],A[col]]; det*=-1; }
      det*=A[col][col];
      const scale=A[col][col];
      for (let j=col;j<n;j++) A[col][j]/=scale;
      for (let row=0;row<n;row++) {
        if (row===col) continue;
        const f=A[row][col];
        for (let j=col;j<n;j++) A[row][j]-=f*A[col][j];
      }
    }
    return det;
  }

  function _eigenDecomp(M) {
    // Jacobi eigenvalue algorithm for symmetric matrices
    const n=M.length, maxIter=1000;
    const A=M.map(r=>[...r]);
    const V=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
    for (let iter=0;iter<maxIter;iter++) {
      let maxVal=0, p2=0, q2=1;
      for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) { if (Math.abs(A[i][j])>maxVal) { maxVal=Math.abs(A[i][j]); p2=i; q2=j; } }
      if (maxVal<1e-12) break;
      const theta=0.5*Math.atan2(2*A[p2][q2],A[p2][p2]-A[q2][q2]);
      const c=Math.cos(theta), s=Math.sin(theta);
      const newA=A.map(r=>[...r]);
      for (let i=0;i<n;i++) {
        if (i===p2||i===q2) continue;
        newA[i][p2]=c*A[i][p2]+s*A[i][q2]; newA[p2][i]=newA[i][p2];
        newA[i][q2]=-s*A[i][p2]+c*A[i][q2]; newA[q2][i]=newA[i][q2];
      }
      newA[p2][p2]=c**2*A[p2][p2]+2*s*c*A[p2][q2]+s**2*A[q2][q2];
      newA[q2][q2]=s**2*A[p2][p2]-2*s*c*A[p2][q2]+c**2*A[q2][q2];
      newA[p2][q2]=0; newA[q2][p2]=0;
      for (let i=0;i<n;i++) A[i]=newA[i];
      for (let i=0;i<n;i++) {
        const vp=c*V[i][p2]+s*V[i][q2], vq=-s*V[i][p2]+c*V[i][q2];
        V[i][p2]=vp; V[i][q2]=vq;
      }
    }
    return { eigenvalues:A.map((_,i)=>A[i][i]), eigenvectors:Array.from({length:n},(_,j)=>Array.from({length:n},(_,i)=>V[i][j])) };
  }

  function _varimax(L, maxIter=1000, tol=1e-6) {
    const p=L.length, k=L[0].length;
    if (k<=1) return L;
    let rot=Array.from({length:k},(_,i)=>Array.from({length:k},(_,j)=>i===j?1:0));
    for (let iter=0;iter<maxIter;iter++) {
      let maxChange=0;
      for (let i=0;i<k;i++) for (let j=i+1;j<k;j++) {
        const Lmat=L.map(r=>[...r]); // current rotated
        const u=Lmat.map(r=>r[i]**2-r[j]**2), v=Lmat.map(r=>2*r[i]*r[j]);
        const A=u.reduce((s,v2)=>s+v2,0), B=v.reduce((s,v2)=>s+v2,0);
        const C=u.reduce((s,v2,ii)=>s+v2**2-v[ii]**2,0), D=u.reduce((s,v2,ii)=>s+2*v2*v[ii],0);
        const num=D-A*B/p, den=C-(A**2-B**2)/p;
        const angle=den!==0?0.25*Math.atan2(num,den):0;
        const c=Math.cos(angle), s=Math.sin(angle);
        const G=Array.from({length:k},(_,a)=>Array.from({length:k},(_,b)=>a===b?1:0));
        G[i][i]=c; G[j][j]=c; G[i][j]=-s; G[j][i]=s;
        // Apply rotation to L: L = L * G
        const newL=L.map(row=>{ const nr=new Array(k).fill(0); for (let a=0;a<k;a++) for (let b=0;b<k;b++) nr[b]+=row[a]*G[a][b]; return nr; });
        L=newL;
        maxChange=Math.max(maxChange,Math.abs(angle));
      }
      if (maxChange<tol) break;
    }
    return L;
  }

  /* ══════════════════════════════════════════════════════════════
     NONPARAMETRIC TESTS
     ══════════════════════════════════════════════════════════════ */
  function nonparametric(dataset, params) {
    const test=params.test||'mannwhitney';
    if (test==='mannwhitney') return _mannWhitney(dataset,params);
    if (test==='wilcoxon') return _wilcoxon(dataset,params);
    if (test==='kruskalwallis') return _kruskalWallis(dataset,params);
    if (test==='friedman') return _friedman(dataset,params);
    return _err('nonparametric','UNKNOWN_TEST',`Unknown test: ${test}`,'','');
  }

  function _mannWhitney(dataset, params) {
    const { variable:vn, grouping_variable:gv, alternative='two-sided' } = params;
    const { data, warnings } = resolveDataset(dataset,[vn,gv],params);
    const xArr=data[vn]||[], gArr=data[gv]||[];
    const gKeys=[...new Set(gArr.map(String))];
    if (gKeys.length!==2) return _err('nonparametric','GROUPS',`Expected 2 groups, found ${gKeys.length}.`,'','');
    const g1=xArr.filter((_,i)=>String(gArr[i])===gKeys[0]).filter(v=>typeof v==='number'&&isFinite(v));
    const g2=xArr.filter((_,i)=>String(gArr[i])===gKeys[1]).filter(v=>typeof v==='number'&&isFinite(v));
    const n1=g1.length, n2=g2.length, N=n1+n2;
    // Mann-Whitney U
    let U1=0;
    for (const a of g1) for (const b of g2) { if (a>b)U1++; else if (a===b)U1+=0.5; }
    const U2=n1*n2-U1, U=Math.min(U1,U2);
    const muU=n1*n2/2, sigU=Math.sqrt(n1*n2*(N+1)/12);
    const Z=(U1-muU)/sigU;
    let p;
    if (alternative==='two-sided') p=2*Math.min(normCdf(Z),1-normCdf(Z));
    else if (alternative==='less') p=normCdf(Z);
    else p=1-normCdf(Z);
    const r=Math.abs(Z)/Math.sqrt(N);
    const syntax=`NPAR TESTS M-W=${vn} BY ${gv}(${gKeys[0]} ${gKeys[1]}).`;
    return { status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ test:'Mann-Whitney U', variable:vn, grouping_variable:gv, group1:gKeys[0], group2:gKeys[1],
        n1, n2, group1_median:parseFloat(quantile(sortNum(g1),0.5).toFixed(6)), group2_median:parseFloat(quantile(sortNum(g2),0.5).toFixed(6)),
        U:parseFloat(U1.toFixed(4)), z:parseFloat(Z.toFixed(4)), p:parseFloat(p.toFixed(6)), alternative, effect_size_r:parseFloat(r.toFixed(6)) } };
  }

  function _wilcoxon(dataset, params) {
    const { variable1:v1n, variable2:v2n, alternative='two-sided' } = params;
    const { data, warnings } = resolveDataset(dataset,[v1n,v2n],params);
    const x1=data[v1n]||[], x2=data[v2n]||[];
    const n=Math.min(x1.length,x2.length);
    const diffs=x1.slice(0,n).map((v,i)=>v-x2[i]).filter(d=>d!==0);
    if (diffs.length===0) return _err('nonparametric','NO_DIFFERENCES','All differences are zero.','','');
    // Rank |diffs|
    const absDiffs=diffs.map(Math.abs);
    const rks=Stats.ranks(absDiffs);
    let Tplus=0, Tminus=0;
    diffs.forEach((d,i)=>{ if (d>0)Tplus+=rks[i]; else Tminus+=rks[i]; });
    const T=Math.min(Tplus,Tminus), nn=diffs.length;
    // Normal approximation (z-score)
    const muT=nn*(nn+1)/4, sigT=Math.sqrt(nn*(nn+1)*(2*nn+1)/24);
    const Z=(T-muT)/sigT;
    const p=alternative==='two-sided'?2*Math.min(normCdf(Z),1-normCdf(Z)):Z<0?normCdf(Z):1-normCdf(Z);
    const syntax=`NPAR TESTS WILCOXON=${v1n} WITH ${v2n}.`;
    return { status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ test:'Wilcoxon Signed-Rank', variable1:v1n, variable2:v2n, n_pairs:n, n_nonzero_diff:nn, T:parseFloat(T.toFixed(4)), z:parseFloat(Z.toFixed(4)), p:parseFloat(p.toFixed(6)), alternative } };
  }

  function _kruskalWallis(dataset, params) {
    // Accept both 'factor' and 'grouping_variable' for compatibility
    const vn = params.variable;
    const fv = params.factor || params.grouping_variable;
    const { data, warnings } = resolveDataset(dataset,[vn,fv],params);
    const xArr=data[vn]||[], gArr=data[fv]||[];
    const gKeys=[...new Set(gArr.map(String))];
    if (gKeys.length<2) return _err('nonparametric','GROUPS','At least 2 groups required.','','');
    const groups={};
    gKeys.forEach(k=>{ groups[k]=xArr.filter((_,i)=>String(gArr[i])===k).filter(v=>typeof v==='number'&&isFinite(v)); });
    const allVals=Object.values(groups).flat();
    const N=allVals.length, K=gKeys.length;
    const allRanks=Stats.ranks(allVals);
    const rankMap=new Map();
    allVals.forEach((v,i)=>rankMap.set(`${i}`,allRanks[i]));
    let offset=0;
    const groupRankSums={};
    for (const k of gKeys) {
      const g=groups[k];
      groupRankSums[k]=allRanks.slice(offset,offset+g.length).reduce((s,v)=>s+v,0);
      offset+=g.length;
    }
    const H=12/(N*(N+1))*gKeys.reduce((s,k)=>s+groupRankSums[k]**2/groups[k].length,0)-3*(N+1);
    const pH=1-chi2Cdf(H,K-1);
    const epsSq=(H-K+1)/(N-K);
    const syntax=`NPAR TESTS K-W=${vn} BY ${fv}.`;
    return { status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ test:'Kruskal-Wallis', variable:vn, factor:fv, k_groups:K, n_total:N,
        group_medians:Object.fromEntries(gKeys.map(k=>[k,parseFloat(quantile(sortNum(groups[k]),0.5).toFixed(6))])),
        H:parseFloat(H.toFixed(4)), df:K-1, p:parseFloat(pH.toFixed(6)), epsilon_squared:parseFloat(epsSq.toFixed(6)) } };
  }

  function _friedman(dataset, params) {
    const { variables:varNames } = params;
    if (!varNames||varNames.length<2) return _err('nonparametric','INSUFFICIENT_VARS','At least 2 variables required.','','');
    const { data, warnings } = resolveDataset(dataset,varNames,params);
    const cols=varNames.map(vn=>(data[vn]||[]).filter(v=>typeof v==='number'&&isFinite(v)));
    const n=Math.min(...cols.map(c=>c.length)), k=varNames.length;
    if (n<2) return _err('nonparametric','INSUFFICIENT_N','At least 2 complete cases required.','','');
    // Rank within each row
    const rowRankSums=new Array(k).fill(0);
    for (let i=0;i<n;i++) {
      const row=cols.map(c=>c[i]);
      const rks=Stats.ranks(row);
      rks.forEach((r,j)=>{ rowRankSums[j]+=r; });
    }
    const chi2=(12/(n*k*(k+1)))*rowRankSums.reduce((s,r)=>s+r**2,0)-3*n*(k+1);
    const p=1-chi2Cdf(chi2,k-1);
    const W=chi2/(n*(k-1));
    const syntax=`NPAR TESTS FRIEDMAN=${varNames.join(' ')}.`;
    return { status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ test:'Friedman', variables:varNames, n_cases:n, k_conditions:k,
        chi_square:parseFloat(chi2.toFixed(4)), df:k-1, p:parseFloat(p.toFixed(6)), kendall_w:parseFloat(W.toFixed(6)) } };
  }

  /* ══════════════════════════════════════════════════════════════
     K-MEANS CLUSTERING
     ══════════════════════════════════════════════════════════════ */
  function kMeans(dataset, params) {
    const { variables:varNames, k=3, max_iter=100, seed=42 } = params;
    if (!varNames||varNames.length<1) return _err('cluster','MISSING_VARS','Variables required.','','');
    const { data, warnings } = resolveDataset(dataset,varNames,params);
    const cols=varNames.map(vn=>(data[vn]||[]).filter(v=>typeof v==='number'&&isFinite(v)));
    const n=Math.min(...cols.map(c=>c.length));
    if (n<k) return _err('cluster','INSUFFICIENT_N',`N=${n} < k=${k}.`,'','Reduce k or add more cases.');
    // Build data matrix (n × p)
    const X=Array.from({length:n},(_,i)=>cols.map(c=>c[i]));
    // Standardize
    const stds=cols.map(c=>std(c.slice(0,n),1)||1), means=cols.map(c=>mean(c.slice(0,n)));
    const Xs=X.map(row=>row.map((v,j)=>(v-means[j])/stds[j]));
    // Init centroids (k-means++ seeding)
    const rng=(s=>()=>{ s=(1664525*s+1013904223)&0xFFFFFFFF; return (s>>>0)/0xFFFFFFFF; })(seed);
    const centroids=[Xs[Math.floor(rng()*n)]];
    while (centroids.length<k) {
      const dists=Xs.map(row=>Math.min(...centroids.map(c=>row.reduce((s,v,j)=>s+(v-c[j])**2,0))));
      const total=dists.reduce((s,v)=>s+v,0);
      let r=rng()*total, cum=0;
      for (let i=0;i<n;i++) { cum+=dists[i]; if (cum>=r) { centroids.push(Xs[i]); break; } }
    }
    // Iterate
    let assignments=new Array(n).fill(0);
    for (let iter=0;iter<max_iter;iter++) {
      const newA=Xs.map(row=>{ let best=Infinity,bi=0; centroids.forEach((c,ci)=>{ const d=row.reduce((s,v,j)=>s+(v-c[j])**2,0); if(d<best){best=d;bi=ci;} }); return bi; });
      const changed=newA.some((a,i)=>a!==assignments[i]);
      assignments=newA;
      if (!changed) break;
      // Update centroids
      for (let ci=0;ci<k;ci++) {
        const members=Xs.filter((_,i)=>assignments[i]===ci);
        if (members.length===0) continue;
        const p2=members[0].length;
        centroids[ci]=Array.from({length:p2},(_,j)=>mean(members.map(r=>r[j])));
      }
    }
    // Cluster sizes and centers (unstandardized)
    const sizes=Array.from({length:k},(_,ci)=>assignments.filter(a=>a===ci).length);
    const centers=Array.from({length:k},(_,ci)=>{
      const members=X.filter((_,i)=>assignments[i]===ci);
      return varNames.map((_,j)=>members.length>0?parseFloat(mean(members.map(r=>r[j])).toFixed(4)):0);
    });
    // Silhouette score (simplified)
    let silTotal=0;
    for (let i=0;i<Math.min(n,500);i++) {
      const ci=assignments[i];
      const same=Xs.filter((_,j)=>j!==i&&assignments[j]===ci);
      const a=same.length>0?mean(same.map(row=>Math.sqrt(row.reduce((s,v,jj)=>s+(v-Xs[i][jj])**2,0)))):0;
      let b=Infinity;
      for (let c2=0;c2<k;c2++) { if (c2===ci) continue; const other=Xs.filter((_,j)=>assignments[j]===c2); if (other.length>0) { const bd=mean(other.map(row=>Math.sqrt(row.reduce((s,v,jj)=>s+(v-Xs[i][jj])**2,0)))); b=Math.min(b,bd); } }
      if (b===Infinity) b=0;
      silTotal+=(b-a)/Math.max(a,b)||0;
    }
    const silScore=parseFloat((silTotal/Math.min(n,500)).toFixed(4));
    warnings.push({ severity:'LOW', code:'CLUSTER_NOTE', issue:'Cluster solution depends on initial seed and k choice.', why_it_matters:'Cluster membership is not a ground truth — different k values may be more appropriate.', recommended_action:'Compare silhouette scores across different k values.' });

    const syntax=`QUICK CLUSTER\n  /VARIABLES=${varNames.join(' ')}\n  /MISSING=LISTWISE\n  /CRITERIA=CLUSTER(${k}) MXITER(${max_iter}).`;
    return { status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ variables:varNames, k, n, assignments, sizes, centers:centers.map((c,ci)=>({ cluster:ci+1, n:sizes[ci], means:Object.fromEntries(varNames.map((vn,j)=>[vn,c[j]])) })), silhouette_score:silScore } };
  }

  /* ══════════════════════════════════════════════════════════════
     KAPLAN-MEIER SURVIVAL ANALYSIS
     ══════════════════════════════════════════════════════════════ */
  function kaplanMeier(dataset, params) {
    const { time_variable:tv, event_variable:ev, group_variable:gv } = params;
    if (!tv||!ev) return _err('survival','MISSING_VARS','Time and event variables required.','','');
    const varList=[tv,ev,...(gv?[gv]:[])];
    const { data, warnings } = resolveDataset(dataset,varList,params);
    const times=(data[tv]||[]).map(Number).filter(isFinite);
    const events=(data[ev]||[]).map(Number);
    const n=Math.min(times.length,events.length);
    const groups=gv?[...new Set((data[gv]||[]).map(String))]:[null];

    const computeKM=(tArr,eArr)=>{
      const pairs=tArr.map((t,i)=>({ t,e:eArr[i]!==0&&eArr[i]!=='0' })).sort((a,b)=>a.t-b.t);
      let surv=1, nRisk=pairs.length;
      const steps=[{ t:0, survival:1, n_risk:nRisk, n_event:0, n_censor:0 }];
      let i=0;
      while (i<pairs.length) {
        const t0=pairs[i].t; let nEvent=0, nCensor=0, j=i;
        while (j<pairs.length&&pairs[j].t===t0) { if(pairs[j].e)nEvent++; else nCensor++; j++; }
        if (nEvent>0) { surv*=(nRisk-nEvent)/nRisk; steps.push({ t:t0, survival:parseFloat(surv.toFixed(6)), n_risk:nRisk, n_event:nEvent, n_censor:nCensor }); }
        nRisk-=nEvent+nCensor; i=j;
      }
      return steps;
    };

    const curves={};
    if (!gv) {
      curves['all']=computeKM(times.slice(0,n),events.slice(0,n));
    } else {
      const gArr=data[gv]||[];
      for (const g of groups) {
        const idx=gArr.map((_,i)=>String(gArr[i])===g?i:-1).filter(i=>i>=0);
        curves[g]=computeKM(idx.map(i=>times[i]),idx.map(i=>events[i]));
      }
    }

    const syntax=`KM ${tv} /STATUS=${ev}(1)\n${gv?`  /STRATA=${gv}\n`:''}  /PRINT TABLE MEAN.`;
    return { status:'complete', syntax, warnings, assumptions_checked:[],
      result:{ time_variable:tv, event_variable:ev, group_variable:gv, n, groups, survival_curves:curves } };
  }

  /* ══════════════════════════════════════════════════════════════
     PROCEDURE REGISTRY
     ══════════════════════════════════════════════════════════════ */
  const registry = {
    frequencies: { id:'frequencies', category:'descriptive', display_name:'Frequencies', description:'Frequency table with counts, percentages, cumulative percent.', execute: Stats.frequencies },
    descriptives: { id:'descriptives', category:'descriptive', display_name:'Descriptive Statistics', execute: Stats.descriptives },
    crosstabs: { id:'crosstabs', category:'descriptive', display_name:'Crosstabs', execute: crosstabs },
    correlation: { id:'correlation', category:'correlate', display_name:'Bivariate Correlations', execute: correlation },
    ttest_onesample: { id:'ttest_onesample', category:'compare_means', display_name:'One-Sample T-Test', execute: (ds,p)=>ttest(ds,{...p,type:'onesample'}) },
    ttest_independent: { id:'ttest_independent', category:'compare_means', display_name:'Independent Samples T-Test', execute: (ds,p)=>ttest(ds,{...p,type:'independent'}) },
    ttest_paired: { id:'ttest_paired', category:'compare_means', display_name:'Paired Samples T-Test', execute: (ds,p)=>ttest(ds,{...p,type:'paired'}) },
    anova_oneway: { id:'anova_oneway', category:'compare_means', display_name:'One-Way ANOVA', execute: anova },
    linear_regression: { id:'linear_regression', category:'regression', display_name:'Linear Regression', execute: linearRegression },
    logistic_regression: { id:'logistic_regression', category:'regression', display_name:'Binary Logistic Regression', execute: logisticRegression },
    reliability: { id:'reliability', category:'scale', display_name:'Reliability Analysis (Alpha)', execute: reliability },
    factor_analysis: { id:'factor_analysis', category:'dimension_reduction', display_name:'Exploratory Factor Analysis', execute: factorAnalysis },
    nonparametric_mannwhitney: { id:'nonparametric_mannwhitney', category:'nonparametric', display_name:'Mann-Whitney U Test', execute:(ds,p)=>nonparametric(ds,{...p,test:'mannwhitney'}) },
    nonparametric_wilcoxon: { id:'nonparametric_wilcoxon', category:'nonparametric', display_name:'Wilcoxon Signed-Rank Test', execute:(ds,p)=>nonparametric(ds,{...p,test:'wilcoxon'}) },
    nonparametric_kruskalwallis: { id:'nonparametric_kruskalwallis', category:'nonparametric', display_name:'Kruskal-Wallis Test', execute:(ds,p)=>nonparametric(ds,{...p,test:'kruskalwallis'}) },
    nonparametric_friedman: { id:'nonparametric_friedman', category:'nonparametric', display_name:'Friedman Test', execute:(ds,p)=>nonparametric(ds,{...p,test:'friedman'}) },
    kmeans: { id:'kmeans', category:'cluster', display_name:'K-Means Clustering', execute: kMeans },
    kaplan_meier: { id:'kaplan_meier', category:'survival', display_name:'Kaplan-Meier Survival Analysis', execute: kaplanMeier },
  };

  function runProcedure(procedureId, dataset, params) {
    const proc = registry[procedureId];
    if (!proc) return { status:'error', result:null, warnings:[], assumptions_checked:[], error:{ procedure:procedureId, error_code:'UNKNOWN_PROCEDURE', message:`Procedure '${procedureId}' not registered.`, likely_cause:'', suggested_action:'Check procedure ID.' } };
    try {
      const result = proc.execute(dataset, params);
      return result;
    } catch(e) {
      return { status:'error', result:null, warnings:[], assumptions_checked:[], error:{ procedure:procedureId, error_code:'RUNTIME_ERROR', message:e.message, likely_cause:'Unexpected error in statistical computation.', suggested_action:'Check input data and parameters.' } };
    }
  }

  return { runProcedure, registry };
})();

const ProcedureRegistry = StatProcs;

/* ══════════════════════════════════════════════════════════════════
   SECTION 4B-DIAG: DATA INTEGRITY CHECK
   Provides DataIntegrity.check(dataset) for diagnostic use.
   Also exposed as DataIntegrity.report(dataset) → HTML string.
   ══════════════════════════════════════════════════════════════════ */

