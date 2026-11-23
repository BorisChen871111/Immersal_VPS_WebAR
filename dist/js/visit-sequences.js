export const visitSequences = [
  {
    title: '列車進站',
    fps: 12,
    frames: Array.from({ length: 24 }, (_, i) => `./assets/sequences/arrival/${String(i + 1).padStart(3, '0')}.png`),
  },
  {
    title: '列車通過',
    fps: 12,
    frames: Array.from({ length: 24 }, (_, i) => `./assets/sequences/passing/${String(i + 1).padStart(3, '0')}.png`),
  },
];

export async function loadVisitSequences() {
  return Promise.all(visitSequences.map(async sequence => ({
    ...sequence,
    images: await Promise.all(sequence.frames.map(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    })),
  })));
}

export function drawVisitFrame(ctx, sequence, elapsed) {
  const { width, height } = ctx.canvas;
  const index = Math.floor(Math.max(0, elapsed) * sequence.fps / 1000) % sequence.images.length;
  const image = sequence.images[index];
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  return index;
}
