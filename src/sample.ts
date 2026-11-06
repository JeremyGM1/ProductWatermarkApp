export function makeSampleProduct(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D is not available in this browser.');

  const bg = g.createLinearGradient(0, 0, 0, 360);
  bg.addColorStop(0, '#EEF1F4');
  bg.addColorStop(1, '#C9D1DA');
  g.fillStyle = bg;
  g.fillRect(0, 0, 480, 360);

  g.fillStyle = 'rgba(20,26,34,.16)';
  g.beginPath();
  g.ellipse(240, 322, 78, 11, 0, 0, Math.PI * 2);
  g.fill();

  const body = g.createLinearGradient(170, 0, 310, 0);
  body.addColorStop(0, '#1E3A5F');
  body.addColorStop(0.45, '#3F6EA8');
  body.addColorStop(1, '#16304F');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(205, 120); g.lineTo(205, 96); g.lineTo(275, 96); g.lineTo(275, 120);
  g.quadraticCurveTo(312, 134, 312, 176); g.lineTo(312, 304);
  g.quadraticCurveTo(312, 320, 296, 320); g.lineTo(184, 320);
  g.quadraticCurveTo(168, 320, 168, 304); g.lineTo(168, 176);
  g.quadraticCurveTo(168, 134, 205, 120);
  g.closePath();
  g.fill();

  g.fillStyle = '#E8ECF0';
  g.fillRect(212, 54, 56, 44);
  g.fillStyle = '#C5CCD4';
  for (let i = 0; i < 6; i++) g.fillRect(216 + i * 9, 56, 3, 40);

  g.fillStyle = '#F4F1EA';
  g.fillRect(168, 190, 144, 82);
  g.fillStyle = '#1E3A5F';
  g.textAlign = 'center';
  g.font = '700 22px system-ui, sans-serif';
  g.fillText('SERUM', 240, 228);
  g.font = '500 12px system-ui, sans-serif';
  g.fillText('30 ML', 240, 250);

  g.fillStyle = 'rgba(255,255,255,.28)';
  g.fillRect(180, 150, 9, 150);
  return c;
}