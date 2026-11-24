// card-kit.js v1.0.0 - 2026-11-23
// Shared chat-card helpers for power actions.

import { RANK_ABBR } from "../../rules/rules-reference.js";

export function colorBg(c) {
  switch ((c || '').toLowerCase()) {
    case 'white':  return '#f5f5f0';
    case 'green':  return '#4CAF50';
    case 'yellow': return '#FFC107';
    case 'red':    return '#F44336';
    default:       return '#ddd';
  }
}

export function colorFg(c) {
  switch ((c || '').toLowerCase()) {
    case 'white':  return '#1a1a1a';
    case 'green':  return '#fff';
    case 'yellow': return '#1a1a1a';
    case 'red':    return '#fff';
    default:       return '#1a1a1a';
  }
}

export function postPassiveCard(actor, item, cfg, kindLabel) {
  const rank = item.system?.rank || "Typical";
  const short = RANK_ABBR[rank] || rank;
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="background-color:#f5f5f0;border:1px solid #c0c0c0;border-radius:3px;margin-bottom:5px;">
        <div style="padding:5px 10px;border-bottom:1px solid #c0c0c0;font-size:1.05em;color:#8b0000;">
          <strong>${item.name}</strong><br>
          <span style="font-size:0.85em;font-weight:400;">${kindLabel} (${short})</span>
        </div>
        <div style="padding:6px 10px;font-size:0.9em;">${cfg.text(rank)}</div>
      </div>`
  });
}
