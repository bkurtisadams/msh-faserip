// scripts/modules/actions/manual-mode-dialog.js
import { ACTION_RESULT_LABELS } from "../dice/universal-table.js";
import { shiftRank, getAbilityInfo, labelFor, bannerColors, buildResultGrid, rollWithKarma, debugLog } from "./action-utils.js";
import { rollUniversalTable } from "../dice/universal-table.js";

// scripts/modules/actions/manual-mode-dialog.js
export class ManualModeDialog {
  static setupChatListeners() {
    // Guard against double-install
    if (typeof game === "undefined") return;
    game.msh ??= {};
    if (game.msh.manualToggleInstalled) return;
    game.msh.manualToggleInstalled = true;

    // Toggle the collapsible section
    $(document)
      .off("click.mshManualToggle")
      .on("click.mshManualToggle", ".manual-action-toggle", (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();

        const $btn = $(ev.currentTarget);
        const $content = $btn.next(".manual-action-content");
        const expanded = $content.is(":visible");

        $content.stop(true, true).slideToggle(120, () => {
          $btn.attr("aria-expanded", String(!expanded));
        });
      });

    // Post a simple summary message from the selections
    $(document)
      .off("click.mshManualPost")
      .on("click.mshManualPost", ".manual-action-post", async (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();

        const $btn  = $(ev.currentTarget);
        const $card = $btn.closest(".manual-action-card");

        const color = ($card.find("input[name='manual-color']:checked").val() || "Green");
        const fx    = ($card.find("select[name='manual-effect']").val() || "");
        const notes = ($card.find("textarea.manual-notes").val() || "").trim();

        const actionType = $card.attr("data-action-type") || "blunt-attack";
        const actorUuid  = $card.attr("data-actor-uuid")  || "";
        const tokenUuid  = $card.attr("data-token-uuid")  || "";
        const rankLabel  = $card.attr("data-rank-label")  || "";
        const cs         = Number($card.attr("data-cs") || "0") || 0;

        let actor = null;
        let tokenDoc = null;
        try { actor    = actorUuid ? await fromUuid(actorUuid) : null; } catch (_) {}
        try { tokenDoc = tokenUuid ? await fromUuid(tokenUuid) : null; } catch (_) {}

        const speaker = ChatMessage.getSpeaker({ actor, token: tokenDoc });
        const actionLabel = (game.i18n && game.i18n.localize) ? game.i18n.localize(actionType) : actionType;

        const effectFrag = fx ? " • <b>" + fx + "</b>" : "";
        const csFrag     = cs ? " (CS " + (cs >= 0 ? "+" : "") + cs + ")" : "";
        const notesFrag  = notes ? '<div style="margin-top:6px;opacity:.8;"><i>' + TextEditor.enrichHTML(notes) + "</i></div>" : "";

        const who = actor ? actor.name : (speaker.alias || "Actor");
        const html = [
          '<div style="border:1px solid #bbb;border-radius:4px;padding:8px;">',
            '<div style="font-weight:700;margin-bottom:4px;">Manual Result: ' + actionLabel + '</div>',
            '<div>' + who + ' • Rank: <b>' + (rankLabel || "—") + "</b>" + csFrag + "</div>",
            "<div>Color: <b>" + color + "</b>" + effectFrag + "</div>",
            notesFrag,
          "</div>"
        ].join("");

        await ChatMessage.create({ speaker, content: html });
      });
  }

