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

function interpretRefinement(instruction: string, seed: string) {
  const words = instruction.toLowerCase();
  const baseHueShift = Number.parseInt(hashText(seed).slice(0, 3), 36) % 36;
  return {
    hueShift:
      baseHueShift +
      (/(colder|cooler|blue)/.test(words) ? -48 : 0) +
      (/(warmer|golden|amber)/.test(words) ? 42 : 0),
    scale: /(closer|close-up|close up|more intimate)/.test(words)
      ? 1.2
      : /(wider|distant|more distant|environment)/.test(words)
        ? 0.84
        : 1,
    verticalShift: /(lower angle|low angle)/.test(words)
      ? 0.1
      : /(higher angle|high angle|overhead)/.test(words)
        ? -0.1
        : 0,
    lightOverlay: /(brighter|softer)/.test(words)
      ? { color: "#fff4dc", opacity: 0.14 }
      : /(darker|harsher|more tense)/.test(words)
        ? { color: "#07060c", opacity: 0.3 }
        : { color: "#777fd7", opacity: 0.08 },
    fog: /(fog|mist|atmospheric|isolated)/.test(words),
    storm: /(storm|rougher|chaotic|dramatic)/.test(words),
    emphasizeCharacter: /(character|soldier|person|people|prominent)/.test(words),
    negativeSpace: /(negative space|off-center|off center)/.test(words),
  };
}

function createRefinementSvg(request: RefinePageImageRequest, seed: string) {
  const parent = request.parentVersion;
  const { width, height } = dimensions(parent.aspectRatio);
  const treatment = interpretRefinement(request.refinementInstructions, seed);
  const hue =
    (Number.parseInt(hashText(parent.visualSeed).slice(0, 5), 36) + treatment.hueShift + 360) %
    360;
  const scaledWidth = width * treatment.scale;
  const scaledHeight = height * treatment.scale;
  const offsetX = treatment.negativeSpace
    ? width * 0.16
    : (width - scaledWidth) / 2;
  const offsetY =
    (height - scaledHeight) / 2 + treatment.verticalShift * height;
  const titleSize = Math.max(26, Math.round(width * 0.035));
  const metaSize = Math.max(18, Math.round(width * 0.021));
  const rootLabel = parent.optionLabel.split(".")[0];
  const versionLabel = `${rootLabel}.${request.refinementSequence}`;
  const atmosphericMarkup = `${
    treatment.fog
      ? `<path d="M0 ${height * 0.48} Q${width * 0.25} ${height * 0.38} ${width * 0.52} ${height * 0.52} T${width} ${height * 0.46}" fill="none" stroke="#e8e9f2" stroke-opacity=".22" stroke-width="${width * 0.1}"/>`
      : ""
  }${
    treatment.storm
      ? `<g stroke="#d9dcff" stroke-opacity=".34" stroke-width="${Math.max(2, width * 0.004)}"><path d="M${width * 0.15} 0 L${width * 0.03} ${height * 0.32}"/><path d="M${width * 0.48} 0 L${width * 0.32} ${height * 0.4}"/><path d="M${width * 0.82} 0 L${width * 0.65} ${height * 0.38}"/></g>`
      : ""
  }${
    treatment.emphasizeCharacter
      ? `<circle cx="${width * 0.68}" cy="${height * 0.5}" r="${width * 0.075}" fill="hsl(${(hue + 55) % 360} 78% 68%)"/><path d="M${width * 0.57} ${height * 0.8} Q${width * 0.59} ${height * 0.58} ${width * 0.68} ${height * 0.58} Q${width * 0.78} ${height * 0.58} ${width * 0.8} ${height * 0.8}Z" fill="#11101a"/>`
      : ""
  }`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Prototype refinement ${versionLabel}">
    <defs><linearGradient id="refined-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${(hue + 210) % 360} 42% 14%)"/><stop offset="1" stop-color="hsl(${(hue + 275) % 360} 45% 7%)"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#refined-bg)"/>
    <g transform="translate(${offsetX} ${offsetY}) scale(${treatment.scale})">${visualMarkup(parent.optionIndex, width, height, hue)}</g>
    ${atmosphericMarkup}
    <rect width="${width}" height="${height}" fill="${treatment.lightOverlay.color}" opacity="${treatment.lightOverlay.opacity}"/>
    <rect x="0" y="${height * 0.84}" width="${width}" height="${height * 0.16}" fill="#08070d" opacity=".9"/>
    <text x="${width * 0.055}" y="${height * 0.9}" fill="#fff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700">PROTOTYPE VISUAL · ${versionLabel.toUpperCase()}</text>
    <text x="${width * 0.055}" y="${height * 0.945}" fill="#c9c4d8" font-family="Arial, sans-serif" font-size="${metaSize}">Demo refinement · Level ${parent.refinementDepth + 1} · ${parent.aspectRatio}</text>
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
        rootVersionId: `image-${hashText(visualSeed)}`,
        generationBatchId,
        batchNumber: request.batchNumber,
        optionIndex,
        optionLabel: direction.label,
        aspectRatio: request.aspectRatio,
        compositionDirection: `${direction.name}. ${direction.description}`,
        visualSeed: hashText(visualSeed),
        generationSource: "generated",
        refinementInstruction: null,
        refinementDepth: 0,
        refinementSequence: 0,
        status: "generated",
      };
    });

    return { generationBatchId, versions };
  }

  async refine(request: RefinePageImageRequest): Promise<ImageGenerationResult> {
    const parent = request.parentVersion;
    if (
      !request.projectId ||
      !request.pageId ||
      !parent ||
      parent.pageId !== request.pageId ||
      !request.refinementInstructions.trim() ||
      !Number.isInteger(request.refinementSequence) ||
      request.refinementSequence < 1
    ) {
      throw new ImageGenerationError(
        "INVALID_REQUEST",
        "A selected parent and non-empty refinement instruction are required.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 140));

    const seedSource = `${request.projectId}:${request.pageId}:${parent.id}:${request.refinementSequence}:${request.refinementInstructions}`;
    const visualSeed = hashText(seedSource);
    const id = `image-refined-${visualSeed}`;
    const rootLabel = parent.optionLabel.split(".")[0];
    const child: ImageVersion = {
      id,
      pageId: request.pageId,
      imageUrl: createRefinementSvg(request, seedSource),
      prompt: parent.prompt,
      createdAt: new Date().toISOString(),
      selected: true,
      parentVersionId: parent.id,
      rootVersionId: parent.rootVersionId || parent.id,
      generationBatchId: parent.generationBatchId,
      batchNumber: parent.batchNumber,
      optionIndex: parent.optionIndex,
      optionLabel: `${rootLabel}.${request.refinementSequence}`,
      aspectRatio: parent.aspectRatio,
      compositionDirection: `Refinement of ${parent.optionLabel}: ${request.refinementInstructions}`,
      visualSeed,
      generationSource: "refinement",
      refinementInstruction: request.refinementInstructions,
      refinementDepth: parent.refinementDepth + 1,
      refinementSequence: request.refinementSequence,
      status: "selected",
    };

    return { generationBatchId: parent.generationBatchId, versions: [child] };
  }
}
