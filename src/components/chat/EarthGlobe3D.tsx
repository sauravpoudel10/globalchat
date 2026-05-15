import { useEffect, useRef } from "react";

type ThreeModule = typeof import("three");

type EarthGlobe3DProps = {
  className?: string;
};

export function EarthGlobe3D({ className }: EarthGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;

    import("three").then((THREE) => {
      if (disposed) return;
      cleanup = initGlobe(THREE, mount);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden="true" />;
}

function initGlobe(THREE: ThreeModule, mount: HTMLDivElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 11);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = "h-full w-full";
  renderer.domElement.dataset.earthCanvas = "true";
  mount.appendChild(renderer.domElement);

  let disposedFlag = false;

  const earthTexture = new THREE.CanvasTexture(createEarthTexture());
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  earthTexture.wrapS = THREE.RepeatWrapping;
  earthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const cloudTexture = new THREE.CanvasTexture(createCloudTexture());
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  cloudTexture.wrapS = THREE.RepeatWrapping;

  const globeGroup = new THREE.Group();
  globeGroup.rotation.z = -0.36;
  scene.add(globeGroup);

  const earthMaterial = new THREE.MeshStandardMaterial({
    map: earthTexture,
    roughness: 0.88,
    metalness: 0,
    emissive: new THREE.Color(0x031510),
    emissiveIntensity: 0.16,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(2.5, 128, 96), earthMaterial);
  globeGroup.add(earth);

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  loader.load(
    "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg",
    (tex: InstanceType<ThreeModule["Texture"]>) => {
      if (disposedFlag) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const old = earthMaterial.map;
      earthMaterial.map = tex;
      earthMaterial.emissive = new THREE.Color(0x000000);
      earthMaterial.emissiveIntensity = 0;
      earthMaterial.needsUpdate = true;
      old?.dispose();
    },
  );
  loader.load(
    "https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png",
    (tex: InstanceType<ThreeModule["Texture"]>) => {
      if (disposedFlag) {
        tex.dispose();
        return;
      }
      tex.wrapS = THREE.RepeatWrapping;
      earthMaterial.bumpMap = tex;
      earthMaterial.bumpScale = 0.04;
      earthMaterial.needsUpdate = true;
    },
  );
  loader.load(
    "https://unpkg.com/three-globe@2.31.1/example/img/earth-water.png",
    (tex: InstanceType<ThreeModule["Texture"]>) => {
      if (disposedFlag) {
        tex.dispose();
        return;
      }
      tex.wrapS = THREE.RepeatWrapping;
      earthMaterial.roughnessMap = tex;
      earthMaterial.metalness = 0.2;
      earthMaterial.needsUpdate = true;
    },
  );

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(2.535, 128, 96),
    new THREE.MeshLambertMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  globeGroup.add(clouds);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(2.62, 128, 96),
    new THREE.MeshBasicMaterial({
      color: 0x5ecfff,
      transparent: true,
      opacity: 0.075,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(atmosphere);

  const EARTH_RADIUS = 2.5;
  const cities: Array<{ name: string; lat: number; lon: number }> = [
    { name: "USA", lat: 39, lon: -98 },
    { name: "Germany", lat: 52.52, lon: 13.4 },
    { name: "China", lat: 39.9, lon: 116.4 },
    { name: "Australia", lat: -33.87, lon: 151.21 },
  ];

  const markerColor = new THREE.Color(0x39ff88);
  const markerGeometry = new THREE.SphereGeometry(0.045, 18, 18);
  const haloGeometry = new THREE.RingGeometry(0.08, 0.13, 32);
  const disposables: Array<{ dispose: () => void }> = [
    markerGeometry,
    haloGeometry,
  ];

  const halos: Array<{ mesh: InstanceType<ThreeModule["Mesh"]>; phase: number }> = [];

  cities.forEach((city, index) => {
    const position = latLonToVec3(THREE, city.lat, city.lon, EARTH_RADIUS + 0.015);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: markerColor,
      transparent: true,
      opacity: 0.95,
    });
    disposables.push(markerMaterial);
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(position);
    globeGroup.add(marker);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: markerColor,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(haloMaterial);
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.copy(position);
    halo.lookAt(0, 0, 0);
    halo.rotateY(Math.PI);
    globeGroup.add(halo);
    halos.push({ mesh: halo, phase: index * 0.7 });
  });

  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const start = latLonToVec3(THREE, cities[i].lat, cities[i].lon, EARTH_RADIUS);
      const end = latLonToVec3(THREE, cities[j].lat, cities[j].lon, EARTH_RADIUS);
      const points = buildArcPoints(THREE, start, end, EARTH_RADIUS);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineDashedMaterial({
        color: markerColor,
        dashSize: 0.085,
        gapSize: 0.07,
        transparent: true,
        opacity: 0.9,
        linewidth: 1,
      });
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      globeGroup.add(line);
      disposables.push(geometry, material);
    }
  }

  scene.add(new THREE.AmbientLight(0x9bd8ff, 0.52));
  const sun = new THREE.DirectionalLight(0xffffff, 3.4);
  sun.position.set(4.8, 2.6, 5.8);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x66ffd0, 1.2);
  rim.position.set(-3.8, -0.2, -2.4);
  scene.add(rim);

  const resize = () => {
    const { width, height } = mount.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();

  let frame = 0;
  const clock = new THREE.Clock();

  const animate = () => {
    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;
    globeGroup.rotation.y += delta * 0.22;
    clouds.rotation.y += delta * 0.06;
    atmosphere.rotation.y += delta * 0.08;
    halos.forEach(({ mesh, phase }) => {
      const pulse = 0.85 + Math.sin(elapsed * 2.2 + phase) * 0.35;
      mesh.scale.setScalar(pulse);
      const material = mesh.material as InstanceType<ThreeModule["MeshBasicMaterial"]>;
      material.opacity = 0.35 + (Math.sin(elapsed * 2.2 + phase) + 1) * 0.25;
    });
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  };
  animate();

  return () => {
    disposedFlag = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    mount.removeChild(renderer.domElement);
    earth.geometry.dispose();
    clouds.geometry.dispose();
    atmosphere.geometry.dispose();
    earthMaterial.map?.dispose();
    earthMaterial.bumpMap?.dispose();
    earthMaterial.roughnessMap?.dispose();
    cloudTexture.dispose();
    earthMaterial.dispose();
    clouds.material.dispose();
    atmosphere.material.dispose();
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  };
}

