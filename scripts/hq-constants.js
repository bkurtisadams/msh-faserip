// hq-constants.js v1.0.0 - 2026-03-02
// Headquarters building types, room packages, and staff from MSH Advanced Set rules

export const RANK_ABBR = {
  "Sh0": "Shift-0", "Fe": "Feeble", "Pr": "Poor", "Ty": "Typical", "Gd": "Good",
  "Ex": "Excellent", "Rm": "Remarkable", "In": "Incredible", "Am": "Amazing",
  "Mn": "Monstrous", "Un": "Unearthly", "ShX": "Shift-X", "ShY": "Shift-Y",
  "ShZ": "Shift-Z", "C1000": "Class 1000", "C3000": "Class 3000", "C5000": "Class 5000"
};

export const SIZE_ROOMS = {
  "Small": { min: 2, max: 3, label: "Small (2-3 rooms)" },
  "Mid-sized": { min: 4, max: 5, label: "Mid-sized (4-5 rooms)" },
  "Large": { min: 10, max: 15, label: "Large (10+ rooms)" },
  "Deluxe": { min: 20, max: 99, label: "Deluxe (20+ rooms)" }
};

// Building types from the rules table
// cost format: "rentRank/buyRank"
export const BUILDING_TYPES = {
  residential: {
    label: "Residential",
    types: [
      { key: "1br-apt",      name: "1 BR Apartment",       size: "Small",    material: "Good",      rentCost: "Feeble",     buyCost: "Excellent" },
      { key: "2br-apt",      name: "2 BR Apartment",       size: "Small",    material: "Good",      rentCost: "Poor",       buyCost: "Excellent" },
      { key: "3br-apt",      name: "3 BR Apartment",       size: "Small",    material: "Good",      rentCost: "Good",       buyCost: "Remarkable" },
      { key: "cottage",      name: "Cottage (2 rooms)",    size: "Small",    material: "Poor",      rentCost: "Poor",       buyCost: "Good" },
      { key: "small-house",  name: "Small House (4 room)", size: "Small",    material: "Typical",   rentCost: "Typical",    buyCost: "Excellent" },
      { key: "medium-house", name: "Medium House (8 room)",size: "Mid-sized", material: "Typical",  rentCost: "Typical",    buyCost: "Remarkable" },
      { key: "large-house",  name: "Large House (12 room)",size: "Mid-sized", material: "Good",     rentCost: "Excellent",  buyCost: "Incredible" },
      { key: "small-manor",  name: "Small Manor (18 room)",size: "Large",    material: "Excellent", rentCost: "Remarkable", buyCost: "Amazing" },
      { key: "large-manor",  name: "Large Manor (24 room)",size: "Deluxe",   material: "Excellent", rentCost: "Incredible", buyCost: "Monstrous" },
      { key: "mansion",      name: "Mansion (30+ room)",   size: "Deluxe",   material: "Excellent", rentCost: "Amazing",    buyCost: "Monstrous" }
    ]
  },
  commercial: {
    label: "Commercial",
    types: [
      { key: "office-3",       name: "Office (3 room)",          size: "Mid-sized", material: "Excellent",  rentCost: "Good",       buyCost: "Remarkable" },
      { key: "storefront",     name: "Storefront (4 room)",      size: "Small",     material: "Good",       rentCost: "Typical",    buyCost: "Remarkable" },
      { key: "office-suite",   name: "Office Suite (6 room)",    size: "Mid-sized", material: "Excellent",  rentCost: "Excellent",  buyCost: "Incredible" },
      { key: "office-floor",   name: "Office Floor (12 room)",   size: "Mid-sized", material: "Excellent",  rentCost: "Remarkable", buyCost: "Amazing" },
      { key: "office-2floor",  name: "2 Office Floors (24 room)",size: "Large",     material: "Excellent",  rentCost: "Incredible", buyCost: "Monstrous" },
      { key: "brownstone",     name: "Brownstone",               size: "Mid-sized", material: "Good",       rentCost: "Excellent",  buyCost: "Remarkable" }
    ]
  },
  office_building: {
    label: "Office Building",
    types: [
      { key: "office-bldg-4",  name: "Office Building, 4 floors",  size: "Large",  material: "Excellent",  rentCost: "Remarkable", buyCost: "Amazing" },
      { key: "office-bldg-8",  name: "Office Building, 8 floors",  size: "Deluxe", material: "Remarkable", rentCost: "Incredible", buyCost: "Monstrous" },
      { key: "office-bldg-12", name: "Office Building, 12 floors", size: "Deluxe", material: "Remarkable", rentCost: "Amazing",    buyCost: "Unearthly" },
      { key: "office-bldg-20", name: "Office Building, 20 floors", size: "Deluxe", material: "Remarkable", rentCost: "Monstrous",  buyCost: "Shift-X" },
      { key: "office-bldg-30", name: "Office Building, 30+ floors",size: "Deluxe", material: "Remarkable", rentCost: "Unearthly",  buyCost: "Shift-Z" }
    ]
  },
  industrial: {
    label: "Industrial",
    types: [
      { key: "small-warehouse",  name: "Small Warehouse",  size: "Mid-sized", material: "Typical",    rentCost: "Typical",    buyCost: "Remarkable" },
      { key: "medium-warehouse", name: "Medium Warehouse", size: "Large",     material: "Typical",    rentCost: "Good",       buyCost: "Incredible" },
      { key: "large-warehouse",  name: "Large Warehouse",  size: "Deluxe",    material: "Good",       rentCost: "Excellent",  buyCost: "Amazing" },
      { key: "small-factory",    name: "Small Factory",    size: "Mid-sized", material: "Remarkable", rentCost: "Good",       buyCost: "Incredible" },
      { key: "medium-factory",   name: "Medium Factory",   size: "Large",     material: "Remarkable", rentCost: "Excellent",  buyCost: "Amazing" },
      { key: "large-factory",    name: "Large Factory",    size: "Deluxe",    material: "Incredible", rentCost: "Remarkable", buyCost: "Monstrous" }
    ]
  }
};

