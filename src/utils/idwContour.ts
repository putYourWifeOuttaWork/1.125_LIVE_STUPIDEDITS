import { contours } from 'd3-contour';
import { geoPath, geoTransform } from 'd3-geo';
import { scaleSequential } from 'd3-scale';
import {
  interpolateRdYlBu,
  interpolateYlGnBu,
  interpolateYlOrRd,
  interpolateBlues,
} from 'd3-scale-chromatic';

export type ContourZoneMode = 'none' | 'temperature' | 'humidity' | 'battery' | 'pressure' | 'gas_resistance' | 'mold_risk';

export interface SensorPoint {
  x: number;
  y: number;
  value: number;
}

export interface ContourBand {
  path: Path2D;
  color: string;
  opacity: number;
  value: number;
}

interface IDWGridResult {
  values: Float64Array;
  cols: number;
  rows: number;
  minValue: number;
  maxValue: number;
}

const IDW_POWER = 2;
const GRID_RESOLUTION = 1;
const CONTOUR_THRESHOLD_COUNT = 18;

function idwInterpolate(
  gridX: number,
  gridY: number,
  sensors: SensorPoint[],
  power: number,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const sensor of sensors) {
    const dx = gridX - sensor.x;
    const dy = gridY - sensor.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1e-10) return sensor.value;
    const w = 1 / Math.pow(distSq, power / 2);
    numerator += w * sensor.value;
    denominator += w;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

export function buildIDWGrid(
  siteLength: number,
  siteWidth: number,
  sensors: SensorPoint[],
  resolution: number = GRID_RESOLUTION,
): IDWGridResult {
  const cols = Math.ceil(siteLength / resolution);
  const rows = Math.ceil(siteWidth / resolution);
  const values = new Float64Array(cols * rows);
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * resolution;
      const y = (j + 0.5) * resolution;
      const val = idwInterpolate(x, y, sensors, IDW_POWER);
      values[i + j * cols] = val;
      if (val < minValue) minValue = val;
      if (val > maxValue) maxValue = val;
    }
  }

  return { values, cols, rows, minValue, maxValue };
}

export function buildConfidenceGrid(
  siteLength: number,
  siteWidth: number,
  sensors: SensorPoint[],
  resolution: number = GRID_RESOLUTION,
  maxRadius: number = 60,
): Float64Array {
  const cols = Math.ceil(siteLength / resolution);
  const rows = Math.ceil(siteWidth / resolution);
  const confidence = new Float64Array(cols * rows);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * resolution;
      const y = (j + 0.5) * resolution;
      let minDist = Infinity;
      for (const s of sensors) {
        const dx = x - s.x;
        const dy = y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }
      confidence[i + j * cols] = Math.max(0.12, 1.0 - (minDist / maxRadius) * 0.88);
    }
  }

  return confidence;
}

function getColorScaleForMode(mode: ContourZoneMode, minVal: number, maxVal: number) {
  switch (mode) {
    case 'humidity':
      return scaleSequential(interpolateYlGnBu).domain([minVal, maxVal]);
    case 'gas_resistance':
      return scaleSequential(interpolateYlOrRd).domain([maxVal, minVal]);
    case 'pressure':
      return scaleSequential(interpolateBlues).domain([minVal, maxVal]);
    case 'mold_risk':
      return scaleSequential(interpolateYlOrRd).domain([minVal, maxVal]);
    case 'temperature':
    case 'battery':
    default:
      return scaleSequential(interpolateRdYlBu).domain([maxVal, minVal]);
  }
}

function parseColorToRGB(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ];
  }
  if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])];
    }
  }
  return [200, 200, 200];
}

