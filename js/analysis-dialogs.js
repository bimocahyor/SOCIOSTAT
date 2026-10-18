const AnalysisDialogs = (() => {
  /**
   * Variable list picker — in-place DOM updates, scroll and focus preserved.
   *
   * Supports:
   *   - Single-click select / Ctrl+click toggle / Shift+click range
   *   - Ctrl+A / Cmd+A to select all eligible variables (multi only)
   *   - Ineligible variables shown in a collapsed "Unavailable" section
   *
   * Parameters:
   *   dataset    — active dataset
   *   selected   — mutable array of selected variable names
   *   multi      — allow multi-select (default true)
   *   onChange   — called with [...selected] on every change
   *   filterFn   — optional extra predicate (kept for backward compat)
   *   procedure  — optional procedure id for eligibility service
   *   role       — optional role ('dependent','independent','item','any')
   */
  function varList(dataset, selected, multi=true, onChange, filterFn, procedure, role) {
    // Build eligibility data when procedure is specified
    let eligMap = null; // Map<varName, {eligible, reason, stats}>
    if (procedure && typeof AnalysisEligibility !== 'undefined') {
      const list = AnalysisEligibility.getEligibleVariables(dataset, procedure, role || 'any');
      eligMap = new Map(list.map(e => [e.varDef.name, e]));
    }

    // Visible variable list (respects filterFn for backward-compat + visibility)
    const allVis = dataset.variables.filter(v => v.visibility !== false);
    const vars = filterFn ? allVis.filter(filterFn) : allVis;

    // Partition into eligible and unavailable
    const eligibleVars   = eligMap ? vars.filter(v => eligMap.get(v.name)?.eligible !== false) : vars;
    const unavailableVars = eligMap ? vars.filter(v => eligMap.get(v.name)?.eligible === false) : [];

    const box=el('div',{class:'var-list',tabIndex:'0'});
    let _lastClickIdx=-1; // for Shift+click range (within eligible section)

    function _isSel(vname) {
      return Array.isArray(selected)?selected.includes(vname):(selected===vname);
    }

    function _updateItemEl(item, vname) {
      const isSel=_isSel(vname);
      item.classList.toggle('selected',isSel);
      const chk=item.querySelector('.var-item-chk');
      if (chk) chk.textContent=isSel?'✓':'';
    }

    function _toggleOne(vname, isSel) {
      if (multi) {
        const idx=selected.indexOf(vname);
        if (isSel && idx>-1) selected.splice(idx,1);
        else if (!isSel) selected.push(vname);
      } else {
        selected.length=0;
        if (!isSel) selected.push(vname);
      }
    }

    // Build stat label for an eligible variable
    function _statLabel(v) {
      if (!eligMap) return '';
      const e = eligMap.get(v.name);
      if (!e) return '';
      const s = e.stats;
      if (s.total === 0) return '';
      return ` — ${s.valid} valid`;
    }

    eligibleVars.forEach((v,vi)=>{
      const isSel=_isSel(v.name);
      const item=el('div',{class:`var-item${isSel?' selected':''}`},
        el('span',{class:'var-item-chk'},isSel?'✓':''),
        el('span',{class:`var-type var-type-${v.type}`},v.type[0].toUpperCase()),
        el('span',{class:'var-name'},v.name),
        el('span',{class:'var-label muted'},v.label?` — ${v.label}`:''),
        el('span',{class:'var-stat muted'},_statLabel(v))
      );
      item.dataset.vn=v.name;
      item.dataset.vi=String(vi);
      item.dataset.eligible='1';

      item.addEventListener('click',e=>{
        const scrollTop=box.scrollTop;
        const wasSel=_isSel(v.name);
        if (multi && e.shiftKey && _lastClickIdx>=0) {
          const lo=Math.min(vi,_lastClickIdx), hi=Math.max(vi,_lastClickIdx);
          for (let k=lo;k<=hi;k++) {
            const vk=eligibleVars[k];
            if (!selected.includes(vk.name)) selected.push(vk.name);
          }
        } else if (multi && (e.ctrlKey||e.metaKey)) {
          _toggleOne(v.name, wasSel);
          _lastClickIdx=vi;
        } else {
          _toggleOne(v.name, wasSel);
          _lastClickIdx=vi;
        }
        $$('.var-item',box).forEach(it=>{ _updateItemEl(it, it.dataset.vn); });
        box.scrollTop=scrollTop;
        onChange && onChange([...selected]);
      });

      box.appendChild(item);
    });

    // Ctrl+A / Cmd+A — select all ELIGIBLE variables only
    box.addEventListener('keydown',e=>{
      if (multi && (e.ctrlKey||e.metaKey) && (e.key==='a'||e.key==='A')) {
        e.preventDefault();
        const scrollTop=box.scrollTop;
        eligibleVars.forEach(v=>{ if(!selected.includes(v.name)) selected.push(v.name); });
        $$('.var-item',box).forEach(it=>{ _updateItemEl(it,it.dataset.vn); });
        box.scrollTop=scrollTop;
        onChange && onChange([...selected]);
      }
    });

    if (!eligibleVars.length) {
      box.appendChild(el('div',{class:'var-list-empty'},'No compatible variables'));
    }

    // Unavailable variables section (collapsed by default)
    if (unavailableVars.length > 0) {
      const details = el('details',{class:'var-list-unavailable'});
      const summary = el('summary',{class:'var-list-unavailable-hdr'},
        `${unavailableVars.length} unavailable variable${unavailableVars.length!==1?'s':''}`
      );
      details.appendChild(summary);
      unavailableVars.forEach(v=>{
        const e = eligMap.get(v.name);
        const reason = e ? e.reason : 'Ineligible';
        const item=el('div',{class:'var-item var-item-unavailable'},
          el('span',{class:'var-item-chk'},''),
          el('span',{class:`var-type var-type-${v.type}`},v.type[0].toUpperCase()),
          el('span',{class:'var-name'},v.name),
          el('span',{class:'var-reason muted'},` — ${reason}`)
        );
        item.title = reason;
        details.appendChild(item);
      });
      box.appendChild(details);
    }

    return box;
  }

  // WHY_PANELS: contextual explanations for each procedure
  const WHY_PANELS = {
    'Frequencies':               { why: 'Shows how often each value appears. Use for categorical or nominal variables to understand distribution.', when: 'Any variable — start here to understand your data.', alt: null },
    'Descriptives':              { why: 'Summarises continuous (scale) variables with mean, SD, min, max, skewness.', when: 'Scale variables only.', alt: null },
    'Crosstabs':                 { why: 'Tests whether two categorical variables are statistically independent.', when: 'Both variables are nominal or ordinal.', alt: 'Fisher exact test (automatic for 2×2 tables).' },
    'Bivariate Correlations':    { why: 'Measures the linear association between two numeric variables. r = 0 means no linear association; r = ±1 means perfect linear association.', when: 'Both variables are scale (interval/ratio).', alt: 'Spearman correlation if normality is violated or variables are ordinal.' },
    'One-Sample T-Test':         { why: 'Tests whether the mean of a variable differs from a specified hypothetical value.', when: 'One continuous variable; known test value.', alt: null },
    'Independent Samples T-Test':{ why: 'Tests whether two independent groups have different means on a continuous variable.', when: '1 continuous outcome + 1 binary grouping variable.', alt: 'Mann-Whitney U if normality is severely violated.' },
    'Paired Samples T-Test':     { why: 'Tests whether the mean difference between two related measurements is zero.', when: 'Two measurements on the same subjects (pre/post).', alt: 'Wilcoxon Signed-Rank if normality violated.' },
    'One-Way ANOVA':             { why: 'Tests whether three or more independent groups have different means.', when: '1 continuous outcome + 1 grouping variable with ≥3 groups.', alt: 'Kruskal-Wallis H if normality/homogeneity violated.' },
    'Linear Regression':         { why: 'Models the relationship between a continuous outcome and one or more predictors. Produces B (unstandardised) and Beta (standardised) coefficients.', when: 'Continuous outcome variable; scale or dummy-coded predictors.', alt: 'Logistic regression if outcome is binary.' },
    'Binary Logistic Regression':{ why: 'Models the log-odds of a binary outcome (0/1) as a linear function of predictors. Exp(B) = odds ratio.', when: 'Binary (0/1) outcome variable.', alt: null },
    "Reliability Analysis (Cronbach's α)": { why: "Measures internal consistency — whether scale items all measure the same construct.", when: 'Multiple Likert items that together form a scale.', alt: null },
    'Factor Analysis':           { why: 'Identifies latent factors behind a set of observed variables. Reduces many items to fewer underlying dimensions.', when: 'Multiple scale variables; KMO ≥ 0.6; Bartlett p < .05.', alt: null },
    'Nonparametric Tests':       { why: 'Distribution-free alternatives to parametric tests. Use when assumptions of normality are severely violated or variables are ordinal.', when: 'Ordinal data or severely non-normal distributions.', alt: null },
    'K-Means Cluster Analysis':  { why: 'Partitions cases into k clusters based on similarity. Cluster membership is not ground truth — try multiple k values.', when: 'Multiple continuous variables; exploratory classification.', alt: null },
    'Kaplan-Meier Survival':     { why: 'Estimates survival curves showing the proportion of subjects surviving beyond each time point.', when: 'Time-to-event data with a censoring indicator.', alt: null },
  };

  function mkDialog(title, body, onRun) {
    const overlay=el('div',{class:'dialog-overlay'});
    const box=el('div',{class:'dialog-box analysis-dialog'});
    box.appendChild(el('div',{class:'dialog-header'},
      el('h3',{},title),
      el('button',{class:'dialog-close',onclick:()=>overlay.remove()},'×')
    ));

    // Build dialog body with optional Why panel in Simple mode
    const dialogBody = el('div',{class:'dialog-body'});
    const wp = WHY_PANELS[title];
    if (wp && typeof _appMode !== 'undefined' && _appMode === 'simple') {
      dialogBody.appendChild(el('div',{class:'why-panel'},
        el('div',{class:'why-panel-title'},'ⓘ Why this test?'),
        el('p',{},wp.why),
        el('p',{class:'alt'},`When to use: ${wp.when}`),
        wp.alt ? el('p',{class:'alt'},`Alternative: ${wp.alt}`) : null
      ));
    }
    dialogBody.appendChild(body);
    box.appendChild(dialogBody);

    box.appendChild(el('div',{class:'dialog-footer'},
      el('button',{class:'btn btn-primary',onclick:()=>{
        const ok=onRun(); if(ok!==false)overlay.remove();
      }},'▶ Run'),
      el('button',{class:'btn btn-secondary',onclick:()=>overlay.remove()},'Cancel')
    ));
    overlay.appendChild(box); document.body.appendChild(overlay);
    return overlay;
  }

  function getDataset() {
    return AppState.get('activeDataset');
  }

  // ── Frequencies ────────────────────────────────────────────────
  function openFrequencies() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const sel=[];
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},
        el('label',{},'Variables:'),
        varList(ds,sel,true,()=>{},null,'frequencies')
      )
    );
    mkDialog('Frequencies',body,()=>{
      if(!sel.length){notify('Select at least one variable','warning');return false;}
      runAnalysis('frequencies',{variables:sel});
    });
  }

  // ── Descriptives ───────────────────────────────────────────────
  function openDescriptives() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const sel=[];
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},
        el('label',{},'Variables (numeric/scale):'),
        varList(ds,sel,true,()=>{},null,'descriptives')
      )
    );
    mkDialog('Descriptives',body,()=>{
      if(!sel.length){notify('Select at least one variable','warning');return false;}
      runAnalysis('descriptives',{variables:sel});
    });
  }

  // ── Crosstabs ──────────────────────────────────────────────────
  function openCrosstabs() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const rowVar=[],colVar=[];
    const chkChi=el('input',{type:'checkbox',checked:true}); const chkPhi=el('input',{type:'checkbox',checked:true});
    const chkFisher=el('input',{type:'checkbox'}); const chkLambda=el('input',{type:'checkbox'});
    const body=el('div',{class:'analysis-form two-col'},
      el('div',{class:'form-section'},el('label',{},'Row variable:'),varList(ds,rowVar,false,()=>{},null,'crosstabs')),
      el('div',{class:'form-section'},el('label',{},'Column variable:'),varList(ds,colVar,false,()=>{},null,'crosstabs')),
      el('div',{class:'form-section wide'},el('label',{},'Statistics:'),
        el('div',{class:'check-group'},
          el('label',{},chkChi,' Chi-Square'),
          el('label',{},chkPhi,' Phi & Cramér\'s V'),
          el('label',{},chkFisher,' Fisher Exact'),
          el('label',{},chkLambda,' Lambda')
        )
      )
    );
    mkDialog('Crosstabs',body,()=>{
      if(!rowVar[0]||!colVar[0]){notify('Select row and column variables','warning');return false;}
      runAnalysis('crosstabs',{row_variable:rowVar[0],column_variable:colVar[0],
        statistics:{chi_square:chkChi.checked,phi_cramer:chkPhi.checked,fisher_exact:chkFisher.checked}});
    });
  }

  // ── Correlation ────────────────────────────────────────────────
  function openCorrelation() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const sel=[];
    const methodSel=el('select',{class:'form-control'},
      el('option',{value:'pearson'},'Pearson'),
      el('option',{value:'spearman'},'Spearman'),
      el('option',{value:'kendall'},'Kendall\'s tau')
    );
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},el('label',{},'Variables:'),varList(ds,sel,true,()=>{},null,'correlation')),
      el('div',{class:'form-row'},el('label',{},'Method: '),methodSel)
    );
    mkDialog('Bivariate Correlations',body,()=>{
      if(sel.length<2){notify('Select at least 2 variables','warning');return false;}
      runAnalysis('correlation',{variables:sel,method:methodSel.value});
    });
  }

  // ── One-Sample T-Test ──────────────────────────────────────────
  function openOneSampleT() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const sel=[];
    const testVal=el('input',{type:'number',class:'form-control',value:'0',step:'any'});
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},el('label',{},'Test variable(s):'),varList(ds,sel,true,()=>{},null,'ttest_onesample')),
      el('div',{class:'form-row'},el('label',{},'Test value: '),testVal)
    );
    mkDialog('One-Sample T-Test',body,()=>{
      if(!sel.length){notify('Select at least one variable','warning');return false;}
      // Engine expects one variable at a time; run for each selected variable
      sel.forEach(vn=>runAnalysis('ttest_onesample',{variable:vn,test_value:Number(testVal.value)}));
    });
  }

  // ── Independent Samples T-Test ─────────────────────────────────
  function openIndepT() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const testVar=[],groupVar=[];
    const g1=el('input',{type:'text',class:'form-control',value:'1',placeholder:'Group 1 value'});
    const g2=el('input',{type:'text',class:'form-control',value:'2',placeholder:'Group 2 value'});
    const body=el('div',{class:'analysis-form two-col'},
      el('div',{class:'form-section'},el('label',{},'Test variable:'),varList(ds,testVar,false,()=>{},null,'ttest_independent','dependent')),
      el('div',{class:'form-section'},el('label',{},'Grouping variable:'),varList(ds,groupVar,false,()=>{},null,'ttest_independent','independent')),
      el('div',{class:'form-section wide form-row'},
        el('label',{},'Group 1 value:'),g1,
        el('label',{},' Group 2 value:'),g2
      )
    );
    mkDialog('Independent Samples T-Test',body,()=>{
      if(!testVar[0]||!groupVar[0]){notify('Select test and grouping variables','warning');return false;}
      const v1=isNaN(g1.value)?g1.value:Number(g1.value);
      const v2=isNaN(g2.value)?g2.value:Number(g2.value);
      runAnalysis('ttest_independent',{variable:testVar[0],grouping_variable:groupVar[0],group1:v1,group2:v2});
    });
  }

  // ── Paired T-Test ──────────────────────────────────────────────
  function openPairedT() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const var1=[],var2=[];
    const body=el('div',{class:'analysis-form two-col'},
      el('div',{class:'form-section'},el('label',{},'Variable 1 (before):'),varList(ds,var1,false,()=>{},null,'ttest_paired')),
      el('div',{class:'form-section'},el('label',{},'Variable 2 (after):'),varList(ds,var2,false,()=>{},null,'ttest_paired'))
    );
    mkDialog('Paired Samples T-Test',body,()=>{
      if(!var1[0]||!var2[0]){notify('Select both variables','warning');return false;}
      runAnalysis('ttest_paired',{variable1:var1[0],variable2:var2[0]});
    });
  }

  // ── One-Way ANOVA ──────────────────────────────────────────────
  function openOneWayANOVA() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const depVars=[],factorVar=[];
    const postHocSel=el('select',{class:'form-control'},
      el('option',{value:'none'},'None'),
      el('option',{value:'tukey'},'Tukey HSD'),
      el('option',{value:'bonferroni'},'Bonferroni'),
      el('option',{value:'scheffe'},'Scheffé')
    );
    const body=el('div',{class:'analysis-form two-col'},
      el('div',{class:'form-section'},el('label',{},'Dependent variable(s):'),varList(ds,depVars,true,()=>{},null,'anova_oneway','dependent')),
      el('div',{class:'form-section'},el('label',{},'Factor:'),varList(ds,factorVar,false,()=>{},null,'anova_oneway','independent')),
      el('div',{class:'form-row'},el('label',{},'Post Hoc: '),postHocSel)
    );
    mkDialog('One-Way ANOVA',body,()=>{
      if(!depVars.length||!factorVar[0]){notify('Select dependent variable(s) and factor','warning');return false;}
      const ph=postHocSel.value==='none'?[]:[ postHocSel.value ];
      depVars.forEach(dv=>runAnalysis('anova_oneway',{dependent:dv,factor:factorVar[0],post_hoc:ph}));
    });
  }

  // ── Linear Regression ─────────────────────────────────────────
  // Compatibility filter: numeric (or boolean-as-dummy) variables only
  function _isNumericCompat(v) {
    return v.type==='numeric' || v.type==='boolean';
  }

  function openLinearRegression() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const numericVars=ds.variables.filter(_isNumericCompat);
    const stringVars=ds.variables.filter(v=>!_isNumericCompat(v));

    const depVar=[],indepVars=[];

    // Selection-count labels
    const depCountLbl=el('span',{class:'muted small'},'');
    const indepCountLbl=el('span',{class:'muted small'},'');

    // Incompatible variable notice
    let incompatNote=null;
    if (stringVars.length>0) {
      incompatNote=el('div',{class:'compat-note'},
        '⚠ ',stringVars.length,' variable(s) hidden: ',
        el('span',{class:'muted'},stringVars.map(v=>v.name).join(', ')),
        ' (string/date — not compatible with linear regression)'
      );
    }

    const depList=varList(ds,depVar,false,v=>{
      depCountLbl.textContent=depVar.length?`${depVar[0]} selected`:'';
    },_isNumericCompat,'linear_regression','dependent');

    const indepList=varList(ds,indepVars,true,()=>{
      indepCountLbl.textContent=indepVars.length?`${indepVars.length} selected`:'';
    },_isNumericCompat,'linear_regression','independent');

    const body=el('div',{class:'analysis-form two-col'},
      incompatNote,
      el('div',{class:'form-section'},
        el('div',{class:'var-list-header'},
          el('label',{},'Dependent variable (numeric):'),
          depCountLbl
        ),
        depList
      ),
      el('div',{class:'form-section'},
        el('div',{class:'var-list-header'},
          el('label',{},'Independent variable(s) (numeric):'),
          el('span',{class:'muted small'},'Ctrl+A selects all'),
          indepCountLbl
        ),
        indepList
      )
    );
    mkDialog('Linear Regression',body,()=>{
      if(!depVar[0]){notify('Select a dependent variable','warning');return false;}
      if(!indepVars.length){notify('Select at least one independent variable','warning');return false;}
      // Validate selected variables are still numeric
      const badDep=ds.variables.find(v=>v.name===depVar[0]&&!_isNumericCompat(v));
      if (badDep) { notify(`Dependent variable "${depVar[0]}" is not numeric.`,'error'); return false; }
      const badIndep=indepVars.find(vn=>{const v=ds.variables.find(x=>x.name===vn); return v&&!_isNumericCompat(v);});
      if (badIndep) { notify(`Predictor "${badIndep}" is not numeric. Remove it or convert it first.`,'error'); return false; }
      runAnalysis('linear_regression',{dependent:depVar[0],independent:indepVars});
    });
  }

  // ── Logistic Regression ────────────────────────────────────────
  function openLogisticRegression() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const depVar=[],covariates=[];
    const body=el('div',{class:'analysis-form two-col'},
      el('div',{class:'form-section'},el('label',{},'Dependent variable (binary):'),varList(ds,depVar,false,()=>{},null,'logistic_regression','dependent')),
      el('div',{class:'form-section'},el('label',{},'Covariates:'),varList(ds,covariates,true,()=>{},null,'logistic_regression','independent'))
    );
    mkDialog('Binary Logistic Regression',body,()=>{
      if(!depVar[0]||!covariates.length){notify('Select dependent variable and covariates','warning');return false;}
      runAnalysis('logistic_regression',{dependent:depVar[0],independent:covariates});
    });
  }

  // ── Reliability Analysis ───────────────────────────────────────
  function openReliability() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const sel=[];
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},el('label',{},'Items (scale variables):'),varList(ds,sel,true,()=>{},null,'reliability','item'))
    );
    mkDialog('Reliability Analysis (Cronbach\'s α)',body,()=>{
      if(sel.length<2){notify('Select at least 2 items','warning');return false;}
      runAnalysis('reliability',{items:sel});
    });
  }

  // ── Factor Analysis ────────────────────────────────────────────
  function openFactorAnalysis() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const sel=[];
    const rotSel=el('select',{class:'form-control'},
      el('option',{value:'varimax'},'Varimax'),
      el('option',{value:'none'},'None (unrotated)')
    );
    const extSel=el('select',{class:'form-control'},
      el('option',{value:'pca'},'Principal Components'),
      el('option',{value:'paf'},'Principal Axis Factoring')
    );
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},el('label',{},'Variables:'),varList(ds,sel,true,()=>{},null,'factor_analysis')),
      el('div',{class:'form-row'},el('label',{},'Extraction: '),extSel),
      el('div',{class:'form-row'},el('label',{},'Rotation: '),rotSel)
    );
    mkDialog('Factor Analysis',body,()=>{
      if(sel.length<3){notify('Select at least 3 variables','warning');return false;}
      runAnalysis('factor_analysis',{variables:sel,extraction:extSel.value,rotation:rotSel.value});
    });
  }

  // ── Nonparametric ──────────────────────────────────────────────
  function openNonparametric() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const testSel=el('select',{class:'form-control'},
      el('option',{value:'mann_whitney'},'Mann-Whitney U'),
      el('option',{value:'wilcoxon'},'Wilcoxon Signed-Rank'),
      el('option',{value:'kruskal_wallis'},'Kruskal-Wallis H'),
      el('option',{value:'friedman'},'Friedman')
    );
    const var1=[],var2=[],factorVar=[];
    const formBox=el('div',{class:'form-section'});
    testSel.onchange=()=>renderNPForm();
    function renderNPForm(){
      formBox.innerHTML='';
      const t=testSel.value;
      if(t==='mann_whitney'||t==='kruskal_wallis'){
        formBox.appendChild(el('label',{},'Test variable:')); formBox.appendChild(varList(ds,var1,false,()=>{},null,'nonparametric_mannwhitney','dependent'));
        formBox.appendChild(el('label',{},'Grouping variable:')); formBox.appendChild(varList(ds,factorVar,false,()=>{},null,'nonparametric_mannwhitney','independent'));
      } else if(t==='wilcoxon'){
        formBox.appendChild(el('label',{},'Variable 1:')); formBox.appendChild(varList(ds,var1,false,()=>{},null,'nonparametric_wilcoxon'));
        formBox.appendChild(el('label',{},'Variable 2:')); formBox.appendChild(varList(ds,var2,false,()=>{},null,'nonparametric_wilcoxon'));
      } else if(t==='friedman'){
        formBox.appendChild(el('label',{},'Variables (repeated measures):')); formBox.appendChild(varList(ds,var1,true,()=>{},null,'nonparametric_friedman'));
      }
    }
    renderNPForm();
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-row'},el('label',{},'Test: '),testSel),
      formBox
    );
    mkDialog('Nonparametric Tests',body,()=>{
      const t=testSel.value;
      if(t==='mann_whitney') runAnalysis('nonparametric_mannwhitney',{variable:var1[0],grouping_variable:factorVar[0]});
      else if(t==='wilcoxon') runAnalysis('nonparametric_wilcoxon',{variable1:var1[0],variable2:var2[0]});
      else if(t==='kruskal_wallis') runAnalysis('nonparametric_kruskalwallis',{variable:var1[0],grouping_variable:factorVar[0]});
      else if(t==='friedman') runAnalysis('nonparametric_friedman',{variables:var1});
    });
  }

  // ── Kaplan-Meier ───────────────────────────────────────────────
  function openKaplanMeier() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const timeVar=[],eventVar=[],groupVar=[];
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},el('label',{},'Time variable:'),varList(ds,timeVar,false,()=>{},null,'kaplan_meier','dependent')),
      el('div',{class:'form-section'},el('label',{},'Event variable (1=event, 0=censored):'),varList(ds,eventVar,false,()=>{},null,'kaplan_meier','dependent')),
      el('div',{class:'form-section'},el('label',{},'Group variable (optional):'),varList(ds,groupVar,false,()=>{},null,'kaplan_meier','independent'))
    );
    mkDialog('Kaplan-Meier Survival',body,()=>{
      if(!timeVar[0]||!eventVar[0]){notify('Select time and event variables','warning');return false;}
      runAnalysis('kaplan_meier',{time_variable:timeVar[0],event_variable:eventVar[0],group_variable:groupVar[0]||null});
    });
  }

  // ── K-Means ────────────────────────────────────────────────────
  function openKMeans() {
    const ds=getDataset(); if(!ds){notify('No dataset loaded','error');return;}
    const sel=[];
    const kInp=el('input',{type:'number',class:'form-control',value:'3',min:'2',max:'20'});
    const body=el('div',{class:'analysis-form'},
      el('div',{class:'form-section'},el('label',{},'Variables:'),varList(ds,sel,true,()=>{},null,'kmeans')),
      el('div',{class:'form-row'},el('label',{},'Number of clusters (k): '),kInp)
    );
    mkDialog('K-Means Cluster Analysis',body,()=>{
      if(sel.length<2){notify('Select at least 2 variables','warning');return false;}
      const kVal=Number(kInp.value);
      const kVars=sel;
      // Pre-execution validation
      const validCases=ds.cases.filter(row=>
        kVars.every(vn=>{ const v=row[vn]; return typeof v==='number'&&isFinite(v); })
      ).length;
      if(validCases===0){
        notify(
          'No valid cases for K-Means.\n\nLikely causes:\n'+
          '\u2022 Selected variables are not numeric\n'+
          '\u2022 All values are missing or null\n'+
          '\u2022 Active filter removes all cases\n\n'+
          'Variables checked: '+kVars.join(', '),
          'error'
        );
        return false;
      }
      if(kVal<2){notify('K must be \u2265 2.','error');return false;}
      if(kVal>=validCases){
        notify('K ('+kVal+') must be less than valid cases ('+validCases+').','error');
        return false;
      }
      notify('Running K-Means (k='+kVal+', N='+validCases+' valid cases)...','info');
      runAnalysis('kmeans',{variables:sel,k:kVal});
    });
  }

  function runAnalysis(procedureId, params) {
    const ds=getDataset();
    if(!ds){notify('No dataset loaded','error');return;}
    notify(`Running ${procedureId}...`,'info');
    // Run async to keep UI responsive
    setTimeout(()=>{
      const result=ProcedureRegistry.runProcedure(procedureId,ds,params);
      Output.addResult(procedureId,result,params);
      History.addEntry({ type:'analysis', procedure:procedureId, params, timestamp:new Date().toISOString() });
      if(result.status==='error') notify(`Analysis error: ${result.error?.message||'Unknown error'}`,'error');
      else notify(`${procedureId} completed`,'success');
      // Navigate to output
      App.navigate('output');
    },10);
  }

  return {
    openFrequencies, openDescriptives, openCrosstabs, openCorrelation,
    openOneSampleT, openIndepT, openPairedT, openOneWayANOVA,
    openLinearRegression, openLogisticRegression, openReliability,
    openFactorAnalysis, openNonparametric, openKaplanMeier, openKMeans,
    runAnalysis
  };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 9B: PROBABILITY & DISTRIBUTIONS CALCULATOR UI
   Accessible from Analyze → Probability & Distributions.
   Also invoked by AI commands and [Explain Z] buttons.
   ══════════════════════════════════════════════════════════════════ */