function latLonToVec3(THREE: ThreeModule, lat: number, lon: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function buildArcPoints(
  THREE: ThreeModule,
  start: InstanceType<ThreeModule["Vector3"]>,
  end: InstanceType<ThreeModule["Vector3"]>,
  radius: number,
  segments = 72,
) {
  const dot = start.dot(end) / (radius * radius);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinAngle = Math.sin(angle) || 1;
  const lift = 0.18 + Math.min(angle / Math.PI, 1) * 0.22;

  const points: Array<InstanceType<ThreeModule["Vector3"]>> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = Math.sin((1 - t) * angle) / sinAngle;
    const b = Math.sin(t * angle) / sinAngle;
    const point = new THREE.Vector3()
      .copy(start)
      .multiplyScalar(a)
      .addScaledVector(end, b);
    const r = radius * (1 + Math.sin(t * Math.PI) * lift);
    point.normalize().multiplyScalar(r);
    points.push(point);
  }
  return points;
}

function createEarthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const ocean = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  ocean.addColorStop(0, "#102f58");
  ocean.addColorStop(0.45, "#071e35");
  ocean.addColorStop(1, "#0d3f4b");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawLatitudeBands(ctx, canvas.width, canvas.height);

  const land = "#2f6f42";
  const highland = "#7a7855";
  drawLand(ctx, land, highland, [
    [-168, 72],
    [-132, 71],
    [-98, 58],
    [-70, 48],
    [-82, 24],
    [-110, 18],
    [-123, 33],
    [-154, 50],
  ]);
  drawLand(ctx, land, highland, [
    [-82, 12],
    [-54, 5],
    [-36, -14],
    [-48, -48],
    [-70, -55],
    [-80, -24],
  ]);
  drawLand(ctx, land, highland, [
    [-18, 36],
    [18, 64],
    [72, 68],
    [132, 54],
    [152, 32],
    [104, 8],
    [78, 22],
    [42, 8],
    [28, -32],
    [8, -36],
    [-8, 8],
  ]);
  drawLand(ctx, land, highland, [
    [112, -12],
    [154, -18],
    [150, -39],
    [116, -43],
    [102, -27],
  ]);
  drawLand(ctx, land, highland, [
    [-50, 78],
    [-22, 72],
    [-30, 60],
    [-58, 60],
  ]);

  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "#d8e6cf";
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + Math.random() * 3, 0.6 + Math.random() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  return canvas;
}

function createCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const width = 30 + Math.random() * 150;
    const height = 6 + Math.random() * 26;
    ctx.beginPath();
    ctx.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    ctx.beginPath();
    const y = Math.random() * canvas.height;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      canvas.width * 0.28,
      y - 80 + Math.random() * 160,
      canvas.width * 0.68,
      y - 80 + Math.random() * 160,
      canvas.width,
      y - 40 + Math.random() * 80,
    );
    ctx.stroke();
  }

  return canvas;
}

function drawLatitudeBands(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 18; i++) {
    const y = (i / 17) * height;
    ctx.fillStyle = i % 2 === 0 ? "#4da0a8" : "#0a283c";
    ctx.fillRect(0, y, width, height / 52);
  }
  ctx.globalAlpha = 1;
}

function drawLand(
  ctx: CanvasRenderingContext2D,
  land: string,
  highland: string,
  points: Array<[number, number]>,
) {
  const mapped = points.map(([lon, lat]) => lonLat(lon, lat, ctx.canvas.width, ctx.canvas.height));
  ctx.beginPath();
  mapped.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = land;
  ctx.fill();

  ctx.globalAlpha = 0.34;
  ctx.fillStyle = highland;
  mapped.forEach(([x, y], index) => {
    if (index % 2 === 0) {
      ctx.beginPath();
      ctx.ellipse(x, y, 24, 10, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

function lonLat(lon: number, lat: number, width: number, height: number): [number, number] {
  return [((lon + 180) / 360) * width, ((90 - lat) / 180) * height];
}
