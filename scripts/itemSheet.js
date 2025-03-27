// In itemSheet.js
export class FaseripItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["faserip", "sheet", "item"],
      width: 500,
      height: "auto",
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
      resizable: true
    });
  }

  get template() {
    // Use specific templates for different item types
    if (this.item.type === 'power') {
      return `systems/msh-faserip/templates/power-sheet.html`;
    }
    else if (this.item.type === 'talent') {
      return `systems/msh-faserip/templates/talent-sheet.html`;
    }
    else if (this.item.type === 'contact') {
      return `systems/msh-faserip/templates/contact-sheet.html`;
    }
    // Fall back to the default item sheet for other types
    return `systems/msh-faserip/templates/item-sheet.html`;
  }

  // In itemSheet.js - revised getData() function
  getData() {
    // Get base data
    const context = super.getData();
    context.item = this.item;
    context.system = this.item.system;
    
    // Add custom CSS class based on document type
    const classes = ["faserip", "sheet", "item", this.item.type];
    context.cssClass = classes.join(" ");
  
    // Add all rank options for any item type that needs them
    context.allRanks = [
      "Shift-0", "Feeble", "Poor", "Typical", "Good", "Excellent",
      "Remarkable", "Incredible", "Amazing", "Monstrous", "Unearthly",
      "Shift-X", "Shift-Y", "Shift-Z", "Class 1000", "Class 3000", "Class 5000", "Beyond"
    ];
  
    // Add calculated range to context if this is a power and range is set to "rank"
    if (this.item.type === "power" && this.item.system.range === "rank") {
      context.calculatedRange = this.item.system.calculatedRange || this._calculateRangeForRank(this.item.system.rank);
    }
    
    // Add specific data for power items
    if (this.item.type === "power") {
      // Add power-specific dropdown options
      context.powerTypes = [
        "Resistances", "Movement", "Matter Control", "Energy Control", 
        "Body Control", "Mental", "Sensory", "Self-Alteration", "Other"
      ];
      
      // Range options - direct options for dropdown
      context.rangeOptions = [
        "Touch only", "1 area", "2 areas", "4 areas", "6 areas", "8 areas", 
        "10 areas", "20 areas", "40 areas", "60 areas", "80 areas", "160 areas", 
        "400 areas", "Line of Sight", "Custom"
      ];
      
      context.durationOptions = [
        "Instantaneous", "Concentration", "Maintenance", "Permanent"
      ];
      
      // Fix bonusPowers if it's an object with numeric keys instead of an array
      if (this.item.system.bonusPowers && !Array.isArray(this.item.system.bonusPowers)) {
        console.warn("bonusPowers is not an array, fixing:", this.item.system.bonusPowers);
        
        // Convert object with numeric keys to an array
        const fixedBonusPowers = [];
        const bonusPowersObj = this.item.system.bonusPowers;
        
        // Get all numeric keys and sort them
        const keys = Object.keys(bonusPowersObj)
          .filter(key => !isNaN(key))
          .sort((a, b) => Number(a) - Number(b));
        
        // Push each item into the array in order
        for (const key of keys) {
          fixedBonusPowers.push(bonusPowersObj[key]);
        }
        
        // Update the item with the fixed array
        this.item.update({"system.bonusPowers": fixedBonusPowers});
      }
      
      // Ensure context.system.bonusPowers is an array for the template
      if (!context.system.bonusPowers) {
        context.system.bonusPowers = [];
      } else if (!Array.isArray(context.system.bonusPowers)) {
        // Create a temporary array for the template rendering
        const tempArray = [];
        const obj = context.system.bonusPowers;
        
        const keys = Object.keys(obj)
          .filter(key => !isNaN(key))
          .sort((a, b) => Number(a) - Number(b));
        
        for (const key of keys) {
          tempArray.push(obj[key]);
        }
        
        context.system.bonusPowers = tempArray;
      }
      
      // Make sure to log data for debugging
      console.log("Power sheet data:", context);
    }
  
    return context;
  }

  /**
   * Helper method to calculate range based on rank
   * @private
   */
  _calculateRangeForRank(rank) {
    switch (rank) {
      case "Shift-0": return "Contact only";
      case "Feeble": return "Touch only";
      case "Poor": return "1 area";
      case "Typical": return "2 areas";
      case "Good": return "4 areas";
      case "Excellent": return "6 areas";
      case "Remarkable": return "8 areas";
      case "Incredible": return "10 areas";
      case "Amazing": return "20 areas";
      case "Monstrous": return "40 areas";
      case "Unearthly": return "60 areas";
      case "Shift-X": return "80 areas";
      case "Shift-Y": return "160 areas";
      case "Shift-Z": return "400 areas";
      case "Class 1000": return "100 miles";
      case "Class 3000": return "10,000 miles";
      case "Class 5000": return "1,000,000 miles";
      case "Beyond": return "Unlimited";
      default: return "Unknown";
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Update power type options when category changes
    html.find('#power-category').change(ev => {
      const category = ev.currentTarget.value;
      this._updatePowerTypeOptions(html, category);
    });

    // If the category is already selected on load, populate the types
    const selectedCategory = html.find('#power-category').val();
    if (selectedCategory) {
      this._updatePowerTypeOptions(html, selectedCategory);
    }
    
    if (this.item.type === "power") {
      // Initially show/hide custom range field based on current selection
      const currentRange = this.item.system.range;
      const customRangeInput = html.find('.custom-range-input');
      const calculatedRangeDiv = html.find('.calculated-range');
      
      if (currentRange === "custom") {
        customRangeInput.show();
        calculatedRangeDiv.hide();
      } else if (currentRange === "rank") {
        customRangeInput.hide();
        calculatedRangeDiv.show();
      } else {
        customRangeInput.hide();
        calculatedRangeDiv.hide();
      }
      
      // Handle range dropdown changes
      html.find('select[name="system.range"]').change(ev => {
        const selectedRange = ev.currentTarget.value;
        const customRangeInput = html.find('.custom-range-input');
        const calculatedRangeDiv = html.find('.calculated-range');
        
        if (selectedRange === "custom") {
          customRangeInput.show();
          calculatedRangeDiv.hide();
        } else if (selectedRange === "rank") {
          customRangeInput.hide();
          calculatedRangeDiv.show();
          this._updateCalculatedRangeDisplay();
        } else {
          customRangeInput.hide();
          calculatedRangeDiv.hide();
        }
      });
      
      // Handle power stunts
      html.find('.add-stunt').click(ev => {
        const stunts = this.item.system.stunts || [];
        stunts.push({ 
          name: "New Stunt", 
          description: "", 
          timesUsed: 0 
        });
        this.item.update({ "system.stunts": stunts });
      });

      html.find('.increment-stunt').click(ev => {
        const index = ev.currentTarget.dataset.index;
        const stunts = duplicate(this.item.system.stunts || []);
        if (stunts[index]) {
          stunts[index].timesUsed = (stunts[index].timesUsed || 0) + 1;
          this.item.update({ "system.stunts": stunts });
        }
      });

      html.find('.delete-stunt').click(ev => {
        const index = parseInt(ev.currentTarget.dataset.index);
        
        // Make sure stunts exists and is an array
        let stunts = duplicate(this.item.system.stunts);
        if (!Array.isArray(stunts)) {
          stunts = [];
          console.warn("Stunts was not an array, creating empty array");
        }
        
        // Remove the stunt at the specified index
        if (stunts.length > index) {
          stunts.splice(index, 1);
          
          // Update the item
          this.item.update({ "system.stunts": stunts });
        } else {
          console.error("Invalid stunt index:", index, "length:", stunts.length);
        }
      });
      
      // Add bonus power button
      html.find('.add-bonus-power').click(async ev => {
        let bonusPowers;
        
        // Convert to array if it's not already
        if (!this.item.system.bonusPowers) {
          bonusPowers = [];
        } else if (Array.isArray(this.item.system.bonusPowers)) {
          bonusPowers = foundry.utils.deepClone(this.item.system.bonusPowers);
        } else {
          // Convert object to array
          bonusPowers = [];
          const obj = this.item.system.bonusPowers;
          
          const keys = Object.keys(obj)
            .filter(key => !isNaN(key))
            .sort((a, b) => Number(a) - Number(b));
          
          for (const key of keys) {
            bonusPowers.push(obj[key]);
          }
        }
        
        // Add the new bonus power
        bonusPowers.push({
          name: "New Bonus Power",
          rank: "Typical",
          countsAgainstLimit: true
        });
        
        console.log("Adding bonus power, new array:", bonusPowers);
        
        // Update the item with the proper array
        await this.item.update({"system.bonusPowers": bonusPowers});
      });
      
      // Delete bonus power
      html.find('.delete-bonus-power').click(ev => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const bonusPowers = duplicate(this.item.system.bonusPowers);
        if (bonusPowers.length > index) {
          bonusPowers.splice(index, 1);
          this.item.update({ "system.bonusPowers": bonusPowers });
        }
      });
      
      // Handle rank changes to update calculated range display
      html.find('select[name="system.rank"]').change(ev => {
        if (this.item.system.range === "rank") {
          this._updateCalculatedRangeDisplay();
        }
      });
      
      // Handle Limited Power checkbox
      html.find('input[name="system.isLimited"]').change(ev => {
        const isChecked = ev.currentTarget.checked;
        html.find('.limitation-rank-mod').toggle(isChecked);
      });
    }

    // For talent sheets - handle specialty dropdown
if (this.item.type === "talent") {
  // Define talent specialties by category
  const talentSpecialties = {
    "Weapon Skill": ["Guns", "Thrown Weapons", "Bows", "Blunt Weapons", "Sharp Weapons", 
                     "Oriental Weapons", "Marksman", "Weapons Master", "Weapons Specialist"],
    "Fighting Skill": ["Martial Arts A", "Martial Arts B", "Martial Arts C", "Martial Arts D", 
                       "Martial Arts E", "Wrestling", "Thrown Objects", "Acrobatics", "Tumbling"],
    "Professional Skill": ["Medicine", "Law", "Law Enforcement", "Pilot", "Military", 
                          "Business/Finance", "Journalism", "Engineering", "Criminology", 
                          "Psychiatry", "Detective/Espionage"],
    "Scientific Skill": ["Chemistry", "Biology", "Geology", "Genetics", "Archaeology", 
                         "Physics", "Computers", "Electronics"],
    "Mystic/Mental Skill": ["Trance", "Mesmerism and Hypnosis", "Sleight of Hand", 
                           "Resist Domination", "Occult Lore", "Mystic Background"],
    "Other": ["Artist", "Languages", "First Aid", "Repair/Tinkering", "Trivia", 
              "Performer", "Animal Training", "Heir to Fortune", "Student", "Leadership"]
  };

    // Function to update specialty dropdown based on selected category
    const updateSpecialtyDropdown = () => {
      const category = html.find('#talent-category').val();
      const specialtySelect = html.find('#talent-specialty');
      specialtySelect.empty(); // Clear existing options
      
      // Add default option
      specialtySelect.append($('<option></option>').val('').text('--Select Specialty--'));
      
      // If a category is selected, add its specialties
      if (category && talentSpecialties[category]) {
        talentSpecialties[category].forEach(specialty => {
          const option = $('<option></option>').val(specialty).text(specialty);
          // Select this option if it matches the current specialty
          if (specialty === this.item.system.specialty) {
            option.attr('selected', 'selected');
          }
          specialtySelect.append(option);
        });
      }
    };

    // Update specialty dropdown when category changes
    html.find('#talent-category').change(updateSpecialtyDropdown);
    
    // Initially populate the dropdown
    updateSpecialtyDropdown();
  }

  // end of activeListeners
  }

  /**
 * Update power type options based on selected category
 */
