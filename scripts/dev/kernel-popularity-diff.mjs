// scripts/dev/kernel-popularity-diff.mjs v1.0.0 - 2026-09-05
// Popularity/Resource proof: contact-action.js v1.1.0, actorSheet.js v2.10.0
// and headquartersSheet.js v3.1.0 vs faserip-rules popularity/resources/feats
// v0.1.0. The pre-slice behaviour is restated in `legacy` so the fixed-bugs
// show against their old numbers. Run from the msh-faserip system root:
//   node scripts/dev/kernel-popularity-diff.mjs
import {
  DISPOSITION_COLOR, REQUEST_MODIFIERS, popularityFeat, POPULARITY_VERSION,
} from '../lib/faserip-rules/faserip-popularity.js';
import {
  purchaseColor, resourceFeatAvailable, purchaseBlockedByFailure, bankLoan, RESOURCE_FEAT_INTERVAL_DAYS, RESOURCES_VERSION,
} from '../lib/faserip-rules/faserip-resources.js';
import { combinedActionColumn, multipleActionColor, FEATS_VERSION } from '../lib/faserip-rules/faserip-feats.js';
import { RANKS, rankByKey } from '../lib/faserip-rules/faserip-kernel.js';

let match = 0, fixed = 0, open = 0;
const M = (label, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja === jb) { match++; console.log(`MATCH     ${label}`); } else { fixed++; console.log(`FIXED-BUG ${label}\n          current ${ja}\n          kernel  ${jb}`); } };
const FIXED = (label, was, now) => { fixed++; console.log(`FIXED-BUG ${label}\n          was     ${JSON.stringify(was)}\n          now     ${JSON.stringify(now)}`); };
const OPEN = (label, note) => { open++; console.log(`OPEN      ${label}  ${note}`); };
const GAP = (label, note) => console.log(`GAP       ${label}  ${note}`);
const KEYS = RANKS.map(r => r.key);

// ---- pre-slice behaviour
const legacy = {
  dispColor: { Friendly: 'Green', Neutral: 'Yellow', Suspicious: 'Red', Hostile: 'Impossible' },
  negPopDisposition: (stored) => ['Friendly', 'Neutral', 'Suspicious', 'Hostile'][Math.min(['Friendly', 'Neutral', 'Suspicious', 'Hostile'].indexOf(stored) + 1, 3)],
  resourceReq: (resIdx, itemIdx) => { const d = resIdx - itemIdx; return d >= 3 ? 'Automatic' : d >= 1 ? 'Green' : 'Yellow'; },
  hqLoan: (resIdx, itemIdx) => ({ paymentRank: KEYS[Math.max(0, resIdx - 2)], months: itemIdx + 1 }),
};

console.log(`faserip-popularity v${POPULARITY_VERSION} / resources v${RESOURCES_VERSION} / feats v${FEATS_VERSION}\n`);

console.log('== Popularity (contact-action.js)');
M('disposition colours: Friendly green, Neutral yellow, Suspicious=Unfriendly red, Hostile impossible',
  Object.values(legacy.dispColor).map(c => c.toLowerCase()), ['friendly', 'neutral', 'unfriendly', 'hostile'].map(d => DISPOSITION_COLOR[d] ?? 'impossible'));
M('column is the Popularity number\'s rank (45 -> Incredible)', popularityFeat({ popularity: 45, disposition: 'friendly' }).baseRank, 'IN');
FIXED('negative Popularity: yellow on every disposition, Contacts only (was: disposition bumped one step, so Neutral became red)',
  legacy.dispColor[legacy.negPopDisposition('Neutral')], popularityFeat({ popularity: -5, disposition: 'neutral', isContact: true }).needed);
M('negative Popularity honours only the benefit shift', popularityFeat({ popularity: -5, disposition: 'friendly', isContact: true, request: { unique: true, targetBenefits: true } }).shift, 2);
GAP('request modifiers', `new in the dialog: ${Object.entries(REQUEST_MODIFIERS).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')} (were manual CS only).`);
GAP('mutant -1CS on Contacts and the negative-Popularity Karma cost', 'kept in contact-action.js; neither is in the Popularity FEATs passage.');

console.log('\n== Resources (actorSheet.js hardware + standard, headquartersSheet.js)');
for (const [res, item] of [['EX', 'GD'], ['EX', 'TY'], ['EX', 'PR'], ['PR', 'PR'], ['RM', 'GD']]) {
  const p = purchaseColor({ resourceRank: res, itemRank: item });
  const cur = legacy.resourceReq(KEYS.indexOf(res), KEYS.indexOf(item));
  M(`purchase ${rankByKey(item).name} with ${rankByKey(res).name} Resources = ${cur}`, cur, p.automatic ? 'Automatic' : p.needed === 'green' ? 'Green' : 'Yellow');
}
M('lone character cannot buy above Resources', purchaseColor({ resourceRank: 'GD', itemRank: 'EX' }).allowed, false);
M('once per week (actorSheet lock scope "week")', [RESOURCE_FEAT_INTERVAL_DAYS, resourceFeatAvailable({ lastFeatAt: 0, now: 6 * 86400 }).available], [7, false]);
M('failure bars that rank and higher for a week (actorSheet lock scope "fail")', [purchaseBlockedByFailure({ failedRank: 'GD', failedAt: 0, itemRank: 'EX', now: 86400 }), purchaseBlockedByFailure({ failedRank: 'GD', failedAt: 0, itemRank: 'TY', now: 86400 })], [true, false]);
FIXED('HQ bank loan terms (Good Resources buying Excellent): payment two ranks below the ITEM for rank-NUMBER months',
  legacy.hqLoan(KEYS.indexOf('GD'), KEYS.indexOf('EX')), (({ paymentRank, months }) => ({ paymentRank, months }))(bankLoan({ resourceRank: 'GD', itemRank: 'EX' })));
FIXED('loan purchase FEAT (RULED 2026-09-05): one rank up via a lender has no purchase FEAT (was a house yellow FEAT)', 'Yellow', bankLoan({ resourceRank: 'GD', itemRank: 'EX' }).purchaseFeat === null ? 'Automatic' : 'FEAT');
GAP('HQ weekly lockout', 'headquartersSheet purchases do not consult the actor resourceFeat ledger (actorSheet does, setting-gated).');

console.log('\n== Combined / Multiple FEATs (faserip-feats.js)');
M('combined: helper within one rank gives +1CS (Vision + She-Hulk -> Unearthly)', combinedActionColumn({ leaderRank: 'MN', helperRank: 'AM' }).column, 'UN');
M('multiple: green tougher -> both yellow', multipleActionColor(['green', 'automatic']).needed, 'yellow');
GAP('combined / multiple FEAT callers', 'no msh-faserip dialog applies these yet (the Hardware tab describes combined Resource FEATs in prose only).');

console.log(`\n${match} match, ${fixed} fixed-bug, ${open} open`);
