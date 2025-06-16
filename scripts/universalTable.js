export function rollUniversalTable(rank, roll) {
    console.log("🎲 rollUniversalTable called with rank:", rank, "roll:", roll);
    
    const tableRanks = {
      "Shift-0": [66, 95, 100],
      "Feeble": [61, 91, 100],
      "Poor": [56, 86, 100],
      "Typical": [51, 81, 98],
      "Good": [46, 75, 98],
      "Excellent": [41, 71, 95],
      "Remarkable": [36, 66, 95],
      "Incredible": [31, 61, 91],
      "Amazing": [26, 56, 91],
      "Monstrous": [21, 51, 86],
      "Unearthly": [16, 46, 86],
      "Shift X": [11, 41, 81],
      "Shift Y": [7, 41, 81],
      "Shift Z": [4, 36, 75],
      "Class 1000": [2, 36, 75],
      "Class 3000": [2, 31, 71],
      "Class 5000": [2, 26, 66],
      "Beyond": [2, 21, 61],
      
      // Add backward compatibility for old formats
      "Shift-X": [11, 41, 81],
      "Shift-Y": [7, 41, 81],
      "Shift-Z": [4, 36, 75],
      "1000": [2, 36, 75],
      "3000": [2, 31, 71],
      "5000": [2, 26, 66]
    };
  
    // Normalize the rank name
    let normalizedRank = rank;
    
    // Handle common variations
    if (rank === "Class1000") normalizedRank = "Class 1000";
    if (rank === "Class3000") normalizedRank = "Class 3000";
    if (rank === "Class5000") normalizedRank = "Class 5000";
    
    console.log("🎲 Normalized rank:", normalizedRank);
    
    const thresholds = tableRanks[normalizedRank];
    if (!thresholds) {
      console.warn(`Rank ${rank} not found in universal table. Available ranks:`, Object.keys(tableRanks));
      ui.notifications.error(`Rank ${rank} not found.`);
      return "white";
    }
  
    console.log("🎲 Thresholds for", normalizedRank, ":", thresholds);
    
    const [green, yellow, red] = thresholds;
    let result;
    
    if (roll <= green) {
        result = "white";
        console.log("🎲 Result: WHITE (roll", roll, "<=", green, ")");
    } else if (roll <= yellow) {
        result = "green";
        console.log("🎲 Result: GREEN (roll", roll, "<=", yellow, ")");
    } else if (roll <= red) {
        result = "yellow";
        console.log("🎲 Result: YELLOW (roll", roll, "<=", red, ")");
    } else {
        result = "red";
        console.log("🎲 Result: RED (roll", roll, ">", red, ")");
    }
    
    return result;
}