// Flatten for quick lookup by key
export const BUILDING_TYPE_MAP = {};
for (const cat of Object.values(BUILDING_TYPES)) {
  for (const bt of cat.types) {
    BUILDING_TYPE_MAP[bt.key] = bt;
  }
}

// Room packages from the rules
// Each tier array: [costRank, description]
export const ROOM_PACKAGES = {
  "living-room": {
    name: "Living Room",
    icon: "fa-couch",
    rooms: 1,
    tiers: [
      { cost: "Good",       label: "Basic",    desc: "Sofa, 2 easy chairs, 2 end tables, coffee table, 2 lamps" },
      { cost: "Excellent",  label: "Standard", desc: "Add TV, stereo, or piano" },
      { cost: "Remarkable", label: "Deluxe",   desc: "TV, stereo, and piano" }
    ]
  },
  "dining-room": {
    name: "Dining Room",
    icon: "fa-utensils",
    rooms: 1,
    tiers: [
      { cost: "Good",       label: "Basic",    desc: "Table, 4 chairs, ceiling lamp" },
      { cost: "Excellent",  label: "Standard", desc: "Large table, bureau, 8 chairs" },
      { cost: "Remarkable", label: "Deluxe",   desc: "Add china cabinet, good china, sterling tableware" }
    ]
  },
  "kitchen": {
    name: "Kitchen",
    icon: "fa-blender",
    rooms: 1,
    tiers: [
      { cost: "Good",       label: "Basic",    desc: "Sink, stove, 4 cabinets, dishware, counterspace" },
      { cost: "Excellent",  label: "Standard", desc: "Add refrigerator, dishwasher, or microwave + fire extinguisher" },
      { cost: "Remarkable", label: "Deluxe",   desc: "All three appliances plus freezer" }
    ]
  },
  "library": {
    name: "Library",
    icon: "fa-book",
    rooms: 1,
    tiers: [
      { cost: "Excellent",  label: "Basic",    desc: "2 easy chairs, table, desk, straight chair, 5 bookcases" },
      { cost: "Remarkable", label: "Deluxe",   desc: "Add globe, microfiche reader, computer terminal" }
    ]
  },
  "computer-room": {
    name: "Computer Room",
    icon: "fa-desktop",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Standard", desc: "Computer + terminal, Excellent ability processing", abilityRank: "Excellent" },
      { cost: "Incredible",  label: "Advanced", desc: "Remarkable ability processing", abilityRank: "Remarkable" }
    ]
  },
  "communications": {
    name: "Communications Room",
    icon: "fa-satellite-dish",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Standard", desc: "Short-wave monitor, computer networks, police band" },
      { cost: "Incredible",  label: "Advanced", desc: "Add national security alert, visual display screens" }
    ]
  },
  "crime-files": {
    name: "Crime Files Room",
    icon: "fa-fingerprint",
    rooms: 1,
    tiers: [
      { cost: "Excellent", label: "Standard", desc: "Specialized computer, Remarkable retrieval ability, terminal, chairs", abilityRank: "Remarkable" }
    ]
  },
  "workshop": {
    name: "Workshop",
    icon: "fa-wrench",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Basic",    desc: "Lathes, drills, saws, fire extinguisher" },
      { cost: "Incredible",  label: "Standard", desc: "Add laser guided instruments" },
      { cost: "Amazing",     label: "Advanced", desc: "Add automatic processing (factory for simple goods)" }
    ]
  },
  "electronics-lab": {
    name: "Electronics Lab",
    icon: "fa-microchip",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Basic",    desc: "Soldering, oscilloscopes, basic circuit fabrication", abilityRank: "Remarkable" },
      { cost: "Incredible",  label: "Standard", desc: "Add micro-circuitry tools, spectrum analyzer", abilityRank: "Incredible" },
      { cost: "Amazing",     label: "Advanced", desc: "Add chip fabrication, advanced diagnostic systems", abilityRank: "Amazing" }
    ]
  },
  "laboratory": {
    name: "Laboratory",
    icon: "fa-flask",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Basic",    desc: "Scales, sinks, common chemicals, microscope" },
      { cost: "Incredible",  label: "Standard", desc: "Add Incredible analysis computer OR clean room", abilityRank: "Incredible" },
      { cost: "Amazing",     label: "Advanced", desc: "Both + poison analysis, serum dispenser (Excellent vs known poisons)", abilityRank: "Incredible" }
    ]
  },
  "office": {
    name: "Office",
    icon: "fa-briefcase",
    rooms: 1,
    tiers: [
      { cost: "Good",       label: "Basic",    desc: "Desk, 3 chairs, 2 lamps" },
      { cost: "Excellent",  label: "Standard", desc: "Double furniture, file cabinet, typewriter" },
      { cost: "Remarkable", label: "Deluxe",   desc: "Add computer terminal, double again, hanging plants, art" }
    ]
  },
  "rec-room": {
    name: "Rec Room",
    icon: "fa-gamepad",
    rooms: 1,
    tiers: [
      { cost: "Excellent",  label: "Basic",    desc: "Sofa, easy chairs, pool table or ping pong or TV" },
      { cost: "Remarkable", label: "Standard", desc: "All of above + video/pinball machines" },
      { cost: "Amazing",    label: "Deluxe",   desc: "Add holographic entertainment projector" }
    ]
  },
  "gym": {
    name: "Gym",
    icon: "fa-dumbbell",
    rooms: 1,
    tiers: [
      { cost: "Excellent",   label: "Basic",    desc: "Weight-lifting equipment, universal gym, lockers" },
      { cost: "Remarkable",  label: "Standard", desc: "Add rings, parallel bars, short horse" },
      { cost: "Incredible",  label: "Advanced", desc: "Separate locker/steam rooms (+2 rooms), diagnostic displays" },
      { cost: "Amazing",     label: "Deluxe",   desc: "Boxing area, robotic opponents, electronic weights to 100 tons (3+ areas)" }
    ]
  },
  "pool": {
    name: "Pool",
    icon: "fa-swimming-pool",
    rooms: 2,
    tiers: [
      { cost: "Remarkable",  label: "Outdoor",  desc: "Olympic pool, diving boards, sun room (outdoor)" },
      { cost: "Incredible",  label: "Indoor",   desc: "Olympic pool, diving boards, retractable sun roof (indoor)" }
    ]
  },
  "danger-room": {
    name: "Danger Room",
    icon: "fa-radiation",
    rooms: 3,
    tiers: [
      { cost: "Incredible",  label: "Standard", desc: "Gym + active dangers/security, max Incredible threats", abilityRank: "Incredible" },
      { cost: "Amazing",     label: "Advanced", desc: "Amazing threats, Excellent holographic illusions", abilityRank: "Amazing" }
    ]
  },
  "conference-room": {
    name: "Conference Room",
    icon: "fa-users",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Standard", desc: "Large table + 10 chairs, or platform + speaker + 30 chairs" },
      { cost: "Incredible",  label: "Deluxe",   desc: "Add wood paneling" }
    ]
  },
  "medical": {
    name: "Medical",
    icon: "fa-medkit",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Basic",    desc: "Emergency room care, standard antidotes and medication", abilityRank: "Remarkable" },
      { cost: "Incredible",  label: "Standard", desc: "X-ray, clean room, operating room, pathology (+rooms)", abilityRank: "Incredible" },
      { cost: "Amazing",     label: "Advanced", desc: "Add cryogenics", abilityRank: "Amazing" }
    ]
  },
  "power-room": {
    name: "Power Room",
    icon: "fa-bolt",
    rooms: 1,
    tiers: [
      { cost: "Remarkable",  label: "Basic",    desc: "Back-up generator, 12-hour power supply" },
      { cost: "Incredible",  label: "Standard", desc: "24-hour supply, auto cut-in 2 rounds after failure" },
      { cost: "Amazing",     label: "Advanced", desc: "Solar-powered cells, no external power needed" }
    ]
  },
  "garage": {
    name: "Garage",
    icon: "fa-car",
    rooms: 1,
    tiers: [
      { cost: "Good",       label: "Single",   desc: "1 ground vehicle, repair facilities, fire extinguisher" },
      { cost: "Excellent",  label: "Small",    desc: "Up to 3 ground vehicles" },
      { cost: "Remarkable", label: "Large",    desc: "Up to 12 ground vehicles" }
    ]
  },
  "hangar": {
    name: "Hangar",
    icon: "fa-plane",
    rooms: 1,
    tiers: [
      { cost: "Excellent", label: "Standard", desc: "1 air vehicle berth, repair facilities (1 area per vehicle)" }
    ]
  },
  "dock": {
    name: "Dock",
    icon: "fa-anchor",
    rooms: 3,
    tiers: [
      { cost: "Remarkable", label: "Standard", desc: "1 sea/sub vehicle, drydock facilities (3 areas per vehicle)" }
    ]
  },
  "security": {
    name: "Security",
    icon: "fa-shield-alt",
    rooms: 0,
    tiers: [
      { cost: "Good",       label: "Basic",    desc: "Hand-set burglar alarms, mechanical locks", abilityRank: "Good" },
      { cost: "Excellent",  label: "Standard", desc: "Automatic alarms, computer-code or card ID", abilityRank: "Excellent" },
      { cost: "Remarkable", label: "Advanced", desc: "Auto alarms, palm-print scan, activates defenses", abilityRank: "Remarkable" },
      { cost: "Incredible", label: "High-Tech", desc: "Full body scan, hostility detection, activates defenses", abilityRank: "Incredible" }
    ]
  },
  "defense": {
    name: "Defense",
    icon: "fa-crosshairs",
    rooms: 0,
    tiers: [
      { cost: "Excellent",  label: "Basic",    desc: "Pre-set defenses (nets/lasers/stun/pits), max Remarkable intensity", abilityRank: "Remarkable" },
      { cost: "Remarkable", label: "Standard", desc: "Security-activated, one type at Incredible intensity", abilityRank: "Incredible" },
      { cost: "Incredible", label: "Advanced", desc: "As above, Amazing intensity", abilityRank: "Amazing" }
    ]
  },
  "trophy-room": {
    name: "Trophy Room",
    icon: "fa-trophy",
    rooms: 1,
    tiers: [
      { cost: "Excellent",  label: "Standard", desc: "Showcase, lighting, frames for mementos, reception/gallery" },
      { cost: "Remarkable", label: "Secured",  desc: "Handles potentially dangerous exhibits at Incredible level" }
    ]
  },
  "imprisonment": {
    name: "Imprisonment",
    icon: "fa-lock",
    rooms: 1,
    tiers: [
      { cost: "Excellent",  label: "Basic",    desc: "Standard restraints, Remarkable material bars", abilityRank: "Remarkable" },
      { cost: "Remarkable", label: "Standard", desc: "Incredible strength restraints", abilityRank: "Incredible" },
      { cost: "Incredible", label: "Advanced", desc: "Amazing strength restraints + Excellent inhibitors", abilityRank: "Amazing" }
    ]
  },
  "fire-protection": {
    name: "Fire Protection",
    icon: "fa-fire-extinguisher",
    rooms: 0,
    tiers: [
      { cost: "Excellent",  label: "Standard", desc: "Sprinkler system, Good fire protection, covers 10 rooms", abilityRank: "Good" },
      { cost: "Remarkable", label: "Advanced", desc: "Foam projectors, Excellent fire protection, covers 10 rooms", abilityRank: "Excellent" }
    ]
  }
};

