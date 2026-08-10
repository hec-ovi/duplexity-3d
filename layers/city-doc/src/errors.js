// The closed error set.

export class NotAStreetError extends Error {
  constructor(id) {
    super(`"${id}" is not an outdoor level: a city document describes open ground with buildings on it`);
    this.code = "NOT_A_STREET";
  }
}

export class CityDocInvalidError extends Error {
  constructor(detail) {
    super(`not a readable city document: ${detail}`);
    this.code = "CITY_DOC_INVALID";
  }
}
