// Vehicle Chase Sandbox v1.1.0 - 2026-11-22
// v1.1.0: for the compact Control FEAT dialog (msh-faserip 2.55.50). Each
//         button opens the dialog with its Maneuver already chosen, and Hit
//         something opens the crash step. A turn of up to 90 degrees costs
//         one area and needs no FEAT; the new Sudden 90 buttons keep the
//         full move and roll.
// Script macro for msh-faserip 2.55.50 or later. Run as GM.
// Drives vehicle actors round by round with the system's own Control FEAT
// dialog, so the map, the vehicle sheet and the chat cards all show real
// results. Nothing here changes the rules; it only moves tokens and sets
// each vehicle's Current Speed.

(async () => {
  if (!game.user.isGM) return ui.notifications.warn("Run the Vehicle Chase Sandbox as GM.");
  const { DialogV2 } = foundry.applications.api;
  const modPath = foundry.utils.getRoute(`systems/${game.system.id}/scripts/modules/actions/vehicle-control.js`);
  let openVehicleControl, openVehicleCrash, getOocState;
  try { ({ openVehicleControl, openVehicleCrash, getOocState } = await import(modPath)); }
  catch (e) { console.error(e); return ui.notifications.error("vehicle-control.js not found. The sandbox needs msh-faserip 2.55.50 or later."); }
  if (typeof openVehicleCrash !== "function") return ui.notifications.error("The sandbox needs msh-faserip 2.55.50 or later.");

  const PREFIX = "Chase Sandbox";
  const SCENE_NAME = "Vehicle Chase Sandbox";
  const RANKS = ["Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent", "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly", "Shift-X", "Shift-Y", "Shift-Z"];
  const LAND = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16];
  const AIR = [0, 2, 4, 6, 8, 10, 15, 20, 25, 30, 40, 50, 100, 200];
  const RANK_VALUE = { "Shift-0": 0, Feeble: 2, Poor: 4, Typical: 6, Good: 10, Excellent: 20, Remarkable: 30, Incredible: 40, Amazing: 50, Monstrous: 75, Unearthly: 100 };
  const idx = (rank) => Math.max(0, RANKS.indexOf(rank));
  const column = (type) => ["Air", "Space", "GEV"].includes(type) ? AIR : LAND;
  const areasFor = (rank, type) => column(type)[idx(rank)] ?? 0;
  const rankForAreas = (areas, type) => { const col = column(type); const i = col.findIndex(v => v >= areas); return RANKS[i < 0 ? RANKS.length - 1 : i]; };
  const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

  // ---------------------------------------------------------------- setup
  async function buildScene() {
    let scene = game.scenes.getName(SCENE_NAME);
    if (!scene) {
      scene = await Scene.create({
        name: SCENE_NAME, width: 3000, height: 2000, padding: 0, backgroundColor: "#3d6b3d",
        grid: { type: 1, size: 100, distance: 1, units: "areas" }, tokenVision: false, fogExploration: false
      });
      const rect = (x, y, w, h, fill, text = "", extra = {}) => ({
        x, y, shape: { type: "r", width: w, height: h }, fillType: 1, fillColor: fill, fillAlpha: 1,
        strokeWidth: 2, strokeColor: "#222222", text, fontSize: 28, textColor: "#ffffff", ...extra
      });
      try {
        await scene.createEmbeddedDocuments("Drawing", [
          rect(0, 900, 3000, 200, "#555555", "MAIN STREET (road)"),
          rect(1400, 0, 200, 2000, "#555555", "CROSS STREET"),
          rect(100, 1250, 1100, 600, "#2e7d32", "PARK (off-road)"),
          rect(2700, 900, 100, 100, "#9e9e9e", "Concrete\nExcellent", { fontSize: 18, textColor: "#000000" }),
          rect(1400, 100, 200, 60, "#8d4a2f", "Brick wall — Good", { fontSize: 18 }),
          rect(600, 1250, 300, 30, "#a1887f", "Wood fence — Poor", { fontSize: 16 })
        ]);
      } catch (e) { console.warn("Chase Sandbox: drawings skipped", e); }
    }
    if (canvas.scene?.id !== scene.id) await scene.view();
    return scene;
  }

  async function demoActor(name, type, data) {
    const full = `${PREFIX} - ${name}`;
    const existing = game.actors.find(a => a.name === full && a.type === type);
    if (existing) return existing;
    const ActorClass = Actor.implementation ?? Actor;
    return ActorClass.create({ name: full, type, ...data });
  }

  async function addDemoCars() {
    const scene = canvas.scene;
    const crook = await demoActor("Getaway Driver", "hero", { system: { abilities: { agility: { value: 10 } } }, prototypeToken: { actorLink: true } });
    const cop = await demoActor("Pursuit Officer", "hero", { system: { abilities: { agility: { value: 20 } } }, prototypeToken: { actorLink: true } });
    const car = (driver, sys) => ({ system: { type: "Road", bodyHP: RANK_VALUE[sys.body], bodyHPMax: RANK_VALUE[sys.body], seatingCapacity: 2, driverUuid: driver.uuid, passengerUuids: [], currentSpeed: "", outOfControl: false, ...sys }, prototypeToken: { actorLink: true, displayName: 30 } });
    const sports = await demoActor("Sports Car", "vehicle", car(crook, { control: "Excellent", speed: "Remarkable", body: "Poor", protection: "Poor", cost: "Incredible" }));
    const police = await demoActor("Police Car", "vehicle", car(cop, { control: "Good", speed: "Excellent", body: "Typical", protection: "Typical", cost: "Remarkable" }));
    const onSandbox = scene.name === SCENE_NAME;
    const g = scene.grid.size;
    const c = canvas.stage?.pivot ?? { x: scene.width / 2, y: scene.height / 2 };
    const spots = onSandbox ? [[500, 950], [200, 950]] : [[c.x + g * 2, c.y], [c.x - g * 2, c.y]];
    const out = [];
    for (const [i, actor] of [sports, police].entries()) {
      let token = scene.tokens.find(t => t.actorId === actor.id);
      if (!token) {
        const td = await actor.getTokenDocument({ x: spots[i][0], y: spots[i][1], actorLink: true });
        [token] = await scene.createEmbeddedDocuments("Token", [td.toObject()]);
      }
      out.push(token);
    }
    return out;
  }

  const vehicleTokens = () => canvas.scene.tokens.filter(t => t.actor?.type === "vehicle");

  if (!canvas?.scene || !vehicleTokens().length) {
    const choice = await DialogV2.wait({
      window: { title: "Vehicle Chase Sandbox — Setup" },
      content: `<p>No vehicle tokens on this scene. The sandbox can build a simple test scene (one grid square = one area, a road, a cross street, a park and three obstacles) or drop two demo cars on the scene you have open.</p>
        <p>The demo cars use the book's stats: Sports Car (Control Ex, Speed Rm, Body Pr, Protection Pr) and Police Car (Control Gd, Speed Ex, Body Ty, Protection Ty).</p>`,
      buttons: [
        { action: "scene", label: "Build test scene + cars", default: true },
        ...(canvas?.scene ? [{ action: "here", label: "Demo cars on this scene" }] : []),
        { action: "cancel", label: "Cancel" }
      ],
      rejectClose: false
    });
    if (!choice || choice === "cancel") return;
    if (choice === "scene") await buildScene();
    await addDemoCars();
  }

  // ---------------------------------------------------------------- state
  const scene = canvas.scene;
  const unitsPerArea = (() => {
    const u = String(scene.grid.units || "").toLowerCase();
    if (u.startsWith("area")) return 1;
    let s; try { s = Number(game.settings.get(game.system.id, "unitsPerArea")); } catch { s = 0; }
    if (s > 0) return s;
    return { ft: 132, feet: 132, m: 40, meter: 40, meters: 40, yd: 44, yard: 44, yards: 44 }[u] ?? 132;
  })();
  const pxPerArea = unitsPerArea / (Number(scene.grid.distance) || 1) * scene.grid.size;
  const squaresPerArea = pxPerArea / scene.grid.size;

  const cars = vehicleTokens().map(token => {
    const sys = token.actor.system;
    const type = sys.type || "Road";
    return { token, actor: token.actor, type, heading: 90, areas: areasFor(sys.currentSpeed, type), offRoad: false };
  });
  let round = 1;
  let pending = null;

  const safeRank = (car) => RANKS[Math.max(0, idx(car.actor.system.speed || "Typical") - Math.abs(Number(car.actor.system.speedCSLoss) || 0))];
  const safeAreas = (car) => areasFor(safeRank(car), car.type);
  const driverOf = (car) => { const d = car.actor.system.driverUuid ? fromUuidSync(car.actor.system.driverUuid) : null; return d ? (d.token?.name || d.name) : null; };
  const headingName = (h) => ({ 0: "north", 45: "north-east", 90: "east", 135: "south-east", 180: "south", 225: "south-west", 270: "west", 315: "north-west" }[((h % 360) + 360) % 360] ?? `${h}°`);

  async function say(car, title, text) {
    await ChatMessage.create({
      speaker: { alias: "Chase Sandbox" },
      content: `<div style="background:#eef3f8;border:1px solid #9db3c8;border-radius:3px;padding:5px 8px;font-size:.9em;">
        <div style="font-weight:bold;color:#1a3c5e;">Round ${round} — ${esc(car.actor.name)}: ${title}</div><div>${text}</div></div>`
    });
  }

  async function setSpeed(car, areas) {
    car.areas = Math.max(0, areas);
    const rank = car.areas > 0 ? rankForAreas(car.areas, car.type) : "";
    if ((car.actor.system.currentSpeed || "") !== rank) await car.actor.update({ "system.currentSpeed": rank });
  }

  async function drive(car, areas) {
    if (areas <= 0) return;
    const rad = (car.heading - 90) * Math.PI / 180;
    const doc = car.token;
    const w = doc.width * scene.grid.size, h = doc.height * scene.grid.size;
    const r = canvas.dimensions.sceneRect;
    const wantX = doc.x + Math.cos(rad) * areas * pxPerArea;
    const wantY = doc.y + Math.sin(rad) * areas * pxPerArea;
    const x = Math.min(Math.max(wantX, r.x), r.x + r.width - w);
    const y = Math.min(Math.max(wantY, r.y), r.y + r.height - h);
    const artFacing = Number(car.actor.getFlag(game.system.id, "artFacing")) || 0;
    await doc.update({ x, y, rotation: ((car.heading - artFacing) % 360 + 360) % 360 });
    if (Math.abs(x - wantX) > 1 || Math.abs(y - wantY) > 1) ui.notifications.info(`${car.actor.name} reached the edge of the map.`);
  }

  function syncFromActor(car) {
    const ooc = getOocState(car.actor);
    const rank = ooc ? ooc.speed : car.actor.system.currentSpeed;
    const sheetAreas = areasFor(rank, car.type);
    if (!rank) car.areas = 0;
    else if (rankForAreas(car.areas, car.type) !== rank) car.areas = sheetAreas;
    return ooc;
  }

  function waitForCard(car) {
    return new Promise(resolve => {
      const id = Hooks.on("createChatMessage", (msg) => {
        const c = msg.content || "";
        if (!(c.includes("Vehicle Control FEAT") || c.includes("Vehicle Crash")) || !c.includes(car.actor.name)) return;
        Hooks.off("createChatMessage", id); pending = null; setTimeout(() => resolve(true), 150);
      });
      pending = { car, skip: () => { Hooks.off("createChatMessage", id); pending = null; resolve(false); } };
    });
  }

  async function feat(car, hint, preset = {}) {
    const done = waitForCard(car);
    refresh(`Waiting for ${car.actor.name}'s Control FEAT. ${hint}`);
    if (preset.crash) openVehicleCrash(car.actor, null, { speed: car.areas ? rankForAreas(car.areas, car.type) : undefined });
    else openVehicleControl(car.actor, null, preset);
    const rolled = await done;
    return { rolled, ooc: syncFromActor(car) };
  }

  // ------------------------------------------------------------ maneuvers
  const MANEUVERS = {
    accelerate: { label: "Accelerate", tip: "Up 2 areas/round, to the safe Speed. No FEAT.", run: async (car) => {
      if (car.areas >= safeAreas(car)) return say(car, "Accelerate", `Already at the safe Speed (${safeRank(car)}). Going faster is Floor it: one rank over, with a Control FEAT for every action.`);
      const next = Math.min(car.areas + 2, safeAreas(car));
      await setSpeed(car, next); await drive(car, next);
      await say(car, "Accelerate", `Vehicles accelerate in 2 areas/round stages. Now moving ${next} areas/round (${rankForAreas(next, car.type)}). No Control FEAT.`);
    } },
    hold: { label: "Hold speed", tip: "Drive straight at the current speed. No FEAT.", run: async (car) => {
      await drive(car, car.areas);
      await say(car, "Hold speed", `Drives ${car.areas} areas ${headingName(car.heading)}. No Control FEAT.`);
    } },
    slow: { label: "Slow down", tip: "Down 2 ranks. No FEAT.", run: async (car) => {
      const rank = RANKS[Math.max(0, idx(rankForAreas(car.areas, car.type)) - 2)];
      const next = areasFor(rank, car.type);
      await setSpeed(car, next); await drive(car, next);
      await say(car, "Slow down", `Normal deceleration is 2 ranks a round. Now ${next ? `${next} areas/round (${rank})` : "stopped"}. No Control FEAT.`);
    } },
    stop: { label: "Sudden stop", feat: true, tip: "Down 3 ranks. Control FEAT.", run: async (car) => {
      const before = car.areas;
      const rank = RANKS[Math.max(0, idx(rankForAreas(car.areas, car.type)) - 3)];
      const { rolled, ooc } = await feat(car, "Sudden stop: roll at the current speed.", { maneuver: "Sudden stop" });
      if (!rolled) return;
      if (ooc) { await drive(car, car.areas); return say(car, "Sudden stop FAILED", `Out of control: carries on ${car.areas} areas ${headingName(car.heading)} instead of stopping.`); }
      const next = areasFor(rank, car.type);
      await setSpeed(car, next); await drive(car, next);
      await say(car, "Sudden stop", `Drops 3 ranks with a Control FEAT: ${before} → ${next} areas/round.`);
    } },
    turn45L: { label: "Turn 45° left", tip: "Costs 1 area. No FEAT for ground vehicles.", run: (car) => turn(car, -45) },
    turn45R: { label: "Turn 45° right", tip: "Costs 1 area. No FEAT for ground vehicles.", run: (car) => turn(car, 45) },
    turn90L: { label: "Turn 90° left", tip: "Slows for the corner: costs 1 area, no FEAT. (Air vehicles roll for any turn of 45° or more.)", run: (car) => turn(car, -90) },
    turn90R: { label: "Turn 90° right", tip: "Slows for the corner: costs 1 area, no FEAT. (Air vehicles roll for any turn of 45° or more.)", run: (car) => turn(car, 90) },
    sudden90L: { label: "Sudden 90° left", feat: true, tip: "Takes the corner without slowing: full move, Control FEAT.", run: (car) => turn(car, -90, true) },
    sudden90R: { label: "Sudden 90° right", feat: true, tip: "Takes the corner without slowing: full move, Control FEAT.", run: (car) => turn(car, 90, true) },
    bootleg: { label: "Bootleg 180°", feat: true, tip: "Vehicle Stunt: a turn of more than 90°.", run: async (car) => {
      const { rolled, ooc } = await feat(car, "Vehicle Stunt is chosen and named. Set Difficulty: green or yellow for a trained driver, red for a novice.", { maneuver: "Vehicle Stunt", name: "Bootleg Turn" });
      if (!rolled) return;
      if (ooc) { await drive(car, car.areas); return say(car, "Bootleg FAILED", `Out of control: slides on ${car.areas} areas ${headingName(car.heading)}.`); }
      car.heading = (car.heading + 180) % 360; await drive(car, Math.max(0, car.areas - 1));
      await say(car, "Bootleg turn", `Turns of more than 90° are Vehicle Stunts. Now heading ${headingName(car.heading)}.`);
    } },
    offroad: { label: "Leave / rejoin road", feat: true, tip: "Road vehicles: Control FEAT to travel off-road.", run: async (car) => {
      if (car.offRoad) { car.offRoad = false; await drive(car, car.areas); return say(car, "Back on the road", "No Control FEAT to rejoin the road."); }
      const needs = car.type === "Road";
      if (needs) {
        const { rolled, ooc } = await feat(car, "Road vehicle going off-road. The book gives no number for the Control and Speed penalties; put your ruling in Column Shift or Difficulty.", { maneuver: "Travelling off-road" });
        if (!rolled) return;
        if (ooc) { await drive(car, car.areas); return say(car, "Off-road FAILED", `Out of control across the rough ground, ${car.areas} areas ${headingName(car.heading)}.`); }
      }
      car.offRoad = true; await drive(car, car.areas);
      await say(car, "Off-road", needs ? "Road vehicles make a Control FEAT for travelling off-road, and every round they stay there is your call." : "Off-Road types travel rough ground with no penalty and no FEAT.");
    } },
    speeding: { label: "Floor it (+1 rank)", feat: true, tip: "One rank over safe Speed. Every action needs a FEAT, one colour higher.", run: async (car) => {
      const overRank = RANKS[Math.min(RANKS.length - 1, idx(safeRank(car)) + 1)];
      const overAreas = areasFor(overRank, car.type);
      if (car.areas + 2 < overAreas) return say(car, "Floor it", `Not yet: at ${car.areas} areas/round the car can only reach ${car.areas + 2} this round. Accelerate first; ${overRank} is ${overAreas} areas/round.`);
      await setSpeed(car, overAreas);
      const { rolled, ooc } = await feat(car, `Current Speed is set to ${overRank}, one rank over safe. The dialog asks for one colour higher.`, { maneuver: "Action while speeding" });
      if (!rolled) return;
      await drive(car, car.areas);
      await say(car, ooc ? "Speeding — LOST IT" : "Speeding", `${overRank} is one rank over the safe Speed (${safeRank(car)}). While speeding, every action needs a Control FEAT at one colour higher${ooc ? "; the car is now out of control" : ""}.`);
    } },
    crash: { label: "Hit something", feat: true, tip: "Opens the crash step: pick the Crash Object, then Resolve Crash.", run: async (car) => {
      const { rolled } = await feat(car, "Pick the <b>Crash Object</b> material and press <b>Resolve Crash</b>.", { crash: true });
      if (!rolled) return;
      const ooc = syncFromActor(car);
      await say(car, "Crash", car.areas ? `Broke through and carries on at ${car.areas} areas/round${ooc ? ", still out of control" : ""}.` : "Stopped by the obstacle. Occupant and vehicle results are on the crash card.");
    } },
    ooc: { label: "Out-of-control round", feat: true, tip: "Moves straight, then rolls to regain control.", run: async (car) => {
      await drive(car, car.areas);
      const moved = car.areas;
      const { rolled, ooc } = await feat(car, "Regain roll: no Karma. Press Crash… instead if the car hits something this round.");
      if (!rolled) return;
      await say(car, ooc ? "Still out of control" : (car.areas ? "Control regained" : "Stopped"), `Moved ${moved} areas ${headingName(car.heading)} before the roll. ${ooc ? `Next round it moves ${car.areas} areas.` : ""}`);
    } }
  };

  async function turn(car, degrees, sudden = false) {
    const air = car.type === "Air";
    const needsFeat = sudden || (air && Math.abs(degrees) >= 45);
    if (needsFeat) {
      const { rolled, ooc } = await feat(car,
        air ? "Air vehicles: Control FEAT for a turn of 45° or more." : "Sudden turn: the car keeps its full move, so the driver rolls.",
        { maneuver: air ? "Turn of 45° or more" : "Sudden turn (no slowing)" });
      if (!rolled) return;
      if (ooc) { await drive(car, car.areas); return say(car, "Turn FAILED", `Out of control: misses the turn and carries on ${car.areas} areas ${headingName(car.heading)}.`); }
    }
    const moved = sudden ? car.areas : Math.max(0, car.areas - 1);
    car.heading = ((car.heading + degrees) % 360 + 360) % 360;
    await drive(car, moved);
    await say(car, `${sudden ? "Sudden turn" : "Turn"} ${Math.abs(degrees)}° ${degrees < 0 ? "left" : "right"}`, sudden
      ? `Takes the corner without slowing: the full ${moved} areas, now heading ${headingName(car.heading)}. Control FEAT made.`
      : `Slows for the corner: the turn counts as one area, so the car covers ${moved} areas, now heading ${headingName(car.heading)}. ${needsFeat ? "Control FEAT made." : "No Control FEAT."}`);
  }

  // ---------------------------------------------------------------- panel
  let panelEl = null;
  function carHtml(car, i) {
    const sys = car.actor.system;
    const ooc = getOocState(car.actor);
    const driver = driverOf(car);
    const loss = (k) => { const n = Math.abs(Number(sys[k]) || 0); return n ? ` <span style="color:#b71c1c;">−${n}CS</span>` : ""; };
    const btn = (key) => { const m = MANEUVERS[key]; const off = !driver || pending || (ooc ? !["ooc", "crash"].includes(key) : key === "ooc") || (!ooc && car.areas === 0 && !["accelerate", "crash"].includes(key));
      return `<button type="button" data-car="${i}" data-m="${key}" title="${esc(m.tip)}" ${off ? "disabled" : ""} style="width:auto;flex:0 0 auto;padding:2px 7px;font-size:12px;line-height:1.5;${m.feat ? "border-color:#8b0000;color:#8b0000;" : ""}">${m.label}${m.feat ? " ●" : ""}</button>`; };
    return `<div style="border:1px solid #999;border-radius:4px;padding:6px 8px;margin-bottom:8px;${ooc ? "background:#ffebee;" : ""}">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <strong>${esc(car.actor.name)}</strong>
        <span>${driver ? `Driver: ${esc(driver)}` : `<span style="color:#b71c1c;">No driver — add one on the Crew tab</span>`}</span>
      </div>
      <div style="font-size:12px;margin:3px 0;">${esc(car.type)} · Control ${esc(sys.control)}${loss("controlCSLoss")} · Speed ${esc(sys.speed)}${loss("speedCSLoss")} · Body ${esc(sys.body)}${loss("bodyCSLoss")} · Protection ${esc(sys.protection)}</div>
      <div style="font-size:12px;margin:3px 0;">Now: <strong>${car.areas ? `${car.areas} areas/round (${rankForAreas(car.areas, car.type)})` : "stopped"}</strong>, heading ${headingName(car.heading)}${car.offRoad ? ", off-road" : ""} · safe Speed ${safeRank(car)} (${safeAreas(car)} areas/round)
        ${ooc ? `<span style="margin-left:6px;padding:1px 5px;border-radius:3px;background:#c62828;color:#fff;font-weight:bold;">OUT OF CONTROL</span>` : ""}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">${Object.keys(MANEUVERS).map(btn).join("")}</div>
    </div>`;
  }
  function panelHtml(status = "") {
    return `<div class="chase-sandbox">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <strong>Round ${round}</strong>
        <span style="font-size:12px;color:#555;">1 area = ${Math.round(squaresPerArea * 10) / 10} grid square${squaresPerArea === 1 ? "" : "s"} on this scene · ● = Control FEAT</span>
        <button type="button" data-next="1" ${pending ? "disabled" : ""} style="width:auto;flex:0 0 auto;padding:2px 8px;">Next round</button>
      </div>
      ${cars.map(carHtml).join("")}
      <div style="min-height:2.4em;font-size:12px;padding:4px 6px;border:1px dashed #999;border-radius:3px;">
        ${status || "Pick one maneuver per vehicle each round, then Next round. Hover a button for its rule."}
        ${pending ? ` <button type="button" data-skip="1" style="width:auto;padding:0 6px;margin-left:6px;">Skip this FEAT</button>` : ""}
      </div>
    </div>`;
  }
  function refresh(status = "") {
    const host = panelEl?.querySelector(".chase-sandbox")?.parentElement;
    if (host) host.innerHTML = panelHtml(status);
  }

  const updateHook = Hooks.on("updateActor", (actor) => {
    const car = cars.find(c => c.actor.id === actor.id);
    if (!car || pending) return;
    syncFromActor(car); refresh();
  });

  await DialogV2.wait({
    window: { title: "Vehicle Chase Sandbox" },
    position: { width: 640 },
    content: panelHtml(),
    buttons: [{ action: "close", label: "Close sandbox" }],
    rejectClose: false,
    render: (event, dialog) => {
      panelEl = dialog.element;
      panelEl.addEventListener("click", async (ev) => {
        const b = ev.target.closest("button[data-m], button[data-next], button[data-skip]");
        if (!b || b.disabled) return;
        ev.preventDefault(); ev.stopPropagation();
        if (b.dataset.skip) { pending?.skip(); return refresh("FEAT skipped; nothing moved."); }
        if (b.dataset.next) { round++; return refresh(); }
        const car = cars[Number(b.dataset.car)];
        const m = MANEUVERS[b.dataset.m];
        try {
          if (!m.feat && car.areas > safeAreas(car)) {
            const { rolled, ooc } = await feat(car, "Speeding: every action needs a Control FEAT, one colour higher.", { maneuver: "Action while speeding" });
            if (!rolled) return refresh("FEAT skipped; nothing moved.");
            if (ooc) { await drive(car, car.areas); await say(car, `${m.label} FAILED`, `Lost it while speeding: carries on ${car.areas} areas ${headingName(car.heading)}, out of control.`); return refresh(); }
          }
          await m.run(car);
        }
        catch (e) { console.error("Chase Sandbox", e); ui.notifications.error(`Chase Sandbox: ${e.message}`); }
        syncFromActor(car); refresh();
      });
    }
  });
  Hooks.off("updateActor", updateHook);
  pending?.skip();
})();
