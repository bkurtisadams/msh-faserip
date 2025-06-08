export function rollUniversalTable(rank, roll) {
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
      "Shift X": [11, 41, 81],        // Updated to match config
      "Shift Y": [7, 41, 81],         // Updated to match config
      "Shift Z": [4, 36, 75],         // Updated to match config
      "Class 1000": [2, 36, 75],      // Updated to match config
      "Class 3000": [2, 31, 71],      // Updated to match config
      "Class 5000": [2, 26, 66],      // Updated to match config
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
    
    const thresholds = tableRanks[normalizedRank];
    if (!thresholds) {
      console.warn(`Rank ${rank} not found in universal table. Available ranks:`, Object.keys(tableRanks));
      ui.notifications.error(`Rank ${rank} not found.`);
      return "white"; // Return lowercase to match expected format
    }
  
    const [green, yellow, red] = thresholds;
    if (roll <= green) return "white";      // Changed to lowercase
    else if (roll <= yellow) return "green"; // Changed to lowercase
    else if (roll <= red) return "yellow";   // Changed to lowercase
    else return "red";                       // Changed to lowercase
}
  