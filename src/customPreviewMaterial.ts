import { MAX_RASTER_PIXELS, validateRasterImage } from './rasterImage';
import type { PreviewMaterial } from './materialPreviewSurface';

/** Decode a local colour texture to bounded pixels; no file URLs or decoder resources are retained. */
export async function customPreviewMaterial(file: File, id: string): Promise<PreviewMaterial> {
    await validateRasterImage(file);
    const bitmap = await createImageBitmap(file);
    try {
        if (bitmap.width * bitmap.height > MAX_RASTER_PIXELS) throw new Error('Choose an image with at most 40 million pixels.');
        const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height)), image = document.createElement('canvas');
        image.width = Math.max(1, Math.round(bitmap.width * scale));
        image.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = image.getContext('2d')!;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, image.width, image.height);
        context.drawImage(bitmap, 0, 0, image.width, image.height);
        const sample = document.createElement('canvas');
        sample.width = sample.height = 1;
        const colour = sample.getContext('2d')!;
        colour.drawImage(image, 0, 0, 1, 1);
        const rgb = Array.from(colour.getImageData(0, 0, 1, 1).data).slice(0, 3);
        const hex = (values: number[]) => '#' + values.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
        return { id, name: file.name.replace(/\.[^.]*$/, '').trim().slice(0, 100) || 'Custom material',
            base: hex(rgb), edge: hex(rgb.map(value => value * .65)), mark: '#505050', roughness: .65, metalness: 0, grain: false, image };
    } finally {
        bitmap.close();
    }
}
