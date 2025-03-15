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
      "Shift-X": [11, 41, 81],
      "Shift-Y": [7, 41, 81],
      "Shift-Z": [4, 36, 75],
      "1000": [2, 36, 75],
      "3000": [2, 31, 71],
      "5000": [2, 26, 66],
      "Beyond": [2, 21, 61]
    };
  
    const thresholds = tableRanks[rank];
    if (!thresholds) {
      ui.notifications.error(`Rank ${rank} not found.`);
      return "Invalid Rank";
    }
  
    const [green, yellow, red] = tableRanks[rank];
    if (roll <= green) return "White";
    else if (roll <= yellow) return "Green";
    else if (roll <= red) return "Yellow";
    else return "Red";
  }
  