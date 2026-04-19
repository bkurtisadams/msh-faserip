// contactSheet.js v2.0.0 - 2026-04-18
// v2.0.0: Migrate to ApplicationV2 / ItemSheetV2 (v16 prep; v14 backward-compat shims gone in v16)
// v1.0.0: Standalone contact item sheet extending ItemSheet directly (like headquartersSheet.js, talentSheet.js)

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const CONTACT_TYPES = {
  "Professional": {
    "Medicine":        { services: ["Info", "Skills"],          resourceRank: "Good",       desc: "Medical advice and treatment services." },
    "Law":             { services: ["Info", "Skills"],          resourceRank: "Good",       desc: "Legal assistance, court representation, and advice." },
    "Law Enforcement": { services: ["Info", "Skills", "Equip"], resourceRank: "Remarkable", desc: "Police or detective resources, arrest records, investigation aid." },
    "Military":        { services: ["Info", "Skills", "Equip"], resourceRank: "Amazing",    desc: "Armed forces connection with access to military resources." },
    "Business World":  { services: ["Info", "Equip"],           resourceRank: "Incredible", desc: "Corporate or finance contact with significant resources." },
    "Journalism":      { services: ["Info"],                    resourceRank: "Poor",       desc: "Media knowledge and connections. Remarkable Reason in area of expertise." },
    "Crime":           { services: ["Info", "Equip"],           resourceRank: "Remarkable", desc: "Criminal underworld contact. Using this contact risks Karma loss." },
    "Engineering":     { services: ["Info", "Skills"],          resourceRank: "Good",       desc: "Construction, device building, and structural expertise." },
    "Psychiatry":      { services: ["Info", "Skills"],          resourceRank: "Good",       desc: "Mental health expertise. +1CS on mind-related FEATs." },
    "Espionage":       { services: ["Info", "Equip"],           resourceRank: "Incredible", desc: "Intelligence agency contact with covert resources." },
    "Hero Group":      { services: ["Info", "Skills", "Equip"], resourceRank: "Amazing",    desc: "Super-team alliance providing heroic support." }
  },
  "Scientific": {
    "Chemistry":       { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Chemical analysis, formulas, and poison identification." },
    "Biology":         { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Biological research, organic compounds, disease study." },
    "Geology":         { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Earth sciences, mineral identification, volcanic activity." },
    "Genetics":        { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Genetic research, mutant studies, life form analysis." },
    "Archaeology":     { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Historical records, ancient artifacts, paleontology." },
    "Physics":         { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Motion, flight, astrophysics expertise." },
    "Computers":       { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Computer systems, AI, and electronic intelligence." },
    "Electronics":     { services: ["Info", "Skills"], resourceRank: "Remarkable", desc: "Electronic device design, repair, and analysis." }
  },
  "Political": {
    "Local":              { services: ["Info"],          resourceRank: "Good",      desc: "Local government ally — city council, mayor's office." },
    "State":              { services: ["Info", "Equip"], resourceRank: "Remarkable", desc: "State government connection — governor, state agencies." },
    "National":           { services: ["Info", "Equip"], resourceRank: "Monstrous",  desc: "Federal government contact — Congress, federal agencies." },
    "Other National":     { services: ["Info", "Equip"], resourceRank: "Monstrous",  desc: "Foreign government contact with diplomatic resources." },
    "International":      { services: ["Info", "Equip"], resourceRank: "Monstrous",  desc: "UN or multinational organization representative." }
  },
  "Mystic": {
    "Mystic Arts":  { services: ["Info", "Skills"], resourceRank: "Good", desc: "Extradimensional awareness and magical practice." },
    "Occult Lore":  { services: ["Info"],           resourceRank: "Good", desc: "Remarkable Reason on mystic items, societies, and runes." },
    "Mythology":    { services: ["Info"],           resourceRank: "Good", desc: "Deity pantheon specialist with divine knowledge." }
  },
  "Other": {}
};

// Flat lookup for quick access
const CONTACT_TYPE_FLAT = {};
for (const [category, types] of Object.entries(CONTACT_TYPES)) {
  for (const [typeName, data] of Object.entries(types)) {
    CONTACT_TYPE_FLAT[typeName] = { ...data, category };
  }
}

export class FaseripContactSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["faserip", "sheet", "item", "contact"],
    position: { width: 420, height: 540 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    main: { template: "systems/msh-faserip/templates/contact-sheet.html" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    context.cssClass = "faserip-dialog contact-dialog";
    context.hasActor = !!this.item.parent;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;
    const html = $(this.element);

    const typeSelect = html.find('.contact-type-select');
    const dispositionSelect = html.find('.contact-disposition-select');
    const resourceSelect = html.find('.contact-resource-select');
    const servicesBadges = html.find('.contact-services-badges');
    const descriptionArea = html.find('textarea[name="system.description"]');

    // Track last auto-filled description to avoid clobbering user edits
    let lastAutoDesc = '';

    const updateFromType = () => {
      const typeName = typeSelect.val();
      const typeData = typeName ? CONTACT_TYPE_FLAT[typeName] : null;
      if (!typeData) {
        servicesBadges.html('<span class="contact-rule-empty">Select a type to see services</span>');
        return;
      }

      // Auto-fill resource rank
      if (typeData.resourceRank) {
        resourceSelect.val(typeData.resourceRank);
      }

      // Auto-fill services badges
      if (typeData.services && typeData.services.length) {
        servicesBadges.html(typeData.services.map(s =>
          `<span class="contact-badge" data-tooltip="${this._getServiceTooltip(s)}">${s}</span>`
        ).join(' '));
        // Activate tooltips on new badges
        servicesBadges.find('[data-tooltip]').each((i, el) => {
          el.addEventListener('pointerenter', () => game.tooltip.activate(el));
          el.addEventListener('pointerleave', () => game.tooltip.deactivate());
        });
      } else {
        servicesBadges.html('<span class="contact-rule-empty">No standard services</span>');
      }

      // Auto-fill description only if empty or matches previous auto-fill
      const currentDesc = descriptionArea.val().trim();
      if (!currentDesc || currentDesc === lastAutoDesc) {
        descriptionArea.val(typeData.desc);
        lastAutoDesc = typeData.desc;
      }
    };

    typeSelect.change(() => updateFromType());

    // Pop FEAT button
    html.find('.contact-pop-feat-btn').click(async (ev) => {
      ev.preventDefault();
      const actor = this.item.parent;
      if (!actor) {
        ui.notifications.warn("Contact must be owned by an actor to roll Pop FEAT.");
        return;
      }
      const { rollContact } = await import('./modules/actions/contact-action.js');
      rollContact(actor, this.item);
    });

    // Initial population
    updateFromType();

    // Store current auto-desc for comparison
    const typeName = typeSelect.val();
    const typeData = typeName ? CONTACT_TYPE_FLAT[typeName] : null;
    if (typeData) lastAutoDesc = typeData.desc;

    // Activate Foundry tooltips for data-tooltip elements in this sheet
    html.find('[data-tooltip]').each((i, el) => {
      el.addEventListener('pointerenter', () => game.tooltip.activate(el));
      el.addEventListener('pointerleave', () => game.tooltip.deactivate());
    });
  }

  _getServiceTooltip(service) {
    switch (service) {
      case "Info": return "Contact can provide information and intelligence in their area";
      case "Skills": return "Contact can perform skilled work or provide expert assistance";
      case "Equip": return "Contact can supply equipment up to their resource rank";
      case "Training": return "Contact can provide training in their area of expertise";
      default: return service;
    }
  }
}