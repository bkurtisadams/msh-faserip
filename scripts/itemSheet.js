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
    else if (this.item.type === 'headquarters') {
      return `systems/msh-faserip/templates/hq-sheet.html`;
    }
    else if (this.item.type === 'vehicle') {
      return `systems/msh-faserip/templates/vehicle-sheet.html`;
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

  // If this is a power and marked as magic, include options
  if (this.item.type === "power") {
    context.isMagic = context.system.isMagic;
    context.magic = context.system.magic || {};
    context.energyTypes = ["personal", "universal", "dimensional"];
    context.abilities = ["fighting", "agility", "strength", "endurance", "reason", "intuition", "psyche"];
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
      "1 area", "2 areas", "4 areas", "6 areas", "8 areas", 
      "10 areas", "20 areas", "40 areas", "60 areas", "80 areas", 
      "160 areas", "400 areas", "Line of Sight"
    ];
    
    context.durationOptions = [
      "Instant", "Concentration", "Maintenance", "Permanent"
    ];
    
    // Make sure to log data for debugging
    console.log("Power sheet data:", context);
  }

  return context;
}

  activateListeners(html) {
    super.activateListeners(html);

    if (this.item.type === "power") {
      html.find("#is-magic-checkbox").change(ev => {
        const isChecked = ev.currentTarget.checked;
        this.item.update({ "system.isMagic": isChecked });
      });
    }
  
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
      
      if (currentRange === "Custom") {
        customRangeInput.show();
      } else {
        customRangeInput.hide();
      }
      
      // Handle range dropdown changes
      // Range dropdown listener
      html.find('select[name="system.range"]').change(ev => {
        const selectedRange = ev.currentTarget.value;
        const customRangeInput = html.find('.custom-range-input');
        const calculatedRangeField = html.find('.calculated-range');
      
        if (selectedRange === "custom") {
          customRangeInput.show();
        } else {
          customRangeInput.hide();
        }
      
        if (selectedRange === "rank") {
          calculatedRangeField.show();
          const rank = html.find('select[name="system.rank"]').val(); // Use dropdown value, not this.item.system
          const rangeText = this._getRangeByRank(rank);
          html.find('#calculated-range-display').val(rangeText);
          this.item.update({ "system.calculatedRange": rangeText });
        } else {
          calculatedRangeField.hide();
          html.find('#calculated-range-display').val('');
          this.item.update({ "system.calculatedRange": "" });
        }
      });

      // On load, if range is "rank", show the calculated field and fill it
      const rangeValue = html.find('select[name="system.range"]').val();
      if (rangeValue === "rank") {
        const rank = html.find('select[name="system.rank"]').val();
        const rangeText = this._getRangeByRank(rank);
        html.find('.calculated-range').show();
        html.find('#calculated-range-display').val(rangeText);
      }

      // When Rank dropdown changes, update calculated range if using "By Rank"
      html.find('select[name="system.rank"]').change(ev => {
        const newRank = ev.currentTarget.value;
        const selectedRange = html.find('select[name="system.range"]').val(); // Get current dropdown value
        if (selectedRange === "rank") {
          const rangeText = this._getRangeByRank(newRank);
          html.find('#calculated-range-display').val(rangeText);
          this.item.update({ "system.calculatedRange": rangeText });
        }
      });
      
      // Add to the activateListeners method in itemSheet.js
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
        
        // Log for debugging
        console.log("Before delete:", stunts, "index:", index);
        
        // Remove the stunt at the specified index
        if (stunts.length > index) {
          stunts.splice(index, 1);
          console.log("After delete:", stunts);
          
          // Update the item
          this.item.update({ "system.stunts": stunts });
        } else {
          console.error("Invalid stunt index:", index, "length:", stunts.length);
        }
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
      "Weather Control", "Animate Objects","Density Manipulation Others", "Body Transformation Others",
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

  _getRangeByRank(rank) {
    const rankRanges = {
      "Feeble": "1 area",
      "Poor": "2 areas",
      "Typical": "4 areas",
      "Good": "6 areas",
      "Excellent": "8 areas",
      "Remarkable": "10 areas",
      "Incredible": "20 areas",
      "Amazing": "40 areas",
      "Monstrous": "60 areas",
      "Unearthly": "80 areas",
      "Shift-X": "160 areas",
      "Shift-Y": "400 areas",
      "Shift-Z": "Line of Sight",
      "Class 1000": "Line of Sight",
      "Class 3000": "Line of Sight",
      "Class 5000": "Line of Sight",
      "Beyond": "Unlimited"
    };
    return rankRanges[rank] || "Unknown";
  }
    
}