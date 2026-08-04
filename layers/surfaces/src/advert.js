// A holo advert: a big lit panel bolted to the side of a building.
//
// It is one colour field, a rule round the edge, a word across it and a run of smaller marks under
// it, and all of it burns. Nothing here is subtle: an advert is meant to be read from the far end of
// the street, and it is what a wall of concrete is missing at night.

const PAD = 0.08;

export function planAdvert({ text, colour, portrait }) {
  const width = portrait ? 256 : 512;
  const height = portrait ? 640 : 192;
  // Sized off the panel and the length of the word, which is close enough for a sign and keeps this
  // drawable against a stub.
  const size = portrait
    ? Math.min(width * 0.72, (height * 0.5) / Math.max(1, text.length * 0.34))
    : Math.min(height * 0.5, (width * (1 - PAD * 3)) / Math.max(1, text.length * 0.6));
  return { text, colour, portrait: Boolean(portrait), width, height, size };
}

/** Unlit, it is a dark panel with a coloured rule: the frame the light sits in. */
export function paintAdvertAlbedo(ctx, plan) {
  const { width, height } = plan;
  ctx.fillStyle = "#0d1014";
  ctx.fillRect(0, 0, width, height);
  rule(ctx, plan, plan.colour);
  letters(ctx, plan, plan.colour);
}

/** Lit, it is the whole panel: the field, the rule and the word, all burning. */
export function paintAdvertEmissive(ctx, plan) {
  const { width, height } = plan;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // a dim wash over the panel so it glows as a whole, with the word full strength on top
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = plan.colour;
  ctx.fillRect(width * PAD, height * PAD, width * (1 - PAD * 2), height * (1 - PAD * 2));
  ctx.globalAlpha = 1;

  rule(ctx, plan, plan.colour);
  letters(ctx, plan, "#ffffff");
  marks(ctx, plan);
}

function rule(ctx, plan, colour) {
  const { width, height } = plan;
  const edge = Math.max(3, Math.round(Math.min(width, height) * 0.035));
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, edge);
  ctx.fillRect(0, height - edge, width, edge);
  ctx.fillRect(0, 0, edge, height);
  ctx.fillRect(width - edge, 0, edge, height);
}

function letters(ctx, plan, fill) {
  ctx.font = `bold ${Math.round(plan.size)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fill;
  if (!plan.portrait) {
    ctx.fillText(plan.text, plan.width / 2, plan.height / 2);
    return;
  }
  // running down the panel, one letter per line, the way a vertical sign reads
  const rows = plan.text.length;
  const step = (plan.height * 0.74) / rows;
  for (let i = 0; i < rows; i++) {
    ctx.fillText(plan.text[i], plan.width / 2, plan.height * 0.13 + step * (i + 0.5));
  }
}

// The small print nobody reads, which is what makes it look like an advert rather than a label.
function marks(ctx, plan) {
  const { width, height } = plan;
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = plan.colour;
  const bar = Math.max(2, height * 0.012);
  for (let i = 0; i < 4; i++) {
    const w = width * (0.18 + i * 0.09);
    ctx.fillRect((width - w) / 2, height * (plan.portrait ? 0.88 : 0.78) + i * bar * 2.4, w, bar);
  }
  ctx.globalAlpha = 1;
}
