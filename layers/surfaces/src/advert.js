// A holo advert: a big lit panel bolted to the side of a building.
//
// Most of them carry no words at all, because a made-up name across five storeys reads as nonsense.
// A panel is a colour field with a rule round it and either a trade written across it or a lit
// composition: bars, rings, a wave, a grid, a figure. All of it burns. Nothing here is subtle: an
// advert is meant to be read from the far end of the street.

const PAD = 0.08;

export function planAdvert({ text, graphic, colour, portrait }) {
  const width = portrait ? 256 : 512;
  const height = portrait ? 640 : 192;
  // Sized off the panel and the length of the word, which is close enough for a sign and keeps this
  // drawable against a stub.
  const size = text
    ? portrait
      ? Math.min(width * 0.72, (height * 0.5) / Math.max(1, text.length * 0.34))
      : Math.min(height * 0.5, (width * (1 - PAD * 3)) / Math.max(1, text.length * 0.6))
    : 0;
  return { text: text ?? null, graphic: graphic ?? null, colour, portrait: Boolean(portrait), width, height, size };
}

/** Unlit, it is a dark panel with a coloured rule: the frame the light sits in. */
export function paintAdvertAlbedo(ctx, plan) {
  const { width, height } = plan;
  ctx.fillStyle = "#0d1014";
  ctx.fillRect(0, 0, width, height);
  rule(ctx, plan, plan.colour);
  if (plan.text) letters(ctx, plan, plan.colour);
  else graphic(ctx, plan, plan.colour);
}

/** Lit, it is the whole panel: the field, the rule and whatever it carries, all burning. */
export function paintAdvertEmissive(ctx, plan) {
  const { width, height } = plan;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // a dim wash over the panel so it glows as a whole, with what it carries full strength on top
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = plan.colour;
  ctx.fillRect(width * PAD, height * PAD, width * (1 - PAD * 2), height * (1 - PAD * 2));
  ctx.globalAlpha = 1;

  rule(ctx, plan, plan.colour);
  if (plan.text) {
    letters(ctx, plan, "#ffffff");
    marks(ctx, plan);
    return;
  }
  graphic(ctx, plan, "#ffffff");
}

// A panel with no words on it. Four compositions and a figure, drawn from the middle out, so each
// reads as a designed thing at two hundred metres rather than as noise.
function graphic(ctx, plan, ink) {
  const { width: w, height: h } = plan;
  const cx = w / 2;
  const cy = h / 2;
  const unit = Math.min(w, h);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;

  if (plan.graphic === "rings") {
    for (let i = 1; i <= 4; i++) {
      ctx.lineWidth = Math.max(2, unit * 0.02);
      ctx.globalAlpha = 1 - i * 0.16;
      ctx.beginPath();
      ctx.arc(cx, cy, (unit * 0.11 * i) / 1.1, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (plan.graphic === "wave") {
    ctx.lineWidth = Math.max(2, unit * 0.03);
    for (let row = 0; row < 5; row++) {
      ctx.globalAlpha = 1 - row * 0.15;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = (w * i) / 24;
        const y = cy + Math.sin(i * 0.5 + row) * (h * 0.09) + (row - 2) * h * 0.11;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (plan.graphic === "grid") {
    const step = unit * 0.14;
    ctx.globalAlpha = 0.75;
    for (let x = step; x < w; x += step) ctx.fillRect(x - unit * 0.008, h * 0.14, unit * 0.016, h * 0.72);
    for (let y = step; y < h; y += step) ctx.fillRect(w * 0.1, y - unit * 0.008, w * 0.8, unit * 0.016);
    ctx.globalAlpha = 1;
    return;
  }
  if (plan.graphic === "figure") {
    // A person, in the few blocks it takes to read as one: head, shoulders, body.
    const head = unit * 0.11;
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.22, head, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - w * 0.16, cy - h * 0.06, w * 0.32, h * 0.06);
    ctx.fillRect(cx - w * 0.11, cy - h * 0.02, w * 0.22, h * 0.34);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(cx - w * 0.2, cy + h * 0.32, w * 0.4, unit * 0.02);
    ctx.globalAlpha = 1;
    return;
  }
  // bars: a run of columns of different heights, which is what most panels are
  const bars = 7;
  const gap = (w * 0.7) / bars;
  for (let i = 0; i < bars; i++) {
    const tall = h * (0.2 + ((i * 7) % 5) * 0.13);
    ctx.globalAlpha = 0.55 + (i % 3) * 0.22;
    ctx.fillRect(w * 0.15 + i * gap, cy + h * 0.28 - tall, gap * 0.55, tall);
  }
  ctx.globalAlpha = 1;
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
