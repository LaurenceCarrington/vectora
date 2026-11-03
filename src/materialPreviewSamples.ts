import * as THREE from 'three';
import { PREVIEW_MATERIALS, previewMaterialCanvas, type PreviewMaterial } from './materialPreviewSurface';

let cached: Record<string, string> | undefined;

/** Render all samples once using the preview's renderer and environment, without extra WebGL contexts. */
export function materialPreviewSamples(renderer: THREE.WebGLRenderer, environment: THREE.Texture, materials: readonly PreviewMaterial[] = PREVIEW_MATERIALS): Record<string, string> {
    if (materials === PREVIEW_MATERIALS && cached) return cached;
    const size = 144, target = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const previousTarget = renderer.getRenderTarget(), clearColour = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    const scene = new THREE.Scene();
    scene.environment = environment;
    scene.add(new THREE.HemisphereLight('#ffffff', '#6b7383', 2.2));
    const light = new THREE.DirectionalLight('#fff7e5', 3);
    light.position.set(-2, 3, 4);
    scene.add(light);
    const rim = new THREE.DirectionalLight('#b8d8ff', 1);
    rim.position.set(2, 1, -2);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 20);
    camera.position.set(0, .15, 4.2);
    camera.lookAt(0, 0, 0);
    const geometry = new THREE.SphereGeometry(1, 48, 32), initialMaterial = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh<THREE.SphereGeometry, THREE.Material>(geometry, initialMaterial);
    scene.add(mesh);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!, pixels = new Uint8Array(size * size * 4), result: Record<string, string> = {};
    try {
        renderer.setClearColor(0, 0);
        for (const material of materials) {
            const map = new THREE.CanvasTexture(previewMaterialCanvas(material, 256, 128));
            map.colorSpace = THREE.SRGBColorSpace;
            const acrylic = material.id === 'acrylic' || material.id === 'frosted';
            const surface = new THREE.MeshPhysicalMaterial({ map, roughness: material.roughness, metalness: material.metalness,
                transmission: acrylic ? (material.id === 'acrylic' ? .65 : .25) : 0, thickness: 3, ior: 1.49 });
            mesh.material = surface;
            try {
                // Readback restores the resolved framebuffer; rebind the multisample target for each sample.
                renderer.setRenderTarget(target);
                renderer.render(scene, camera);
                renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
                const image = context.createImageData(size, size), stride = size * 4;
                for (let y = 0; y < size; y++) image.data.set(pixels.subarray(y * stride, (y + 1) * stride), (size - 1 - y) * stride);
                context.putImageData(image, 0, 0);
                result[material.id] = canvas.toDataURL('image/png');
            } finally {
                surface.dispose();
                map.dispose();
            }
        }
        if (materials === PREVIEW_MATERIALS) cached = result;
        return result;
    } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(clearColour, clearAlpha);
        geometry.dispose();
        initialMaterial.dispose();
        target.dispose();
    }
}
