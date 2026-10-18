const I18N = (() => {
  const DICT = {
    en: {
      // Nav
      home:'Home', data:'Data', transform:'Transform', analyze:'Analyze',
      graphs:'Graphs', output:'Output', history:'History', syntax:'Syntax',
      ai:'AI Assistant', settings:'Settings', help:'Help',
      // Topbar
      newBtn:'+ New', saveBtn:'💾 Save', importBtn:'📥 Import', exportBtn:'📤 Export',
      searchPlaceholder:'Search SOCIOSTAT...', simple:'🎓 Simple', pro:'⚡ Pro',
      // Home
      heroTagline:'Statistical Analysis Workbench for Social Sciences — runs entirely in your browser',
      heroAuthor:'Dibuat oleh Bimo Cahyo Ramadhan — Mahasiswa Sosiologi, UIN Sunan Gunung Djati Bandung',
      recentProjects:'Recent Projects', quickStart:'Quick Start Guide',
      whatToDo:'What would you like to do?',
      importDataset:'📥 Import Dataset', newProject:'+ New Project', guidedAnalysis:'🔬 Guided Analysis', takeTour:'🗺 Take Tour',
      noRecentProjects:'No recent projects. Import a dataset or create a new project to get started.',
      // Project
      openProject:'Open', renameProject:'Rename', duplicateProject:'Duplicate', deleteProject:'Delete',
      deleteProjectConfirm:'Delete project "%s"?\n\nThis will permanently remove all datasets, outputs, and history stored in this project.',
      deleteProjectBtn:'Delete Project', cancelBtn:'Cancel',
      projectDeleted:'Project "%s" deleted.',
      clearAllProjects:'Clear All Projects', clearAllConfirm:'Delete ALL local projects? This cannot be undone.',
      // Data
      dataView:'⊞ Data View', variableView:'📋 Variable View',
      addCase:'+ Case', addVariable:'+ Variable',
      noDataset:'No dataset loaded. Import data or create a new project.',
      casesLabel:'cases', variablesLabel:'variables',
      // Transform
      transformTitle:'Transform', transformSubtitle:'What would you like to change about your data?',
      computeTitle:'Create a New Variable', computeDesc:'Calculate a new column from existing variables using a mathematical expression.',
      computeExample:'Example: income_millions = income / 1000000',
      recodeTitle:'Change / Recode Values', recodeDesc:'Map old values to new ones, or group categories together.',
      recodeExample:'Example: 1,2 → Low | 3,4 → Medium | 5 → High',
      sortTitle:'Sort Cases', sortDesc:'Reorder your data rows by one or more variables.',
      filterTitle:'Filter Cases (Select Cases)', filterDesc:'Temporarily keep only cases that match a condition.',
      filterExample:'Example: age >= 18',
      weightTitle:'Weight Cases', weightDesc:'Give cases different frequencies for survey-weighted analysis.',
      splitTitle:'Analyze Groups Separately (Split File)', splitDesc:'Run analyses independently for each group of a variable.',
      // Graphs
      graphsTitle:'Graph Builder', graphsSubtitle:'What would you like to visualise?',
      graphHistogramTitle:'Distribution', graphHistogramDesc:'Show how values are spread across a range.',
      graphHistogramWhen:'Use for: scale/numeric variables',
      graphBoxplotTitle:'Spread & Outliers', graphBoxplotDesc:'Compare distributions and detect outliers.',
      graphBoxplotWhen:'Use for: scale variable, optionally grouped',
      graphScatterTitle:'Relationship', graphScatterDesc:'Explore association between two numeric variables.',
      graphScatterWhen:'Use for: two scale variables',
      graphBarTitle:'Categories', graphBarDesc:'Compare counts or means across categories.',
      graphBarWhen:'Use for: nominal/ordinal variable',
      graphPieTitle:'Composition', graphPieDesc:'Show proportions of a categorical variable.',
      graphPieWhen:'Use for: nominal variable with few categories',
      graphLineTitle:'Trend', graphLineDesc:'Show how values change over a sequence.',
      graphLineWhen:'Use for: ordered/time data',
      graphQQTitle:'Normality Check', graphQQDesc:'Test whether a variable follows a normal distribution.',
      graphQQWhen:'Use for: scale variable before parametric test',
      selectVariable:'Select variable', drawChart:'Draw Chart', exportPng:'Export PNG',
      recommended:'Recommended', chartPreview:'Live Preview',
      // AI
      aiTitle:'SOCIOSTAT AI Assistant', aiSubtitle:'Ask me anything about your data, statistics, or analyses.',
      aiPlaceholder:'Type a question or ask me to do something... (EN/ID)',
      aiSend:'Send', aiClear:'Clear',
      aiChipAnalyze:'Analyze my data', aiChipRecommend:'Recommend a test',
      aiChipChart:'Create a chart', aiChipExplain:'Explain this result',
      aiChipTransform:'Help with transform',
      aiWhatIDid:'✅ What I did', aiWhy:'💡 Why', aiResult:'📊 Result', aiNextStep:'➡ Next step',
      aiConfirmDestructive:'Confirm action',
      // Settings
      settingsTitle:'Settings', modeLabel:'Interface Mode',
      simpleModeDesc:'🎓 Simple Mode — explanations, guided analysis, beginner hints',
      proModeDesc:'⚡ Pro Mode — direct access, no guidance',
      languageLabel:'Language / Bahasa',
      storageLabel:'Storage', storageProjects:'Projects', storageDatasets:'Datasets stored',
      storageEstimate:'Estimated storage used',
      clearAllProjectsBtn:'Clear All Projects',
      projectLabel:'Project', exportProjectBtn:'Export Current Project', importProjectBtn:'Import Project File',
      exportCsvBtn:'Export Dataset as CSV', exportXlsxBtn:'Export Dataset as XLSX',
      tourBtn:'🗺 Start Guided Tour', resetTourBtn:'Reset Tour',
      aboutLabel:'About', version:'Version 2.0 — Pure client-side. No server, no installation.',
      disclaimer:'All statistical computations run in your browser using validated algorithms. No data is sent to any server.',
      // Status bar
      noDatasetLoaded:'No dataset loaded',
      datasetLabel:'Dataset', casesStatus:'Cases', variablesStatus:'Variables',
      filterStatus:'Filter', weightStatus:'Weight', splitStatus:'Split',
      // Notifications
      projectCreated:'Project "%s" created',
      projectSaved:'Project saved',
      projectOpened:'Opened project: %s',
      datasetLoaded:'Dataset "%s" loaded (%d cases, %d variables)',
      modeSwitched:'Switched to %s mode',
      noProjectToSave:'No project to save',
      noProjectToExport:'No project to export',
      noDataset:'No dataset loaded',
      importError:'Import error: %s',
      filterApplied:'Filter active: %s', filterCleared:'Filter cleared',
      weightSet:'Weight by: %s', weightRemoved:'Weight removed',
      sortedBy:'Sorted by: %s',
      computedVar:'Computed "%s" for %d cases',
      recodedVar:'Recoded %d values in "%s"',
      syntaxRan:'Syntax executed successfully',
      syntaxError:'Syntax error: %s',
      analysisRunning:'Running %s...',
      analysisComplete:'%s completed',
      analysisError:'Analysis error: %s',
      variableNotFound:'Variable "%s" not found in dataset.',
      tourReset:'Tour reset — reload to trigger again',
    },
    id: {
      // Nav
      home:'Beranda', data:'Data', transform:'Transformasi', analyze:'Analisis',
      graphs:'Grafik', output:'Output', history:'Riwayat', syntax:'Sintaks',
      ai:'Asisten AI', settings:'Pengaturan', help:'Bantuan',
      // Topbar
      newBtn:'+ Baru', saveBtn:'💾 Simpan', importBtn:'📥 Impor', exportBtn:'📤 Ekspor',
      searchPlaceholder:'Cari SOCIOSTAT...', simple:'🎓 Sederhana', pro:'⚡ Pro',
      // Home
      heroTagline:'Workbench Analisis Statistik untuk Ilmu Sosial — berjalan sepenuhnya di browser',
      heroAuthor:'Dibuat oleh Bimo Cahyo Ramadhan — Mahasiswa Sosiologi, UIN Sunan Gunung Djati Bandung',
      recentProjects:'Proyek Terbaru', quickStart:'Panduan Cepat',
      whatToDo:'Apa yang ingin Anda lakukan?',
      importDataset:'📥 Impor Dataset', newProject:'+ Proyek Baru', guidedAnalysis:'🔬 Analisis Terpandu', takeTour:'🗺 Tur Aplikasi',
      noRecentProjects:'Belum ada proyek. Impor dataset atau buat proyek baru untuk mulai.',
      // Project
      openProject:'Buka', renameProject:'Ganti Nama', duplicateProject:'Duplikat', deleteProject:'Hapus',
      deleteProjectConfirm:'Hapus proyek "%s"?\n\nIni akan menghapus permanen semua dataset, output, dan riwayat dalam proyek ini.',
      deleteProjectBtn:'Hapus Proyek', cancelBtn:'Batal',
      projectDeleted:'Proyek "%s" dihapus.',
      clearAllProjects:'Hapus Semua Proyek', clearAllConfirm:'Hapus SEMUA proyek lokal? Tindakan ini tidak dapat dibatalkan.',
      // Data
      dataView:'⊞ Tampilan Data', variableView:'📋 Tampilan Variabel',
      addCase:'+ Kasus', addVariable:'+ Variabel',
      noDataset:'Tidak ada dataset. Impor data atau buat proyek baru.',
      casesLabel:'kasus', variablesLabel:'variabel',
      // Transform
      transformTitle:'Transformasi', transformSubtitle:'Apa yang ingin Anda ubah dari data Anda?',
      computeTitle:'Buat Variabel Baru', computeDesc:'Hitung kolom baru dari variabel yang ada menggunakan ekspresi matematika.',
      computeExample:'Contoh: harga_juta = harga_usd / 1000000',
      recodeTitle:'Ubah / Recode Nilai', recodeDesc:'Petakan nilai lama ke nilai baru, atau kelompokkan kategori.',
      recodeExample:'Contoh: 1,2 → Rendah | 3,4 → Sedang | 5 → Tinggi',
      sortTitle:'Urutkan Kasus', sortDesc:'Susun ulang baris data berdasarkan satu atau lebih variabel.',
      filterTitle:'Filter Kasus (Pilih Kasus)', filterDesc:'Sementara simpan hanya kasus yang memenuhi kondisi tertentu.',
      filterExample:'Contoh: usia >= 18',
      weightTitle:'Bobot Kasus', weightDesc:'Berikan frekuensi berbeda pada kasus untuk analisis berbobot survei.',
      splitTitle:'Analisis Per Kelompok (Split File)', splitDesc:'Jalankan analisis secara terpisah untuk setiap kelompok variabel.',
      // Graphs
      graphsTitle:'Pembuat Grafik', graphsSubtitle:'Apa yang ingin Anda visualisasikan?',
      graphHistogramTitle:'Distribusi', graphHistogramDesc:'Tampilkan bagaimana nilai tersebar dalam suatu rentang.',
      graphHistogramWhen:'Untuk: variabel skala/numerik',
      graphBoxplotTitle:'Sebaran & Pencilan', graphBoxplotDesc:'Bandingkan distribusi dan temukan pencilan.',
      graphBoxplotWhen:'Untuk: variabel skala, opsional dikelompokkan',
      graphScatterTitle:'Hubungan', graphScatterDesc:'Jelajahi asosiasi antara dua variabel numerik.',
      graphScatterWhen:'Untuk: dua variabel skala',
      graphBarTitle:'Kategori', graphBarDesc:'Bandingkan jumlah atau rata-rata antar kategori.',
      graphBarWhen:'Untuk: variabel nominal/ordinal',
      graphPieTitle:'Komposisi', graphPieDesc:'Tampilkan proporsi variabel kategorik.',
      graphPieWhen:'Untuk: variabel nominal dengan sedikit kategori',
      graphLineTitle:'Tren', graphLineDesc:'Tampilkan bagaimana nilai berubah sepanjang urutan.',
      graphLineWhen:'Untuk: data berurutan/waktu',
      graphQQTitle:'Pemeriksaan Normalitas', graphQQDesc:'Uji apakah variabel mengikuti distribusi normal.',
      graphQQWhen:'Untuk: variabel skala sebelum uji parametrik',
      selectVariable:'Pilih variabel', drawChart:'Buat Grafik', exportPng:'Ekspor PNG',
      recommended:'Direkomendasikan', chartPreview:'Pratinjau Langsung',
      // AI
      aiTitle:'Asisten AI SOCIOSTAT', aiSubtitle:'Tanyakan apa saja tentang data, statistik, atau analisis Anda.',
      aiPlaceholder:'Ketik pertanyaan atau minta saya melakukan sesuatu... (EN/ID)',
      aiSend:'Kirim', aiClear:'Bersihkan',
      aiChipAnalyze:'Analisis data saya', aiChipRecommend:'Rekomendasikan uji statistik',
      aiChipChart:'Buat grafik', aiChipExplain:'Jelaskan hasil ini',
      aiChipTransform:'Bantu transformasi',
      aiWhatIDid:'✅ Yang saya lakukan', aiWhy:'💡 Mengapa', aiResult:'📊 Hasil', aiNextStep:'➡ Langkah berikut',
      aiConfirmDestructive:'Konfirmasi tindakan',
      // Settings
      settingsTitle:'Pengaturan', modeLabel:'Mode Antarmuka',
      simpleModeDesc:'🎓 Mode Sederhana — penjelasan, analisis terpandu, petunjuk pemula',
      proModeDesc:'⚡ Mode Pro — akses langsung, tanpa panduan',
      languageLabel:'Bahasa / Language',
      storageLabel:'Penyimpanan', storageProjects:'Proyek', storageDatasets:'Dataset tersimpan',
      storageEstimate:'Estimasi penyimpanan terpakai',
      clearAllProjectsBtn:'Hapus Semua Proyek',
      projectLabel:'Proyek', exportProjectBtn:'Ekspor Proyek Aktif', importProjectBtn:'Impor File Proyek',
      exportCsvBtn:'Ekspor Dataset sebagai CSV', exportXlsxBtn:'Ekspor Dataset sebagai XLSX',
      tourBtn:'🗺 Mulai Tur Terpandu', resetTourBtn:'Reset Tur',
      aboutLabel:'Tentang', version:'Versi 2.0 — Sisi klien murni. Tanpa server, tanpa instalasi.',
      disclaimer:'Semua komputasi statistik berjalan di browser Anda menggunakan algoritma yang telah divalidasi. Tidak ada data yang dikirim ke server mana pun.',
      // Status bar
      noDatasetLoaded:'Tidak ada dataset',
      datasetLabel:'Dataset', casesStatus:'Kasus', variablesStatus:'Variabel',
      filterStatus:'Filter', weightStatus:'Bobot', splitStatus:'Split',
      // Notifications
      projectCreated:'Proyek "%s" dibuat',
      projectSaved:'Proyek disimpan',
      projectOpened:'Proyek dibuka: %s',
      datasetLoaded:'Dataset "%s" dimuat (%d kasus, %d variabel)',
      modeSwitched:'Beralih ke mode %s',
      noProjectToSave:'Tidak ada proyek untuk disimpan',
      noProjectToExport:'Tidak ada proyek untuk diekspor',
      noDataset:'Tidak ada dataset',
      importError:'Error impor: %s',
      filterApplied:'Filter aktif: %s', filterCleared:'Filter dihapus',
      weightSet:'Bobot berdasarkan: %s', weightRemoved:'Bobot dihapus',
      sortedBy:'Diurutkan berdasarkan: %s',
      computedVar:'Dihitung "%s" untuk %d kasus',
      recodedVar:'Direcode %d nilai di "%s"',
      syntaxRan:'Sintaks berhasil dijalankan',
      syntaxError:'Error sintaks: %s',
      analysisRunning:'Menjalankan %s...',
      analysisComplete:'%s selesai',
      analysisError:'Error analisis: %s',
      variableNotFound:'Variabel "%s" tidak ditemukan dalam dataset.',
      tourReset:'Tur direset — muat ulang untuk memicu kembali',
    }
  };

  let _lang = localStorage.getItem('sociostat_lang') ||
    (navigator.language && navigator.language.startsWith('id') ? 'id' : 'en');

  function t(key, ...args) {
    const dict = DICT[_lang] || DICT.en;
    let str = dict[key] || DICT.en[key] || key;
    // Simple printf-style substitution: %s = string, %d = number
    let i = 0;
    str = str.replace(/%[sd]/g, () => (args[i++] ?? ''));
    return str;
  }

  function setLang(lang) {
    _lang = lang;
    localStorage.setItem('sociostat_lang', lang);
  }

  function getLang() { return _lang; }

  return { t, setLang, getLang, DICT };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 18B: VarPicker — Universal Variable Selection Component
   ══════════════════════════════════════════════════════════════════ */
