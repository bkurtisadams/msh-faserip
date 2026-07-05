// Champions II–style Patrol / Encounter Generator (Foundry v13)
// Implements: encounter chance by activity (2d6 ≥ target), encounter type (2d6 w/ bias),
// arrival timing (before/after/either tables w/ closeness bias), people count (1–3, 2d6×, 3d6×),
// and sub-tables for Special, Natural Disaster, Man-Made Disaster, Major Crime, Minor Crime, Accident.
//
// Notes:
// • “Bias (type roll)” shifts the 2d6 encounter-type roll: +1..+3 → simpler/quicker (skews to 10–12: Accidents/Minor Crimes)
//   and −1..−3 → longer/more intricate (skews to 2–4: Specials/Disasters).
// • “Arrival mode”: After (1d6− table), Before (1d6+ table), Either (2d6 table). “Proximity” nudges results toward “Exactly.”
// • People count: 1–3 (1d6 bracket), or product of 2d6 / 3d6 per the book.
// • “Prevent vs Fix”: derived from arrival timing (before = prevent; after = fix; exactly = GM choice).

(async () => {
  // ---------- Utilities ----------
  const roll1d6 = () => Math.floor(Math.random() * 6) + 1;
  const roll2d6 = () => ({ dice: [roll1d6(), roll1d6()], total: 0 });
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // Foundry-safe 2d6 with explicit dice shown in output
  function roll2d6Show() {
    const a = roll1d6(), b = roll1d6();
    return { dice: [a, b], total: a + b };
  }

  function htmlEscape(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // ----- FASERIP Karma (awards + penalties) -----
const KARMA = {
  crime: {
    violent:      { prevent: 30, arrest: 15 },
    destructive:  { prevent: 20, arrest: 10 },
    theft:        { prevent: 10, arrest:  5 },
    robbery:      { prevent: 20, arrest: 10 },
    misdemeanor:  { prevent:  5, arrest:  5 },
    national:     { prevent: 20, arrest: 10 },
    conspiracy:   { local:{prevent:30,arrest:15}, national:{prevent:40,arrest:20}, global:{prevent:50,arrest:25} }
  },
  rescuePerLife: 20,
  rescueCapPerAction: 100,
  defeat: { none: 0, private: -20, public: -40 },
  propertyDamagePerArea: -5,
  permitCrimePenalty: { violent:-15, destructive:-10, theft:-5, robbery:-10, misdemeanor:-5, national:-10 },
  commitment: { kept: 5, broke: -10, leftEarly: -5 },
  deathZero: true,
  nobleDeathPenalty: -50
};

// Suggest a crime category from the generated encounter (for prefill only)
function suggestCrimeCategory(encType, encSubtype) {
  switch (encType) {
    case "Minor Crime":
      if (encSubtype === "Drugs") return "misdemeanor";
      if (encSubtype === "Robbery") return "robbery";
      if (encSubtype === "Assault") return "violent";
      if (encSubtype === "Burglary/Theft") return "theft";
      if (encSubtype === "Arson/Bombing") return "destructive";
      break;
    case "Major Crime":
      if (encSubtype === "Hijacking") return "national";
      if (encSubtype === "Hostage Situation") return "violent";
      if (encSubtype === "Robbery") return "robbery";
      if (encSubtype === "Extortion") return "theft"; // add "destructive" in dialog if a bomb was involved
      break;
  }
  return "";
}

// Compute Karma from flags entered in the dialog
function scoreKarma(opts) {
  const {
    crimeCategory = "", prevent = false, arrest = false,
    conspiracy = "",                      // "", "local", "national", "global"
    livesSaved = 0, rescueActions = 1,    // rescues (cap +100 per action)
    foeHighestRank = 0,                   // only counts if ≥ 30
    propertyAreas = 0,
    permittedCrime = false,
    defeat = "none",                      // "none"|"private"|"public"
    deathByHero = false,
    nobleDeaths = 0,
    charity = 0,
    commitment = "none",                  // "none"|"kept"|"broke"|"leftEarly"
    participants = 1
  } = opts;

  const lines = [];
  let total = 0;

  // Crime awards
  if (crimeCategory && (prevent || arrest)) {
    const rule = KARMA.crime[crimeCategory];
    if (rule) {
      if (prevent) { total += rule.prevent; lines.push({label:`${crimeCategory} (prevent)`, val: rule.prevent}); }
      if (arrest)  { total += rule.arrest;  lines.push({label:`${crimeCategory} (arrest)`,  val: rule.arrest }); }
    }
  }

  // Conspiracy (optional, stacks)
  if (conspiracy) {
    const rule = KARMA.crime.conspiracy[conspiracy];
    if (rule) {
      if (prevent) { total += rule.prevent; lines.push({label:`Conspiracy ${conspiracy} (prevent)`, val: rule.prevent}); }
      if (arrest)  { total += rule.arrest;  lines.push({label:`Conspiracy ${conspiracy} (arrest)`,  val: rule.arrest }); }
    }
  }

  // Rescues (cap +100 per action)
  const actions = Math.max(1, Number(rescueActions||1));
  const rescued = Math.max(0, Number(livesSaved||0));
  if (rescued > 0) {
    const perAction = Math.min(rescued * KARMA.rescuePerLife, KARMA.rescueCapPerAction);
    const rescueAward = perAction * actions;
    total += rescueAward;
    lines.push({label:`Rescues (+${KARMA.rescuePerLife} each, cap +${KARMA.rescueCapPerAction}/action × ${actions})`, val: rescueAward});
  }

  // Opponent highest rank (if ≥ Remarkable 30)
  if (foeHighestRank >= 30) { total += foeHighestRank; lines.push({label:`Foe highest rank (≥ Remarkable)`, val: foeHighestRank}); }

  // Charity / commitment (optional)
  if (charity) { total += charity; lines.push({label:`Charity / public good`, val: charity}); }
  if (commitment !== "none") {
    const v = KARMA.commitment[commitment] || 0;
    if (v) { total += v; lines.push({label:`Commitment (${commitment})`, val: v}); }
  }

  // Penalties
  const pd = Math.max(0, Number(propertyAreas||0)) * KARMA.propertyDamagePerArea; // negative value
  if (pd) { total += pd; lines.push({label:`Property damage (−5 each × ${propertyAreas})`, val: pd}); }

  if (permittedCrime && crimeCategory) {
    const pen = KARMA.permitCrimePenalty[crimeCategory] || 0;
    if (pen) { total += pen; lines.push({label:`Permitted crime to occur`, val: pen}); }
  }

  const defeatVal = KARMA.defeat[defeat] || 0;
  if (defeatVal) { total += defeatVal; lines.push({label:`Defeat (${defeat})`, val: defeatVal}); }

  if (nobleDeaths > 0) {
    const pen = KARMA.nobleDeathPenalty * nobleDeaths;
    total += pen; lines.push({label:`Noble/mysterious/self-destruction deaths (${nobleDeaths})`, val: pen});
  }

  // Death caused by hero → set current Karma to 0 (report subtotal for transparency)
  if (deathByHero) lines.push({label:`Death caused by hero`, val:`→ Current Karma set to 0`});

  const perHero = Math.floor(total / Math.max(1, Number(participants||1)));
  return { total, perHero, lines, deathByHero };
}

// Popup to enter Karma details and print a breakdown to chat
async function openKarmaDialog({ encType, encSubtype, defaultPrevent=false, defaultArrest=false, peopleCount=1, participants=1 } = {}) {
  const esc = htmlEscape;
  const preCat = suggestCrimeCategory(encType, encSubtype) || "";
  const content = `
    <style>
      .msh-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .msh-full{grid-column:1 / -1}
      .msh-note{opacity:.8;font-size:11px;margin-top:-4px}
      .msh-break{height:1px;background:var(--color-border, #888);margin:6px 0;}
      .msh-right{float:right}
    </style>
    <div class="msh-grid">
      <label>Crime category
        <select id="km-crime">
          <option value="">— none (rescue-only) —</option>
          <option value="violent">Violent</option>
          <option value="destructive">Destructive</option>
          <option value="robbery">Robbery</option>
          <option value="theft">Theft</option>
          <option value="misdemeanor">Misdemeanor</option>
          <option value="national">National offense</option>
        </select>
        <div class="msh-note">Prefill: ${esc(encType)} / ${esc(encSubtype||"-")}</div>
      </label>
      <label>Conspiracy tier
        <select id="km-consp">
          <option value="">— none —</option>
          <option value="local">Local</option>
          <option value="national">National</option>
          <option value="global">Global</option>
        </select>
      </label>

      <label><input type="checkbox" id="km-prevent" ${defaultPrevent?"checked":""}/> Prevented</label>
      <label><input type="checkbox" id="km-arrest"  ${defaultArrest?"checked":""}/> Arrested offenders</label>

      <label>Lives saved <input id="km-rescues" type="number" min="0" value="${peopleCount||0}"/></label>
      <label>Rescue actions <input id="km-actions" type="number" min="1" value="1"/></label>

      <label>Foe highest rank (≥30 counts) <input id="km-foe" type="number" min="0" value="0"/></label>
      <label>Property areas damaged <input id="km-prop" type="number" min="0" value="0"/></label>

      <label>Defeat
        <select id="km-defeat">
          <option value="none">None</option>
          <option value="private">Private (−20)</option>
          <option value="public">Public (−40)</option>
        </select>
      </label>
      <label><input type="checkbox" id="km-permitted"/> Permitted crime to occur</label>

      <label><input type="checkbox" id="km-death"/> Death caused by hero</label>
      <label>Noble/Mysterious/Self deaths <input id="km-noble" type="number" min="0" value="0"/></label>

      <label>Charity award (+) <input id="km-charity" type="number" min="0" value="0"/></label>
      <label>Commitment
        <select id="km-commit">
          <option value="none">—</option>
          <option value="kept">Kept (+5)</option>
          <option value="broke">Broke (−10)</option>
          <option value="leftEarly">Left early (−5)</option>
        </select>
      </label>

      <label class="msh-full">Participants (split evenly) <input id="km-party" type="number" min="1" value="${participants||1}"/></label>
    </div>
  `;

  await new Promise(resolve => {
    new Dialog({
      title: "Quick Karma (FASERIP)",
      content,
      buttons: {
        score: {
          label: "Score Karma",
          callback: async html => {
            const v = s => html.find(s).val();
            const n = s => Number(v(s) || 0);
            const b = s => html.find(s).prop("checked");

            const result = scoreKarma({
              crimeCategory: v("#km-crime"),
              prevent: b("#km-prevent"),
              arrest: b("#km-arrest"),
              conspiracy: v("#km-consp"),
              livesSaved: n("#km-rescues"),
              rescueActions: n("#km-actions"),
              foeHighestRank: n("#km-foe"),
              propertyAreas: n("#km-prop"),
              permittedCrime: b("#km-permitted"),
              defeat: v("#km-defeat"),
              deathByHero: b("#km-death"),
              nobleDeaths: n("#km-noble"),
              charity: n("#km-charity"),
              commitment: v("#km-commit"),
              participants: n("#km-party")
            });

            const list = result.lines.map(l => {
              const val = (typeof l.val === "number") ? (l.val >= 0 ? `+${l.val}` : `${l.val}`) : `${l.val}`;
              return `<div>• ${esc(l.label)} <span class="msh-right">${val}</span></div>`;
            }).join("");

            const perHero = result.deathByHero ? "Per rules: set current Karma to 0" : `${result.perHero >= 0 ? "+" : ""}${result.perHero}`;
            const total   = result.deathByHero ? "—" : `${result.total >= 0 ? "+" : ""}${result.total}`;

            const out = `
              <div class="champions-encounter" style="line-height:1.35;">
                <div style="font-weight:700">Karma Summary</div>
                <div class="msh-break"></div>
                <div style="display:flex;flex-direction:column;gap:2px">${list || "<div>— no components —</div>"}</div>
                <div class="msh-break"></div>
                <div><b>Total:</b> ${total}</div>
                <div><b>Per hero (participants split):</b> ${perHero}</div>
                <div class="msh-note">Apply awards on the sheet manually.</div>
              </div>
            `;
            const speaker = ChatMessage.getSpeaker({ token: canvas?.tokens?.controlled?.[0] ?? null });
            await ChatMessage.create({ content: out, speaker });
            resolve();
          }
        },
        cancel: { label: "Close", callback: () => resolve() }
      },
      render: html => { if (preCat) html.find("#km-crime").val(preCat); },
      default: "score"
    }).render(true);
  });
}

  // ---------- Dialog ----------
  const content = `
    <div style="display:grid;grid-template-columns:1fr;gap:8px;">
      <label>Activity
        <select id="enc-activity">
          <option value="patrol">On Patrol (encounter on 6+)</option>
          <option value="hq">At Headquarters (7+)</option>
          <option value="sid">In Secret ID (9+)</option>
        </select>
      </label>
      <label>Force an encounter?
        <input type="checkbox" id="enc-force"/>
      </label>
      <hr/>
      <label>Bias (type roll) −3..+3
        <input id="enc-bias" type="number" min="-3" max="3" step="1" value="0"/>
      </label>
      <label>Arrival mode
        <select id="enc-arrival">
          <option value="either">Either (2d6)</option>
          <option value="before">Before the event (1d6+)</option>
          <option value="after">After the event (1d6−)</option>
        </select>
      </label>
      <label>Proximity (0..3) — closer to “Exactly”
        <input id="enc-prox" type="number" min="0" max="3" step="1" value="0"/>
      </label>
      <label>People count
        <select id="enc-people">
          <option value="1to3">Bracket (1–3)</option>
          <option value="2d6x">2d6 product (1..36)</option>
          <option value="3d6x">3d6 product (1..216)</option>
        </select>
      </label>
    </div>
  `;

  const form = await new Promise(resolve => {
    new Dialog({
      title: "Champions II Encounter Generator",
      content,
      buttons: {
        go: {
          label: "Roll Encounter",
          callback: html => resolve({
            activity: html.find("#enc-activity").val(),
            force: html.find("#enc-force").prop("checked"),
            bias: Number(html.find("#enc-bias").val() || 0),
            arrival: html.find("#enc-arrival").val(),
            prox: Number(html.find("#enc-prox").val() || 0),
            peopleMode: html.find("#enc-people").val()
          })
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "go"
    }).render(true);
  });
  if (!form) return;

  // ---------- Encounter chance by activity ----------
  const thresholds = { patrol: 6, hq: 7, sid: 9 };
  const chanceLabel = {
    patrol: "On Patrol (need 6+ on 2d6)",
    hq: "At Headquarters (need 7+ on 2d6)",
    sid: "In Secret ID (need 9+ on 2d6)"
  };

  let chanceRoll = roll2d6Show();
  let encounterHappens = form.force || (chanceRoll.total >= thresholds[form.activity]);

  // ---------- Encounter type (2d6 with bias) ----------
  // Mapping per text:
  // 2 Special | 3 Natural Disaster | 4 Man-Made Disaster | 5–6 Major Crime | 7–9 Minor Crime | 10–12 Accident
  function encounterTypeFrom2d6(n) {
    if (n <= 2) return "Special";
    if (n === 3) return "Natural Disaster";
    if (n === 4) return "Man-Made Disaster";
    if (n <= 6) return "Major Crime";
    if (n <= 9) return "Minor Crime";
    return "Accident";
  }

  const typeRollRaw = roll2d6Show();
  const typeRollBiased = clamp(typeRollRaw.total + (form.bias || 0), 2, 12);
  const encounterType = encounterTypeFrom2d6(typeRollBiased);

  // ---------- Subtables ----------
  function subSpecial(n) {
    // 2 Space Disaster | 3–4 Alien Involvement | 5–7 Hunted | 8–9 DNPC | 10–11 Public/Secret ID | 12 Origin
    if (n <= 2) return "Space Disaster";
    if (n <= 4) return "Alien Involvement";
    if (n <= 7) return "Hunted";
    if (n <= 9) return "DNPC";
    if (n <= 11) return "Public/Secret ID";
    return "Origin";
  }
  function subNatural(n) {
    // 2 Tidal Wave | 3–4 Flood | 5–8 Storm | 9 Landslide/Avalanche | 10 Forest Fire | 11 Earthquake | 12 Volcano
    if (n <= 2) return "Tidal Wave";
    if (n <= 4) return "Flood";
    if (n <= 8) return "Storm";
    if (n === 9) return "Landslide/Avalanche";
    if (n === 10) return "Forest Fire";
    if (n === 11) return "Earthquake";
    return "Volcano";
  }
  function subManMade(n) {
    // 2 Train Accident | 3–4 Airplane Accident | 5–6 Freeway Accident | 7–8 Fire/Explosion
    // 9–10 Structural/Power Failure | 11 Chemical Spill | 12 Nuclear Accident
    if (n <= 2) return "Train Accident";
    if (n <= 4) return "Airplane Accident";
    if (n <= 6) return "Freeway Accident";
    if (n <= 8) return "Fire/Explosion";
    if (n <= 10) return "Structural/Power Failure";
    if (n === 11) return "Chemical Spill";
    return "Nuclear Accident";
  }
  function subMajor(n) {
    // 2–3 Hijacking | 4–6 Hostage Situation | 7–9 Robbery | 10–11 Extortion | 12 Special
    if (n <= 3) return "Hijacking";
    if (n <= 6) return "Hostage Situation";
    if (n <= 9) return "Robbery";
    if (n <= 11) return "Extortion";
    return "Special (GM-defined major crime)";
  }
  function subMinor(n) {
    // 2–3 Drugs | 4–6 Robbery | 7–9 Assault | 10–11 Burglary/Theft | 12 Arson/Bombing
    if (n <= 3) return "Drugs";
    if (n <= 6) return "Robbery";
    if (n <= 9) return "Assault";
    if (n <= 11) return "Burglary/Theft";
    return "Arson/Bombing";
  }
  function subAccident(n) {
    // The text lists: Medical, Automobile, Industrial, Falling, Special (no explicit bands),
    // so we distribute reasonably:
    // 2–3 Medical | 4–6 Automobile | 7–8 Industrial | 9–11 Falling | 12 Special
    if (n <= 3) return "Medical";
    if (n <= 6) return "Automobile";
    if (n <= 8) return "Industrial";
    if (n <= 11) return "Falling";
    return "Special (GM-defined accident)";
  }

  const subRoll = roll2d6Show();
  let subtype;
  switch (encounterType) {
    case "Special":           subtype = subSpecial(subRoll.total); break;
    case "Natural Disaster":  subtype = subNatural(subRoll.total); break;
    case "Man-Made Disaster": subtype = subManMade(subRoll.total); break;
    case "Major Crime":       subtype = subMajor(subRoll.total); break;
    case "Minor Crime":       subtype = subMinor(subRoll.total); break;
    case "Accident":          subtype = subAccident(subRoll.total); break;
  }

  // ---------- Arrival timing ----------
  // After (1d6−): [1:+1 Day, 2:+1 Hour, 3:+10 Min, 4:+1 Min, 5:+1 Turn, 6:Exactly]
  // Before (1d6+): [1:-1 Day, 2:-1 Hour, 3:-10 Min, 4:-1 Min, 5:-1 Turn, 6:Exactly]
  // Either (2d6):  [2:+1 Day, 3:+1 Hour, 4:+10 Min, 5:+1 Min, 6:+1 Turn, 7:Exactly,
  //                 8:-1 Turn, 9:-1 Min, 10:-10 Min, 11:-1 Hour, 12:-1 Day]
  function timeAfterLabel(n) {
    const table = ["+1 Day", "+1 Hour", "+10 Minutes", "+1 Minute", "+1 Turn", "Exactly"];
    return table[clamp(n,1,6)-1];
    }
  function timeBeforeLabel(n) {
    const table = ["-1 Day", "-1 Hour", "-10 Minutes", "-1 Minute", "-1 Turn", "Exactly"];
    return table[clamp(n,1,6)-1];
  }
  function timeEitherLabel(n) {
    const map = {
      2:"+1 Day", 3:"+1 Hour", 4:"+10 Minutes", 5:"+1 Minute", 6:"+1 Turn",
      7:"Exactly",
      8:"-1 Turn", 9:"-1 Minute", 10:"-10 Minutes", 11:"-1 Hour", 12:"-1 Day"
    };
    return map[clamp(n,2,12)];
  }

  let timeRollText = "", timeLabel = "", preventFix = "";
  if (form.arrival === "after") {
    let d = roll1d6();
    const nudged = clamp(d + (form.prox || 0), 1, 6);
    timeLabel = timeAfterLabel(nudged);
    timeRollText = `1d6− → ${d} (proximity +${form.prox||0} ⇒ ${nudged})`;
    preventFix = (timeLabel === "Exactly") ? "GM choice (prevent or fix)" : "Fix / Rescue (arrive after)";
  } else if (form.arrival === "before") {
    let d = roll1d6();
    const nudged = clamp(d + (form.prox || 0), 1, 6);
    timeLabel = timeBeforeLabel(nudged);
    timeRollText = `1d6+ → ${d} (proximity +${form.prox||0} ⇒ ${nudged})`;
    preventFix = (timeLabel === "Exactly") ? "GM choice (prevent or fix)" : "Prevent (arrive before)";
  } else {
    // either
    let r = roll2d6Show();
    let nudged = clamp(r.total + (form.prox || 0), 2, 12);
    timeLabel = timeEitherLabel(nudged);
    timeRollText = `2d6 → ${r.dice[0]}+${r.dice[1]}=${r.total} (proximity +${form.prox||0} ⇒ ${nudged})`;
    if (nudged < 7) preventFix = "Fix / Rescue (arrive after)";
    else if (nudged > 7) preventFix = "Prevent (arrive before)";
    else preventFix = "GM choice (prevent or fix)";
  }

  // ---------- People count ----------
  let peopleRollText = "", peopleCount = 1;
  if (form.peopleMode === "1to3") {
    const d = roll1d6();
    if (d <= 3) peopleCount = 1;
    else if (d <= 5) peopleCount = 2;
    else peopleCount = 3;
    peopleRollText = `1d6 → ${d} ⇒ ${peopleCount} people`;
  } else if (form.peopleMode === "2d6x") {
    const a = roll1d6(), b = roll1d6();
    peopleCount = a * b;
    peopleRollText = `2d6 product → ${a}×${b}=${peopleCount} people`;
  } else {
    const a = roll1d6(), b = roll1d6(), c = roll1d6();
    peopleCount = a * b * c;
    peopleRollText = `3d6 product → ${a}×${b}×${c}=${peopleCount} people`;
  }

  // ---------- Output ----------
  const actName = chanceLabel[form.activity];
  const chanceText = form.force
    ? "Forced: Encounter happens (GM override)."
    : `2d6 → ${chanceRoll.dice[0]}+${chanceRoll.dice[1]}=${chanceRoll.total} vs ${thresholds[form.activity]}+ ⇒ ` +
      (encounterHappens ? "<b>Encounter</b>" : "<b>No Encounter</b>");

  const header = `<h2 style="margin:0 0 6px;">Champions II Encounter</h2>`;
  const summary = `
    <div><b>Activity:</b> ${htmlEscape(actName)}</div>
    <div><b>Chance:</b> ${chanceText}</div>
  `;

  let body = "";
  if (encounterHappens) {
    body = `
      <hr/>
      <div><b>Type roll (2d6${form.bias? (form.bias>0?`+${form.bias}`:`${form.bias}`):""}):</b> ${typeRollRaw.dice[0]}+${typeRollRaw.dice[1]}=${typeRollRaw.total}${form.bias?` ⇒ ${typeRollBiased}`:""} → <b>${htmlEscape(encounterType)}</b></div>
      <div><b>Subtype (2d6):</b> ${subRoll.dice[0]}+${subRoll.dice[1]}=${subRoll.total} → <b>${htmlEscape(subtype)}</b></div>
      <div><b>Arrival:</b> ${htmlEscape(timeLabel)} <span style="opacity:.8">(${timeRollText})</span></div>
      <div><b>Framing:</b> ${htmlEscape(preventFix)}</div>
      <div><b>People involved:</b> ${peopleCount} <span style="opacity:.8">(${peopleRollText})</span></div>
      <details style="margin-top:6px;">
        <summary>GM tips</summary>
        <ul style="margin:6px 0 0 20px;">
          <li>Choose “prevent” scenes (arrive before) to emphasize heroism; “fix” scenes (arrive after) to emphasize rescue/drama.</li>
          <li>Scale difficulty with people count and environment hazards (fire, traffic, heights, weather).</li>
          <li>Use the subtype paragraph in your book as color: e.g., ${htmlEscape(subtype)} cues specific obstacles and stakes.</li>
        </ul>
      </details>
    `;
  } else {
    body = `<div style="margin-top:6px;">No encounter generated. Re-run or toggle “Force an encounter” to prep a beat anyway.</div>`;
  }

  const speaker = ChatMessage.getSpeaker({ token: canvas?.tokens?.controlled?.[0] ?? null });
  const contentOut = `<div class="champions-encounter" style="line-height:1.35;">${header}${summary}${body}</div>`;
  await ChatMessage.create({ content: contentOut, speaker });

  // Offer Quick Karma whenever an encounter actually occurred
  if (encounterHappens) {
    const participants = Math.max(1, (canvas?.tokens?.controlled?.filter(t => t?.actor).length || 1));
    await openKarmaDialog({
      encType: encounterType,
      encSubtype: subtype,
      defaultPrevent: /Prevent/.test(preventFix),
      defaultArrest: false,
      peopleCount,
      participants
    });
  }

})();