(function () {
  'use strict';

  var SCALE = 0.1; // metres per map unit
  var COLS = [190, 370, 550, 730];
  var ROWS = [110, 260, 410];
  var LETTERS = 'ABCDEF';
  var MPS = 10 / 3.6; // drive speed in the lot, 10 km/h

  var nodes = {}, adj = {}, edges = [], slots = [];

  function addNode(n) { nodes[n.id] = n; adj[n.id] = []; return n; }
  function jid(r, c) { return 'J' + (r * 4 + c + 1); }
  function addEdge(a, b, fixed) {
    var len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) * SCALE;
    var e = { id: 'e' + edges.length, a: a, b: b, len: len, traffic: 1, blocked: false, fixed: !!fixed };
    edges.push(e);
    adj[a].push({ to: b, e: e });
    adj[b].push({ to: a, e: e });
  }

  var r, c, k, side;
  for (r = 0; r < 3; r++) for (c = 0; c < 4; c++) addNode({ id: jid(r, c), type: 'junction', x: COLS[c], y: ROWS[r] });
  addNode({ id: 'G1', type: 'gate', x: 50, y: 410, name: 'Gate 1' });
  addNode({ id: 'G2', type: 'gate', x: 810, y: 110, name: 'Gate 2' });
  addEdge('G1', jid(2, 0), true);
  addEdge('G2', jid(0, 3), true);
  for (r = 0; r < 3; r++) for (c = 0; c < 4; c++) {
    if (c < 3) addEdge(jid(r, c), jid(r, c + 1), false);
    if (r < 2) addEdge(jid(r, c), jid(r + 1, c), false);
  }
  for (r = 0; r < 3; r++) for (side = 0; side < 2; side++) for (k = 0; k < 7; k++) {
    var letter = LETTERS[r * 2 + side];
    var sid = letter + (k + 1);
    var sx = 190 + k * 90, sy = ROWS[r] + (side ? 44 : -44);
    var s = addNode({ id: sid, type: 'slot', x: sx, y: sy, row: letter, occupied: false });
    var js = (k % 2 === 0) ? [jid(r, k / 2)] : [jid(r, (k - 1) / 2), jid(r, (k + 1) / 2)];
    js.forEach(function (j) {
      var len = Math.hypot(nodes[j].x - sx, nodes[j].y - sy) * SCALE;
      adj[j].push({ to: sid, e: null, len: len });
    });
    slots.push(s);
  }

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var carSeed = 7, trafficSeed = 3;
  function shuffleCars() {
    var rnd = rng(carSeed++);
    slots.forEach(function (s) { s.occupied = rnd() < 0.6; });
    var free = slots.filter(function (s) { return !s.occupied; });
    while (free.length < 3) {
      var pick = slots[Math.floor(rnd() * slots.length)];
      if (pick.occupied) { pick.occupied = false; free.push(pick); }
    }
  }
  function addTraffic() {
    var rnd = rng(trafficSeed++ * 13 + 5);
    edges.forEach(function (e) {
      if (!e.fixed) e.traffic = rnd() < 0.4 ? Math.round((1 + rnd() * 1.6) * 10) / 10 : 1;
    });
  }
  function resetAisles() { edges.forEach(function (e) { e.traffic = 1; e.blocked = false; }); }

  function Heap() { this.a = []; }
  Heap.prototype.push = function (x) {
    var a = this.a; a.push(x);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, rr = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (rr < a.length && a[rr][0] < a[m][0]) m = rr;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  function dijkstra(src) {
    var dist = {}, prev = {}, done = {}, steps = [];
    var heap = new Heap();
    dist[src] = 0; heap.push([0, src]);
    while (heap.a.length) {
      var top = heap.pop(), d = top[0], u = top[1];
      if (done[u] || d > dist[u]) continue;
      done[u] = true;
      if (nodes[u].type !== 'slot') {
        adj[u].forEach(function (it) {
          var v = it.to;
          if (done[v]) return;
          if (it.e && it.e.blocked) return;
          if (nodes[v].type === 'slot' && nodes[v].occupied) return;
          var w = it.e ? it.e.len * it.e.traffic : it.len;
          var nd = d + w;
          if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push([nd, v]); }
        });
      }
      var frontier = Object.keys(dist).filter(function (n) { return !done[n]; });
      steps.push({ node: u, dist: d, frontier: frontier });
    }
    var found = -1;
    for (var i = 0; i < steps.length; i++) if (nodes[steps[i].node].type === 'slot') { found = i; break; }
    var target = found >= 0 ? steps[found].node : null;
    var path = [];
    if (target) { var n = target; while (n !== undefined) { path.unshift(n); n = prev[n]; } }
    return { dist: dist, prev: prev, steps: steps, found: found, target: target, path: path, src: src };
  }

  var S = { gate: 'G1', res: null, view: 0, timer: null };
  var $ = function (id) { return document.getElementById(id); };
  function label(id) { return nodes[id].type === 'gate' ? nodes[id].name : id; }
  function f1(v) { return v.toFixed(1); }
  function maxView() { if (!S.res) return 0; return S.res.found >= 0 ? S.res.found + 1 : S.res.steps.length; }

  /* ---------- map ---------- */
  function renderMap() {
    var res = S.res, shown = res.steps.slice(0, S.view);
    var seen = {};
    shown.forEach(function (st) { seen[st.node] = true; });
    var cur = shown.length ? shown[shown.length - 1] : null;
    var front = {};
    (cur ? cur.frontier : [S.gate]).forEach(function (n) { front[n] = true; });
    var showRoute = res.found >= 0 && S.view > res.found;
    var o = [];
    o.push('<rect class="ground" x="0" y="0" width="860" height="520" rx="12"/>');
    edges.forEach(function (e) {
      var a = nodes[e.a], b = nodes[e.b];
      o.push('<line class="road" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>');
      if (e.traffic > 1) o.push('<line class="traf" style="opacity:' + (0.25 + (e.traffic - 1) * 0.3).toFixed(2) + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>');
      o.push('<line class="center" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>');
      if (e.blocked) o.push('<line class="shutline" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>');
    });
    for (var ri = 0; ri < 3; ri++) {
      o.push('<text class="rowlab" x="156" y="' + (ROWS[ri] - 40) + '">' + LETTERS[ri * 2] + '</text>');
      o.push('<text class="rowlab" x="156" y="' + (ROWS[ri] + 48) + '">' + LETTERS[ri * 2 + 1] + '</text>');
    }
    Object.keys(seen).forEach(function (n) {
      if (n === res.src) return;
      var p = res.prev[n];
      if (p === undefined) return;
      o.push('<line class="tree" x1="' + nodes[p].x + '" y1="' + nodes[p].y + '" x2="' + nodes[n].x + '" y2="' + nodes[n].y + '"/>');
    });
    if (showRoute) {
      o.push('<polyline class="route" points="' + res.path.map(function (n) { return nodes[n].x + ',' + nodes[n].y; }).join(' ') + '"/>');
    }
    edges.forEach(function (e) {
      if (e.fixed) return;
      var a = nodes[e.a], b = nodes[e.b];
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var w = e.len * e.traffic;
      var txt = e.blocked ? '✕' : (e.traffic === 1 ? String(Math.round(w)) : f1(w));
      var cls = 'chip' + (e.blocked ? ' shut' : (e.traffic > 1 ? ' warn' : ''));
      var name = 'Aisle ' + e.a + ' to ' + e.b + ', ' + (e.blocked ? 'closed' : f1(w) + ' metres') + '. Press to ' + (e.blocked ? 'reopen' : 'close') + '.';
      o.push('<g class="' + cls + '" data-edge="' + e.id + '" tabindex="0" role="button" aria-label="' + name + '"><line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="transparent" stroke-width="22"/><rect x="' + (mx - 14) + '" y="' + (my - 8) + '" width="28" height="16" rx="8"/><text x="' + mx + '" y="' + (my + 3.5) + '">' + txt + '</text></g>');
    });
    slots.forEach(function (sl) {
      var cls = 'slot ' + (sl.occupied ? 'busy' : 'free');
      var isHit = showRoute && sl.id === res.target;
      if (!sl.occupied && seen[sl.id]) cls += ' seen';
      if (isHit) cls += ' hit';
      var d = res.dist[sl.id];
      var tip = sl.id + (sl.occupied ? ' occupied' : (d !== undefined ? ', ' + f1(d) + ' m from ' + label(res.src) : ', not reachable'));
      o.push('<g class="' + cls + '" data-slot="' + sl.id + '" tabindex="0" role="button" aria-label="' + tip + '. Press to ' + (sl.occupied ? 'free' : 'park') + '."><title>' + tip + '</title><rect class="sr" x="' + (sl.x - 20) + '" y="' + (sl.y - 13) + '" width="40" height="26" rx="4"/>' +
        (sl.occupied
          ? '<rect class="car" x="' + (sl.x - 12) + '" y="' + (sl.y - 8) + '" width="24" height="16" rx="5"/>'
          : '<text x="' + sl.x + '" y="' + (sl.y + 3.5) + '">' + sl.id + '</text>') + '</g>');
    });
    Object.keys(nodes).forEach(function (id) {
      var n = nodes[id];
      if (n.type !== 'junction') return;
      var cls = 'j';
      if (front[id]) cls += ' front';
      if (seen[id]) cls += ' seen';
      if (cur && cur.node === id && !showRoute) cls += ' cur';
      o.push('<circle class="' + cls + '" cx="' + n.x + '" cy="' + n.y + '" r="11"/><text class="jt" x="' + n.x + '" y="' + (n.y + 3.2) + '">' + id.slice(1) + '</text>');
    });
    ['G1', 'G2'].forEach(function (g) {
      var n = nodes[g];
      o.push('<g class="gate' + (S.gate === g ? ' on' : '') + '" data-gate="' + g + '" tabindex="0" role="button" aria-label="' + n.name + (S.gate === g ? ', selected' : '. Press to select.') + '"><rect x="' + (n.x - 30) + '" y="' + (n.y - 15) + '" width="60" height="30" rx="6"/><text x="' + n.x + '" y="' + (n.y + 4.5) + '">' + n.name.toUpperCase() + '</text></g>');
    });
    $('lot').innerHTML = o.join('');

    var cap;
    if (S.view === 0) cap = 'The car is at ' + label(S.gate) + '. Press Play search or Step to watch Dijkstra explore the aisles.';
    else if (res.found < 0 && S.view >= res.steps.length) cap = 'No free slot can be reached from ' + label(S.gate) + '. Free a slot or reopen an aisle.';
    else if (showRoute) cap = 'Slot ' + res.target + ' is the closest free slot, ' + f1(res.dist[res.target]) + ' m from ' + label(S.gate) + '.';
    else cap = 'Step ' + S.view + ': settled ' + label(cur.node) + ' at ' + f1(cur.dist) + ' m, with ' + cur.frontier.length + ' nodes waiting in the queue.';
    $('caption').textContent = cap;
  }

  /* ---------- result panel ---------- */
  function renderResult() {
    var res = S.res;
    var free = slots.filter(function (s) { return !s.occupied; }).length;
    var occ = Math.round((slots.length - free) / slots.length * 100);
    var h = '';
    if (res.target) {
      var d = res.dist[res.target];
      var firstFree = null;
      for (var i = 0; i < slots.length; i++) {
        if (res.dist[slots[i].id] !== undefined) { firstFree = slots[i]; break; }
      }
      var extra = firstFree ? res.dist[firstFree.id] - d : 0;
      h += '<div><p class="eyebrow">Assigned slot</p><span class="slotbadge">' + res.target + '</span></div>';
      h += '<dl>' +
        '<dt>Route length</dt><dd>' + f1(d) + ' m</dd>' +
        '<dt>Drive time at 10 km/h</dt><dd>' + Math.round(d / MPS) + ' s</dd>' +
        '<dt>Stops on the route</dt><dd>' + res.path.length + '</dd>' +
        '<dt>Nodes settled to match</dt><dd>' + (res.found + 1) + ' of ' + res.steps.length + '</dd>' +
        '<dt>Free slots</dt><dd>' + free + ' of ' + slots.length + '</dd>' +
        '<dt>Occupancy</dt><dd>' + occ + '%</dd>' +
        '<dt>First free by number</dt><dd>' + (firstFree ? firstFree.id + (extra > 0.05 ? ' (+' + f1(extra) + ' m)' : '') : 'none') + '</dd>' +
        '</dl>';
      h += '<div><p class="eyebrow">Route</p><p class="pathline">' + res.path.map(label).join(' → ') + '</p></div>';
    } else {
      h += '<div><p class="eyebrow">Assigned slot</p><span class="slotbadge none">None</span></div>';
      h += '<dl><dt>Free slots</dt><dd>' + free + ' of ' + slots.length + '</dd><dt>Occupancy</dt><dd>' + occ + '%</dd></dl>';
      h += '<p class="hint">Every free slot is either cut off by closed aisles or there are none left. Reopen an aisle or free a slot to continue.</p>';
    }
    h += '<p class="hint">Aisle numbers on the map are lengths in metres. Amber ones include traffic.</p>';
    $('result').innerHTML = h;
  }

  /* ---------- charts ---------- */
  function scaleFor(maxV) {
    var raw = (maxV / 4) || 1;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / p;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
    return { step: step, max: Math.ceil(maxV / step - 1e-9) * step };
  }
  function fmtTick(v, step) { return step < 1 ? v.toFixed(1) : String(Math.round(v)); }
  function emptyChart(W, H, msg) {
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + msg + '"><text class="emptyt" x="' + W / 2 + '" y="' + H / 2 + '">' + msg + '</text></svg>';
  }
  function grid(m, W, ih, sc, y) {
    var s = '';
    for (var v = 0; v <= sc.max + 1e-9; v += sc.step) {
      s += '<line class="gridl" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += '<text class="ax" x="' + (m.l - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end">' + fmtTick(v, sc.step) + '</text>';
    }
    return s;
  }

  function barChart(items, aria) {
    var W = 520, H = 250, m = { l: 40, r: 8, t: 20, b: 30 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    if (!items.length) return emptyChart(W, H, 'No free slot is reachable');
    var sc = scaleFor(Math.max.apply(null, items.map(function (i) { return i.v; })));
    var y = function (v) { return m.t + ih - v / sc.max * ih; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + aria + '">' + grid(m, W, ih, sc, y);
    var bw = iw / items.length;
    items.forEach(function (it, i) {
      var x = m.l + i * bw + bw * 0.16, w = bw * 0.68;
      s += '<rect class="bar' + (it.hit ? ' hit' : '') + '" x="' + x.toFixed(1) + '" y="' + y(it.v).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (m.t + ih - y(it.v)).toFixed(1) + '" rx="2"><title>' + it.id + ': ' + f1(it.v) + ' m</title></rect>';
      s += '<text class="ax" x="' + (m.l + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + it.id + '</text>';
      if (it.hit) s += '<text class="mklab" x="' + (m.l + i * bw + bw / 2).toFixed(1) + '" y="' + (y(it.v) - 5).toFixed(1) + '" text-anchor="middle">' + f1(it.v) + '</text>';
    });
    return s + '</svg>';
  }

  function lineChart(pts, opt) {
    var W = 520, H = 230, m = { l: 40, r: 14, t: 20, b: 30 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var n = pts.length;
    var sc = scaleFor(Math.max.apply(null, pts.map(function (p) { return p; }).concat([1])));
    var x = function (i) { return m.l + (i - 1) / Math.max(n - 1, 1) * iw; };
    var y = function (v) { return m.t + ih - v / sc.max * ih; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + opt.aria + '">' + grid(m, W, ih, sc, y);
    var xs = n <= 12 ? 1 : n <= 30 ? 5 : 10;
    for (var i = 1; i <= n; i++) {
      if (i === 1 || i % xs === 0) s += '<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + i + '</text>';
    }
    var line = pts.map(function (v, j) { return x(j + 1).toFixed(1) + ',' + y(v).toFixed(1); });
    s += '<polygon class="area" points="' + x(1).toFixed(1) + ',' + y(0) + ' ' + line.join(' ') + ' ' + x(n).toFixed(1) + ',' + y(0) + '"/>';
    s += '<polyline class="ln" points="' + line.join(' ') + '"/>';
    if (n <= 40) pts.forEach(function (v, j) { s += '<circle class="dot" cx="' + x(j + 1).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.4"/>'; });
    if (opt.marker > 0) {
      var mx = x(opt.marker), right = mx > W - 110;
      s += '<line class="mk" x1="' + mx.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/>';
      s += '<text class="mklab" x="' + (mx + (right ? -6 : 6)).toFixed(1) + '" y="' + (m.t + 10) + '" text-anchor="' + (right ? 'end' : 'start') + '">first free slot</text>';
    }
    if (opt.playhead > 0 && opt.playhead < opt.maxView) {
      var px = x(opt.playhead);
      s += '<line class="ph" x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/>';
    }
    return s + '</svg>';
  }

  function stackedChart() {
    var W = 520, H = 230, m = { l: 34, r: 14, t: 12, b: 26 };
    var iw = W - m.l - m.r, rowH = (H - m.t - m.b) / 6;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Free and occupied slots in each row">';
    for (var v = 0; v <= 7; v++) {
      var gx = m.l + v / 7 * iw;
      s += '<line class="gridl" x1="' + gx.toFixed(1) + '" x2="' + gx.toFixed(1) + '" y1="' + m.t + '" y2="' + (H - m.b) + '"/>';
      s += '<text class="ax" x="' + gx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + v + '</text>';
    }
    LETTERS.split('').forEach(function (L, i) {
      var inRow = slots.filter(function (sl) { return sl.row === L; });
      var busy = inRow.filter(function (sl) { return sl.occupied; }).length, free = inRow.length - busy;
      var y0 = m.t + i * rowH + rowH * 0.18, h = rowH * 0.64;
      var fw = free / 7 * iw, bw = busy / 7 * iw;
      s += '<text class="ax" x="' + (m.l - 8) + '" y="' + (y0 + h / 2 + 3.5) + '" text-anchor="end">' + L + '</text>';
      if (free) s += '<rect class="sfree" x="' + m.l + '" y="' + y0.toFixed(1) + '" width="' + fw.toFixed(1) + '" height="' + h.toFixed(1) + '"><title>Row ' + L + ': ' + free + ' free</title></rect><text class="segt" x="' + (m.l + fw / 2).toFixed(1) + '" y="' + (y0 + h / 2 + 3.5).toFixed(1) + '">' + free + '</text>';
      if (busy) s += '<rect class="sbusy" x="' + (m.l + fw).toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '"><title>Row ' + L + ': ' + busy + ' occupied</title></rect><text class="segt" x="' + (m.l + fw + bw / 2).toFixed(1) + '" y="' + (y0 + h / 2 + 3.5).toFixed(1) + '">' + busy + '</text>';
    });
    return s + '</svg>';
  }

  function renderCharts() {
    var res = S.res;
    var items = Object.keys(res.dist).filter(function (id) { return nodes[id].type === 'slot'; })
      .map(function (id) { return { id: id, v: res.dist[id], hit: id === res.target }; })
      .sort(function (a, b) { return a.v - b.v; }).slice(0, 16);
    $('tA').textContent = items.length ? 'Nearest ' + items.length + ' free slots' : 'Nearest free slots';
    $('chartA').innerHTML = barChart(items, 'Route length to the nearest free slots');
    $('chartD').innerHTML = stackedChart();
    var mv = maxView();
    $('chartB').innerHTML = lineChart(res.steps.map(function (st) { return st.dist; }), { aria: 'Distance settled at each Dijkstra step', marker: res.found + 1, playhead: S.view, maxView: mv });
    $('chartC').innerHTML = lineChart(res.steps.map(function (st) { return st.frontier.length; }), { aria: 'Priority queue size at each Dijkstra step', marker: res.found + 1, playhead: S.view, maxView: mv });
  }

  function renderTable() {
    var res = S.res;
    var h = '<table><thead><tr><th>Order</th><th>Node</th><th>Distance (m)</th><th>Reached from</th></tr></thead><tbody>';
    res.steps.forEach(function (st, i) {
      var p = res.prev[st.node];
      h += '<tr' + (i === res.found ? ' class="pick"' : '') + '><td>' + (i + 1) + '</td><td>' + label(st.node) + '</td><td>' + f1(st.dist) + '</td><td>' + (p === undefined ? 'start' : label(p)) + '</td></tr>';
    });
    $('table').innerHTML = h + '</tbody></table>';
  }

  function updatePlayBtn() { $('play').textContent = S.timer ? 'Pause' : (S.view >= maxView() && S.view > 0 ? 'Replay search' : 'Play search'); }
  function renderAll() { renderMap(); renderResult(); renderCharts(); updatePlayBtn(); }
  function renderTick() { renderMap(); renderCharts(); updatePlayBtn(); }

  function pause() { if (S.timer) { clearInterval(S.timer); S.timer = null; } updatePlayBtn(); }
  function recompute() {
    pause();
    S.res = dijkstra(S.gate);
    S.view = maxView();
    renderAll();
    renderTable();
  }
  function play() {
    if (S.timer) { pause(); return; }
    if (S.view >= maxView()) S.view = 0;
    renderTick();
    S.timer = setInterval(function () {
      if (S.view >= maxView()) { pause(); return; }
      S.view++;
      renderTick();
      if (S.view >= maxView()) pause();
    }, +$('speed').value);
    updatePlayBtn();
  }

  function activate(t) {
    var g;
    if ((g = t.closest('[data-slot]'))) { var sl = nodes[g.getAttribute('data-slot')]; sl.occupied = !sl.occupied; recompute(); }
    else if ((g = t.closest('[data-edge]'))) { var id = g.getAttribute('data-edge'); edges.forEach(function (e) { if (e.id === id) e.blocked = !e.blocked; }); recompute(); }
    else if ((g = t.closest('[data-gate]'))) { S.gate = g.getAttribute('data-gate'); $('gate').value = S.gate; recompute(); }
  }
  $('lot').addEventListener('click', function (ev) { activate(ev.target); });
  $('lot').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(ev.target); }
  });
  $('gate').addEventListener('change', function () { S.gate = $('gate').value; recompute(); });
  $('play').addEventListener('click', play);
  $('step').addEventListener('click', function () { pause(); S.view = S.view >= maxView() ? 1 : S.view + 1; renderTick(); });
  $('shuffle').addEventListener('click', function () { shuffleCars(); recompute(); });
  $('traffic').addEventListener('click', function () { addTraffic(); recompute(); });
  $('reset').addEventListener('click', function () { resetAisles(); recompute(); });

  shuffleCars();
  recompute();
})();
