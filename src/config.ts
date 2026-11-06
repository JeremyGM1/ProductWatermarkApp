import type { ExportFormat } from "./types.ts";
export const WATERMARK_SRC = 'assets/watermark.png';
export const MAX_SIDE = 8000;
export const DEFAULTS = {
  minOn: true,
  minW: 800,
  minH: 800,
  wmOn: true,
  wmSize: 30,
  wmOpacity: 60,
  wmMargin: 3,
  wmRot: 0,
  fmt: 'png' as ExportFormat,
  quality: 92
};