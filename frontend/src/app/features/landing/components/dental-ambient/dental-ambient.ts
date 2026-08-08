import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  viewChild,
} from '@angular/core';
import type { BufferGeometry, Material, WebGLRenderer } from 'three';

@Component({
  selector: 'app-dental-ambient',
  template: '<canvas #canvas aria-hidden="true"></canvas>',
  styleUrl: './dental-ambient.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DentalAmbient {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private pointerX = 0;
  private pointerY = 0;

  constructor() {
    afterNextRender(() => void this.setupScene());
  }

  @HostListener('window:pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }

    this.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  }

  private async setupScene(): Promise<void> {
    if (window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 56rem)').matches) {
      return;
    }

    const THREE = await import('three');
    if (this.destroyRef.destroyed) {
      return;
    }

    const host = this.elementRef.nativeElement;
    const canvas = this.canvas().nativeElement;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    const group = new THREE.Group();
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    let renderer: WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      host.classList.add('ambient-unavailable');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    camera.position.set(0, 0.1, 6.2);

    const arch = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.75, 0.6, 0),
      new THREE.Vector3(-2.2, -0.25, 0.08),
      new THREE.Vector3(-1.25, -0.92, 0.16),
      new THREE.Vector3(0, -1.12, 0.2),
      new THREE.Vector3(1.25, -0.92, 0.16),
      new THREE.Vector3(2.2, -0.25, 0.08),
      new THREE.Vector3(2.75, 0.6, 0),
    ]);
    const railGeometry = new THREE.TubeGeometry(arch, 96, 0.018, 8, false);
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0xc86445,
      emissive: 0x73311f,
      emissiveIntensity: 0.32,
      metalness: 0.35,
      roughness: 0.45,
      transparent: true,
      opacity: 0.72,
    });
    geometries.push(railGeometry);
    materials.push(railMaterial);
    group.add(new THREE.Mesh(railGeometry, railMaterial));

    const bracketGeometry = new THREE.CapsuleGeometry(0.11, 0.16, 4, 10);
    const bracketMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf3eee4,
      roughness: 0.28,
      metalness: 0.08,
      clearcoat: 0.45,
      transparent: true,
      opacity: 0.82,
    });
    geometries.push(bracketGeometry);
    materials.push(bracketMaterial);

    for (let index = 0; index < 11; index += 1) {
      const position = arch.getPoint(index / 10);
      const tangent = arch.getTangent(index / 10);
      const bracket = new THREE.Mesh(bracketGeometry, bracketMaterial);
      bracket.position.copy(position);
      bracket.position.z += 0.04;
      bracket.rotation.z = Math.atan2(tangent.y, tangent.x) - Math.PI / 2;
      bracket.scale.set(1.05, 1, 0.7);
      group.add(bracket);
    }

    const pointGeometry = new THREE.BufferGeometry();
    const pointPositions = new Float32Array(54);
    for (let index = 0; index < pointPositions.length; index += 3) {
      pointPositions[index] = (Math.random() - 0.5) * 6.5;
      pointPositions[index + 1] = (Math.random() - 0.5) * 4;
      pointPositions[index + 2] = (Math.random() - 0.5) * 1.5 - 0.5;
    }
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
    const pointMaterial = new THREE.PointsMaterial({
      color: 0x2d765f,
      size: 0.035,
      transparent: true,
      opacity: 0.35,
    });
    geometries.push(pointGeometry);
    materials.push(pointMaterial);
    group.add(new THREE.Points(pointGeometry, pointMaterial));

    scene.add(group);
    scene.add(new THREE.HemisphereLight(0xfffefb, 0x173f38, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffeadf, 2.5);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    const resize = (): void => {
      const { width, height } = host.getBoundingClientRect();
      if (width === 0 || height === 0) {
        return;
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;
    let running = false;
    const render = (): void => {
      if (!running) {
        return;
      }
      const elapsed = clock.getElapsedTime();
      group.rotation.y += (this.pointerX * 0.12 - group.rotation.y) * 0.035;
      group.rotation.x += (-this.pointerY * 0.08 - group.rotation.x) * 0.035;
      group.rotation.z = Math.sin(elapsed * 0.35) * 0.018;
      group.position.y = Math.sin(elapsed * 0.5) * 0.035;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };

    const start = (): void => {
      if (running) {
        return;
      }
      running = true;
      clock.start();
      render();
    };
    const stop = (): void => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { rootMargin: '120px' },
    );
    visibilityObserver.observe(host);
    start();

    this.destroyRef.onDestroy(() => {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
    });
  }
}
