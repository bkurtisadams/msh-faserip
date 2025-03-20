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
    
    // Make sure to log data for debugging
    console.log("Power sheet data:", context);
  }

  return context;
}

  activateListeners(html) {
    super.activateListeners(html);
    
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
      html.find('select[name="system.range"]').change(ev => {
        const selectedRange = ev.currentTarget.value;
        
        if (selectedRange === "Custom") {
          customRangeInput.show();
        } else {
          customRangeInput.hide();
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
}