// The closed error set of this layer, in one place so every module can raise them.

export class CitySpecInvalidError extends Error {
  constructor(reason) {
    super(`city spec cannot be built: ${reason}`);
    this.code = "CITY_SPEC_INVALID";
  }
}

export class NoAssetForKindError extends Error {
  constructor(kind, theme) {
    super(`no asset registered for kind "${kind}" in theme "${theme}"`);
    this.code = "NO_ASSET_FOR_KIND";
  }
}

export class LayoutInvalidError extends Error {
  constructor(report) {
    super("the generated level failed the geometry validator");
    this.code = "LAYOUT_INVALID";
    this.report = report;
  }
}
