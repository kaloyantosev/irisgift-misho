/**
 * IRIS Gift - Experience Script
 * - Initial sleek gray IRIS Gift Portal Dashboard with Notification Bell trigger
 * - Cinematic 3D Gift Box with authentic PBR paper & woven satin ribbon textures
 * - 100% glitch-free geometry, zero text clutter, zero audio code
 * - Auto-zooms new birthday card immediately upon unboxing
 */

(function () {
  'use strict';

  // --- Box Dimensions ---
  const BOX_WIDTH = 6.6;
  const BOX_HEIGHT = 2.3;
  const BOX_DEPTH = 5.0;
  const WALL_THICKNESS = 0.14;
  const BASE_HEIGHT = 0.18;

  // Knot position on top of the box
  const KNOT_X = 0.85;
  const KNOT_Z = 0.15;
  const KNOT_Y = BASE_HEIGHT + BOX_HEIGHT + 0.02;

  // Ribbon Dimensions
  const ORANGE_STRAP_W = 0.74;
  const BLUE_STRAP_W = 0.44;
  const RIBBON_GAP = 0.38;

  // --- State ---
  let orangeUntied = false;
  let blueUntied = false;
  let isBoxOpened = false;
  let canInteract = false;
  let sceneStarted = false;

  let activeDraggingRibbon = null; // 'orange' | 'blue'
  let hoveredRibbon = null;

  // --- DOM Elements ---
  const portalView = document.getElementById('portalView');
  const presentView = document.getElementById('presentView');
  const notificationTrigger = document.getElementById('notificationTrigger');
  const viewBoxBtn = document.getElementById('viewBoxBtn');
  const resetBtn = document.getElementById('resetBtn');
  const cardModal = document.getElementById('cardModal');
  const modalClose = document.getElementById('modalClose');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const dragHint = document.getElementById('dragHint');

  // --- Responsive Camera Calculations (Desktop & Mobile) ---
  function getResponsiveCameraSettings() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const isPortrait = aspect < 1.0;

    let fov = 38;
    let topY = 12.2;
    let orbitR = 12.8;
    let orbitH = 6.6;

    if (isPortrait) {
      fov = Math.min(56, 38 / Math.max(aspect * 1.12, 0.48));
      topY = 13.5 / Math.max(aspect * 1.1, 0.58);
      orbitR = 14.5 / Math.max(aspect * 1.15, 0.65);
      orbitH = 7.8;
    }

    return { aspect, isPortrait, fov, topY, orbitR, orbitH };
  }

  // --- Three.js Scene Setup ---
  const container = document.getElementById('webglContainer');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdbeafe);
  scene.fog = new THREE.Fog(0xdbeafe, 18, 42);

  const initCam = getResponsiveCameraSettings();
  const camera = new THREE.PerspectiveCamera(initCam.fov, initCam.aspect, 0.1, 100);
  camera.position.set(0, initCam.orbitH, initCam.orbitR);
  camera.lookAt(0, 1.0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  container.appendChild(renderer.domElement);

  if (THREE.RoomEnvironment) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    scene.environment = pmremGenerator.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xf0f7ff, 0x1e293b, 0.45);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.15);
  keyLight.position.set(-5.5, 13.5, 6.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -7.5;
  keyLight.shadow.camera.right = 7.5;
  keyLight.shadow.camera.top = 7.5;
  keyLight.shadow.camera.bottom = -7.5;
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
  fillLight.position.set(6, 8, -5);
  scene.add(fillLight);

  // Floor Shadow & Contact Vignette
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.ShadowMaterial({ opacity: 0.22 })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const contactCanvas = document.createElement('canvas');
  contactCanvas.width = 512;
  contactCanvas.height = 512;
  const cCtx = contactCanvas.getContext('2d');
  const cGrad = cCtx.createRadialGradient(256, 256, 40, 256, 256, 240);
  cGrad.addColorStop(0, 'rgba(10, 20, 40, 0.36)');
  cGrad.addColorStop(0.55, 'rgba(10, 20, 40, 0.12)');
  cGrad.addColorStop(1, 'rgba(10, 20, 40, 0)');
  cCtx.fillStyle = cGrad;
  cCtx.fillRect(0, 0, 512, 512);

  const contactMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(13.5, 11.5),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, opacity: 0.85, depthWrite: false })
  );
  contactMesh.rotation.x = -Math.PI / 2;
  contactMesh.position.y = 0.003;
  scene.add(contactMesh);

  // Load PBR Textures
  const texLoader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  function loadPaperTex(url, rx, ry, isColor) {
    const t = texLoader.load(url);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = maxAniso;
    if (isColor) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function loadRibbonTex(url, isColor) {
    const t = texLoader.load(url);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (isColor) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  const paperColor = loadPaperTex('navy_paper_color.jpg', 2, 2, true);
  const paperNormal = loadPaperTex('paper_normal.jpg', 3, 3, false);
  const paperRoughness = loadPaperTex('paper_roughness.jpg', 2, 2, false);

  const ribbonOrangeColor = loadRibbonTex('ribbon_orange.jpg', true);
  const ribbonBlueColor = loadRibbonTex('ribbon_blue.jpg', true);
  const ribbonNormal = loadRibbonTex('ribbon_normal.jpg', false);
  const ribbonRoughness = loadRibbonTex('ribbon_roughness.jpg', false);

  // Materials
  const boxOuterMaterial = new THREE.MeshStandardMaterial({
    map: paperColor,
    normalMap: paperNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: paperRoughness,
    roughness: 0.58,
    metalness: 0.06,
    envMapIntensity: 0.45
  });

  const velvetInteriorMaterial = new THREE.MeshStandardMaterial({
    color: 0x071124,
    normalMap: paperNormal,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.2
  });

  const goldTrimMaterial = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    metalness: 0.88,
    roughness: 0.22,
    envMapIntensity: 1.1
  });

  const orangeRibbonMaterial = new THREE.MeshStandardMaterial({
    map: ribbonOrangeColor,
    normalMap: ribbonNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: ribbonRoughness,
    roughness: 0.26,
    metalness: 0.18,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide
  });

  const blueRibbonMaterial = new THREE.MeshStandardMaterial({
    map: ribbonBlueColor,
    normalMap: ribbonNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: ribbonRoughness,
    roughness: 0.26,
    metalness: 0.2,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide
  });

  const ringOrangeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf58a1f,
    metalness: 0.92,
    roughness: 0.14,
    envMapIntensity: 1.4
  });

  const ringBlueMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    metalness: 0.92,
    roughness: 0.14,
    envMapIntensity: 1.4
  });

  function makeRoundedBox(w, h, d, radius, smoothness) {
    if (THREE.RoundedBoxGeometry) {
      return new THREE.RoundedBoxGeometry(w, h, d, smoothness || 4, radius || 0.035);
    }
    return new THREE.BoxGeometry(w, h, d);
  }

  // Clean flat rectangular ribbon strap helper
  function createFlatStrap(width, length, material, vRepeat) {
    const geo = new THREE.PlaneGeometry(width, length);
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      const vVal = uvAttr.getY(i);
      uvAttr.setY(i, vVal * (vRepeat || (length * 0.8)));
    }
    uvAttr.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Smooth wavy ribbon tail helper with V-cut swallowtail notch
  function createWavyTailMesh(points, width, thickness, material) {
    const curve = new THREE.CatmullRomCurve3(points);
    const segsL = 28;
    const segsW = 6;
    const totalLen = curve.getLength();

    const geo = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segsL; i++) {
      const t = i / segsL;
      const pt = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();

      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const normal = new THREE.Vector3().crossVectors(side, tangent).normalize();

      let curW = width;
      if (t < 0.2) {
        curW = width * (0.6 + 0.4 * (t / 0.2));
      }

      for (let j = 0; j <= segsW; j++) {
        const u = j / segsW;
        const across = (u - 0.5) * curW;
        const arch = Math.sin(u * Math.PI) * thickness;

        let vCut = 0;
        if (i === segsL) {
          const distFromMid = Math.abs(u - 0.5) * 2.0;
          vCut = -(1.0 - distFromMid) * (width * 0.35);
        }

        const vPos = new THREE.Vector3()
          .copy(pt)
          .addScaledVector(side, across)
          .addScaledVector(normal, arch)
          .addScaledVector(tangent, vCut);

        positions.push(vPos.x, vPos.y, vPos.z);
        uvs.push(u, t * (totalLen * 0.85));
      }
    }

    const rowSize = segsW + 1;
    for (let i = 0; i < segsL; i++) {
      for (let j = 0; j < segsW; j++) {
        const a = i * rowSize + j;
        const b = (i + 1) * rowSize + j;
        const c = (i + 1) * rowSize + (j + 1);
        const d = i * rowSize + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // --- Build 3D Gift Box ---
  const presentGroup = new THREE.Group();
  scene.add(presentGroup);

  // 1. Box Base & Velvet Pedestal
  const baseOuter = new THREE.Mesh(
    makeRoundedBox(BOX_WIDTH, BASE_HEIGHT, BOX_DEPTH, 0.04, 4),
    boxOuterMaterial
  );
  baseOuter.position.y = BASE_HEIGHT / 2;
  baseOuter.castShadow = true;
  baseOuter.receiveShadow = true;
  presentGroup.add(baseOuter);

  const pedMesh = new THREE.Mesh(
    makeRoundedBox(BOX_WIDTH - 0.45, 0.42, BOX_DEPTH - 0.45, 0.05, 4),
    velvetInteriorMaterial
  );
  pedMesh.position.y = BASE_HEIGHT + 0.21;
  pedMesh.receiveShadow = true;
  presentGroup.add(pedMesh);

  const goldFrame = new THREE.Mesh(
    makeRoundedBox(BOX_WIDTH - 0.5, 0.03, BOX_DEPTH - 0.5, 0.01, 2),
    goldTrimMaterial
  );
  goldFrame.position.y = BASE_HEIGHT + 0.41;
  presentGroup.add(goldFrame);

  const innerVelvetTop = new THREE.Mesh(
    makeRoundedBox(BOX_WIDTH - 0.62, 0.035, BOX_DEPTH - 0.62, 0.01, 2),
    velvetInteriorMaterial
  );
  innerVelvetTop.position.y = BASE_HEIGHT + 0.42;
  innerVelvetTop.receiveShadow = true;
  presentGroup.add(innerVelvetTop);

  // 2. Birthday Card Mesh (New Card: 721x1024, toneMapped: false)
  const cardGroup = new THREE.Group();
  cardGroup.position.set(0, BASE_HEIGHT + 0.46, 0);
  presentGroup.add(cardGroup);

  let cardHitMesh = null;

  texLoader.load('card.png', (cardTex) => {
    cardTex.encoding = THREE.sRGBEncoding;
    cardTex.anisotropy = maxAniso;
    cardTex.minFilter = THREE.LinearMipmapLinearFilter;
    cardTex.magFilter = THREE.LinearFilter;

    const cardRatio = 721 / 1024;
    const cardH = 4.35;
    const cardW = cardH * cardRatio;

    const cardBoard = new THREE.Mesh(
      makeRoundedBox(cardW + 0.08, 0.04, cardH + 0.08, 0.015, 3),
      goldTrimMaterial
    );
    cardBoard.castShadow = true;
    cardGroup.add(cardBoard);

    const cardFrontMat = new THREE.MeshBasicMaterial({
      map: cardTex,
      toneMapped: false
    });
    const cardFront = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), cardFrontMat);
    cardFront.rotation.x = -Math.PI / 2;
    cardFront.position.y = 0.022;
    cardGroup.add(cardFront);

    cardHitMesh = cardFront;
    document.getElementById('loaderOverlay').classList.add('fade-out');
  });

  // 3. The 4 Beveled Walls & Clean Straps
  const wallPivots = {};

  function buildLuxuryWall(name) {
    const pivot = new THREE.Group();

    if (name === 'left') {
      pivot.position.set(-BOX_WIDTH / 2, BASE_HEIGHT, 0);

      const wallMesh = new THREE.Mesh(
        makeRoundedBox(WALL_THICKNESS, BOX_HEIGHT, BOX_DEPTH, 0.035, 4),
        boxOuterMaterial
      );
      wallMesh.position.set(WALL_THICKNESS / 2, BOX_HEIGHT / 2, 0);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      pivot.add(wallMesh);

      const innerLining = new THREE.Mesh(
        new THREE.PlaneGeometry(BOX_HEIGHT - 0.16, BOX_DEPTH - 0.24),
        velvetInteriorMaterial
      );
      innerLining.rotation.y = Math.PI / 2;
      innerLining.rotation.z = Math.PI / 2;
      innerLining.position.set(WALL_THICKNESS + 0.004, BOX_HEIGHT / 2, 0);
      pivot.add(innerLining);

      const lidW = BOX_WIDTH / 2;
      const lidMesh = new THREE.Mesh(
        makeRoundedBox(lidW, WALL_THICKNESS, BOX_DEPTH, 0.035, 4),
        boxOuterMaterial
      );
      lidMesh.position.set(lidW / 2, BOX_HEIGHT - WALL_THICKNESS / 2, 0);
      lidMesh.castShadow = true;
      lidMesh.receiveShadow = true;
      pivot.add(lidMesh);

      const topOrange = createFlatStrap(ORANGE_STRAP_W, lidW, orangeRibbonMaterial);
      topOrange.rotation.x = -Math.PI / 2;
      topOrange.rotation.z = Math.PI / 2;
      topOrange.position.set(lidW / 2, BOX_HEIGHT + 0.008, KNOT_Z);
      pivot.add(topOrange);

      const topBlue = createFlatStrap(BLUE_STRAP_W, lidW, blueRibbonMaterial);
      topBlue.rotation.x = -Math.PI / 2;
      topBlue.rotation.z = Math.PI / 2;
      topBlue.position.set(lidW / 2, BOX_HEIGHT + 0.009, KNOT_Z - RIBBON_GAP);
      pivot.add(topBlue);

      const sideOrange = createFlatStrap(ORANGE_STRAP_W, BOX_HEIGHT, orangeRibbonMaterial);
      sideOrange.rotation.y = -Math.PI / 2;
      sideOrange.position.set(-0.004, BOX_HEIGHT / 2, KNOT_Z);
      pivot.add(sideOrange);

      const sideBlue = createFlatStrap(BLUE_STRAP_W, BOX_HEIGHT, blueRibbonMaterial);
      sideBlue.rotation.y = -Math.PI / 2;
      sideBlue.position.set(-0.004, BOX_HEIGHT / 2, KNOT_Z - RIBBON_GAP);
      pivot.add(sideBlue);

    } else if (name === 'right') {
      pivot.position.set(BOX_WIDTH / 2, BASE_HEIGHT, 0);

      const wallMesh = new THREE.Mesh(
        makeRoundedBox(WALL_THICKNESS, BOX_HEIGHT, BOX_DEPTH, 0.035, 4),
        boxOuterMaterial
      );
      wallMesh.position.set(-WALL_THICKNESS / 2, BOX_HEIGHT / 2, 0);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      pivot.add(wallMesh);

      const innerLining = new THREE.Mesh(
        new THREE.PlaneGeometry(BOX_HEIGHT - 0.16, BOX_DEPTH - 0.24),
        velvetInteriorMaterial
      );
      innerLining.rotation.y = -Math.PI / 2;
      innerLining.rotation.z = -Math.PI / 2;
      innerLining.position.set(-WALL_THICKNESS - 0.004, BOX_HEIGHT / 2, 0);
      pivot.add(innerLining);

      const lidW = BOX_WIDTH / 2;
      const lidMesh = new THREE.Mesh(
        makeRoundedBox(lidW, WALL_THICKNESS, BOX_DEPTH, 0.035, 4),
        boxOuterMaterial
      );
      lidMesh.position.set(-lidW / 2, BOX_HEIGHT - WALL_THICKNESS / 2, 0);
      lidMesh.castShadow = true;
      lidMesh.receiveShadow = true;
      pivot.add(lidMesh);

      const topOrange = createFlatStrap(ORANGE_STRAP_W, lidW, orangeRibbonMaterial);
      topOrange.rotation.x = -Math.PI / 2;
      topOrange.rotation.z = Math.PI / 2;
      topOrange.position.set(-lidW / 2, BOX_HEIGHT + 0.008, KNOT_Z);
      pivot.add(topOrange);

      const topBlue = createFlatStrap(BLUE_STRAP_W, lidW, blueRibbonMaterial);
      topBlue.rotation.x = -Math.PI / 2;
      topBlue.rotation.z = Math.PI / 2;
      topBlue.position.set(-lidW / 2, BOX_HEIGHT + 0.009, KNOT_Z - RIBBON_GAP);
      pivot.add(topBlue);

      const localKnotX = KNOT_X - BOX_WIDTH / 2;

      const vertOrange = createFlatStrap(ORANGE_STRAP_W, BOX_DEPTH, orangeRibbonMaterial);
      vertOrange.rotation.x = -Math.PI / 2;
      vertOrange.position.set(localKnotX, BOX_HEIGHT + 0.01, 0);
      pivot.add(vertOrange);

      const vertBlue = createFlatStrap(BLUE_STRAP_W, BOX_DEPTH, blueRibbonMaterial);
      vertBlue.rotation.x = -Math.PI / 2;
      vertBlue.position.set(localKnotX + RIBBON_GAP, BOX_HEIGHT + 0.011, 0);
      pivot.add(vertBlue);

      const sideOrange = createFlatStrap(ORANGE_STRAP_W, BOX_HEIGHT, orangeRibbonMaterial);
      sideOrange.rotation.y = Math.PI / 2;
      sideOrange.position.set(0.004, BOX_HEIGHT / 2, KNOT_Z);
      pivot.add(sideOrange);

      const sideBlue = createFlatStrap(BLUE_STRAP_W, BOX_HEIGHT, blueRibbonMaterial);
      sideBlue.rotation.y = Math.PI / 2;
      sideBlue.position.set(0.004, BOX_HEIGHT / 2, KNOT_Z - RIBBON_GAP);
      pivot.add(sideBlue);

    } else if (name === 'back') {
      pivot.position.set(0, BASE_HEIGHT, -BOX_DEPTH / 2);

      const wallMesh = new THREE.Mesh(
        makeRoundedBox(BOX_WIDTH - 0.04, BOX_HEIGHT - 0.02, WALL_THICKNESS, 0.03, 4),
        boxOuterMaterial
      );
      wallMesh.position.set(0, (BOX_HEIGHT - 0.02) / 2, WALL_THICKNESS / 2);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      pivot.add(wallMesh);

      const innerLining = new THREE.Mesh(
        new THREE.PlaneGeometry(BOX_WIDTH - 0.3, BOX_HEIGHT - 0.18),
        velvetInteriorMaterial
      );
      innerLining.position.set(0, (BOX_HEIGHT - 0.02) / 2, WALL_THICKNESS + 0.004);
      pivot.add(innerLining);

      const vertOrange = createFlatStrap(ORANGE_STRAP_W, BOX_HEIGHT, orangeRibbonMaterial);
      vertOrange.rotation.y = Math.PI;
      vertOrange.position.set(KNOT_X, BOX_HEIGHT / 2, -0.004);
      pivot.add(vertOrange);

      const vertBlue = createFlatStrap(BLUE_STRAP_W, BOX_HEIGHT, blueRibbonMaterial);
      vertBlue.rotation.y = Math.PI;
      vertBlue.position.set(KNOT_X + RIBBON_GAP, BOX_HEIGHT / 2, -0.004);
      pivot.add(vertBlue);

    } else if (name === 'front') {
      pivot.position.set(0, BASE_HEIGHT, BOX_DEPTH / 2);

      const wallMesh = new THREE.Mesh(
        makeRoundedBox(BOX_WIDTH - 0.04, BOX_HEIGHT - 0.02, WALL_THICKNESS, 0.03, 4),
        boxOuterMaterial
      );
      wallMesh.position.set(0, (BOX_HEIGHT - 0.02) / 2, -WALL_THICKNESS / 2);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      pivot.add(wallMesh);

      const innerLining = new THREE.Mesh(
        new THREE.PlaneGeometry(BOX_WIDTH - 0.3, BOX_HEIGHT - 0.18),
        velvetInteriorMaterial
      );
      innerLining.rotation.y = Math.PI;
      innerLining.position.set(0, (BOX_HEIGHT - 0.02) / 2, -WALL_THICKNESS - 0.004);
      pivot.add(innerLining);

      const vertOrange = createFlatStrap(ORANGE_STRAP_W, BOX_HEIGHT, orangeRibbonMaterial);
      vertOrange.position.set(KNOT_X, BOX_HEIGHT / 2, 0.004);
      pivot.add(vertOrange);

      const vertBlue = createFlatStrap(BLUE_STRAP_W, BOX_HEIGHT, blueRibbonMaterial);
      vertBlue.position.set(KNOT_X + RIBBON_GAP, BOX_HEIGHT / 2, 0.004);
      pivot.add(vertBlue);
    }

    presentGroup.add(pivot);
    wallPivots[name] = pivot;
  }

  buildLuxuryWall('left');
  buildLuxuryWall('right');
  buildLuxuryWall('back');
  buildLuxuryWall('front');

  // 4. Center Rings
  const knotGroup = new THREE.Group();
  knotGroup.position.set(KNOT_X, KNOT_Y, KNOT_Z);
  presentGroup.add(knotGroup);

  const ringGeo = new THREE.TorusGeometry(0.56, 0.105, 32, 64);

  const ringOrangeMesh = new THREE.Mesh(ringGeo, ringOrangeMaterial);
  ringOrangeMesh.rotation.x = Math.PI / 2.25;
  ringOrangeMesh.rotation.y = -0.18;
  ringOrangeMesh.position.set(-0.2, 0.16, 0.04);
  ringOrangeMesh.castShadow = true;
  knotGroup.add(ringOrangeMesh);

  const ringBlueMesh = new THREE.Mesh(ringGeo, ringBlueMaterial);
  ringBlueMesh.rotation.x = Math.PI / 2.1;
  ringBlueMesh.rotation.y = 0.28;
  ringBlueMesh.position.set(0.25, 0.19, -0.08);
  ringBlueMesh.castShadow = true;
  knotGroup.add(ringBlueMesh);

  // 5. Wavy Ribbon Tails for Dragging
  const orangePointsDefault = [
    new THREE.Vector3(KNOT_X - 0.16, KNOT_Y + 0.11, KNOT_Z + 0.08),
    new THREE.Vector3(KNOT_X - 0.65, KNOT_Y + 0.19, KNOT_Z + 0.44),
    new THREE.Vector3(KNOT_X - 1.25, KNOT_Y + 0.06, KNOT_Z + 0.85),
    new THREE.Vector3(KNOT_X - 1.82, KNOT_Y + 0.15, KNOT_Z + 1.22),
    new THREE.Vector3(KNOT_X - 2.30, KNOT_Y + 0.05, KNOT_Z + 1.55)
  ];
  let orangePoints = orangePointsDefault.map(p => p.clone());

  const bluePointsDefault = [
    new THREE.Vector3(KNOT_X + 0.20, KNOT_Y + 0.11, KNOT_Z + 0.06),
    new THREE.Vector3(KNOT_X + 0.65, KNOT_Y + 0.19, KNOT_Z + 0.42),
    new THREE.Vector3(KNOT_X + 1.15, KNOT_Y + 0.06, KNOT_Z + 0.82),
    new THREE.Vector3(KNOT_X + 1.58, KNOT_Y + 0.14, KNOT_Z + 1.16),
    new THREE.Vector3(KNOT_X + 1.96, KNOT_Y + 0.05, KNOT_Z + 1.44)
  ];
  let bluePoints = bluePointsDefault.map(p => p.clone());

  let orangeTailMesh = createWavyTailMesh(orangePoints, 0.72, 0.026, orangeRibbonMaterial);
  presentGroup.add(orangeTailMesh);

  let blueTailMesh = createWavyTailMesh(bluePoints, 0.48, 0.024, blueRibbonMaterial);
  presentGroup.add(blueTailMesh);

  const hitGeo = new THREE.SphereGeometry(1.05, 12, 12);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  const orangeHit = new THREE.Mesh(hitGeo, hitMat);
  orangeHit.position.copy(orangePoints[3]);
  orangeHit.userData = { ribbon: 'orange' };
  presentGroup.add(orangeHit);

  const blueHit = new THREE.Mesh(hitGeo, hitMat);
  blueHit.position.copy(bluePoints[3]);
  blueHit.userData = { ribbon: 'blue' };
  presentGroup.add(blueHit);

  function updateOrangeTailMesh() {
    presentGroup.remove(orangeTailMesh);
    orangeTailMesh.geometry.dispose();
    orangeTailMesh = createWavyTailMesh(orangePoints, 0.72, 0.026, orangeRibbonMaterial);
    presentGroup.add(orangeTailMesh);
    orangeHit.position.copy(orangePoints[3]);
  }

  function updateBlueTailMesh() {
    presentGroup.remove(blueTailMesh);
    blueTailMesh.geometry.dispose();
    blueTailMesh = createWavyTailMesh(bluePoints, 0.48, 0.024, blueRibbonMaterial);
    presentGroup.add(blueTailMesh);
    blueHit.position.copy(bluePoints[3]);
  }

  // Celebration Confetti System (Sprays Left & Right)
  const confettiCanvas = document.getElementById('confettiCanvas');
  const cctx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
  let confettiParticles = [];
  let confettiAnimId = null;

  function resizeConfettiCanvas() {
    if (!confettiCanvas || !cctx) return;
    confettiCanvas.width = window.innerWidth * window.devicePixelRatio;
    confettiCanvas.height = window.innerHeight * window.devicePixelRatio;
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  resizeConfettiCanvas();

  function createConfettiBurst() {
    if (!confettiCanvas || !cctx) return;
    resizeConfettiCanvas();

    const w = window.innerWidth;
    const h = window.innerHeight;
    const originX = w * 0.5;
    const originY = h * 0.62;

    const colors = [
      '#f26f21', '#ea580c', // IRIS Orange
      '#0284c7', '#0369a1', // IRIS Blue
      '#fbbf24', '#f59e0b', // Celebration Gold
      '#f43f5e', '#ec4899', // Hot Pink
      '#10b981', '#059669', // Emerald
      '#38bdf8', '#06b6d4', // Cyan
      '#a855f7',            // Royal Purple
      '#ffffff'             // Sparkle White
    ];

    function spawnSide(isLeft, count, speedMul) {
      for (let i = 0; i < count; i++) {
        // Left cone: angles 118° to 165° | Right cone: angles 15° to 62°
        const angle = isLeft
          ? Math.PI * (0.64 + Math.random() * 0.28)
          : Math.PI * (0.08 + Math.random() * 0.28);

        const speed = (16 + Math.random() * 22) * speedMul;
        const shapes = ['rect', 'rect', 'circle', 'strip'];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];

        confettiParticles.push({
          x: originX + (Math.random() - 0.5) * 50,
          y: originY + (Math.random() - 0.5) * 24,
          vx: Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          gravity: 0.44 + Math.random() * 0.16,
          friction: 0.966,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.16,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.08 + Math.random() * 0.1,
          size: 7 + Math.random() * 8,
          length: shape === 'strip' ? 18 + Math.random() * 14 : 9 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: shape,
          opacity: 1,
          decay: 0.0035 + Math.random() * 0.0035,
          drift: (isLeft ? -1 : 1) * (0.4 + Math.random() * 0.8)
        });
      }
    }

    // Wave 1: Immediate powerful explosion Left & Right
    spawnSide(true, 75, 1.0);  // Left
    spawnSide(false, 75, 1.0); // Right

    // Wave 2: Fast follow-up pop higher to Left & Right
    setTimeout(() => {
      spawnSide(true, 55, 1.18);  // Left
      spawnSide(false, 55, 1.18); // Right
    }, 160);

    if (!confettiAnimId) {
      animateConfetti();
    }
  }

  function animateConfetti() {
    if (!confettiCanvas || !cctx) return;
    cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      p.vx *= p.friction;
      p.vy = p.vy * p.friction + p.gravity;
      p.x += p.vx + p.drift;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.wobble += p.wobbleSpeed;
      p.opacity -= p.decay;

      if (p.opacity <= 0 || p.y > window.innerHeight + 60) {
        confettiParticles.splice(i, 1);
        continue;
      }

      cctx.save();
      cctx.globalAlpha = Math.max(0, p.opacity);
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rotation);
      cctx.scale(Math.cos(p.wobble), 1);

      cctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        cctx.beginPath();
        cctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
        cctx.fill();
      } else if (p.shape === 'strip') {
        cctx.fillRect(-p.size * 0.35, -p.length * 0.5, p.size * 0.7, p.length);
      } else {
        cctx.fillRect(-p.size * 0.5, -p.length * 0.5, p.size, p.length);
      }
      cctx.restore();
    }

    if (confettiParticles.length > 0) {
      confettiAnimId = requestAnimationFrame(animateConfetti);
    } else {
      confettiAnimId = null;
      cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  // Golden Dust on Open
  let dustParticles = [];
  const dustGroup = new THREE.Group();
  scene.add(dustGroup);

  function createSubtleGoldDust() {
    dustParticles = [];
    const count = 14;
    const geo = new THREE.PlaneGeometry(0.09, 0.09);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: Math.random() * 0.55 + 0.25,
        side: THREE.DoubleSide
      });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(
        (Math.random() - 0.5) * 2.4,
        BOX_HEIGHT + Math.random() * 0.6 + 0.3,
        (Math.random() - 0.5) * 1.8
      );
      p.userData = {
        vy: Math.random() * 0.012 + 0.006,
        vx: (Math.random() - 0.5) * 0.006,
        rotSpeed: (Math.random() - 0.5) * 0.025
      };
      dustGroup.add(p);
      dustParticles.push(p);
    }
  }

  function updateGoldDust() {
    for (let i = dustParticles.length - 1; i >= 0; i--) {
      const p = dustParticles[i];
      p.position.y += p.userData.vy;
      p.position.x += p.userData.vx;
      p.rotation.z += p.userData.rotSpeed;
      p.material.opacity -= 0.0035;

      if (p.material.opacity <= 0 || p.position.y > 5.5) {
        dustGroup.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        dustParticles.splice(i, 1);
      }
    }
  }

  let cameraIntroTween = null;

  // --- Cinematic 3D Camera Orbit -> Top POV ---
  function playCinematicCameraIntro() {
    canInteract = false;
    if (dragHint) dragHint.classList.remove('visible');
    const camSettings = getResponsiveCameraSettings();
    camera.fov = camSettings.fov;
    camera.updateProjectionMatrix();

    if (cameraIntroTween) {
      cameraIntroTween.kill();
    }

    const orbit = { angle: 0, height: camSettings.orbitH, radius: camSettings.orbitR };
    camera.position.set(0, orbit.height, orbit.radius);
    camera.lookAt(0, 1.1, 0);

    const tl = gsap.timeline({
      onComplete: () => {
        canInteract = true;
        if (!isBoxOpened && dragHint) {
          dragHint.classList.add('visible');
        }
      }
    });
    cameraIntroTween = tl;

    tl.to(orbit, {
      angle: Math.PI * 2,
      duration: 3.4,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.position.x = Math.sin(orbit.angle) * orbit.radius;
        camera.position.z = Math.cos(orbit.angle) * orbit.radius;
        camera.position.y = orbit.height;
        camera.lookAt(0, 1.15, 0);
      }
    });

    tl.to(camera.position, {
      x: 0,
      y: camSettings.topY,
      z: 0.001,
      duration: 1.9,
      ease: 'power3.out',
      onUpdate: () => {
        camera.lookAt(0, 0, 0);
      }
    }, '-=0.45');
  }

  // --- Enter Present View from Notification Bell ---
  function enterPresentExperience() {
    if (sceneStarted) return;
    sceneStarted = true;

    // Transition portal dashboard out
    portalView.classList.add('portal-hidden');
    presentView.classList.add('active-scene');

    // Start 3D orbit intro
    setTimeout(playCinematicCameraIntro, 350);
  }

  notificationTrigger.addEventListener('click', enterPresentExperience);
  notificationTrigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      enterPresentExperience();
    }
  });

  // --- Interactive Ribbon Dragging ---
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(KNOT_Y + 0.1));
  const planeIntersect = new THREE.Vector3();

  function getRibbonTargets() {
    const targets = [];
    if (!orangeUntied) targets.push(orangeHit, orangeTailMesh);
    if (!blueUntied) targets.push(blueHit, blueTailMesh);
    return targets;
  }

  function resolveRibbonFromHit(obj) {
    if (obj === orangeHit || obj === orangeTailMesh) return 'orange';
    if (obj === blueHit || obj === blueTailMesh) return 'blue';
    return null;
  }

  function onPointerDown(e) {
    if (!canInteract || isBoxOpened) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(getRibbonTargets());

    if (intersects.length > 0) {
      const picked = resolveRibbonFromHit(intersects[0].object);
      if (picked === 'orange' && !orangeUntied) {
        activeDraggingRibbon = 'orange';
        document.body.style.cursor = 'grabbing';
        if (dragHint) dragHint.classList.remove('visible');
        if (e.cancelable) e.preventDefault();
      } else if (picked === 'blue' && !blueUntied) {
        activeDraggingRibbon = 'blue';
        document.body.style.cursor = 'grabbing';
        if (dragHint) dragHint.classList.remove('visible');
        if (e.cancelable) e.preventDefault();
      }
    }
  }

  function onPointerMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    if (!activeDraggingRibbon && canInteract && !isBoxOpened) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(getRibbonTargets());
      const hovered = intersects.length > 0 ? resolveRibbonFromHit(intersects[0].object) : null;
      document.body.style.cursor = hovered ? 'grab' : 'default';
      if (hovered !== hoveredRibbon) {
        hoveredRibbon = hovered;
        orangeRibbonMaterial.emissive.setHex(hovered === 'orange' ? 0x2a0e00 : 0x000000);
        blueRibbonMaterial.emissive.setHex(hovered === 'blue' ? 0x051538 : 0x000000);
      }
    }

    if (!activeDraggingRibbon) return;
    if (e.cancelable) e.preventDefault();

    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      if (activeDraggingRibbon === 'orange') {
        orangePoints[4].x = planeIntersect.x;
        orangePoints[4].z = planeIntersect.z;

        const d = orangePoints[4].distanceTo(orangePointsDefault[4]);
        const tension = Math.min(d / 1.05, 1.0);

        for (let k = 1; k <= 3; k++) {
          const frac = k / 4;
          orangePoints[k].x = THREE.MathUtils.lerp(
            orangePointsDefault[k].x,
            THREE.MathUtils.lerp(orangePointsDefault[0].x, planeIntersect.x, frac),
            tension * 0.75
          );
          orangePoints[k].z = THREE.MathUtils.lerp(
            orangePointsDefault[k].z,
            THREE.MathUtils.lerp(orangePointsDefault[0].z, planeIntersect.z, frac),
            tension * 0.75
          );
          orangePoints[k].y = THREE.MathUtils.lerp(
            orangePointsDefault[k].y,
            KNOT_Y + 0.12,
            tension * 0.65
          );
        }
        updateOrangeTailMesh();

        knotGroup.position.x = KNOT_X - tension * 0.08;
        knotGroup.position.z = KNOT_Z + tension * 0.05;

      } else if (activeDraggingRibbon === 'blue') {
        bluePoints[4].x = planeIntersect.x;
        bluePoints[4].z = planeIntersect.z;

        const d = bluePoints[4].distanceTo(bluePointsDefault[4]);
        const tension = Math.min(d / 1.05, 1.0);

        for (let k = 1; k <= 3; k++) {
          const frac = k / 4;
          bluePoints[k].x = THREE.MathUtils.lerp(
            bluePointsDefault[k].x,
            THREE.MathUtils.lerp(bluePointsDefault[0].x, planeIntersect.x, frac),
            tension * 0.75
          );
          bluePoints[k].z = THREE.MathUtils.lerp(
            bluePointsDefault[k].z,
            THREE.MathUtils.lerp(bluePointsDefault[0].z, planeIntersect.z, frac),
            tension * 0.75
          );
          bluePoints[k].y = THREE.MathUtils.lerp(
            bluePointsDefault[k].y,
            KNOT_Y + 0.12,
            tension * 0.65
          );
        }
        updateBlueTailMesh();

        knotGroup.position.x = KNOT_X + tension * 0.08;
        knotGroup.position.z = KNOT_Z + tension * 0.05;
      }
    }
  }

  function onPointerUp() {
    if (!activeDraggingRibbon) return;
    const ribbon = activeDraggingRibbon;
    activeDraggingRibbon = null;
    document.body.style.cursor = 'default';
    orangeRibbonMaterial.emissive.setHex(0x000000);
    blueRibbonMaterial.emissive.setHex(0x000000);

    gsap.to(knotGroup.position, { x: KNOT_X, z: KNOT_Z, duration: 0.3, ease: 'power2.out' });

    const camSettings = getResponsiveCameraSettings();
    const dragThreshold = camSettings.isPortrait ? 0.36 : 0.48;

    if (ribbon === 'orange') {
      const distDragged = orangePoints[4].distanceTo(orangePointsDefault[4]);
      if (distDragged > dragThreshold) {
        animateRibbonSlide('orange');
      } else {
        orangePoints.forEach((pt, idx) => {
          gsap.to(pt, {
            x: orangePointsDefault[idx].x,
            y: orangePointsDefault[idx].y,
            z: orangePointsDefault[idx].z,
            duration: 0.4,
            ease: 'elastic.out(1, 0.5)',
            onUpdate: idx === 4 ? updateOrangeTailMesh : null
          });
        });
      }
    } else if (ribbon === 'blue') {
      const distDragged = bluePoints[4].distanceTo(bluePointsDefault[4]);
      if (distDragged > dragThreshold) {
        animateRibbonSlide('blue');
      } else {
        bluePoints.forEach((pt, idx) => {
          gsap.to(pt, {
            x: bluePointsDefault[idx].x,
            y: bluePointsDefault[idx].y,
            z: bluePointsDefault[idx].z,
            duration: 0.4,
            ease: 'elastic.out(1, 0.5)',
            onUpdate: idx === 4 ? updateBlueTailMesh : null
          });
        });
      }
    }
  }

  // --- Smooth Ribbon Slide-Off Animation ---
  function animateRibbonSlide(ribbon) {
    if (ribbon === 'orange') {
      orangeUntied = true;

      const exitTarget = new THREE.Vector3(-8.5, KNOT_Y + 0.08, 5.5);
      orangePoints.forEach((pt, idx) => {
        gsap.to(pt, {
          x: exitTarget.x,
          z: exitTarget.z,
          duration: 0.55,
          delay: idx * 0.035,
          ease: 'power2.in',
          onUpdate: idx === 4 ? updateOrangeTailMesh : null,
          onComplete: idx === 4 ? () => {
            presentGroup.remove(orangeTailMesh);
            presentGroup.remove(orangeHit);
            checkBothUntied();
          } : null
        });
      });

    } else if (ribbon === 'blue') {
      blueUntied = true;

      const exitTarget = new THREE.Vector3(8.5, KNOT_Y + 0.08, 5.5);
      bluePoints.forEach((pt, idx) => {
        gsap.to(pt, {
          x: exitTarget.x,
          z: exitTarget.z,
          duration: 0.55,
          delay: idx * 0.035,
          ease: 'power2.in',
          onUpdate: idx === 4 ? updateBlueTailMesh : null,
          onComplete: idx === 4 ? () => {
            presentGroup.remove(blueTailMesh);
            presentGroup.remove(blueHit);
            checkBothUntied();
          } : null
        });
      });
    }
  }

  function checkBothUntied() {
    if (orangeUntied && blueUntied && !isBoxOpened) {
      openBoxPresentation();
    }
  }

  // --- Open the Box: All 4 Walls Fall Flat & DIRECTLY AUTO-ZOOM THE CARD! ---
  function openBoxPresentation() {
    isBoxOpened = true;

    // Rings dissolve upwards
    gsap.to(knotGroup.position, { y: KNOT_Y + 2.6, duration: 0.6, ease: 'power2.out' });
    gsap.to(knotGroup.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.6, ease: 'power2.in' });
    gsap.to(knotGroup.rotation, { y: Math.PI * 2.5, duration: 0.6 });

    // 4 Walls fall flat outward
    gsap.to(wallPivots.left.rotation, {
      z: Math.PI * 0.5,
      duration: 1.15,
      ease: 'bounce.out',
      delay: 0.15
    });

    gsap.to(wallPivots.right.rotation, {
      z: -Math.PI * 0.5,
      duration: 1.15,
      ease: 'bounce.out',
      delay: 0.15
    });

    gsap.to(wallPivots.back.rotation, {
      x: -Math.PI * 0.5,
      duration: 1.15,
      ease: 'bounce.out',
      delay: 0.2
    });

    gsap.to(wallPivots.front.rotation, {
      x: Math.PI * 0.5,
      duration: 1.15,
      ease: 'bounce.out',
      delay: 0.2
    });

    // 3D Card rises from pedestal
    gsap.to(cardGroup.position, {
      y: 2.75,
      duration: 1.35,
      ease: 'power3.out',
      delay: 0.35
    });
    gsap.to(cardGroup.scale, {
      x: 1.22,
      y: 1.22,
      z: 1.22,
      duration: 1.35,
      ease: 'power3.out',
      delay: 0.35
    });

    // LAUNCH CELEBRATION CONFETTI SPRAYING LEFT & RIGHT!
    setTimeout(createConfettiBurst, 150);
    setTimeout(createSubtleGoldDust, 350);

    if (dragHint) dragHint.classList.remove('visible');
    viewBoxBtn.style.display = 'none';
    resetBtn.style.display = 'none';

    // DIRECTLY AUTO-OPEN & ZOOM THE CARD INTO FULLSCREEN LIGHTBOX!
    setTimeout(() => {
      cardModal.classList.add('active');
    }, 750);
  }

  // --- Reset / Re-wrap ---
  function resetBox() {
    isBoxOpened = false;
    orangeUntied = false;
    blueUntied = false;

    cardModal.classList.remove('active');
    confettiParticles = [];
    if (cctx) cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    viewBoxBtn.style.display = 'inline-flex';
    resetBtn.style.display = 'none';

    if (dragHint) {
      setTimeout(() => {
        if (!isBoxOpened) dragHint.classList.add('visible');
      }, 750);
    }

    gsap.to(wallPivots.left.rotation, { z: 0, duration: 0.85, ease: 'power2.inOut' });
    gsap.to(wallPivots.right.rotation, { z: 0, duration: 0.85, ease: 'power2.inOut' });
    gsap.to(wallPivots.back.rotation, { x: 0, duration: 0.85, ease: 'power2.inOut' });
    gsap.to(wallPivots.front.rotation, { x: 0, duration: 0.85, ease: 'power2.inOut' });

    gsap.to(cardGroup.position, { y: BASE_HEIGHT + 0.46, duration: 0.75, ease: 'power2.in' });
    gsap.to(cardGroup.scale, { x: 1, y: 1, z: 1, duration: 0.75, ease: 'power2.in' });

    gsap.to(knotGroup.position, { x: KNOT_X, y: KNOT_Y, z: KNOT_Z, duration: 0.75, ease: 'power2.out', delay: 0.25 });
    gsap.to(knotGroup.scale, { x: 1, y: 1, z: 1, duration: 0.75, ease: 'power2.out', delay: 0.25 });
    gsap.to(knotGroup.rotation, { y: 0, duration: 0.75, delay: 0.25 });

    orangePoints = orangePointsDefault.map(p => p.clone());
    bluePoints = bluePointsDefault.map(p => p.clone());
    updateOrangeTailMesh();
    updateBlueTailMesh();
    presentGroup.add(orangeHit);
    presentGroup.add(blueHit);
  }

  // Click on 3D Card to re-open lightbox if closed
  function onSceneClick(e) {
    if (!isBoxOpened || !cardHitMesh) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(cardHitMesh);
    if (intersects.length > 0) {
      cardModal.classList.add('active');
      viewBoxBtn.style.display = 'none';
      resetBtn.style.display = 'none';
    }
  }

  function onModalClose() {
    cardModal.classList.remove('active');
    if (isBoxOpened) {
      viewBoxBtn.style.display = 'inline-flex';
      resetBtn.style.display = 'inline-flex';
    }
  }

  modalClose.addEventListener('click', onModalClose);
  modalBackdrop.addEventListener('click', onModalClose);

  // --- Show Closed Box & Restart Cinematic Camera Orbit Intro ---
  function showClosedBoxIntro() {
    if (cardModal.classList.contains('active')) {
      cardModal.classList.remove('active');
    }

    if (dragHint) dragHint.classList.remove('visible');

    // Clear confetti
    confettiParticles = [];
    if (cctx) cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Reset state flags
    isBoxOpened = false;
    orangeUntied = false;
    blueUntied = false;
    activeDraggingRibbon = null;
    hoveredRibbon = null;

    // Reset wall pivots immediately to closed upright position (0)
    gsap.killTweensOf(wallPivots.left.rotation);
    gsap.killTweensOf(wallPivots.right.rotation);
    gsap.killTweensOf(wallPivots.back.rotation);
    gsap.killTweensOf(wallPivots.front.rotation);
    wallPivots.left.rotation.z = 0;
    wallPivots.right.rotation.z = 0;
    wallPivots.back.rotation.x = 0;
    wallPivots.front.rotation.x = 0;

    // Card inside box
    gsap.killTweensOf(cardGroup.position);
    gsap.killTweensOf(cardGroup.scale);
    cardGroup.position.set(0, BASE_HEIGHT + 0.46, 0);
    cardGroup.scale.set(1, 1, 1);

    // Knot on top
    gsap.killTweensOf(knotGroup.position);
    gsap.killTweensOf(knotGroup.scale);
    gsap.killTweensOf(knotGroup.rotation);
    knotGroup.position.set(KNOT_X, KNOT_Y, KNOT_Z);
    knotGroup.scale.set(1, 1, 1);
    knotGroup.rotation.set(0, 0, 0);

    // Ribbons back on box
    orangePoints = orangePointsDefault.map(p => p.clone());
    bluePoints = bluePointsDefault.map(p => p.clone());
    updateOrangeTailMesh();
    updateBlueTailMesh();
    if (!presentGroup.children.includes(orangeHit)) presentGroup.add(orangeHit);
    if (!presentGroup.children.includes(blueHit)) presentGroup.add(blueHit);

    // Keep buttons accessible
    viewBoxBtn.style.display = 'inline-flex';
    resetBtn.style.display = 'inline-flex';

    // Play full 360 cinematic camera orbit rotation around the CLOSED box!
    playCinematicCameraIntro();
  }

  viewBoxBtn.addEventListener('click', showClosedBoxIntro);

  resetBtn.addEventListener('click', resetBox);

  function handleResize() {
    resizeConfettiCanvas();
    const camSettings = getResponsiveCameraSettings();
    camera.aspect = camSettings.aspect;
    camera.fov = camSettings.fov;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (canInteract && !isBoxOpened) {
      camera.position.y = camSettings.topY;
    }
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 180);
  });

  window.addEventListener('mousedown', onPointerDown);
  window.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('click', onSceneClick);

  // Animation Loop
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    if (isBoxOpened) {
      cardGroup.position.y = 2.75 + Math.sin(time * 1.5) * 0.04;
    }

    if (dustParticles.length > 0) {
      updateGoldDust();
    }

    renderer.render(scene, camera);
  }
  animate();

})();