  /**
   * Post a Manual-Mode chat card for any action.
   * opts = { actor, token, actionType, rankLabel, cs }
   */
  static async postManualActionCard(opts = {}) {
    const actor      = opts.actor || null;
    const tokenDoc   = opts.token || null;
    const actionType = String(opts.actionType || "blunt-attack");
    const rankLabel  = String(opts.rankLabel || "");
    const cs         = Number(opts.cs || 0);

    const speaker   = ChatMessage.getSpeaker({ actor, token: tokenDoc });
    const actorUuid = (actor && actor.uuid) ? actor.uuid : "";
    const tokenUuid =
      (tokenDoc && tokenDoc.uuid) ? tokenDoc.uuid :
      (actor && actor.getActiveTokens ? (actor.getActiveTokens()[0]?.document?.uuid || "") : "");

    // Escape the attribute safely if foundry.utils isn't present early
    const esc = (s) => {
      if (foundry && foundry.utils && foundry.utils.escapeHTML) return foundry.utils.escapeHTML(s);
      return String(s).replace(/[<>&"]/g, (c) => ({ "<":"&lt;","&":"&amp;",">":"&gt;",'"':"&quot;" }[c]));
    };

    const actionLabel = (game.i18n && game.i18n.localize) ? game.i18n.localize(actionType) : actionType;
    const who = actor ? actor.name : (speaker.alias || "Actor");

    const parts = [];
    parts.push('<div class="manual-action-card"');
    parts.push(' data-action-type="' + actionType + '"');
    parts.push(' data-actor-uuid="' + actorUuid + '"');
    parts.push(' data-token-uuid="' + tokenUuid + '"');
    parts.push(' data-rank-label="' + esc(rankLabel) + '"');
    parts.push(' data-cs="' + cs + '">');
    parts.push('<a href="#" class="manual-action-toggle" aria-expanded="false" ');
    parts.push('style="display:inline-block;padding:6px 10px;border:1px solid #bbb;border-radius:4px;text-decoration:none;">');
    parts.push('Manual: ' + actionLabel + ' — ' + who + '</a>');
    parts.push('<div class="manual-action-content" style="display:none;margin-top:8px;border:1px dashed #bbb;border-radius:4px;padding:8px;">');
    parts.push('<div style="margin-bottom:6px;">Rank: <b>' + (rankLabel || "—") + "</b> " + (cs ? '(CS ' + (cs >= 0 ? "+" : "") + cs + ')' : "") + "</div>");
    parts.push('<div style="margin:6px 0;">Choose Result Color:</div>');
    parts.push('<label style="margin-right:10px;"><input type="radio" name="manual-color" value="White"> White</label>');
    parts.push('<label style="margin-right:10px;"><input type="radio" name="manual-color" value="Green" checked> Green</label>');
    parts.push('<label style="margin-right:10px;"><input type="radio" name="manual-color" value="Yellow"> Yellow</label>');
    parts.push('<label style="margin-right:10px;"><input type="radio" name="manual-color" value="Red"> Red</label>');
    parts.push('<div style="margin:10px 0 6px;">Effect (optional):</div>');
    parts.push('<select name="manual-effect">');
    parts.push('<option value="">—</option>');
    parts.push('<option value="Stun">Stun</option>');
    parts.push('<option value="Slam">Slam</option>');
    parts.push('<option value="Kill">Kill</option>');
    parts.push('<option value="Grab">Grab</option>');
    parts.push('<option value="Grapple">Grapple</option>');
    parts.push('<option value="Catch">Catch</option>');
    parts.push('<option value="Block">Block</option>');
    parts.push('<option value="Dodge">Dodge</option>');
    parts.push('<option value="Evade">Evade</option>');
    parts.push('</select>');
    parts.push('<div style="margin:10px 0 6px;">Notes (optional):</div>');
    parts.push('<textarea class="manual-notes" rows="3" style="width:100%;"></textarea>');
    parts.push('<div style="margin-top:10px;"><button type="button" class="manual-action-post" style="padding:6px 10px;">Post Result</button></div>');
    parts.push('</div></div>');

    const html = parts.join("");

    return ChatMessage.create({
      speaker,
      content: html,
      flags: {
        "msh-faserip": {
          manualCard: true,
          actionType,
          actorUuid,
          tokenUuid,
          rankLabel,
          cs
        }
      }
    });
  }
}
