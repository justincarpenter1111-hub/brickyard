/* Millford — a railway village that is planned, not sprinkled.
   Order: mainline → viaduct → inner loop → roads → districts → furniture.
   The north side of the outer ring climbs 5 ramps (30 plates) before any
   deck crosses another running line, so a loco (18 plates) has 20+ plates
   of air underneath. A ground line then goes under those arches. */
function genMillford() {
  const B = [];
  const used = new Uint8Array(SPAN * SPAN);
  const R = rng(26081307);
  const pick = a => a[(R() * a.length) | 0];
  const free = (x, z, w, d) => {
    if (x < 2 || z < 2 || x + w > SPAN - 2 || z + d > SPAN - 2) return false;
    for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++)
      if (used[j * SPAN + i]) return false;
    return true;
  };
  const claim = (x, z, w, d) => {
    for (let i = Math.max(0, x); i < Math.min(SPAN, x + w); i++)
      for (let j = Math.max(0, z); j < Math.min(SPAN, z + d); j++) used[j * SPAN + i] = 1;
  };
  const put = (t, x, z, base = 0, rot = 0, col = PROP_COLOR) => {
    B.push([t, col, Math.round(x), Math.round(z), base, rot]);
  };
  const claimPiece = (p, pad = 2) => {
    const f = footprint(p[0], p[5]);
    claim(p[2] - pad, p[3] - pad, f.w + pad * 2, f.d + pad * 2);
  };

  const T = makeTurtle(B, (type, x, z, rot) => {
    const f = footprint(type, rot);
    return x > -120 && z > -120 && x + f.w < SPAN + 120 && z + f.d < SPAN + 120;
  });
  const pts = {};
  const laySide = (n, hooks) => {
    for (let i = 0; i < n;) {
      const h = hooks.find(q => q.at === i);
      if (h) {
        const p = T.lay(h.type, { rev: !!h.rev });
        if (p) pts[h.tag] = p;
        i += 1;
        continue;
      }
      T.lay('track_straight');
      i += 1;
    }
  };

  // 16 × 16-stud units a side. North face is the viaduct: 5 up, 6 deck, 5 down.
  T.at(0, 0, 1, RAIL);
  laySide(16, [
    { at: 4, tag: 'staA', type: 'track_switch_r' },
    { at: 9, tag: 'staB', type: 'track_switch_l', rev: true },
  ]);
  T.lay('track_curve_big');
  laySide(16, []);
  T.lay('track_curve_big');

  const rampsUp = [], decks = [], rampsDn = [];
  for (let i = 0; i < 5; i++) { const p = T.lay('track_ramp'); if (p) rampsUp.push(p); }
  for (let i = 0; i < 6; i++) { const p = T.lay('track_bridge'); if (p) decks.push(p); }
  for (let i = 0; i < 5; i++) { const p = T.lay('track_ramp', { rev: true }); if (p) rampsDn.push(p); }
  T.lay('track_curve_big');
  laySide(16, []);
  T.lay('track_curve_big');

  let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
  for (const p of B) {
    const f = footprint(p[0], p[5]);
    mnx = Math.min(mnx, p[2]); mnz = Math.min(mnz, p[3]);
    mxx = Math.max(mxx, p[2] + f.w); mxz = Math.max(mxz, p[3] + f.d);
  }
  const ox = Math.round((SPAN - (mxx - mnx)) / 2) - mnx;
  const oz = Math.round((SPAN - (mxz - mnz)) / 2) - mnz;
  for (const p of B) { p[2] += ox; p[3] += oz; }
  for (const p of [...rampsUp, ...decks, ...rampsDn]) { p.x += ox; p.z += oz; }
  for (const k of Object.keys(pts)) if (pts[k]) { pts[k].x += ox; pts[k].z += oz; }

  const specJoin = (from, to, recipes) => {
    if (!from || !to) return { ok: false, added: [] };
    const a = T.branchOf(from), b = T.branchOf(to);
    for (const steps of recipes) {
      const tmp = [];
      const t = makeTurtle(tmp);
      t.at(a.x, a.z, a.h, a.y);
      let laid = true;
      for (const step of steps) {
        const name = typeof step === 'string' ? step : step.type;
        if (!t.lay(name, typeof step === 'string' ? {} : step)) { laid = false; break; }
      }
      if (!laid) continue;
      const ok = Math.abs(t.cur.x - b.x) < 0.8 && Math.abs(t.cur.z - b.z) < 0.8
              && t.cur.y === b.y && (t.cur.h + 2) % 4 === b.h;
      if (ok) {
        for (const p of tmp) B.push(p);
        return { ok: true, added: tmp };
      }
    }
    return { ok: false, added: [] };
  };
  const nStr = n => Array.from({ length: n }, () => 'track_straight');

  // Platform road: switches sit 4 straights apart (slots 5–8).
  const sta = specJoin(pts.staA, pts.staB, [
    ['track_curve', ...nStr(4), 'track_curve'],
    ['track_curve', ...nStr(3), 'track_curve'],
    ['track_curve', ...nStr(5), 'track_curve'],
  ]);

  const inner = { ok: false };

  // Ground circuit whose south side runs *under* the six high decks — same
  // corridor, 30 plates below — then balloons on the mill bank. Closed, so
  // a second loco can live on it. Speculative: only kept if it shuts.
  const midDeck = decks[Math.floor(decks.length / 2)];
  let underpass = [];
  if (decks.length) {
    const x0 = Math.min(...decks.map(d => d.x));
    const z0 = Math.min(...decks.map(d => d.z));
    const recipes = [
      [...nStr(6), 'track_curve_big', ...nStr(3), 'track_curve_big', ...nStr(6), 'track_curve_big', ...nStr(3), 'track_curve_big'],
      [...nStr(6), 'track_curve', ...nStr(4), 'track_curve', ...nStr(6), 'track_curve', ...nStr(4), 'track_curve'],
      ['track_long', 'track_long', 'track_long', 'track_curve_big', 'track_long', 'track_curve_big',
       'track_long', 'track_long', 'track_long', 'track_curve_big', 'track_long', 'track_curve_big'],
    ];
    for (const seq of recipes) {
      const tmp = [];
      const t = makeTurtle(tmp);
      t.at(x0 + 4, z0 + 4, 1, RAIL);
      let laid = true;
      for (const s of seq) if (!t.lay(s)) { laid = false; break; }
      const closed = laid && Math.abs(t.cur.x - (x0 + 4)) < 2 && Math.abs(t.cur.z - (z0 + 4)) < 2;
      if (closed) { for (const p of tmp) B.push(p); underpass = tmp; break; }
    }
  }

  const underX = midDeck ? midDeck.x + footprint(midDeck.type, midDeck.rot).w / 2 : -999;
  const groundRails = B.filter(p => TRACK[p[0]] && p[4] < 8);
  const hitsGround = (x, z, w = 4, d = 4) => groundRails.some(p => {
    const f = footprint(p[0], p[5]);
    return x < p[2] + f.w && x + w > p[2] && z < p[3] + f.d && z + d > p[3];
  });
  for (const d of decks) {
    if (d.base < 18) continue;
    const f = footprint(d.type, d.rot);
    const px = d.x + Math.floor(f.w / 2) - 1;
    const pz = d.z + Math.floor(f.d / 2) - 1;
    if (Math.abs(px + 1 - underX) < 12) continue;
    if (hitsGround(px, pz, 4, 4)) continue;
    for (let y = 0; y <= d.base - 6; y += 6) put('track_pier', px, pz, y, 0);
  }

  // Claim every railway cell so streets and houses give way to it.
  for (const p of B) if (TRACK[p[0]] || p[0] === 'track_pier' || p[0] === 'track_station')
    claimPiece(p, 2);

  // River under the viaduct (the brook Millford is named for).
  if (decks.length) {
    const zs = decks.map(d => d.z), xs = decks.map(d => d.x);
    const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 24;
    const z0 = Math.min(...zs) - 6;
    for (let x = x0; x < x1; x += 10) for (let k = 0; k < 3; k++) {
      const z = z0 + k * 10;
      if (!inSpan(x, z, 10, 10)) continue;
      if (Math.abs(x + 5 - underX) < 8) continue;
      const t = k === 1 ? 'tile_deep' : k === 0 ? 'tile_shallow' : 'tile_water';
      put(t, x, z, 0, 0);
      claim(x, z, 10, 10);
    }
  }
  function inSpan(x, z, w, d) {
    return x >= 0 && z >= 0 && x + w <= SPAN && z + d <= SPAN;
  }

  // Stone viaduct face under the high decks, short of the river channel.
  if (decks.length >= 4) {
    const x0 = Math.min(...decks.map(d => d.x));
    const z0 = Math.min(...decks.map(d => d.z));
    const top = decks[0].base;
    if (top > 8) {
      for (const [t, c, bx, bz, bb, br] of viaductBricks(3, Math.max(12, top - 2), 8, true)) {
        const x = x0 + bx, z = z0 + bz - 2;
        if (Math.abs(x + 4 - underX) < 10) continue;
        if (inSpan(x, z, 4, 4)) B.push([t, c, x, z, bb, br]);
      }
    }
  }

  // Park a train on the southernmost east–west running rail, loco at the
  // front, three cars behind. Station kits are optional scenery.
  const ew = B.filter(p => (p[0] === 'track_straight' || p[0] === 'track_long') && p[4] === 0)
    .filter(p => {
      const f = footprint(p[0], p[5]);
      return f.w > f.d;                         // rail runs east–west
    })
    .sort((a, b) => a[3] - b[3]);
  const berth = ew[Math.max(0, Math.floor(ew.length * 0.15))];
  if (berth) {
    const [, , px, pz, , prot] = berth;
    const along = prot === 1 || prot === 3;
    if (DEFS.track_station) {
      if (along) {
        if (free(px, pz - 8, 16, 8)) { put('track_station', px, pz - 8, 0, 1); claim(px, pz - 8, 16, 8); }
      } else if (free(px - 8, pz, 8, 16)) {
        put('track_station', px - 8, pz, 0, 0); claim(px - 8, pz, 8, 16);
      }
    }
    if (along) {
      put('train_loco', px + 8, pz + 1, RAIL, 1);
      put('train_car_red', px - 8, pz + 1, RAIL, 1);
      put('train_car_blue', px - 24, pz + 1, RAIL, 1);
      put('train_wagon', px - 40, pz + 1, RAIL, 1);
    } else {
      put('train_loco', px + 1, pz + 8, RAIL, 0);
      put('train_car_red', px + 1, pz - 8, RAIL, 0);
      put('train_car_blue', px + 1, pz - 24, RAIL, 0);
      put('train_wagon', px + 1, pz - 40, RAIL, 0);
    }
  }
  if (underpass.length) {
    const u = underpass.find(p => p[0] === 'track_straight' || p[0] === 'track_long');
    if (u) {
      const f = footprint(u[0], u[5]);
      const along = f.w > f.d;
      put('train_loco', along ? u[2] + 4 : u[2] + 1, along ? u[3] + 1 : u[3] + 4, RAIL, along ? 1 : 0);
      put('train_car_red', along ? u[2] - 12 : u[2] + 1, along ? u[3] + 1 : u[3] - 12, RAIL, along ? 1 : 0);
    }
  }

  // ========== STREETS ==========
  const cobble = (x, z) => {
    if (!free(x, z, 8, 8)) return false;
    put(pick(['prop_road_cobble', 'prop_road_cobble2', 'prop_road_cobble3']), x, z);
    claim(x, z, 8, 8);
    return true;
  };
  const CX = 152, CZ = 152;
  for (let z = 72; z <= 232; z += 8) { cobble(CX, z); cobble(CX + 8, z); }
  for (let x = 72; x <= 232; x += 8) { cobble(x, CZ); cobble(x, CZ + 8); }
  for (let x = 128; x <= 184; x += 8) for (let z = 128; z <= 184; z += 8) cobble(x, z);
  claim(128, 128, 64, 64);

  put('prop_fountain', 154, 148, 1);
  put('prop_well', 138, 168, 1);
  for (let i = 0; i < 4; i++) put('prop_market_stall', 136 + i * 9, 178, 1);
  for (let i = 0; i < 4; i++) put('prop_bench', 172, 136 + i * 8, 1, 1);
  for (let z = 88; z < 224; z += 16) {
    if (free(149, z, 2, 2)) { put('prop_lamppost', 149, z); claim(149, z, 2, 2); }
    if (free(169, z, 2, 2)) { put('prop_lamppost', 169, z); claim(169, z, 2, 2); }
  }

  // Civic hall on the north of the square, facing south onto it.
  const hall = cottageBricks(20, 16, 3, R, { stone: LC.dgrey, plaster: LC.stone, timber: LC.dbrown, roof: LC.dgrey });
  if (free(146, 104, 24, 20)) {
    for (const p of hall) B.push([p[0], p[1], p[2] + 146, p[3] + 104, p[4], p[5]]);
    claim(144, 102, 26, 22);
    put('prop_flagpole', 155, 110, 40);
  }

  // ========== HOUSES facing the streets ==========
  const faceHouse = (x, z, storeys, pal) => {
    const w = 14 + ((R() * 3) | 0) * 2, d = 12 + ((R() * 2) | 0) * 2;
    if (!free(x - 1, z - 1, w + 2, d + 2)) return false;
    for (const p of cottageBricks(w, d, storeys, R, pal))
      B.push([p[0], p[1], p[2] + x, p[3] + z, p[4], p[5]]);
    claim(x - 1, z - 1, w + 2, d + 2);
    if (free(x + w + 1, z + 2, 2, 2)) {
      put(pick(['prop_tree_small', 'prop_bush', 'prop_flower_red']), x + w + 1, z + 2);
      claim(x + w + 1, z + 2, 2, 2);
    }
    return true;
  };
  const palTown = () => pick([
    { stone: LC.dgrey, plaster: LC.white, timber: LC.dbrown, roof: LC.dred },
    { stone: LC.lgrey, plaster: LC.tan, timber: LC.rbrown, roof: LC.dred },
    { stone: LC.stone, plaster: LC.white, timber: LC.dbrown, roof: LC.dgrey },
    { stone: LC.dgrey, plaster: LC.sand, timber: LC.dbrown, roof: LC.dred },
  ]);
  // West of high street, doors face east (toward the street) — houses sit
  // with their front on +Z in cottageBricks, so we place them south of a
  // side lane rather than rotating every brick.
  for (let z = 80; z < 124; z += 22)
    faceHouse(112, z, 2, palTown());
  for (let z = 188; z < 236; z += 22)
    faceHouse(112, z, z < 210 ? 2 : 1, palTown());
  for (let z = 80; z < 124; z += 22)
    faceHouse(176, z, 2, palTown());
  for (let z = 188; z < 236; z += 22)
    faceHouse(176, z, 1, palTown());
  for (let x = 80; x < 124; x += 24)
    faceHouse(x, 188, 1, palTown());
  for (let x = 184; x < 236; x += 24)
    faceHouse(x, 112, 2, palTown());

  // Farms on the south-west and south-east, away from the rails' claim.
  const farm = (x, z) => {
    if (!free(x, z, 28, 32)) return;
    faceHouse(x, z, 1, { stone: LC.dgrey, plaster: LC.tan, timber: LC.rbrown, roof: LC.dred });
    for (let i = 0; i < 5; i++) if (free(x + i * 4, z + 16, 4, 2)) {
      put('prop_fence', x + i * 4, z + 16, 0, 1); claim(x + i * 4, z + 16, 4, 2);
    }
    for (let i = 0; i < 3; i++) if (free(x + i * 6, z + 20, 4, 4)) {
      put('prop_veggie_patch', x + i * 6, z + 20); claim(x + i * 6, z + 20, 4, 4);
    }
    for (let i = 0; i < 2; i++) if (free(x + 2 + i * 8, z + 26, 3, 3)) {
      put(pick(['prop_sheep', 'prop_cow', 'prop_pig']), x + 2 + i * 8, z + 26, 0, (R() * 4) | 0);
      claim(x + 2 + i * 8, z + 26, 3, 3);
    }
  };
  farm(36, 200);
  farm(36, 248);
  farm(232, 200);
  farm(232, 248);

  // Mill on the north bank of the brook.
  if (decks.length) {
    const mx = Math.round(underX + 18), mz = Math.min(...decks.map(d => d.z)) - 28;
    if (free(mx, mz, 22, 20)) {
      const mill = cottageBricks(18, 14, 2, R, { stone: LC.dgrey, plaster: LC.sand, timber: LC.dbrown, roof: LC.dgrey });
      for (const p of mill) B.push([p[0], p[1], p[2] + mx, p[3] + mz, p[4], p[5]]);
      claim(mx - 1, mz - 1, 22, 18);
      put('prop_well', mx + 20, mz + 4, 1);
    }
  }

  // East park — a green that the high street aims at, not leftover space.
  const parkX = 232, parkZ = 136;
  if (free(parkX, parkZ, 28, 36)) {
    claim(parkX, parkZ, 28, 36);
    put('prop_pond', parkX + 8, parkZ + 10);
    put('prop_bench', parkX + 2, parkZ + 4, 0, 1);
    put('prop_swing', parkX + 18, parkZ + 4);
    put('prop_seesaw', parkX + 18, parkZ + 20);
    for (let i = 0; i < 7; i++)
      put(pick(['prop_tree_oak', 'prop_tree_apple', 'prop_tree_small']),
          parkX + ((R() * 22) | 0), parkZ + ((R() * 30) | 0), 0, (R() * 4) | 0);
  }

  // Woodland only on the far rim, in clumps, never on the streets.
  const trees = ['prop_tree_pine', 'prop_tree_oak', 'prop_tree_apple', 'prop_tree_small'];
  for (const [cx, cz] of [[20, 20], [280, 20], [20, 280], [280, 280], [160, 16], [16, 160]]) {
    for (let i = 0; i < 18; i++) {
      const x = cx + ((R() * 22) | 0), z = cz + ((R() * 22) | 0);
      if (!free(x, z, 3, 3)) continue;
      put(R() < 0.2 ? 'prop_bush' : pick(trees), x, z, 0, (R() * 4) | 0);
      claim(x, z, 3, 3);
    }
  }

  // People on the square and the high street — not in a ring in a field.
  const folk = (typeof VILLAGERS !== 'undefined')
    ? VILLAGERS.map(v => 'prop_villager_' + v[0]) : [];
  const spots = [
    [150, 160], [166, 158], [144, 146], [170, 174],
    [156, 120], [156, 200], [120, 156], [196, 156],
    [140, 140], [172, 188],
  ];
  spots.forEach((s, i) => {
    if (!folk.length) return;
    put(folk[i % folk.length], s[0], s[1], 1, (R() * 4) | 0);
  });

  B.__millford = {
    staLoop: sta.ok, inner: inner.ok, decks: decks.length,
    ramps: rampsUp.length + rampsDn.length, underpass: underpass.length,
  };
  return B;
}
