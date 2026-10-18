const AIAssistant = (() => {
  let _container = null;
  let _messages = [];
  let _apiKey = '';
  let _provider = 'none';
  let _navigate = null;

  function setNavigateFn(fn) { _navigate = fn; }

  /* ── Intent detection ───────────────────────────────────────── */
  function extractVarName(msg, ds) {
    if (!ds) return null;
    for (const v of ds.variables) {
      if (msg.includes(v.name.toLowerCase())) return v.name;
      if (v.label && msg.includes(v.label.toLowerCase())) return v.name;
    }
    return null;
  }

  function detectIntent(msg, ds) {
    const m = msg.toLowerCase();
    // Navigation
    if (/buka.*data|open.*data|lihat.*data|tampilkan.*data/.test(m)) return {action:'OPEN_DATA', params:{}};
    if (/buka.*output|open.*output|lihat.*output|tampilkan.*output/.test(m)) return {action:'OPEN_OUTPUT', params:{}};
    if (/buka.*analisi|open.*analyz|buka.*analyze/.test(m)) return {action:'OPEN_ANALYZE', params:{}};
    if (/buka.*grafik|buka.*chart|open.*graph|buka grafik/.test(m)) return {action:'OPEN_GRAPHS', params:{}};
    if (/buka.*transform/.test(m)) return {action:'OPEN_TRANSFORM', params:{}};
    // Chart creation — try to extract variable name
    if (/buat.*pie|pie.*chart|diagram.*pie|pie.*dari|create.*pie/.test(m)) {
      const varName = extractVarName(m, ds);
      return {action:'CREATE_PIE', params:{variable: varName}};
    }
    if (/buat.*histogram|histogram.*dari|create.*histogram/.test(m)) {
      const varName = extractVarName(m, ds);
      return {action:'CREATE_HISTOGRAM', params:{variable: varName}};
    }
    if (/buat.*bar|bar.*chart|diagram.*batang|create.*bar/.test(m)) {
      const varName = extractVarName(m, ds);
      return {action:'CREATE_BAR', params:{variable: varName}};
    }
    if (/buat.*scatter|scatterplot|diagram.*pencar|create.*scatter/.test(m)) return {action:'OPEN_GRAPHS', params:{}};
    if (/buat.*boxplot|box.*plot/.test(m)) return {action:'OPEN_GRAPHS', params:{}};
    // Analysis
    if (/rata.?rata|mean|average/.test(m)) {
      const varName = extractVarName(m, ds);
      if (varName) return {action:'RUN_DESCRIPTIVES_VAR', params:{variable: varName}};
      return {action:'RUN_DESCRIPTIVES', params:{}};
    }
    if (/jalankan.*frekuensi|run.*frequenc|tampilkan.*frekuensi|hitung.*frekuensi|frekuensi/.test(m)) {
      const varName = extractVarName(m, ds);
      return {action:'RUN_FREQUENCIES', params:{variable: varName}};
    }
    if (/jalankan.*deskript|run.*descript|statistik.*deskript|rata.?rata.*semua/.test(m)) return {action:'RUN_DESCRIPTIVES', params:{}};
    if (/jalankan.*korelasi|run.*correlat|hitung.*korelasi/.test(m)) return {action:'RUN_CORRELATION', params:{}};
    // Student's t distribution — detect BEFORE generic probability to avoid false matches
    // "t tabel" / "t kritis" / "critical t" / "cari t"
    if (/t\s*tabel|t\s*kritis|critical\s*t|cari\s*t|find\s*critical\s*t|berapa\s*t\s*tabel|t\s*distribution|distribusi\s*t/.test(m)) {
      const dfMatch = m.match(/df\s*[=:]?\s*(\d+)/);
      const alphaMatch = m.match(/alpha\s*[=:]?\s*([\d.]+)|α\s*[=:]?\s*([\d.]+)|\b(0\.\d+|[\d]+)\s*persen\b|(\d+)\s*%/);
      const tailMatch = /dua\s*sisi|two.?tailed|two\s*tail/.test(m) ? 'two-tailed' : /kiri|left/.test(m) ? 'left' : /kanan|right/.test(m) ? 'right' : 'two-tailed';
      let alpha = null;
      if (alphaMatch) {
        const raw = alphaMatch[1] || alphaMatch[2] || alphaMatch[3] || alphaMatch[4];
        if (raw) {
          alpha = parseFloat(raw);
          if (alpha > 1) alpha = alpha / 100; // e.g. "5 persen" → 0.05
        }
      }
      return { action: 'STUDENT_T_CRITICAL', params: { df: dfMatch ? parseInt(dfMatch[1]) : null, alpha, tail: tailMatch } };
    }
    // "p value kalau t = ..." / "berapa p value t ..."
    if (/p\s*value.*t\s*[=:]?\s*([-\d.]+)|hitung.*p.*t\s*[=:]?\s*([-\d.]+)|berapa.*p.*t\s*[=:]\s*([-\d.]+)/.test(m)) {
      const tMatch = m.match(/t\s*[=:]?\s*([-\d.]+)/);
      const dfMatch = m.match(/df\s*[=:]?\s*(\d+)/);
      const tailMatch = /dua\s*sisi|two.?tailed/.test(m) ? 'two-tailed' : /kiri|left/.test(m) ? 'left' : /kanan|right/.test(m) ? 'right' : 'two-tailed';
      return { action: 'STUDENT_T_PROBABILITY', params: {
        t: tMatch ? parseFloat(tMatch[1]) : null,
        df: dfMatch ? parseInt(dfMatch[1]) : null,
        tail: tailMatch
      }};
    }
    // "uji t ... df ... alpha ..." test mode
    if (/uji\s*t|test\s*t\s*stat|t\s*stat.*test/.test(m)) {
      const tMatch = m.match(/t\s*[=:]?\s*([-\d.]+)/);
      const dfMatch = m.match(/df\s*[=:]?\s*(\d+)/);
      const alphaMatch = m.match(/alpha\s*[=:]?\s*([\d.]+)|\b(0\.\d+)\b|(\d+)\s*%/);
      const tailMatch = /dua\s*sisi|two.?tailed/.test(m) ? 'two-tailed' : /kiri|left/.test(m) ? 'left' : /kanan|right/.test(m) ? 'right' : 'two-tailed';
      let alpha = null;
      if (alphaMatch) {
        const raw = alphaMatch[1] || alphaMatch[2] || alphaMatch[3];
        if (raw) { alpha = parseFloat(raw); if (alpha > 1) alpha = alpha / 100; }
      }
      return { action: 'STUDENT_T_TEST', params: {
        t: tMatch ? parseFloat(tMatch[1]) : null,
        df: dfMatch ? parseInt(dfMatch[1]) : null,
        alpha, tail: tailMatch
      }};
    }
    // Probability calculator
    if (/probabilit|distribusi.*normal|normal.*distribusi|buka.*probabilit|open.*probabilit/.test(m))
      return {action:'OPEN_PROBABILITY_CALCULATOR', params:{}};
    if (/berapa.*peluang.*z|peluang.*untuk.*z|probability.*z\s*=?\s*([-\d.]+)|calculate.*probability.*z\s*=?\s*([-\d.]+)|hitung.*probabilit.*z\s*=?\s*([-\d.]+)|buatkan.*distribusi.*normal.*z\s*=?\s*([-\d.]+)|what.*probability.*z\s*=?\s*([-\d.]+)/.test(m)) {
      const match = m.match(/z\s*=?\s*([-\d.]+)/);
      const z = match ? parseFloat(match[1]) : null;
      return {action:'CALCULATE_NORMAL_PROBABILITY', params: { z }};
    }
    return null;
  }

  /* ── Action registry ────────────────────────────────────────── */
  const AIActionRegistry = {
    NAVIGATE:        { handler: (params) => { if(_navigate) _navigate(params.module); return `Navigated to ${params.module}.`; } },
    OPEN_DATA:       { handler: () => { if(_navigate) _navigate('data');      return 'Opened Data Editor.'; } },
    OPEN_OUTPUT:     { handler: () => { if(_navigate) _navigate('output');    return 'Opened Output Viewer.'; } },
    OPEN_ANALYZE:    { handler: () => { if(_navigate) _navigate('analyze');   return 'Opened Analyze module. Choose a procedure.'; } },
    OPEN_GRAPHS:     { handler: () => { if(_navigate) _navigate('graphs');    return 'Opened Graph Builder.'; } },
    OPEN_TRANSFORM:  { handler: () => { if(_navigate) _navigate('transform'); return 'Opened Transform module.'; } },
    RUN_FREQUENCIES: { handler: (params, ds) => {
      if (!ds) return 'No dataset loaded.';
      const varName = params.variable || (ds.variables[0] && ds.variables[0].name);
      if (!varName) return 'No variable found.';
      try {
        const result = ProcedureRegistry.runProcedure('frequencies', ds, { variables: [varName] });
        Output.addResult('frequencies', result, { variables: [varName] });
        if (_navigate) _navigate('output');
        return `Ran Frequencies for **${varName}**. Results added to Output.`;
      } catch(e) { return `Error: ${e.message}`; }
    }},
    RUN_DESCRIPTIVES: { handler: (params, ds) => {
      if (!ds) return 'No dataset loaded.';
      const numVars = ds.variables.filter(v => v.type==='numeric').map(v=>v.name);
      if (!numVars.length) return 'No numeric variables found.';
      const vars = params.variables || numVars.slice(0,5);
      try {
        const result = ProcedureRegistry.runProcedure('descriptives', ds, { variables: vars });
        Output.addResult('descriptives', result, { variables: vars });
        if (_navigate) _navigate('output');
        return `Ran Descriptives for **${vars.join(', ')}**. Results added to Output.`;
      } catch(e) { return `Error: ${e.message}`; }
    }},
    RUN_CORRELATION: { handler: (params, ds) => {
      if (!ds) return 'No dataset loaded.';
      const scaleVars = ds.variables.filter(v => v.measurementLevel==='scale'||v.type==='numeric').map(v=>v.name);
      if (scaleVars.length < 2) return 'Need at least 2 scale variables for correlation.';
      const vars = params.variables || scaleVars.slice(0,4);
      try {
        const result = ProcedureRegistry.runProcedure('correlation', ds, { variables: vars, method:'pearson' });
        Output.addResult('correlation', result, { variables: vars });
        if (_navigate) _navigate('output');
        return 'Ran Pearson Correlation for **'+vars.join(', ')+'**. Results added to Output.';
      } catch(e) { return 'Error: '+e.message; }
    }},
    RUN_DESCRIPTIVES_VAR: { handler: (params, ds) => {
      if (!ds) return 'No dataset loaded.';
      const varName = params.variable;
      if (!varName) return 'Could not identify variable name. Please try: "rata-rata [variable name]"';
      const v = ds.variables.find(x=>x.name===varName);
      if (!v) return 'Variable not found: '+varName+'. Available: '+ds.variables.map(x=>x.name).join(', ');
      try {
        const result = ProcedureRegistry.runProcedure('descriptives', ds, { variables: [varName] });
        Output.addResult('descriptives', result, { variables: [varName] });
        if (_navigate) _navigate('output');
        return 'Ran Descriptives for **'+varName+'**. Results added to Output.';
      } catch(e) { return 'Error: '+e.message; }
    }},
    CREATE_PIE: { handler: (params, ds) => {
      if (!ds) return 'No dataset loaded.';
      const varName = params.variable;
      if (!varName) {
        if (_navigate) _navigate('graphs');
        return 'Opened Graph Builder. Please select a category variable for the pie chart.';
      }
      const v = ds.variables.find(x=>x.name===varName);
      if (!v) return 'Variable "'+varName+'" not found. Available: '+ds.variables.map(x=>x.name).join(', ');
      // Navigate to graphs and draw
      if (_navigate) _navigate('graphs');
      setTimeout(()=>{
        const area = document.getElementById('graph-canvas-area');
        if (!area) return;
        const allVals = ds.cases.map(r=>String(r[varName]!=null?r[varName]:'')).filter(Boolean);
        const catCount = {};
        allVals.forEach(val=>{ catCount[val]=(catCount[val]||0)+1; });
        const sorted = Object.entries(catCount).sort((a,b)=>b[1]-a[1]).slice(0,20);
        if (!sorted.length) return;
        const chartId = 'ai_pie_'+Date.now();
        area.innerHTML='';
        const wrapper = el('div',{class:'graph-output-wrap'});
        const titleEl = el('div',{class:'graph-title'},'Pie Chart: '+varName+' (AI)');
        const chartDiv = el('div',{id:chartId,class:'graph-chart'});
        wrapper.append(titleEl, chartDiv);
        area.appendChild(wrapper);
        Charts.pieChart(chartId, sorted.map(e=>e[0]), sorted.map(e=>e[1]), 'Pie: '+varName);
        setTimeout(()=>{
          const inst = typeof echarts !== 'undefined' ? echarts.getInstanceByDom(document.getElementById(chartId)) : null;
          if (inst) {
            ChartExportManager.register({ id:chartId, title:'Pie Chart: '+varName, chartType:'pie', instance:inst, sourceModule:'ai', metadata:{variable:varName} });
            wrapper.appendChild(ChartExportManager.buildToolbar(chartId));
          }
        }, 200);
      }, 300);
      return 'Creating pie chart for **'+varName+'**... Navigating to Graph Builder.';
    }},
    CREATE_HISTOGRAM: { handler: (params, ds) => {
      if (!ds) return 'No dataset loaded.';
      const varName = params.variable;
      if (!varName) { if (_navigate) _navigate('graphs'); return 'Opened Graph Builder. Select a numeric variable for histogram.'; }
      const v = ds.variables.find(x=>x.name===varName);
      if (!v || v.type!=='numeric') return 'Variable "'+varName+'" is not numeric. Histogram requires a numeric variable.';
      if (_navigate) _navigate('graphs');
      setTimeout(()=>{
        const area = document.getElementById('graph-canvas-area');
        if (!area) return;
        const vals = ds.cases.map(r=>r[varName]).filter(x=>typeof x==='number'&&isFinite(x));
        if (!vals.length) return;
        const chartId = 'ai_hist_'+Date.now();
        area.innerHTML='';
        const wrapper = el('div',{class:'graph-output-wrap'});
        wrapper.appendChild(el('div',{class:'graph-title'},'Histogram: '+varName+' (AI)'));
        const chartDiv = el('div',{id:chartId,class:'graph-chart'});
        wrapper.appendChild(chartDiv);
        area.appendChild(wrapper);
        Charts.histogram(chartId, vals, 'Histogram: '+varName, varName);
        setTimeout(()=>{
          const inst = typeof echarts !== 'undefined' ? echarts.getInstanceByDom(document.getElementById(chartId)) : null;
          if (inst) {
            ChartExportManager.register({ id:chartId, title:'Histogram: '+varName, chartType:'histogram', instance:inst, sourceModule:'ai', metadata:{variable:varName} });
            wrapper.appendChild(ChartExportManager.buildToolbar(chartId));
          }
        }, 200);
      }, 300);
      return 'Creating histogram for **'+varName+'**...';
    }},
    CREATE_BAR: { handler: (params, ds) => {
      if (!ds) return 'No dataset loaded.';
      const varName = params.variable;
      if (!varName) { if (_navigate) _navigate('graphs'); return 'Opened Graph Builder. Select a category variable for bar chart.'; }
      if (_navigate) _navigate('graphs');
      setTimeout(()=>{
        const area = document.getElementById('graph-canvas-area');
        if (!area) return;
        const cats = [...new Set(ds.cases.map(r=>String(r[varName]!=null?r[varName]:'')).filter(Boolean))].slice(0,30);
        const counts = cats.map(c=>ds.cases.filter(r=>String(r[varName]!=null?r[varName]:'')==c).length);
        const chartId = 'ai_bar_'+Date.now();
        area.innerHTML='';
        const wrapper = el('div',{class:'graph-output-wrap'});
        wrapper.appendChild(el('div',{class:'graph-title'},'Bar Chart: '+varName+' (AI)'));
        const chartDiv = el('div',{id:chartId,class:'graph-chart'});
        wrapper.appendChild(chartDiv);
        area.appendChild(wrapper);
        Charts.barChart(chartId, cats, counts, 'Frequencies: '+varName, varName);
        setTimeout(()=>{
          const inst = typeof echarts !== 'undefined' ? echarts.getInstanceByDom(document.getElementById(chartId)) : null;
          if (inst) {
            ChartExportManager.register({ id:chartId, title:'Bar Chart: '+varName, chartType:'bar', instance:inst, sourceModule:'ai', metadata:{variable:varName} });
            wrapper.appendChild(ChartExportManager.buildToolbar(chartId));
          }
        }, 200);
      }, 300);
      return 'Creating bar chart for **'+varName+'**...';
  }},
  OPEN_PROBABILITY_CALCULATOR: { handler: () => {
    ProbabilityCalcUI.open();
    return 'Opened Probability & Distributions Calculator.';
  }},
  CALCULATE_NORMAL_PROBABILITY: { handler: (params) => {
    const z = params.z;
    if (z == null || isNaN(z)) {
      ProbabilityCalcUI.open();
      return 'Opened Probability Calculator. Please enter a Z value.';
    }
    // Run calculation immediately
    const result = ProbabilityCalc.calculateNormal({ mode:'z', z, tailType:'left', method:'exact' });
    ProbabilityCalc.setLastResult(result);
    ProbabilityCalcUI.open(z);
    if (result.error) return `Error: ${result.error}`;
    return `**Normal Distribution: Z = ${z}**\n\n` +
      `P(Z ≤ ${z}) = ${result.probability.toFixed(7)} (${result.percentage.toFixed(4)}%)\n` +
      `P(Z > ${z}) = ${result.rightTail.toFixed(7)}\n` +
      `Two-tailed: ${(result.leftTail + result.rightTail).toFixed(7)}\n\n` +
      `*(Exact calculation — Probability Calculator opened with Z pre-filled)*`;
  }},
  STUDENT_T_CRITICAL: { handler: (params) => {
    StudentTUI.open();
    const { df, alpha, tail } = params;
    if (df == null || alpha == null) {
      return '**Student\'s t Distribution** — Calculator opened.\n\nPlease enter df and α in the "Find Critical t" tab.';
    }
    const r = StudentTCalc.criticalT({ df, alpha, tail: tail || 'two-tailed' });
    if (r.error) return `⚠ ${r.error}`;
    const dispVal = r.tail === 'two-tailed'
      ? `±${r.criticalValueAbs.toFixed(4)}`
      : r.criticalValue.toFixed(4);
    return `**Student's t — Critical value**\n\n` +
      `df = ${r.df} | α = ${r.alpha} | ${r.tail}\n` +
      `**t critical = ${dispVal}**\n` +
      (r.tableAvailable ? `Reference table (t Student): ${r.tableValue}\n` : 'Reference table: exact calculation used\n') +
      (r.tail === 'two-tailed' ? `(two-tailed → table α = ${r.tableAlpha})\n` : '') +
      `\n*(Student's t Distribution module opened)*`;
  }},
  STUDENT_T_PROBABILITY: { handler: (params) => {
    StudentTUI.open();
    const { df, t, tail } = params;
    if (df == null || t == null) {
      return '**Student\'s t Distribution** — Calculator opened.\n\nPlease enter df and t in the "Probability / p-value" tab.';
    }
    const r = StudentTCalc.probability({ df, t, tail: tail || 'two-tailed' });
    if (r.error) return `⚠ ${r.error}`;
    const tailLabel = { left: `P(T ≤ ${r.t})`, right: `P(T ≥ ${r.t})`, 'two-tailed': 'two-tailed p-value' }[r.tail];
    return `**Student's t — ${tailLabel}**\n\n` +
      `t = ${r.t} | df = ${r.df} | ${r.tail}\n` +
      `**p-value = ${r.pValue.toFixed(7)}** (${r.percentage.toFixed(4)}%)\n` +
      `P(T ≤ t) = ${r.leftTail.toFixed(7)} | P(T ≥ t) = ${r.rightTail.toFixed(7)}\n` +
      `\n*(Student's t Distribution module opened)*`;
  }},
  STUDENT_T_TEST: { handler: (params) => {
    StudentTUI.open();
    const { df, t, alpha, tail } = params;
    if (df == null || t == null || alpha == null) {
      return '**Student\'s t Distribution** — Calculator opened.\n\nPlease enter t, df, and α in the "Test t Statistic" tab.';
    }
    const r = StudentTCalc.testStatistic({ df, t, alpha, tail: tail || 'two-tailed' });
    if (r.error) return `⚠ ${r.error}`;
    const critDisp = r.tail === 'two-tailed' ? `±${r.tCriticalAbs.toFixed(4)}` : r.tCritical.toFixed(4);
    return `**Student's t — Hypothesis Test**\n\n` +
      `t observed = ${r.tObserved} | df = ${r.df} | α = ${r.alpha} | ${r.tail}\n` +
      `t critical = ${critDisp}\n` +
      `p-value = ${r.pValue.toFixed(7)}\n` +
      `**Decision: ${r.decision}**\n` +
      `\n*(Student's t Distribution module opened)*`;
  }},
  };

  function runAction(intentResult, ds) {
    const { action, params } = intentResult;
    const entry = AIActionRegistry[action];
    if (!entry) return null;
    return entry.handler(params, ds);
  }

  /* ── Rule-based response engine — no fabricated statistics ─── */
  function ruleBasedResponse(userMsg) {
    const msg = userMsg.toLowerCase();

    if (/hubungan|association|correlat|berhubungan|korelasi/.test(msg)) {
      if (/nominal|kategorik|kategorikal|categorical/.test(msg))
        return 'Untuk menguji hubungan antara dua variabel **nominal/kategorikal**, gunakan **Crosstabs** dengan Chi-Square (Pearson). Jika tabel 2×2, Fisher Exact juga tersedia.\n\nSyarat: Expected count ≥ 5 di minimal 80% sel.';
      if (/ordinal/.test(msg))
        return 'Untuk hubungan antara variabel **ordinal**, gunakan **Spearman** atau **Kendall\'s tau** dari menu Analyze → Correlation.';
      return 'Untuk hubungan antara dua variabel **skala/numerik**, gunakan **Pearson Correlation** jika asumsi linearitas terpenuhi. Untuk non-parametrik, gunakan Spearman.\n\nPenting: Korelasi ≠ kausalitas.';
    }

    if (/perbedaan|beda|difference|compare|bandingkan/.test(msg)) {
      if (/dua kelompok|two group|independent/.test(msg))
        return 'Untuk membandingkan **dua kelompok independen** (misal: laki-laki vs perempuan), gunakan **Independent Samples T-Test**.\n\nPeriksa:\n• Levene\'s Test (kesamaan varians)\n• Jika signifikan → gunakan Welch correction\n• Normalitas (untuk n kecil)';
      if (/lebih dari dua|more than two|beberapa kelompok|multiple group/.test(msg))
        return 'Untuk **lebih dari dua kelompok**, gunakan **One-Way ANOVA**.\n\nTambahkan:\n• Levene\'s Test untuk homogenitas varians\n• Post Hoc (Tukey/Bonferroni) jika ANOVA signifikan';
      if (/sebelum.*sesudah|pre.*post|paired|berpasangan/.test(msg))
        return 'Untuk dua pengukuran **pada subjek yang sama** (pre-post), gunakan **Paired-Samples T-Test**.';
    }

    if (/reliabilit|cronbach|konsistensi|alpha/.test(msg))
      return 'Untuk mengukur **reliabilitas skala Likert**, gunakan **Reliability Analysis (Cronbach\'s Alpha)**.\n\nInterpretasi α:\n• α ≥ 0.9 = Excellent\n• α ≥ 0.8 = Good\n• α ≥ 0.7 = Acceptable\n• α ≥ 0.6 = Questionable\n• α < 0.6 = Poor\n\nPeriksa "Alpha if Item Deleted" untuk mengidentifikasi item bermasalah. Jangan hapus item otomatis — pertimbangkan konten substantif.';

    if (/faktor|factor analysis|konstruk|dimensi/.test(msg))
      return 'Untuk **exploratory factor analysis**, gunakan Analyze → Factor Analysis.\n\nLangkah:\n1. Periksa KMO ≥ 0.6 dan Bartlett\'s Test signifikan\n2. Ekstraksi: PCA atau PAF\n3. Rotasi: Varimax (faktor independen)\n4. Interpretasi loading ≥ 0.4 atau 0.5\n\nPerhatian: PCA ≠ Common Factor Analysis.';

    if (/regresi|regression|prediksi|predict/.test(msg)) {
      if (/logistik|logistic|biner|binary/.test(msg))
        return 'Untuk **variabel dependen biner** (0/1), gunakan **Binary Logistic Regression**.\n\nOutput penting:\n• B = koefisien log-odds\n• Exp(B) = Odds Ratio\n• Nagelkerke R² (pseudo R²)\n• Classification Table\n\nPeringatan: Logistic regression mengukur asosiasi, bukan sebab-akibat.';
      return 'Untuk **memprediksi variabel kontinu**, gunakan **Linear Regression**.\n\nPeriksa asumsi:\n• Linearitas (scatterplot residu vs predicted)\n• Homoskedastisitas\n• Normalitas residu (diagnostic, bukan syarat mutlak)\n• Tidak ada multikolinearitas (VIF < 10)\n• Durbin-Watson ~2 (tidak ada autokorelasi)\n\nPeringatan: Regresi signifikan ≠ kausalitas.';
    }

    if (/non.?parametr|nonparam|mann.?whit|wilcoxon|kruskal|friedman/.test(msg))
      return 'Gunakan **uji non-parametrik** ketika:\n• Distribusi sangat tidak normal dengan n kecil\n• Variabel ordinal\n• Asumsi parametrik tidak terpenuhi\n\nAlternatif:\n• t-test independen → **Mann-Whitney U**\n• t-test berpasangan → **Wilcoxon Signed-Rank**\n• ANOVA → **Kruskal-Wallis H**\n• ANOVA repeated → **Friedman**';

    if (/missing|hilang|kosong/.test(msg))
      return 'SOCIOSTAT mendukung:\n• **Listwise deletion**: kasus dengan missing di variabel mana pun dihapus dari analisis\n• **Pairwise deletion**: untuk korelasi, hanya pasangan tanpa missing yang digunakan\n• **User-defined missing**: definisikan kode missing di Variable View\n\nPenting: Jangan replace missing dengan mean tanpa alasan teoritis.';

    if (/skala|likert|ordinal|measurement level/.test(msg))
      return 'Dalam SOCIOSTAT, **Measurement Level** memengaruhi validasi prosedur:\n• **Nominal**: Chi-Square, frekuensi, crosstabs\n• **Ordinal**: Spearman, Mann-Whitney, Kruskal-Wallis, Friedman\n• **Scale**: Mean, SD, t-test, ANOVA, Pearson, Regression\n\nSkala Likert: perdebatan akademis. Banyak peneliti memperlakukan Likert 5-7 point sebagai kontinu (scale) untuk kemudahan, tetapi pendekatan ordinal lebih konservatif secara statistik.';

    if (/kausalitas|causality|causation|sebab|menyebabkan/.test(msg))
      return '⚠ **Penting**: Analisis statistik observasional (korelasi, regresi) **tidak membuktikan kausalitas**.\n\nKausalitas membutuhkan:\n• Eksperimental design (randomisasi)\n• Temporal precedence (sebab mendahului akibat)\n• Mekanisme yang masuk akal\n• Eliminasi confounders\n\nPertanyaan yang tepat: "Apakah variabel X berasosiasi dengan Y?" bukan "Apakah X menyebabkan Y?"';

    if (/ukuran sampel|sample size|power|n minimal/.test(msg))
      return 'Ukuran sampel minimum (panduan umum):\n• Korelasi: n ≥ 30 untuk estimasi yang stabil\n• T-test: n ≥ 20 per kelompok\n• ANOVA: n ≥ 20 per kelompok\n• Regresi: n ≥ 10–20 per prediktor\n• Factor Analysis: n ≥ 5–10 per variabel, minimum n ≥ 100\n• Chi-Square: expected count ≥ 5 di ≥ 80% sel\n\nGunakan power analysis formal untuk penelitian yang dipublikasikan.';

    if (/effect size|ukuran efek|cohen|eta|omega/.test(msg))
      return 'Effect size mengukur **besarnya praktis** suatu efek, berbeda dari signifikansi statistik:\n\n• Cohen\'s d: kecil=0.2, sedang=0.5, besar=0.8\n• r (korelasi): kecil=0.1, sedang=0.3, besar=0.5\n• η² (ANOVA): kecil=0.01, sedang=0.06, besar=0.14\n• Cramér\'s V: bergantung pada df\n\nP < .05 dengan n besar ≠ efek penting secara praktis.';

    if (/outlier|pencilan/.test(msg))
      return 'Penanganan outlier:\n• Identifikasi: Z-score > ±3, boxplot, Cook\'s distance > 1\n• Jangan hapus outlier secara otomatis\n• Pertimbangkan: apakah data entry error? apakah kasus valid?\n• Lakukan analisis dengan dan tanpa outlier, laporkan keduanya\n• Untuk regresi: Cook\'s distance dan leverage tersedia di output diagnostics';

    if (/z.?score|distribusi normal|normal distribusi|probabilit|peluang.*z|z.*peluang/.test(msg)) {
      const zMatch = msg.match(/z\s*[=:]\s*([-\d.]+)/);
      if (zMatch) {
        const z = parseFloat(zMatch[1]);
        const r = ProbabilityCalc.calculateNormal({ mode:'z', z, tailType:'left', method:'exact' });
        if (!r.error) {
          return `**Normal Distribution: Z = ${z}**\n\n` +
            `P(Z ≤ ${z}) = ${r.probability.toFixed(7)} (${r.percentage.toFixed(4)}%)\n` +
            `P(Z > ${z}) = ${r.rightTail.toFixed(7)}\n` +
            `Two-tailed p = ${(r.leftTail + r.rightTail).toFixed(7)}\n\n` +
            `Gunakan **Analyze → Probability & Distributions → Probability Calculator** untuk visualisasi interaktif dan kalkulasi lebih lanjut.`;
        }
      }
      return 'Gunakan **Analyze → Probability & Distributions → Probability Calculator** untuk:\n• Menghitung P(Z ≤ z), P(Z > z), P(z₁ < Z < z₂)\n• Konversi nilai X ke Z-score\n• Menemukan Z kritis dari probabilitas\n• Menghitung p-value dari Z\n• Melihat visualisasi kurva normal dengan daerah yang diarsir\n\nContoh: P(Z ≤ 1.96) ≈ 0.9750 (97.50%)';
    }

    if (/halo|hello|hi|selamat|apa kabar/.test(msg))
      return 'Halo! Saya adalah **AI Assistant SOCIOSTAT** — asisten statistik berbasis aturan.\n\nSaya dapat membantu:\n• Memilih prosedur statistik yang tepat\n• Menjelaskan asumsi dan interpretasi\n• Membimbing alur penelitian\n• Mengidentifikasi potensi masalah dalam data\n\nApa yang ingin Anda analisis?';

    if (/apa itu|what is|jelaskan|explain/.test(msg)) {
      if (/cronbach/.test(msg)) return 'Cronbach\'s Alpha (α) adalah ukuran **internal consistency reliability** — seberapa konsisten responden menjawab item-item dalam skala yang mengukur konstruk yang sama. Nilainya 0–1; ≥ 0.7 umumnya dianggap acceptable.';
      if (/kmo/.test(msg)) return 'KMO (Kaiser-Meyer-Olkin) mengukur kecukupan sampling untuk factor analysis. Nilai ≥ 0.6 = adequate, ≥ 0.8 = meritorious, ≥ 0.9 = marvelous. Nilai < 0.5 = tidak layak untuk factor analysis.';
      if (/vif|multikolinear/.test(msg)) return 'VIF (Variance Inflation Factor) mengukur multikolinearitas dalam regresi berganda. VIF > 10 = masalah serius. VIF 5–10 = perhatian. VIF < 5 = acceptable. Multikolinearitas tinggi membuat koefisien tidak stabil.';
    }

    if (/prosedur|pilih.*uji|uji.*apa|bantu.*pilih/.test(msg))
      return 'Untuk memilih prosedur yang tepat, saya perlu tahu:\n\n1. **Berapa variabel** yang terlibat?\n2. **Apa tipe masing-masing?** (nominal/ordinal/scale)\n3. **Apa yang ingin diketahui?**\n   • Hubungan antara variabel → Korelasi/Regresi\n   • Perbedaan antar kelompok → T-test/ANOVA\n   • Distribusi frekuensi → Crosstabs/Chi-Square\n   • Kualitas skala → Reliabilitas/Factor Analysis';

    return 'Saya memahami pertanyaan Anda tentang statistik. Untuk mendapatkan bantuan yang lebih spesifik, bisa Anda ceritakan:\n\n1. **Apa pertanyaan penelitian Anda?**\n2. **Variabel apa yang Anda punya?** (jenis: nominal/ordinal/scale)\n3. **Apa yang ingin Anda ketahui?** (perbedaan, hubungan, prediksi?)\n\nSaya akan membantu memilih prosedur yang tepat dan menjelaskan asumsi yang perlu dipenuhi.';
  }

  async function callAPI(messages) {
    if (_provider === 'none' || !_apiKey) return null;

    const ds = AppState.get('activeDataset');
    const context = ds ? `Dataset aktif: "${ds.name}" (${ds.cases.length} kasus, ${ds.variables.length} variabel: ${ds.variables.slice(0,5).map(v=>v.name).join(', ')}${ds.variables.length>5?'...':''})` : 'Tidak ada dataset aktif.';

    const systemPrompt = `Anda adalah asisten statistik SOCIOSTAT untuk mahasiswa sosiologi dan peneliti ilmu sosial.

Aturan WAJIB:
1. JANGAN pernah mengarang angka statistik, nilai p, koefisien, atau hasil analisis.
2. Angka statistik hanya boleh dikutip dari output nyata yang diberikan user.
3. Anda boleh menjelaskan, menginterpretasi, dan memberi rekomendasi prosedur.
4. Selalu bedakan asosiasi statistik vs kausalitas.
5. Selalu pertimbangkan ukuran sampel dan effect size, bukan hanya signifikansi.
6. Jawab dalam Bahasa Indonesia kecuali user meminta bahasa lain.

${context}`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      let url, headers, body;
      if (_provider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions';
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_apiKey}` };
        body = JSON.stringify({ model: 'gpt-4o-mini', messages: apiMessages, max_tokens: 800, temperature: 0.3 });
      } else if (_provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages';
        headers = { 'Content-Type': 'application/json', 'x-api-key': _apiKey, 'anthropic-version': '2023-06-01' };
        body = JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 800, system: systemPrompt, messages: messages.filter(m=>m.role!=='system').map(m=>({role:m.role,content:m.content})) });
      }
      const res = await fetch(url, { method:'POST', headers, body });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (_provider === 'openai') return data.choices?.[0]?.message?.content;
      if (_provider === 'anthropic') return data.content?.[0]?.text;
    } catch(e) { return null; }
  }

  function render() {
    if (!_container) return;
    _container.innerHTML = '';
    _container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    const lang = I18N.getLang();

    // API settings panel
    const settings = el('div', { class:'ai-settings' },
      el('h4', {}, lang==='id' ? 'Pengaturan AI (Opsional)' : 'AI Settings (Optional)'),
      el('p', { class:'muted small' }, lang==='id'
        ? 'Secara default, mesin berbasis aturan digunakan. Opsional: masukkan API key untuk GPT-4 atau Claude.'
        : 'By default, a rule-based engine is used. Optionally provide an API key for GPT-4 or Claude.'),
      el('div', { class:'form-row' },
        el('label', {}, 'Provider: '),
        el('select', { class:'form-control', id:'ai-provider', onchange: e=>{ _provider=e.target.value; } },
          el('option', { value:'none' }, lang==='id' ? 'Berbasis Aturan (default)' : 'Rule-based (default)'),
          el('option', { value:'openai' }, 'OpenAI (GPT-4o-mini)'),
          el('option', { value:'anthropic' }, 'Anthropic (Claude Haiku)')
        )
      ),
      el('div', { class:'form-row', id:'ai-key-row' },
        el('label', {}, 'API Key: '),
        el('input', { type:'password', class:'form-control', id:'ai-key-input', placeholder:'sk-... or similar', onchange: e=>{ _apiKey=e.target.value; } })
      )
    );

    const chatArea = el('div', { class:'ai-chat-area', id:'ai-chat-area' });
    _messages.forEach(m => chatArea.appendChild(renderMsg(m)));

    if (_messages.length === 0) {
      const quickChips = lang === 'id'
        ? [
            { label:'📊 Statistik Deskriptif', msg:'jalankan deskriptif untuk semua variabel' },
            { label:'🔗 Korelasi Variabel',     msg:'jalankan korelasi' },
            { label:'📈 Buat Grafik',           msg:'buka grafik' },
            { label:'❓ Bantu Pilih Uji',       msg:'bantu saya memilih prosedur statistik yang tepat' },
            { label:'📋 Frekuensi Data',        msg:'tampilkan frekuensi' },
            { label:'⚠️ Masalah Kausalitas',    msg:'jelaskan perbedaan asosiasi dan kausalitas' }
          ]
        : [
            { label:'📊 Descriptive Stats',    msg:'run descriptives for all variables' },
            { label:'🔗 Correlations',         msg:'run correlation' },
            { label:'📈 Build a Chart',        msg:'open graphs' },
            { label:'❓ Choose a Test',        msg:'help me choose the right statistical procedure' },
            { label:'📋 Frequencies',          msg:'show frequencies' },
            { label:'⚠️ Causality Warning',    msg:'explain the difference between association and causality' }
          ];

      chatArea.appendChild(el('div', { class:'ai-welcome' },
        el('h3', { class:'ai-recs-header' }, 'SOCIOSTAT AI Assistant'),
        el('p', {}, lang==='id'
          ? 'Saya dapat membantu memilih prosedur statistik, memahami asumsi, menginterpretasi output, dan menjalankan analisis langsung!'
          : 'I can help choose statistical procedures, explain assumptions, interpret output, and run analyses directly!'),
        el('div', { class:'ai-suggestions' },
          ...quickChips.map(c => el('button', { class:'ai-suggestion-chip', onclick:()=>sendMsg(c.msg) }, c.label))
        )
      ));
    }

    const inputArea = el('div', { class:'ai-input-area' });
    const input = el('textarea', { class:'ai-input',
      placeholder: lang==='id' ? 'Tanyakan tentang statistik, atau ketik perintah seperti "jalankan korelasi"...' : 'Ask about statistics, or type a command like "run correlation"...',
      rows:'2' });
    const sendBtn = el('button', { class:'btn btn-primary', onclick:()=>{ if(input.value.trim()){ sendMsg(input.value.trim()); input.value=''; } } },
      lang==='id' ? 'Kirim' : 'Send');
    input.onkeydown = e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendBtn.click(); } };
    const clearBtn = el('button', { class:'btn btn-sm btn-secondary', onclick:()=>{ _messages=[]; render(); } },
      lang==='id' ? 'Bersihkan' : 'Clear');
    inputArea.append(input, sendBtn, clearBtn);

    _container.appendChild(settings);
    _container.appendChild(chatArea);
    _container.appendChild(inputArea);
  }

  function renderMsg(m) {
    const div = el('div', { class:`ai-msg ai-msg-${m.role}` });
    const lang = I18N.getLang();
    const label = el('span', { class:'ai-msg-label' }, m.role==='user' ? (lang==='id'?'Anda':'You') : 'Assistant');
    const text = el('div', { class:'ai-msg-text' });
    if (m.isAction) {
      // Render structured action result
      text.innerHTML = m.content;
    } else {
      text.innerHTML = (m.content || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\n/g,'<br>');
    }
    div.append(label, text);
    return div;
  }

  function buildActionHtml(actionKey, resultText, lang) {
    const actionLabels = {
      OPEN_DATA:            { en:'Opened Data Editor',            id:'Membuka Editor Data' },
      OPEN_OUTPUT:          { en:'Opened Output Viewer',          id:'Membuka Output Viewer' },
      OPEN_ANALYZE:         { en:'Opened Analyze module',         id:'Membuka modul Analyze' },
      OPEN_GRAPHS:          { en:'Opened Graph Builder',          id:'Membuka Graph Builder' },
      OPEN_TRANSFORM:       { en:'Opened Transform module',       id:'Membuka modul Transform' },
      RUN_FREQUENCIES:      { en:'Ran Frequencies analysis',      id:'Menjalankan analisis Frekuensi' },
      RUN_DESCRIPTIVES:     { en:'Ran Descriptive Statistics',    id:'Menjalankan Statistik Deskriptif' },
      RUN_DESCRIPTIVES_VAR: { en:'Ran Descriptive Statistics',    id:'Menjalankan Statistik Deskriptif' },
      RUN_CORRELATION:      { en:'Ran Pearson Correlation',       id:'Menjalankan Korelasi Pearson' },
      CREATE_PIE:           { en:'Created Pie Chart',             id:'Membuat Diagram Pie' },
      CREATE_HISTOGRAM:     { en:'Created Histogram',             id:'Membuat Histogram' },
      CREATE_BAR:           { en:'Created Bar Chart',             id:'Membuat Diagram Batang' }
    };
    const nextSteps = {
      OPEN_DATA:        { en:'Edit variables or review cases.',                id:'Edit variabel atau tinjau kasus.' },
      OPEN_OUTPUT:      { en:'Review your analysis results.',                  id:'Tinjau hasil analisis Anda.' },
      OPEN_ANALYZE:     { en:'Select a procedure from the list.',              id:'Pilih prosedur dari daftar.' },
      OPEN_GRAPHS:      { en:'Choose a chart type and select variables.',      id:'Pilih jenis grafik dan variabel.' },
      OPEN_TRANSFORM:   { en:'Compute new variables or recode values.',        id:'Hitung variabel baru atau recode nilai.' },
      RUN_FREQUENCIES:  { en:'Check the Output tab for results. Look for modal category and valid percent.',  id:'Cek tab Output untuk hasil. Perhatikan kategori modus dan persen valid.' },
      RUN_DESCRIPTIVES: { en:'Check means and standard deviations in Output. Assess range for outliers.',    id:'Cek rata-rata dan standar deviasi di Output. Nilai range bisa mengindikasikan outlier.' },
      RUN_CORRELATION:  { en:'Check Output for r values and significance. Remember: correlation ≠ causation.', id:'Cek Output untuk nilai r dan signifikansi. Ingat: korelasi ≠ kausalitas.' }
    };
    const lbl = (actionLabels[actionKey]||{})[lang] || actionKey;
    const nxt = (nextSteps[actionKey]||{})[lang] || '';
    const whatLabel = lang==='id' ? '🎯 Yang saya lakukan:' : '🎯 What I did:';
    const nextLabel = lang==='id' ? '💡 Langkah berikutnya:' : '💡 Next step:';
    return `<div class="ai-action-result"><div class="ai-action-what">${whatLabel} ${lbl}</div><div class="ai-action-next">${nextLabel} ${nxt}</div></div>`;
  }

  async function sendMsg(text) {
    const lang = I18N.getLang();
    _messages.push({ role:'user', content:text });
    render();
    scrollChatBottom();

    const ds = AppState.get('activeDataset');
    const intent = detectIntent(text, ds);

    let response, isAction = false;
    if (intent) {
      const actionResult = runAction(intent, ds);
      if (actionResult !== null) {
        isAction = true;
        response = buildActionHtml(intent.action, actionResult, lang);
        // Re-render since navigation may have changed the view
        setTimeout(()=>{ render(); scrollChatBottom(); }, 100);
      }
    }

    if (!isAction) {
      if (_provider !== 'none' && _apiKey) {
        const chatArea = document.getElementById('ai-chat-area');
        const typing = el('div', { class:'ai-msg ai-msg-assistant' }, el('span', {}, '…'));
        if (chatArea) chatArea.appendChild(typing);
        response = await callAPI(_messages);
        if (!response) response = ruleBasedResponse(text);
      } else {
        response = ruleBasedResponse(text);
      }
    }

    _messages.push({ role:'assistant', content:response, isAction });
    render();
    scrollChatBottom();
  }

  function scrollChatBottom() {
    setTimeout(() => {
      const a = document.getElementById('ai-chat-area');
      if (a) a.scrollTop = a.scrollHeight;
    }, 50);
  }

  function init(container) { _container = container; }

  return { init, render, setNavigateFn };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 15: HISTORY MODULE
   ══════════════════════════════════════════════════════════════════ */
