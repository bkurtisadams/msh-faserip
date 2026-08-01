import assert from "node:assert/strict";
import {
  RANKS_ORDERED, RANK_VALUES, rankValueForStorage, valueToRank
} from "../scripts/rules/rules-reference.js";

const expected = new Map([
  ["Shift-0", 0], ["Feeble", 2], ["Poor", 4], ["Typical", 6],
  ["Good", 10], ["Excellent", 20], ["Remarkable", 30],
  ["Incredible", 40], ["Amazing", 50], ["Monstrous", 75],
  ["Unearthly", 100], ["Shift-X", 150], ["Shift-Y", 200],
  ["Shift-Z", 500], ["Class 1000", 1000], ["Class 3000", 3000],
  ["Class 5000", 5000], ["Beyond", Infinity]
]);

assert.deepEqual(RANKS_ORDERED, [...expected.keys()]);
for (const [rank, value] of expected) {
  assert.equal(RANK_VALUES[rank], value, `${rank} standard value`);
  if (rank !== "Beyond") assert.equal(rankValueForStorage(rank), value, `${rank} storage value`);
}

assert.equal(rankValueForStorage("Beyond"), 5001, "Beyond uses document-safe sentinel");
assert.equal(valueToRank(0), "Shift-0");
assert.equal(valueToRank(2), "Feeble");
assert.equal(valueToRank(10), "Good");
assert.equal(valueToRank(75), "Monstrous");
assert.equal(valueToRank(100), "Unearthly");
assert.equal(valueToRank(5000), "Class 5000");
assert.equal(valueToRank(5001), "Beyond");

console.log("Resources rank regression checks passed.");
