// scripts/apps/legacy-app-v2.js v1.0.0 - 2026-11-11
// A V2 base for windows that were written against Foundry's V1 Application.
// A subclass keeps its V1 shape (static defaultOptions, getData,
// activateListeners(html), close) and this class maps it onto ApplicationV2:
// the options become the V2 window options, getData feeds the template, and
// activateListeners receives the window's root as a jQuery handle after each
// render. Used by the Team Tracker, GM Tools and the Encounter Editor.

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LegacyAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {

  /** V1-style options: classes, template, width, height, resizable, title, id, scrollY, minimizable. */
  static get defaultOptions() {
    return {};
  }

  /** One template part, taken from defaultOptions.template. */
  static get PARTS() {
    const v1 = this.defaultOptions ?? {};
    return { body: { template: v1.template, scrollable: v1.scrollY ?? [] } };
  }

  /** @override */
  _initializeApplicationOptions(options) {
    const v1 = this.constructor.defaultOptions ?? {};
    const merged = super._initializeApplicationOptions(options);
    merged.classes = Array.from(new Set([...(merged.classes ?? []), ...(v1.classes ?? [])]));
    if (v1.id && !options?.id) merged.id = v1.id;
    merged.window = {
      ...merged.window,
      ...(v1.title ? { title: v1.title } : {}),
      resizable: !!v1.resizable,
      minimizable: v1.minimizable ?? true,
      ...(options?.window ?? {})
    };
    merged.position = {
      ...merged.position,
      ...(Number.isFinite(v1.width) ? { width: v1.width } : {}),
      ...(Number.isFinite(v1.height) ? { height: v1.height } : {}),
      ...(options?.position ?? {})
    };
    return merged;
  }

  /** V1 data hook. */
  getData() {
    return {};
  }

  /** V1 listener hook. `html` is the window's root element as a jQuery handle. */
  activateListeners(_html) {}

  /** V1 name for bringToFront. */
  bringToTop() {
    return this.bringToFront();
  }

  /** @override */
  async _prepareContext(options) {
    const base = await super._prepareContext(options);
    return Object.assign(base ?? {}, (await this.getData(options)) ?? {});
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.activateListeners($(this.element));
  }

  /** Rendered windows of a class. Replaces scanning ui.windows, which only holds V1 windows. */
  static instancesOf(cls) {
    return Array.from(foundry.applications.instances.values()).filter(app => app instanceof cls);
  }
}