_updatePowerTypeOptions(html, category) {
  const typeSelect = html.find('#power-type');
  typeSelect.empty();
  typeSelect.append($('<option value="">-- Select Type --</option>'));
  
  // Define power types by category
  const powerTypesByCategory = {
    "resistances": [
      "Resistance to Fire/Heat", "Resistance to Cold", "Resistance to Electricity", 
      "Resistance to Radiation", "Resistance to Toxins", "Resistance to Corrosives",
      "Resistance to Emotion Attacks", "Resistance to Mental Attacks", 
      "Resistance to Magical Attacks", "Resistance to Disease", "Invulnerability"
    ],
    "senses": [
      "Protected Senses", "Enhanced Senses", "Infravision", "Cosmic Awareness",
      "Combat Sense", "Computer Links", "Emotion Detection", "Energy Detection",
      "Magic Detection", "Magnetic Detection", "Mutant Detection", "Psionic Detection",
      "Astral Detection", "Tracking Ability"
    ],
    "movement": [
      "Flight", "Gliding", "Leaping", "Wall-Crawling", "Lightning Speed",
      "Teleportation", "Levitation", "Swimming", "Climbing", "Digging",
      "Dimensional Travel"
    ],
    "matterControl": [
      "Earth Control", "Air Control", "Fire Control", "Water Control",
      "Weather Control", "Density Manipulation Others", "Body Transformation Others",
      "Animal Transformation Others"
    ],
    "energyControl": [
      "Magnetic Manipulation", "Electrical Manipulation", "Light Manipulation",
      "Sound Manipulation", "Darkforce Manipulation", "Gravity Manipulation",
      "Probability Manipulation", "Nullifying Power", "Energy Reflection", "Time Control"
    ],
    "bodyControl": [
      "Growth", "Shrinking", "Density Manipulation Self", "Phasing", "Invisibility",
      "Plasticity", "Elongation", "Shape-Shifting", "Imitation", "Body Transformation",
      "Animal Transformation Self", "Raise Lowest Ability", "Blending", "Power Absorption",
      "Alter Ego"
    ],
    "distanceAttacks": [
      "Projectile Missile", "Ensnaring Missile", "Ice Generation", "Fire Generation",
      "Energy Generation", "Sound Generation", "Stunning Missile", "Corrosive Missile",
      "Slashing Missile", "Nullifier Missile", "Darkforce Generation"
    ],
    "mentalPowers": [
      "Telepathy", "Image Generation", "Telekinesis", "Mind Control", "Emotion Control",
      "Force Field Generation", "Animal Communication and Control", "Mechanical Intuition",
      "Animal Empathy", "Empathy", "Psi-Screen", "Mental Probe", "Animate Drawings",
      "Possession", "Transferral", "Astral Projection", "Psionic Attack", "Precognition",
      "Postcognition", "Plant Control", "Ultimate Skill"
    ],
    "bodyAlterationsOffensive": [
      "Extra Body Parts", "Extra Attacks", "Energy Touch", "Paralyzing Touch",
      "Claws", "Rotting Touch", "Corrosive Touch", "Health-Drain Touch", "Blinding Touch"
    ],
    "bodyAlterationsDefensive": [
      "Body Armor", "Water Breathing", "Absorption", "Regeneration", "Solar Regeneration",
      "Recovery", "Life Support", "Pheromones", "Damage Transfer", "Healing", "Immortality"
    ]
  };
  
  // Add options based on selected category
  if (powerTypesByCategory[category]) {
    powerTypesByCategory[category].forEach(type => {
      const selected = this.item.system.type === type ? 'selected' : '';
      typeSelect.append($(`<option value="${type}" ${selected}>${type}</option>`));
    });
  }
}

  /**
   * Update only the display of calculated range without changing data
   * @private
   */
  _updateCalculatedRangeDisplay() {
    const rank = this.item.system.rank;
    const calculatedRange = this._calculateRangeForRank(rank);
    
    // Update only the display element
    const displayElement = document.getElementById("calculated-range-display");
    if (displayElement) {
      displayElement.value = calculatedRange;
    }
  }

  /**
   * Calculate and update the range based on power rank
   * @private
   */
  _updateCalculatedRange() {
    // Only perform calculation if power type is "power" and range is set to "rank"
    if (this.item.type !== "power" || this.item.system.range !== "rank") return;

    const rank = this.item.system.rank;
    const calculatedRange = this._calculateRangeForRank(rank);

    // Update the calculated range display
    const display = document.getElementById("calculated-range-display");
    if (display) display.value = calculatedRange;
    
    // Also update the document if needed
    this.item.update({ "system.calculatedRange": calculatedRange });
  }

}