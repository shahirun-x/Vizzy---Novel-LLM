import {
  ImageGenerationError,
  type GeneratePageImagesRequest,
  type ImageGenerationResult,
  type ImageGenerationService,
  type RefinePageImageRequest,
} from "@/services/image-generation";
import type { ImageVersion, PageAspectRatio } from "@/types/domain";

const DIRECTIONS = [
  {
    label: "Option A",
    name: "Establishing composition",
    description: "A wide environmental view that establishes place and scale.",
  },
  {
    label: "Option B",
    name: "Character composition",
    description: "A closer character-led frame with a strong emotional focal point.",
  },
  {
    label: "Option C",
    name: "Atmospheric composition",
    description: "A mood-first frame shaped by light, depth, and environmental texture.",
  },
] as const;

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function dimensions(aspectRatio: PageAspectRatio) {
  if (aspectRatio === "16:9") return { width: 1600, height: 900 };
  if (aspectRatio === "1:1") return { width: 1000, height: 1000 };
  return { width: 900, height: 1200 };
}

function visualMarkup(optionIndex: number, width: number, height: number, hue: number) {
  const accent = `hsl(${hue} 82% 64%)`;
  const accentSoft = `hsl(${(hue + 42) % 360} 72% 58%)`;

  if (optionIndex === 1) {
    return `
      <circle cx="${width * 0.18}" cy="${height * 0.2}" r="${width * 0.08}" fill="${accent}" opacity=".8"/>
      <path d="M0 ${height * 0.68} L${width * 0.22} ${height * 0.42} L${width * 0.42} ${height * 0.66} L${width * 0.65} ${height * 0.34} L${width} ${height * 0.64} V${height} H0Z" fill="#292241"/>
      <path d="M0 ${height * 0.8} Q${width * 0.45} ${height * 0.62} ${width} ${height * 0.76} V${height} H0Z" fill="#151222"/>
      <circle cx="${width * 0.58}" cy="${height * 0.68}" r="${width * 0.025}" fill="${accentSoft}"/>
      <path d="M${width * 0.56} ${height * 0.7} L${width * 0.53} ${height * 0.82} H${width * 0.63} L${width * 0.6} ${height * 0.7}Z" fill="${accentSoft}"/>`;
  }

  if (optionIndex === 2) {
    return `
      <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" rx="${width * 0.04}" fill="#211d34" stroke="${accent}" stroke-width="${Math.max(3, width * 0.006)}"/>
      <circle cx="${width * 0.5}" cy="${height * 0.37}" r="${width * 0.17}" fill="${accentSoft}"/>
      <path d="M${width * 0.22} ${height * 0.9} Q${width * 0.28} ${height * 0.58} ${width * 0.5} ${height * 0.58} Q${width * 0.72} ${height * 0.58} ${width * 0.78} ${height * 0.9}Z" fill="#0d0b16"/>
      <path d="M${width * 0.39} ${height * 0.36} Q${width * 0.5} ${height * 0.28} ${width * 0.61} ${height * 0.36}" fill="none" stroke="#0d0b16" stroke-width="${width * 0.025}" stroke-linecap="round"/>`;
  }

  return `
    <defs><filter id="blur"><feGaussianBlur stdDeviation="${width * 0.035}"/></filter></defs>
    <circle cx="${width * 0.28}" cy="${height * 0.32}" r="${width * 0.22}" fill="${accent}" opacity=".42" filter="url(#blur)"/>
    <circle cx="${width * 0.73}" cy="${height * 0.58}" r="${width * 0.3}" fill="${accentSoft}" opacity=".3" filter="url(#blur)"/>
    <path d="M${width * 0.06} ${height * 0.18} L${width * 0.48} ${height * 0.82}" stroke="#fff" stroke-opacity=".14" stroke-width="${width * 0.07}"/>
    <path d="M0 ${height * 0.76} Q${width * 0.28} ${height * 0.62} ${width * 0.55} ${height * 0.78} T${width} ${height * 0.7} V${height} H0Z" fill="#171325" opacity=".92"/>`;
}

function createPrototypeSvg(
  request: GeneratePageImagesRequest,
  optionIndex: number,
  seed: string,
) {
  const { width, height } = dimensions(request.aspectRatio);
  const hue = Number.parseInt(hashText(seed).slice(0, 5), 36) % 360;
  const direction = DIRECTIONS[optionIndex - 1];
  const titleSize = Math.max(26, Math.round(width * 0.035));
  const metaSize = Math.max(18, Math.round(width * 0.021));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prototype visual ${direction.label}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${(hue + 220) % 360} 34% 12%)"/><stop offset="1" stop-color="hsl(${(hue + 280) % 360} 40% 7%)"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    ${visualMarkup(optionIndex, width, height, hue)}
    <rect x="0" y="${height * 0.84}" width="${width}" height="${height * 0.16}" fill="#08070d" opacity=".88"/>
    <text x="${width * 0.055}" y="${height * 0.9}" fill="#fff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700">PROTOTYPE VISUAL · ${direction.label.toUpperCase()}</text>
    <text x="${width * 0.055}" y="${height * 0.945}" fill="#c9c4d8" font-family="Arial, sans-serif" font-size="${metaSize}">Demo composition · Batch ${request.batchNumber} · ${request.aspectRatio}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class MockImageGenerationService implements ImageGenerationService {
  async generate(request: GeneratePageImagesRequest): Promise<ImageGenerationResult> {
    if (
      !request.projectId ||
      !request.pageId ||
      !request.prompt.trim() ||
      request.optionCount !== 3 ||
      !Number.isInteger(request.batchNumber) ||
      request.batchNumber < 1
    ) {
      throw new ImageGenerationError(
        "INVALID_REQUEST",
        "A page, prompt, and valid three-option batch are required.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 140));

    const batchSeed = `${request.projectId}:${request.pageId}:${request.batchNumber}`;
    const generationBatchId = `batch-${hashText(batchSeed)}`;
    const createdAt = new Date().toISOString();
    const versions: ImageVersion[] = DIRECTIONS.map((direction, index) => {
      const optionIndex = index + 1;
      const visualSeed = `${batchSeed}:${optionIndex}`;
      return {
        id: `image-${hashText(visualSeed)}`,
        pageId: request.pageId,
        imageUrl: createPrototypeSvg(request, optionIndex, visualSeed),
        prompt: request.prompt,
        createdAt,
        selected: false,
        parentVersionId: null,
        generationBatchId,
        batchNumber: request.batchNumber,
        optionIndex,
        optionLabel: direction.label,
        aspectRatio: request.aspectRatio,
        compositionDirection: `${direction.name}. ${direction.description}`,
        visualSeed: hashText(visualSeed),
        status: "generated",
      };
    });

    return { generationBatchId, versions };
  }

  async refine(request: RefinePageImageRequest): Promise<ImageGenerationResult> {
    void request;
    throw new ImageGenerationError(
      "NOT_IMPLEMENTED",
      "Image refinement is intentionally outside this prototype sprint.",
    );
  }
}
