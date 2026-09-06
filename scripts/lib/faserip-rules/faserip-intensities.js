// faserip-rules intensities v0.1.0
// Judge's Book Intensity Tables, as data. Keys are kernel rank keys; a
// trailing '+' in the book ("Incredible+") is carried as { rank, plus: true }.
export const INTENSITIES_VERSION = '0.1.0';
export const INTENSITIES_CERTIFIED = true;

export const INTENSITY_TABLES = {
  fighting: [
    { item: 'Making 2 attacks/round', rank: 'RM' },
    { item: 'Making 2 attacks/round (second line as printed; likely 3 attacks)', rank: 'AM', note: 'book prints "2 attacks/round" for both Remarkable and Amazing' },
  ],
  agility: [
    { item: 'Catching a falling object', rank: 'FE' },
    { item: 'Walking a balance beam', rank: 'GD' },
    { item: 'Using a dodge maneuver against bullets', rank: 'EX' },
    { item: 'Catching thrown objects', rank: 'EX', note: 'no rank printed; reads with the Excellent line above' },
    { item: 'Walking a tightrope', rank: 'RM' },
    { item: 'Attempting to dodge bursts of bullets', rank: 'IN' },
    { item: 'Catching arrows in flight', rank: 'AM' },
    { item: 'Dodging laser fire of energy weapons', rank: 'MN' },
    { item: 'Catching bullets in flight', rank: 'UN' },
  ],
  strength: [
    { item: 'Lifting up to 50 lbs.', rank: 'FE' },
    { item: 'Lifting 51-100 lbs.', rank: 'PR' },
    { item: 'Lifting 101-200 lbs.', rank: 'TY' },
    { item: 'Lifting 201-400 lbs.', rank: 'GD' },
    { item: 'Lifting 401-800 lbs.', rank: 'EX' },
    { item: 'Lifting 801-2000 lbs. (1 ton)', rank: 'RM' },
    { item: 'Lifting 1-10 tons', rank: 'IN' },
    { item: 'Lifting 10-50 tons', rank: 'AM' },
    { item: 'Lifting 50-80 tons', rank: 'MN' },
    { item: 'Lifting 80-100 tons', rank: 'UN' },
    { item: 'Lifting 100+ tons', rank: 'SHX' },
  ],
  endurance: [
    { item: 'Air pollution alert', rank: 'FE' },
    { item: 'Tear gas', rank: 'TY' },
    { item: 'Snake venom', rank: 'GD' },
    { item: 'Spider venom', rank: 'EX' },
    { item: 'Exposure to vacuum', rank: 'UN' },
  ],
  reason: [
    { item: 'Simple machines', rank: 'FE' },
    { item: 'Complex machines', rank: 'PR' },
    { item: 'Communication by gestures', rank: 'PR', note: 'no rank printed; reads with the Poor line above' },
    { item: 'Appliances', rank: 'TY' },
    { item: 'Simple electronics', rank: 'GD' },
    { item: 'Common vehicles', rank: 'EX' },
    { item: 'Computer design and programming', rank: 'RM' },
    { item: 'Ability-modifying devices', rank: 'IN' },
    { item: 'Stardrive, time travel', rank: 'AM' },
    { item: 'Teleportation', rank: 'MN' },
  ],
  intuition: [
    { item: 'Obvious items (number of people present, condition of room)', rank: 'PR' },
    { item: 'Detail work (position of objects, things missing or added)', rank: 'EX' },
    { item: 'Discovering "typical" hidden door or secret passage', rank: 'EX' },
    { item: 'Sense "wrongness" about an area, person, or object', rank: 'IN' },
    { item: 'Sense presence of others hidden, concealed, invisible, or astral', rank: 'MN' },
  ],
  psyche: [
    { item: 'Standard hypnosis and mesmerism', rank: 'GD' },
    { item: 'Standard mind control devices', rank: 'RM' },
    { item: 'Standard terran magic', rank: 'IN' },
    { item: 'Standard Asgardian magic', rank: 'MN' },
  ],
  fire: [
    { item: 'A single match', rank: 'FE' },
    { item: 'Campfire', rank: 'PR' },
    { item: 'Burning room', rank: 'TY' },
    { item: 'Burning house', rank: 'EX' },
    { item: 'Burning warehouse and supplies', rank: 'RM' },
    { item: 'Burning non-explosive chemicals', rank: 'IN' },
    { item: 'Inside of a blast furnace', rank: 'AM' },
    { item: 'Burning explosive chemicals', rank: 'MN' },
    { item: 'Interior of a volcano', rank: 'UN' },
    { item: 'Surface of a star', rank: 'CL1000' },
  ],
  disease: [
    { item: 'Common cold', rank: 'FE' },
    { item: 'Common flu', rank: 'GD' },
  ],
  radiation: [
    { item: 'Ancient A-bomb blast site', rank: 'FE' },
    { item: 'Recent A-bomb blast site', rank: 'EX' },
    { item: 'Interior of an active nuclear reactor', rank: 'AM' },
    { item: 'A vial of plutonium', rank: 'IN' },
    { item: 'A-bomb blast', rank: 'MN' },
  ],
  slickness: [
    { item: 'Ordinary concrete', rank: null, note: 'no rank printed' },
    { item: 'Ordinary brickwork', rank: 'FE' },
    { item: 'Glass and steel', rank: 'TY' },
    { item: 'Polished steel alloys', rank: 'GD' },
    { item: 'Surface covered with ice', rank: 'EX' },
    { item: 'Surface covered with oil', rank: 'RM' },
    { item: 'Non-stick surfaces', rank: 'IN' },
    { item: 'Frictionless surfaces', rank: 'CL1000' },
  ],
  darkness: [
    { item: 'Night conditions', rank: 'TY' },
    { item: 'Dark conditions', rank: 'EX' },
    { item: '"Typical" Darkforce', rank: 'RM' },
  ],
  weather: [
    { item: 'Vision through normal fog', rank: 'TY' },
    { item: 'Normal rainshower', rank: 'GD' },
    { item: 'Normal thundershower', rank: 'RM' },
    { item: 'Normal thunderstorm', rank: 'IN' },
    { item: 'High winds', rank: 'IN' },
    { item: 'Normal tornado', rank: 'AM' },
    { item: 'Normal hurricane', rank: 'UN' },
  ],
  heat: [
    { item: '90 degrees F', rank: 'GD' },
    { item: '120 degrees F', rank: 'EX' },
    { item: '150 degrees F', rank: 'RM' },
  ],
  cold: [
    { item: '30 degrees F', rank: 'GD' },
    { item: '0 degrees F', rank: 'EX' },
    { item: '-30 degrees F', rank: 'RM' },
    { item: 'Interplanetary space', rank: 'MN' },
  ],
  corrosive: [
    { item: 'Mild acid', rank: 'GD' },
    { item: 'Standard acid', rank: 'EX' },
    { item: 'Concentrated acid', rank: 'IN', plus: true },
  ],
  stunning: [
    { item: 'Ordinary house current', rank: 'EX' },
    { item: '"Typical" protection devices', rank: 'RM' },
    { item: 'Lightning bolts', rank: 'IN' },
    { item: 'High tension wires', rank: 'AM' },
  ],
};

/** Look up an intensity by category and (case-insensitive substring) item text. */
export function findIntensity(category, text) {
  const list = INTENSITY_TABLES[category];
  if (!list) return null;
  const t = String(text).toLowerCase();
  return list.find(e => e.item.toLowerCase().includes(t)) ?? null;
}
