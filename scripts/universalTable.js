export function rollUniversalTable(rank, roll) {
    const tableRanks = {
      "Shift-0": [66, 95, 100],
      "Feeble": [66, 95, 100],
      "Poor": [61, 91, 100],
      "Typical": [56, 91, 100],
      "Good": [56, 86, 100],
      "Excellent": [56, 86, 100],
      "Remarkable": [56, 86, 100],
      "Incredible": [56, 86, 100],
      "Amazing": [51, 86, 100],
      "Monstrous": [41, 66, 100],
      "Unearthly": [36, 61, 100],
      "Shift-X": [31, 56, 95],
      "Shift-Y": [21, 56, 91],
      "Shift-Z": [21, 46, 86]
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
  