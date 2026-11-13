export type Drawable = HTMLImageElement | HTMLCanvasElement;

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ImageItem {
  src: Drawable;
  w: number;
  h: number;
  name: string;
}

export interface WatermarkImage {
  src: Drawable;
  w: number;
  h: number;
}

export interface RenderOptions {
  minOn: boolean;
  minW: number;
  minH: number;
  wmOn: boolean;
  wmSize: number;
  wmOpacity: number;
  wmMargin: number;
  wmRot: number;
  fmt: ExportFormat;
  tile: boolean;
  row: number;
  col: number;
}

export interface OutputPlan {
  scale: number;
  W: number;
  H: number;
}