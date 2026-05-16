// scripts/modules/actions/damage-transfer-action.js v1.0.0 - 2026-05-15
// Two-target touch dialog for the Damage Transfer power.
// RAW: "Health may be transferred between two separate targets on touch, in
//       effect healing one while reducing the Health of the other. The hero
//       may not regain any Health in this Damage Transfer."
// No FEAT (RAW silent — automatic on touch). No daily cap. Sink gain clamped
// at max HP (no overheal, per Health-Drain Touch analog). Hero cannot be
// either source or sink (cannot regain Health from this power, and being
// the source would be self-damage which isn't the intended use).

import { showFaseripDialog } from "./dialog-shim.js";
import { RANK_ABBR } from "../../rules/rules-reference.js";

const SCOPE = () => (globalThis.MSH_FLAG_SCOPE || game.system?.id || "msh-faserip");

export async function showDamageTransferDialog(hero, item) {
  if (!hero || !item) {
    ui.notifications.warn("Damage Transfer requires actor and power item.");
    return;
  }

  // ── Target resolution: exactly two targets, neither = hero ──────────
  const targets = Array.from(game.user.targets || []);
  if (targets.length !== 2) {
    ui.notifications.warn("Damage Transfer requires exactly two targets. Select two tokens.");
    return;
  }
  const actors = targets.map(t => t.actor).filter(Boolean);
  if (actors.length !== 2) {
    ui.notifications.warn("Both targets must have actors.");
    return;
  }
  if (actors.some(a => a.uuid === hero.uuid)) {
    ui.notifications.warn(`${hero.name} cannot be one of the two targets — hero is the conduit only.`);
    return;
  }

  const powerRank = item.system?.rank || "Typical";
  const powerValue = game.msh?.getRankValue?.(powerRank) ?? 0;
  const rankShort = RANK_ABBR[powerRank] || powerRank;

  // Build a snapshot of both actors for the dropdowns
  const snapshot = actors.map(a => ({
    uuid: a.uuid,
    name: a.name,
    hp: Number(a.system?.attributes?.health?.value ?? 0),
    max: Number(a.system?.attributes?.health?.max ?? 0),
  }));

  const sourceDefault = snapshot[0].uuid;
  const sinkDefault = snapshot[1].uuid;

  const buildOptions = (selectedUuid) =>
    snapshot.map(s =>
      `<option value="${s.uuid}" ${s.uuid === selectedUuid ? "selected" : ""}>${s.name} (${s.hp}/${s.max})</option>`
    ).join("");

  // Initial computation
  const initialSrc = snapshot.find(s => s.uuid === sourceDefault);
  const initialSink = snapshot.find(s => s.uuid === sinkDefault);
  const initialMax = Math.min(powerValue, initialSrc.hp, Math.max(0, initialSink.max - initialSink.hp));

  const dialogContent = `
    <div class="frp-dlg frp-feat">
      <div class="frp-header-v3">
        <span class="h-actor" title="${hero.name}">${hero.name}</span>
        <span class="h-paren">(</span>
        <span class="h-stat">
          <span class="h-stat-label">Damage Transfer</span>
          <span class="h-stat-rank">${rankShort}</span>
          <span class="h-stat-val">${powerValue}</span>
        </span>
        <span class="h-paren">)</span>
      </div>

      <div class="frp-box" style="margin-top:8px;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);min-width:60px;">SOURCE</span>
          <select id="dt-source" style="flex:1;">${buildOptions(sourceDefault)}</select>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);min-width:60px;">SINK</span>
          <select id="dt-sink" style="flex:1;">${buildOptions(sinkDefault)}</select>
        </div>
        <div style="display:flex;justify-content:center;margin:4px 0;">
          <button type="button" id="dt-swap" class="frp-btn" style="font-size:0.85em;padding:2px 8px;">&uarr;&darr; Swap</button>
        </div>
      </div>

      <div class="frp-box" style="margin-top:6px;">
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="frp-box-label" style="margin:0;color:var(--feat-deep);">AMOUNT</span>
          <input type="number" id="dt-amount" min="1" max="${initialMax}" value="${initialMax}" style="width:70px;text-align:center;">
          <span id="dt-cap" style="color:#666;">(up to ${initialMax})</span>
        </div>
        <div id="dt-preview" style="margin-top:6px;color:#666;font-size:0.88em;line-height:1.4;">
          ${initialSrc.name}: ${initialSrc.hp} &rarr; ${initialSrc.hp - initialMax}<br>
          ${initialSink.name}: ${initialSink.hp} &rarr; ${initialSink.hp + initialMax}
        </div>
      </div>

      <div class="frp-foot" style="margin-top:8px;">
        <button type="button" id="frp-roll" class="frp-btn frp-btn-primary">Transfer</button>
        <button type="button" id="frp-cancel" class="frp-btn">Cancel</button>
      </div>
    </div>`;

  await showFaseripDialog({
    title: `Damage Transfer — ${hero.name}`,
    content: dialogContent,
    render: async (html, dlg) => {
      const $dialog = html.closest('.dialog');
      const $src = html.find('#dt-source');
      const $sink = html.find('#dt-sink');
      const $amt = html.find('#dt-amount');
      const $cap = html.find('#dt-cap');
      const $preview = html.find('#dt-preview');

      const recompute = () => {
        const srcUuid = $src.val();
        const sinkUuid = $sink.val();
        if (srcUuid === sinkUuid) {
          $preview.html(`<span style="color:#c62828;">Source and sink must be different.</span>`);
          $amt.val(0).prop('disabled', true);
          $cap.text("(invalid)");
          html.find('#frp-roll').prop('disabled', true);
          return;
        }
        const src = snapshot.find(s => s.uuid === srcUuid);
        const sink = snapshot.find(s => s.uuid === sinkUuid);
        const maxAmount = Math.min(powerValue, src.hp, Math.max(0, sink.max - sink.hp));
        if (maxAmount <= 0) {
          const reason = src.hp <= 0
            ? `${src.name} has no Health to transfer.`
            : (sink.max - sink.hp <= 0 ? `${sink.name} is at max Health.` : "No transfer possible.");
          $preview.html(`<span style="color:#c62828;">${reason}</span>`);
          $amt.val(0).prop('disabled', true);
          $cap.text("(0)");
          html.find('#frp-roll').prop('disabled', true);
          return;
        }
        const currentAmt = Math.max(1, Math.min(maxAmount, Number($amt.val() || maxAmount)));
        $amt.prop('disabled', false).attr('max', maxAmount).val(currentAmt);
        $cap.text(`(up to ${maxAmount})`);
        $preview.html(
          `${src.name}: ${src.hp} &rarr; ${src.hp - currentAmt}<br>` +
          `${sink.name}: ${sink.hp} &rarr; ${sink.hp + currentAmt}`
        );
        html.find('#frp-roll').prop('disabled', false);
      };

      $src.on('change', recompute);
      $sink.on('change', recompute);
      $amt.on('input', recompute);
      html.find('#dt-swap').on('click', () => {
        const s = $src.val();
        $src.val($sink.val());
        $sink.val(s);
        recompute();
      });

      const commit = async () => {
        const srcUuid = $src.val();
        const sinkUuid = $sink.val();
        if (srcUuid === sinkUuid) {
          ui.notifications.warn("Source and sink must be different.");
          return;
        }
        const amount = Math.max(1, Number($amt.val() || 0));
        const srcActor = await fromUuid(srcUuid);
        const sinkActor = await fromUuid(sinkUuid);
        if (!srcActor || !sinkActor) {
          ui.notifications.warn("Could not resolve one of the target actors.");
          return;
        }

        const srcHp = Number(srcActor.system?.attributes?.health?.value ?? 0);
        const sinkHp = Number(sinkActor.system?.attributes?.health?.value ?? 0);
        const sinkMax = Number(sinkActor.system?.attributes?.health?.max ?? sinkHp);
        const cappedAmount = Math.min(amount, powerValue, srcHp, Math.max(0, sinkMax - sinkHp));
        if (cappedAmount <= 0) {
          ui.notifications.warn("Nothing to transfer.");
          return;
        }

        const newSrcHp = Math.max(0, srcHp - cappedAmount);
        const newSinkHp = Math.min(sinkMax, sinkHp + cappedAmount);

        await srcActor.update({ "system.attributes.health.value": newSrcHp });
        await sinkActor.update({ "system.attributes.health.value": newSinkHp });

        const srcZeroWarn = newSrcHp === 0
          ? `<div style="margin-top:6px;padding:6px;background:#c62828;color:#fff;text-align:center;font-weight:bold;">${srcActor.name} reduced to 0 HP — normal dying rules apply.</div>`
          : "";

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: hero }),
          content: `
            <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
              <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
                <strong>Damage Transfer</strong><br>
                <span style="font-size:0.85em;font-weight:400;">${hero.name} (conduit)</span>
              </div>
              <div style="padding:8px 10px;font-size:0.95em;">
                <div>${srcActor.name}: <strong>${srcHp}</strong> &rarr; <strong>${newSrcHp}</strong> &nbsp; (&minus;${cappedAmount})</div>
                <div>${sinkActor.name}: <strong>${sinkHp}</strong> &rarr; <strong>${newSinkHp}</strong> &nbsp; (+${cappedAmount})</div>
              </div>
              ${srcZeroWarn}
            </div>`
        });
      };

      html.find('#frp-roll').on('click', async () => {
        try { await commit(); } finally { dlg.close(); }
      });
      html.find('#frp-cancel').on('click', () => dlg.close());
      html.find('#frp-roll').focus();
      $dialog.on('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          html.find('#frp-roll').trigger('click');
        }
      });

      recompute();
    }
  });
}
