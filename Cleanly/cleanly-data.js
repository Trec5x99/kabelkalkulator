/* ============================================================
   Cleanly – datalag for henvendelser
   ------------------------------------------------------------
   I forhåndsvisning kjører dette på nettleserens lagring
   (localStorage), slik at du ser skjema -> dashbord fungere.

   FOR EKTE DRIFT (henvendelser fra ekte kunder):
   1. Lag gratis konto på https://supabase.com og et prosjekt.
   2. Lag en tabell "henvendelser" med kolonnene:
        id (text, primary key), created_at (timestamptz),
        status (text), service (text), service_label (text),
        fornavn, etternavn, mobil, epost, adresse, melding (text),
        details (jsonb), has_image (bool),
        scheduled_at (timestamptz), duration_min (int), pris (int)
   3. Slå på Row Level Security. Lag policy som lar "anon"
      SETTE INN (insert), og bare innloggede lese (select).
   4. Sett MODE = 'supabase' under, og lim inn URL + anon-nøkkel.
   Da lagres alle henvendelser i databasen din, og dashbordet
   (Admin.dc.html) leser fra den samme databasen.
   ============================================================ */
(function () {
  var MODE = 'supabase'; // 'local' (forhåndsvisning) | 'supabase' (ekte drift)

  var STORAGE_KEY = 'cleanly_enquiries_v1';
  var AUTH_KEY = 'cleanly_auth_jwt';
  var SUPABASE_URL = 'https://zcmndrluoqtyoftaqmre.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_EXPYEdLVv9aI7iQLv_6NJg_ehRZYNNg';
  var TABLE = 'henvendelser';

  // Tjenester: nøkkel -> visningsnavn + farge (brukt i statistikk)
  var SERVICE_META = {
    vindusvask: { label: 'Vindusvask', color: '#2B87C8' },
    maling:     { label: 'Maling',     color: '#1E9E8A' },
    garasje:    { label: 'Rydding',    color: '#E0912F' },
    hage:       { label: 'Hagearbeid', color: '#6BA53A' },
    annet:      { label: 'Annet',      color: '#8A6FD1' }
  };
  var STATUS_META = {
    ny:        { label: 'Ny',        color: '#2B87C8' },
    kontaktet: { label: 'Kontaktet', color: '#E0912F' },
    avtalt:    { label: 'Avtalt',    color: '#1E9E8A' },
    ferdig:    { label: 'Ferdig',    color: '#2F9E5B' },
    avvist:    { label: 'Avvist',    color: '#8095A3' }
  };
  var STATUS_ORDER = ['ny', 'kontaktet', 'avtalt', 'ferdig', 'avvist'];

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function writeLocal(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  function getStoredToken() {
    try { return localStorage.getItem(AUTH_KEY); } catch (e) { return null; }
  }
  function sbHeaders(extra) {
    var token = getStoredToken() || SUPABASE_ANON_KEY;
    var h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token };
    if (extra) { for (var k in extra) { h[k] = extra[k]; } }
    return h;
  }

  async function signIn(email, password) {
    try {
      var r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      var data = await r.json();
      if (!r.ok || data.error) { return { ok: false }; }
      try { localStorage.setItem(AUTH_KEY, data.access_token); } catch (e) {}
      return { ok: true };
    } catch (e) { return { ok: false }; }
  }

  async function signOut() {
    var token = getStoredToken();
    if (token) {
      try {
        await fetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
        });
      } catch (e) {}
    }
    try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  }

  function getSession() {
    return getStoredToken();
  }

  async function getEnquiries() {
    if (MODE === 'supabase') {
      var r = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?select=*&order=created_at.desc', { headers: sbHeaders() });
      var rows = await r.json();
      // normaliser felt-navn fra databasen
      return (rows || []).map(function (x) {
        return {
          id: x.id, createdAt: x.created_at, status: x.status, service: x.service,
          serviceLabel: x.service_label, fornavn: x.fornavn, etternavn: x.etternavn,
          mobil: x.mobil, epost: x.epost, adresse: x.adresse, melding: x.melding,
          details: x.details || {}, hasImage: x.has_image,
          scheduledAt: x.scheduled_at || null, durationMin: x.duration_min || null,
          pris: x.pris != null ? x.pris : null
        };
      });
    }
    return readLocal().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  }

  async function addEnquiry(data) {
    var rec = Object.assign({
      id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
      status: 'ny'
    }, data);
    if (MODE === 'supabase') {
      await fetch(SUPABASE_URL + '/rest/v1/' + TABLE, {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return-minimal' }),
        body: JSON.stringify({
          id: rec.id, created_at: rec.createdAt, status: rec.status, service: rec.service,
          service_label: rec.serviceLabel, fornavn: rec.fornavn, etternavn: rec.etternavn,
          mobil: rec.mobil, epost: rec.epost, adresse: rec.adresse, melding: rec.melding,
          details: rec.details, has_image: rec.hasImage,
          scheduled_at: rec.scheduledAt || null, duration_min: rec.durationMin || null
        })
      });
      return rec;
    }
    var list = readLocal(); list.push(rec); writeLocal(list); return rec;
  }

  async function updateStatus(id, status) {
    if (MODE === 'supabase') {
      await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', headers: sbHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status: status })
      });
      return;
    }
    writeLocal(readLocal().map(function (e) { return e.id === id ? Object.assign({}, e, { status: status }) : e; }));
  }

  async function scheduleEnquiry(id, scheduledAt, durationMin) {
    if (MODE === 'supabase') {
      await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', headers: sbHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ scheduled_at: scheduledAt, duration_min: durationMin, status: 'avtalt' })
      });
      return;
    }
    writeLocal(readLocal().map(function (e) { return e.id === id ? Object.assign({}, e, { scheduledAt: scheduledAt, durationMin: durationMin, status: 'avtalt' }) : e; }));
  }

  async function unscheduleEnquiry(id) {
    if (MODE === 'supabase') {
      await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', headers: sbHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ scheduled_at: null })
      });
      return;
    }
    writeLocal(readLocal().map(function (e) { return e.id === id ? Object.assign({}, e, { scheduledAt: null, durationMin: null }) : e; }));
  }

  async function setPris(id, pris) {
    if (MODE === 'supabase') {
      await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', headers: sbHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ pris: pris })
      });
      return;
    }
    writeLocal(readLocal().map(function (e) { return e.id === id ? Object.assign({}, e, { pris: pris }) : e; }));
  }

  async function deleteEnquiry(id) {
    if (MODE === 'supabase') {
      await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', headers: sbHeaders() });
      return;
    }
    writeLocal(readLocal().filter(function (e) { return e.id !== id; }));
  }

  function clearAll() { if (MODE === 'local') { writeLocal([]); } }

  // Legger inn litt demodata FØRSTE gang, kun i forhåndsvisning,
  // slik at dashbordet har noe å vise. Ekte henvendelser legger seg øverst.
  function seedDemoIfEmpty() {
    if (MODE !== 'local') { return; }
    if (readLocal().length > 0) { return; }
    var day = 86400000;
    var now = Date.now();
    function d(days) { return new Date(now - days * day).toISOString(); }
    var mon = startOfWeek(new Date(now));
    function sched(off, h) { var x = new Date(mon.getTime() + off * day); x.setHours(h, 0, 0, 0); return x.toISOString(); }
    var demo = [
      { service: 'vindusvask', status: 'ny',        fornavn: 'Ingrid', etternavn: 'Hauge',   mobil: '412 05 118', epost: 'ingrid.hauge@epost.no', adresse: 'Ekebergveien 201, Nordstrand', melding: 'To etasjer, litt høyt bak.', createdAt: d(1),  details: { antallVinduer: '18', karmer: true, type: 'Abonnement – månedlig' } },
      { service: 'maling',     status: 'ny',        fornavn: 'Petter', etternavn: 'Solli',    mobil: '901 22 340', epost: 'petter@solli.no',       adresse: 'Nordstrandveien 55, Nordstrand', melding: 'Sørveggen flasser.', createdAt: d(2),  details: { hva: 'Hus (én vegg)', areal: '40', budsjett: 'Vet ikke' } },
      { service: 'vindusvask', status: 'kontaktet', fornavn: 'Marte',  etternavn: 'Lie',      mobil: '478 90 512', epost: 'marte.lie@epost.no',    adresse: 'Kastellbakken 8, Nordstrand',   melding: '', createdAt: d(4),  details: { antallVinduer: '9', karmer: true, type: 'Engangsvask' } },
      { service: 'garasje',    status: 'avtalt',    fornavn: 'Odd',    etternavn: 'Berg',     mobil: '922 14 006', epost: 'odd.berg@epost.no',     adresse: 'Sæterveien 14, Nordstrand',     melding: 'Mye gammelt trevirke.', createdAt: d(6),  scheduledAt: sched(1, 10), durationMin: 180, details: { beskrivelse: 'Gammel garasje full av skrot og maling', rives: false } },
      { service: 'maling',     status: 'avtalt',    fornavn: 'Kari',   etternavn: 'Nyland',   mobil: '415 66 231', epost: 'kari.nyland@epost.no',  adresse: 'Munkerudveien 3, Nordstrand',   melding: 'Stakittgjerde rundt hele hagen.', createdAt: d(9),  scheduledAt: sched(3, 13), durationMin: 240, details: { hva: 'Gjerde', areal: '60', budsjett: '18000' } },
      { service: 'vindusvask', status: 'ferdig',    fornavn: 'Jonas',  etternavn: 'Ruud',     mobil: '936 71 884', epost: 'jonas.ruud@epost.no',   adresse: 'Ljabruveien 42, Nordstrand',    melding: '', createdAt: d(12), details: { antallVinduer: '14', karmer: true, type: 'Abonnement – hver 2. uke' } },
      { service: 'hage',       status: 'ferdig',    fornavn: 'Siri',   etternavn: 'Aas',      mobil: '400 31 209', epost: 'siri.aas@epost.no',     adresse: 'Nordstrand torg 2, Nordstrand', melding: 'Klippe plen og luke bed.', createdAt: d(15), details: { beskrivelse: 'Plen, hekk og bed' } },
      { service: 'garasje',    status: 'ferdig',    fornavn: 'Bjørn',  etternavn: 'Moe',      mobil: '959 02 447', epost: 'bjorn.moe@epost.no',    adresse: 'Herregårdsveien 9, Nordstrand', melding: '', createdAt: d(20), details: { beskrivelse: 'Bortkjøring av hvitevarer', rives: false } },
      { service: 'maling',     status: 'ferdig',    fornavn: 'Anne',   etternavn: 'Dahl',     mobil: '482 55 173', epost: 'anne.dahl@epost.no',    adresse: 'Kongsveien 88, Nordstrand',     melding: 'Stort prosjekt med stillas.', createdAt: d(26), details: { hva: 'Hus', areal: '120', budsjett: '45000' } },
      { service: 'vindusvask', status: 'ferdig',    fornavn: 'Tom',    etternavn: 'Iversen',  mobil: '917 40 668', epost: 'tom.iversen@epost.no',  adresse: 'Setermyrveien 5, Nordstrand',   melding: '', createdAt: d(31), details: { antallVinduer: '11', karmer: true, type: 'Engangsvask' } },
      { service: 'annet',      status: 'avvist',    fornavn: 'Live',   etternavn: 'Sund',     mobil: '405 88 902', epost: 'live.sund@epost.no',    adresse: 'Utenfor område',                melding: 'Ligger dessverre for langt unna.', createdAt: d(34), details: { beskrivelse: 'Takrenne-spyling' } }
    ].map(function (x) { return Object.assign({ id: 'demo' + Math.random().toString(36).slice(2, 8), demo: true, hasImage: false, serviceLabel: (SERVICE_META[x.service] || {}).label || 'Annet' }, x); });
    writeLocal(demo);
  }

  function startOfWeek(dt) {
    var x = new Date(dt);
    x.setHours(0, 0, 0, 0);
    var day = (x.getDay() + 6) % 7; // mandag = 0
    x.setDate(x.getDate() - day);
    return x;
  }

  function computeStats(list) {
    var now = new Date();
    var weekAgo = now.getTime() - 7 * 86400000;
    var monthAgo = now.getTime() - 30 * 86400000;
    var total = list.length;
    var nye = 0, week = 0, month = 0;
    var perServiceCount = {}, byStatusCount = {};
    Object.keys(SERVICE_META).forEach(function (k) { perServiceCount[k] = 0; });
    STATUS_ORDER.forEach(function (k) { byStatusCount[k] = 0; });

    list.forEach(function (e) {
      var t = new Date(e.createdAt).getTime();
      if (e.status === 'ny') { nye++; }
      if (t >= weekAgo) { week++; }
      if (t >= monthAgo) { month++; }
      if (perServiceCount[e.service] != null) { perServiceCount[e.service]++; }
      if (byStatusCount[e.status] != null) { byStatusCount[e.status]++; }
    });

    // fullførte / avviste for "vunnet"-rate
    var ferdig = byStatusCount['ferdig'] || 0;
    var avgjort = ferdig + (byStatusCount['avvist'] || 0);
    var winRate = avgjort > 0 ? Math.round((ferdig / avgjort) * 100) : 0;

    var maxService = 1;
    var perService = Object.keys(SERVICE_META).map(function (k) {
      if (perServiceCount[k] > maxService) { maxService = perServiceCount[k]; }
      return { key: k, label: SERVICE_META[k].label, color: SERVICE_META[k].color, count: perServiceCount[k] };
    });
    perService.forEach(function (s) { s.pct = Math.round((s.count / maxService) * 100); });

    var byStatus = STATUS_ORDER.map(function (k) {
      return { key: k, label: STATUS_META[k].label, color: STATUS_META[k].color, count: byStatusCount[k] };
    });

    // siste 6 uker (volum)
    var weeks = [];
    var thisWeekStart = startOfWeek(now);
    var maxWeek = 1;
    for (var i = 5; i >= 0; i--) {
      var ws = new Date(thisWeekStart.getTime() - i * 7 * 86400000);
      var we = new Date(ws.getTime() + 7 * 86400000);
      var c = list.filter(function (e) { var t = new Date(e.createdAt); return t >= ws && t < we; }).length;
      if (c > maxWeek) { maxWeek = c; }
      var lbl = ('0' + ws.getDate()).slice(-2) + '.' + ('0' + (ws.getMonth() + 1)).slice(-2);
      weeks.push({ label: lbl, count: c });
    }
    weeks.forEach(function (w) { w.pct = Math.round((w.count / maxWeek) * 100); });

    return { total: total, nye: nye, week: week, month: month, winRate: winRate, perService: perService, byStatus: byStatus, weeks: weeks };
  }

  window.CleanlyData = {
    SERVICE_META: SERVICE_META,
    STATUS_META: STATUS_META,
    STATUS_ORDER: STATUS_ORDER,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getEnquiries: getEnquiries,
    addEnquiry: addEnquiry,
    updateStatus: updateStatus,
    scheduleEnquiry: scheduleEnquiry,
    unscheduleEnquiry: unscheduleEnquiry,
    setPris: setPris,
    deleteEnquiry: deleteEnquiry,
    clearAll: clearAll,
    seedDemoIfEmpty: seedDemoIfEmpty,
    computeStats: computeStats
  };
})();
