// SheetJS supplies the compound document storage in the browser entry.
module.exports.Readable = class {
  constructor() {
    throw new Error('Native streams are unavailable');
  }
};
