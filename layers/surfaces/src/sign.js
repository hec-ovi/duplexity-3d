// A cartel: a board with the name of the place on it, and the same name again in the emissive map so
// the letters are what glows rather than the whole board.
//
// The type is sized from the board rather than measured, so this needs nothing from the canvas but
// somewhere to draw: the same code runs against a recording stub.

const PAD = 0.1; // share of the board kept clear round the type
const BORDER = 0.045;

export function planSign({ text, colour, metresWide, metresTall }) {
  const width = 512;
  const height = Math.max(64, Math.round((width * metresTall) / metresWide));
  // No measureText: the type is sized off the board and the length of the name, which is close
  // enough for a sign and keeps this drawable anywhere.
  const size = Math.min(height * (1 - PAD * 2), (width * (1 - PAD * 2)) / (text.length * 0.6));
  return { text, colour, width, height, size, metres: [metresWide, metresTall] };
}

/** The board itself: dark, with a lit edge and the name across it. */
export function paintSignAlbedo(ctx, plan) {
  const { width, height } = plan;
  ctx.fillStyle = "#14171c";
  ctx.fillRect(0, 0, width, height);

  const edge = Math.max(2, height * BORDER);
  ctx.fillStyle = plan.colour;
  ctx.fillRect(0, 0, width, edge);
  ctx.fillRect(0, height - edge, width, edge);
  ctx.fillRect(0, 0, edge, height);
  ctx.fillRect(width - edge, 0, edge, height);

  letters(ctx, plan, plan.colour);
}

/** What of it burns: the edge and the letters, nothing else. */
export function paintSignEmissive(ctx, plan) {
  const { width, height } = plan;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const edge = Math.max(2, height * BORDER);
  ctx.fillStyle = plan.colour;
  ctx.fillRect(0, 0, width, edge);
  ctx.fillRect(0, height - edge, width, edge);
  ctx.fillRect(0, 0, edge, height);
  ctx.fillRect(width - edge, 0, edge, height);

  letters(ctx, plan, plan.colour); // the tube burns its own colour, not white
}

function letters(ctx, plan, fill) {
  ctx.font = `bold ${Math.round(plan.size)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fill;
  ctx.fillText(plan.text, plan.width / 2, plan.height / 2);
}
