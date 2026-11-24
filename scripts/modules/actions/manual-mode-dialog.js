// scripts/modules/actions/manual-mode-dialog.js




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

}