export function generateContourBands(
  grid: IDWGridResult,
  mode: ContourZoneMode,
  canvasWidth: number,
  canvasHeight: number,
): ContourBand[] {
  const { values, cols, rows, minValue, maxValue } = grid;

  if (maxValue - minValue < 0.001) {
    const colorScale = getColorScaleForMode(mode, minValue, maxValue);
    const color = colorScale(minValue) || 'rgb(200,200,200)';
    const [r, g, b] = parseColorToRGB(color);
    const path = new Path2D();
    path.rect(0, 0, canvasWidth, canvasHeight);
    return [{ path, color: `rgb(${r},${g},${b})`, opacity: 0.55, value: minValue }];
  }

  const padding = (maxValue - minValue) * 0.05;
  const thresholdMin = minValue - padding;
  const thresholdMax = maxValue + padding;
  const step = (thresholdMax - thresholdMin) / CONTOUR_THRESHOLD_COUNT;
  const thresholds: number[] = [];
  for (let i = 0; i <= CONTOUR_THRESHOLD_COUNT; i++) {
    thresholds.push(thresholdMin + i * step);
  }

  const contourGenerator = contours()
    .size([cols, rows])
    .smooth(true)
    .thresholds(thresholds);

  const geoPolygons = contourGenerator(values as unknown as number[]);

  const xScale = (x: number) => (x / cols) * canvasWidth;
  const yScale = (y: number) => (y / rows) * canvasHeight;

  const projection = geoTransform({
    point(x: number, y: number) {
      this.stream.point(xScale(x), yScale(y));
    },
  });

  const pathGenerator = geoPath(projection);
  const colorScale = getColorScaleForMode(mode, minValue, maxValue);

  const bands: ContourBand[] = [];
  for (const polygon of geoPolygons) {
    const svgPath = pathGenerator(polygon);
    if (!svgPath) continue;
    const path2d = new Path2D(svgPath);
    const color = colorScale(polygon.value) || 'rgb(200,200,200)';
    const [r, g, b] = parseColorToRGB(color);
    bands.push({
      path: path2d,
      color: `rgb(${r},${g},${b})`,
      opacity: 0.55,
      value: polygon.value,
    });
  }

  return bands;
}

export function renderContourToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  bands: ContourBand[],
  confidenceGrid: Float64Array | null,
  cols: number,
  rows: number,
) {
  const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return;

  for (const band of bands) {
    offCtx.fillStyle = band.color;
    offCtx.globalAlpha = band.opacity;
    offCtx.fill(band.path);
  }
  offCtx.globalAlpha = 1.0;

  if (confidenceGrid) {
    const maskCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const maskCtx = maskCanvas.getContext('2d');
    if (maskCtx) {
      const imageData = maskCtx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      const cellW = canvas.width / cols;
      const cellH = canvas.height / rows;

      for (let py = 0; py < canvas.height; py++) {
        const gridJ = Math.min(Math.floor(py / cellH), rows - 1);
        for (let px = 0; px < canvas.width; px++) {
          const gridI = Math.min(Math.floor(px / cellW), cols - 1);
          const confidence = confidenceGrid[gridI + gridJ * cols];
          const idx = (py * canvas.width + px) * 4;
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = Math.round(confidence * 255);
        }
      }

      maskCtx.putImageData(imageData, 0, 0);

      offCtx.globalCompositeOperation = 'destination-in';
      offCtx.drawImage(maskCanvas, 0, 0);
      offCtx.globalCompositeOperation = 'source-over';
    }
  }

  ctx.drawImage(offscreen, 0, 0);
}

export function getValueLabel(value: number, mode: ContourZoneMode): string {
  switch (mode) {
    case 'temperature':
      return `${value.toFixed(1)}\u00B0F`;
    case 'humidity':
      return `${value.toFixed(0)}%`;
    case 'battery':
      return `${value.toFixed(0)}%`;
    case 'pressure':
      return `${value.toFixed(0)} hPa`;
    case 'gas_resistance':
      return `${(value / 1000).toFixed(1)} k\u2126`;
    case 'mold_risk':
      return `${(value * 100).toFixed(0)}%`;
    default:
      return value.toFixed(1);
  }
}

export function getModeDomain(mode: ContourZoneMode): [number, number] | null {
  switch (mode) {
    case 'temperature':
      return [32, 120];
    case 'humidity':
      return [0, 100];
    case 'battery':
      return [0, 100];
    case 'pressure':
      return [950, 1050];
    case 'gas_resistance':
      return [5000, 500000];
    case 'mold_risk':
      return [0, 1];
    default:
      return null;
  }
}

export interface LegendStop {
  color: string;
  label: string;
  position: number;
}

export function buildLegendStops(
  mode: ContourZoneMode,
  minVal: number,
  maxVal: number,
  count: number = 5,
): LegendStop[] {
  const colorScale = getColorScaleForMode(mode, minVal, maxVal);
  const stops: LegendStop[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const value = minVal + t * (maxVal - minVal);
    const color = colorScale(value) || 'rgb(200,200,200)';
    stops.push({
      color,
      label: getValueLabel(value, mode),
      position: t,
    });
  }
  return stops;
}