// Staff roles and costs from the rules
export const STAFF_ROLES = {
  "butler":       { name: "Butler/Housekeeper", cost: "Typical",    icon: "fa-user-tie" },
  "secretary":    { name: "Secretary",          cost: "Typical",    icon: "fa-clipboard" },
  "pilot":        { name: "Pilot",              cost: "Good",       icon: "fa-plane" },
  "lawyer":       { name: "Lawyer",             cost: "Good",       icon: "fa-gavel" },
  "bodyguard":    { name: "Bodyguard",          cost: "Typical",    icon: "fa-shield-alt" },
  "mechanic":     { name: "Mechanic",           cost: "Typical",    icon: "fa-wrench" },
  "computer-spec":{ name: "Computer Specialist", cost: "Excellent", icon: "fa-laptop-code" },
  "scientist":    { name: "Scientist",          cost: "Excellent",  icon: "fa-atom" },
  "cook":         { name: "Cook",               cost: "Typical",    icon: "fa-utensils" },
  "groundskeeper":{ name: "Groundskeeper",      cost: "Typical",    icon: "fa-leaf" },
  "workers-10":   { name: "10 Workers",         cost: "Excellent",  icon: "fa-hard-hat" },
  "workers-50":   { name: "50 Workers",         cost: "Remarkable", icon: "fa-hard-hat" },
  "workers-100":  { name: "100 Workers",        cost: "Incredible", icon: "fa-hard-hat" },
  "workers-150":  { name: "150 Workers",        cost: "Amazing",    icon: "fa-hard-hat" }
};
