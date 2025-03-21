// Updated elevation-integration.js

// Wait for Foundry to be ready
Hooks.once('ready', () => {
  console.log("FASERIP | Setting up Elevation Ruler integration");
  
  // Configure Elevation Ruler for FASERIP system
  if (!CONFIG.elevationruler) CONFIG.elevationruler = {};
  
  // Set measurement units to "areas"
  CONFIG.elevationruler.measurementUnits = "areas";
  
  // Define attributes for different movement types
  CONFIG.elevationruler.SPEED = CONFIG.elevationruler.SPEED || {};
  CONFIG.elevationruler.SPEED.ATTRIBUTES = {
    WALK: "actor.system.movement.run",
    FLY: "actor.system.movement.fly",
    SWIM: "actor.system.movement.swim",
    TELEPORT: "actor.system.movement.teleport"
  };
  
  // Define token type detection function
  CONFIG.elevationruler.SPEED.tokenMovementType = function(token) {
    // Check if token has flying status effect
    if (token.actor?.effects.some(e => e.name?.toLowerCase().includes("fly"))) {
      return "FLY";
    }
    
    // Default to walking/running
    return "WALK";
  };
  
  // Ensure we don't replace existing categories
  const originalCategories = CONFIG.elevationruler.SPEED.CATEGORIES || [];
  
  // Define speed categories for FASERIP - ensure all properties are properly set
  const faseripCategories = [
    {
      name: "Walk",
      color: PIXI.utils.string2hex("#00ff00"),
      multiplier: 1
    },
    {
      name: "Run",
      color: PIXI.utils.string2hex("#ffff00"),
      multiplier: 2
    },
    {
      name: "Sprint",
      color: PIXI.utils.string2hex("#ff0000"),
      multiplier: 3
    }
  ];
  
  // Only set our categories if none exist already
  if (!originalCategories.length) {
    CONFIG.elevationruler.SPEED.CATEGORIES = faseripCategories;
  } else {
    // Ensure all existing categories have the required properties
    originalCategories.forEach(category => {
      if (category.multiplier === undefined) {
        category.multiplier = 1;
      }
    });
  }
  
  // Override the maximum category distance calculation to handle our structure
  const originalMaxCategoryDistance = CONFIG.elevationruler.SPEED.maximumCategoryDistance;
  CONFIG.elevationruler.SPEED.maximumCategoryDistance = function(token, speedCategory, tokenSpeed) {
    // Ensure speedCategory has multiplier
    if (speedCategory && speedCategory.multiplier === undefined) {
      speedCategory.multiplier = 1;
    }
    
    // Call original function if it exists, otherwise calculate ourselves
    if (typeof originalMaxCategoryDistance === 'function') {
      return originalMaxCategoryDistance.call(this, token, speedCategory, tokenSpeed);
    } else {
      tokenSpeed = tokenSpeed ?? this.tokenSpeed(token);
      return (speedCategory?.multiplier || 1) * tokenSpeed;
    }
  };
  
  // Override speed function to select appropriate movement type
  CONFIG.elevationruler.SPEED.tokenSpeed = function(token) {
    if (!token.actor) return 0;
    
    const movementType = this.tokenMovementType(token);
    let speed = 0;
    
    switch (movementType) {
      case "FLY":
        speed = token.actor.system.movement.fly || 0;
        break;
      case "SWIM":
        speed = token.actor.system.movement.swim || 0;
        break;
      case "TELEPORT":
        speed = token.actor.system.movement.teleport || 0;
        break;
      default: // WALK
        speed = token.actor.system.movement.run || 0;
    }
    
    return speed;
  };
  
  console.log("FASERIP | Elevation Ruler integration complete");
});