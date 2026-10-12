/**
 * CYBERPULSE: Highway Overdrive
 * Full 3D Racing Game Engine powered by Three.js & Web Audio API
 */

(function () {
  'use strict';

  // ==========================================================================
  // CONFIGURATION & GAME CONSTANTS
  // ==========================================================================
  const CONFIG = {
    ROAD_WIDTH: 22,
    ROAD_SEGMENT_LENGTH: 80,
    TOTAL_SEGMENTS: 12,
    LANES: [-7, -2.3, 2.3, 7], // 4 Driving Lanes
    BASE_SPEED: 0,
    MAX_NORMAL_SPEED: 260, // km/h
    MAX_NITRO_SPEED: 375,  // km/h
    ACCELERATION: 110,     // km/h per second
    BRAKE_POWER: 220,      // km/h per second
    COAST_FRICTION: 35,    // natural slowdown
    STEER_SPEED: 18,       // lane traversal responsiveness
    NITRO_DRAIN_RATE: 30,  // % per sec
    NITRO_RECHARGE_RATE: 7,// % per sec idle recharge
    SPAWN_INTERVAL: 1.1,   // seconds between enemy cars
    CAR_DIMENSIONS: { width: 2.2, height: 1.1, length: 4.6 }
  };

  // ==========================================================================
  // AUDIO SYNTHESIS SYSTEM (Web Audio API - Zero External Audio Dependencies)
  // ==========================================================================
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.engineOsc = null;
      this.engineGain = null;
      this.windGain = null;
      this.nitroGain = null;
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();

        // 1. Engine Oscillator (Sub/Sawtooth rumble)
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.setValueAtTime(60, this.ctx.currentTime);

        const engineFilter = this.ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.setValueAtTime(350, this.ctx.currentTime);

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

        this.engineOsc.connect(engineFilter);
        engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();

        // 2. Wind / White Noise generator for high speeds
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const windFilter = this.ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
        windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

        this.windGain = this.ctx.createGain();
        this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);

        whiteNoise.connect(windFilter);
        windFilter.connect(this.windGain);
        this.windGain.connect(this.ctx.destination);
        whiteNoise.start();

        this.initialized = true;
      } catch (e) {
        console.warn('Web Audio not allowed or unsupported yet:', e);
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      if (!this.enabled && this.ctx) {
        if (this.engineGain) this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
        if (this.windGain) this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      return this.enabled;
    }

    updateEngine(speed, maxSpeed, isNitro) {
      if (!this.enabled || !this.initialized) return;
      const ratio = Math.max(0.05, speed / maxSpeed);

      // Pitch engine up based on speed
      const baseFreq = isNitro ? 120 : 55;
      const targetFreq = baseFreq + ratio * 280;
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);

      const targetVol = 0.04 + ratio * 0.07;
      this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);

      // Wind noise increases at speed
      const windVol = Math.pow(ratio, 2) * 0.12;
      this.windGain.gain.setTargetAtTime(windVol, this.ctx.currentTime, 0.1);
    }

    playNitroWhoosh() {
      if (!this.enabled || !this.initialized) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    }

    playCrash() {
      if (!this.enabled || !this.initialized) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.6);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.7);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.7);
    }

    playNearMiss() {
      if (!this.enabled || !this.initialized) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1400, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    }

    playBeep(freq = 600, duration = 0.15) {
      if (!this.enabled || !this.initialized) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    }
  }

  // ==========================================================================
  // 3D CAR FACTORY: PROCEDURAL SPORTS CARS & TRAFFIC MODELS
  // ==========================================================================
  class CarFactory {
    static createCarMesh(color = 0x00f0ff, isPlayer = false) {
      const carGroup = new THREE.Group();

      // Materials
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.85,
        roughness: 0.2,
        envMapIntensity: 1.0
      });

      const carbonMaterial = new THREE.MeshStandardMaterial({
        color: 0x111317,
        metalness: 0.3,
        roughness: 0.8
      });

      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x050c18,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.7,
        transparent: true,
        opacity: 0.9
      });

      const wheelRimMaterial = new THREE.MeshStandardMaterial({
        color: 0xdde4f0,
        metalness: 0.9,
        roughness: 0.1
      });

      const tireMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9
      });

      const glowCyan = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const glowRed = new THREE.MeshBasicMaterial({ color: 0xff0033 });

      // 1. Lower Chassis / Aerodynamic Skirt
      const chassisGeo = new THREE.BoxGeometry(2.1, 0.45, 4.5);
      const chassis = new THREE.Mesh(chassisGeo, bodyMaterial);
      chassis.position.y = 0.45;
      chassis.castShadow = true;
      carGroup.add(chassis);

      // 2. Cockpit / Cabin
      const cabinGeo = new THREE.BoxGeometry(1.65, 0.5, 2.2);
      const cabin = new THREE.Mesh(cabinGeo, glassMaterial);
      cabin.position.set(0, 0.85, -0.2);
      cabin.castShadow = true;
      carGroup.add(cabin);

      // Cabin Roof Cap
      const roofGeo = new THREE.BoxGeometry(1.5, 0.08, 1.8);
      const roof = new THREE.Mesh(roofGeo, carbonMaterial);
      roof.position.set(0, 1.12, -0.2);
      carGroup.add(roof);

      // 3. Front Hood Slope
      const hoodGeo = new THREE.BoxGeometry(1.9, 0.25, 1.3);
      const hood = new THREE.Mesh(hoodGeo, bodyMaterial);
      hood.position.set(0, 0.65, 1.35);
      hood.rotation.x = -0.15;
      carGroup.add(hood);

      // Front Splitter
      const splitterGeo = new THREE.BoxGeometry(2.2, 0.08, 0.7);
      const splitter = new THREE.Mesh(splitterGeo, carbonMaterial);
      splitter.position.set(0, 0.22, 2.2);
      carGroup.add(splitter);

      // 4. Rear Trunk & Diffuser
      const trunkGeo = new THREE.BoxGeometry(1.9, 0.35, 1.1);
      const trunk = new THREE.Mesh(trunkGeo, bodyMaterial);
      trunk.position.set(0, 0.65, -1.6);
      carGroup.add(trunk);

      // Rear Spoiler Wing
      const wingGeo = new THREE.BoxGeometry(2.0, 0.06, 0.4);
      const wing = new THREE.Mesh(wingGeo, carbonMaterial);
      wing.position.set(0, 1.15, -2.1);

      const wingPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.1), carbonMaterial);
      wingPillarL.position.set(-0.6, 0.95, -2.1);
      const wingPillarR = wingPillarL.clone();
      wingPillarR.position.x = 0.6;

      carGroup.add(wing);
      carGroup.add(wingPillarL);
      carGroup.add(wingPillarR);

      // 5. Wheels
      const wheelRadius = 0.4;
      const wheelWidth = 0.32;
      const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20);
      tireGeo.rotateZ(Math.PI / 2);

      const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.65, wheelRadius * 0.65, wheelWidth + 0.02, 12);
      rimGeo.rotateZ(Math.PI / 2);

      const wheelPositions = [
        [-1.02, 0.4, 1.35], // Front Left
        [1.02, 0.4, 1.35],  // Front Right
        [-1.02, 0.4, -1.35],// Rear Left
        [1.02, 0.4, -1.35]  // Rear Right
      ];

      const wheels = [];
      wheelPositions.forEach(pos => {
        const wheelGroup = new THREE.Group();
        const tire = new THREE.Mesh(tireGeo, tireMaterial);
        tire.castShadow = true;
        const rim = new THREE.Mesh(rimGeo, wheelRimMaterial);
        wheelGroup.add(tire);
        wheelGroup.add(rim);
        wheelGroup.position.set(pos[0], pos[1], pos[2]);
        carGroup.add(wheelGroup);
        wheels.push(wheelGroup);
      });
      carGroup.userData.wheels = wheels;

      // 6. Lights
      // Headlights (Front: +Z)
      const headLightGeo = new THREE.BoxGeometry(0.38, 0.1, 0.06);
      const hlLeft = new THREE.Mesh(headLightGeo, glowCyan);
      hlLeft.position.set(-0.72, 0.52, 2.26);
      const hlRight = hlLeft.clone();
      hlRight.position.x = 0.72;
      carGroup.add(hlLeft);
      carGroup.add(hlRight);

      // Tail Lights (Rear: -Z)
      const tailLightGeo = new THREE.BoxGeometry(0.5, 0.08, 0.06);
      const tlLeft = new THREE.Mesh(tailLightGeo, glowRed);
      tlLeft.position.set(-0.68, 0.62, -2.26);
      const tlRight = tlLeft.clone();
      tlRight.position.x = 0.68;
      carGroup.add(tlLeft);
      carGroup.add(tlRight);

      // If Player, create dual exhaust nitro jets
      if (isPlayer) {
        const jetGeo = new THREE.ConeGeometry(0.25, 1.8, 16);
        jetGeo.rotateX(-Math.PI / 2);
        jetGeo.translate(0, 0, -0.9);

        const flameMaterial = new THREE.MeshBasicMaterial({
          color: 0x00e5ff,
          transparent: true,
          opacity: 0.9
        });

        const flameL = new THREE.Mesh(jetGeo, flameMaterial);
        flameL.position.set(-0.45, 0.35, -2.25);
        flameL.visible = false;

        const flameR = flameL.clone();
        flameR.position.x = 0.45;

        // Core white-hot inner cones
        const innerConeGeo = new THREE.ConeGeometry(0.12, 1.2, 16);
        innerConeGeo.rotateX(-Math.PI / 2);
        innerConeGeo.translate(0, 0, -0.6);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const coreL = new THREE.Mesh(innerConeGeo, innerMat);
        const coreR = coreL.clone();
        flameL.add(coreL);
        flameR.add(coreR);

        carGroup.add(flameL);
        carGroup.add(flameR);
        carGroup.userData.nitroFlames = [flameL, flameR];

        // Headlight spot cones shining forward
        const headlightBeam1 = new THREE.SpotLight(0x00f0ff, 1.5, 50, Math.PI / 7, 0.4, 1);
        headlightBeam1.position.set(-0.7, 0.5, 2.2);
        headlightBeam1.target.position.set(-0.7, 0, 20);
        carGroup.add(headlightBeam1);
        carGroup.add(headlightBeam1.target);

        const headlightBeam2 = new THREE.SpotLight(0x00f0ff, 1.5, 50, Math.PI / 7, 0.4, 1);
        headlightBeam2.position.set(0.7, 0.5, 2.2);
        headlightBeam2.target.position.set(0.7, 0, 20);
        carGroup.add(headlightBeam2);
        carGroup.add(headlightBeam2.target);
      }

      return carGroup;
    }
  }

  // ==========================================================================
  // MAIN GAME CLASS
  // ==========================================================================
  class CyberPulseGame {
    constructor() {
      this.container = document.getElementById('game-container');
      this.sound = new SoundManager();

      // Game State
      this.state = 'START'; // 'START', 'COUNTDOWN', 'RACING', 'PAUSED', 'GAMEOVER'
      this.speed = 0;       // Current speed in km/h
      this.targetSpeed = 0;
      this.score = 0;
      this.distance = 0;    // Meters
      this.nitro = 100;     // Percentage 0-100
      this.isNitroActive = false;
      this.topSpeedReached = 0;
      this.nearMisses = 0;
      this.cameraShake = 0;

      // Controls State
      this.keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        nitro: false
      };

      // Road & Scenery
      this.roadSegments = [];
      this.sceneryObjects = [];
      this.trafficCars = [];
      this.particleSparks = [];
      this.lastSpawnTime = 0;

      // Clock & Timing
      this.clock = new THREE.Clock();
      this.totalTime = 0;

      // Cache DOM UI Elements
      this.dom = {
        hud: document.getElementById('hud'),
        speedDisplay: document.getElementById('speed-display'),
        speedGaugeBar: document.getElementById('speed-gauge-bar'),
        gearDisplay: document.getElementById('gear-display'),
        scoreDisplay: document.getElementById('score-display'),
        distanceDisplay: document.getElementById('distance-display'),
        nitroBarFill: document.getElementById('nitro-bar-fill'),
        nitroPercent: document.getElementById('nitro-percent'),
        speedFx: document.getElementById('speed-fx'),
        damageFlash: document.getElementById('damage-flash'),
        countdownOverlay: document.getElementById('countdown-overlay'),
        countdownText: document.getElementById('countdown-text'),
        startMenu: document.getElementById('start-menu'),
        pauseMenu: document.getElementById('pause-menu'),
        gameOverMenu: document.getElementById('game-over-menu'),
        startBtn: document.getElementById('start-btn'),
        pauseBtn: document.getElementById('pause-btn'),
        resumeBtn: document.getElementById('resume-btn'),
        pauseRestartBtn: document.getElementById('pause-restart-btn'),
        restartBtn: document.getElementById('restart-btn'),
        soundToggleBtn: document.getElementById('sound-toggle-btn'),
        soundIcon: document.getElementById('sound-icon'),
        finalScore: document.getElementById('final-score'),
        finalDist: document.getElementById('final-dist'),
        finalTopSpeed: document.getElementById('final-top-speed'),
        finalMisses: document.getElementById('final-misses'),
        // Touch
        touchLeft: document.getElementById('touch-left'),
        touchRight: document.getElementById('touch-right'),
        touchGas: document.getElementById('touch-gas'),
        touchBrake: document.getElementById('touch-brake'),
        touchNitro: document.getElementById('touch-nitro')
      };

      this.initThree();
      this.buildEnvironment();
      this.createPlayerCar();
      this.setupControls();
      this.setupUIListeners();

      // Initial Render & Loop
      this.animate = this.animate.bind(this);
      requestAnimationFrame(this.animate);
    }

    // ========================================================================
    // THREE.JS SCENE SETUP
    // ========================================================================
    initThree() {
      // Scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x060814);
      this.scene.fog = new THREE.FogExp2(0x070b1a, 0.0075);

      // Camera
      this.camera = new THREE.PerspectiveCamera(
        68,
        window.innerWidth / window.innerHeight,
        0.1,
        600
      );
      this.camera.position.set(0, 4.5, -8.5);
      this.camera.lookAt(0, 1.5, 12);

      // Renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.container.appendChild(this.renderer.domElement);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x1a243d, 1.8);
      this.scene.add(ambientLight);

      this.dirLight = new THREE.DirectionalLight(0x7099ff, 1.2);
      this.dirLight.position.set(30, 60, -30);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.camera.near = 10;
      this.dirLight.shadow.camera.far = 150;
      this.dirLight.shadow.camera.left = -30;
      this.dirLight.shadow.camera.right = 30;
      this.dirLight.shadow.camera.top = 30;
      this.dirLight.shadow.camera.bottom = -30;
      this.scene.add(this.dirLight);

      // Neon Highway Rim Lights (Cyan & Purple street glow)
      const rimLightCyan = new THREE.DirectionalLight(0x00f0ff, 0.8);
      rimLightCyan.position.set(-40, 20, 20);
      this.scene.add(rimLightCyan);

      const rimLightMagenta = new THREE.DirectionalLight(0xff0066, 0.6);
      rimLightMagenta.position.set(40, 15, -10);
      this.scene.add(rimLightMagenta);

      // Window resize handling
      window.addEventListener('resize', () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      });
    }

    // ========================================================================
    // WORLD & HIGHWAY ENVIRONMENT
    // ========================================================================
    buildEnvironment() {
      // 1. Procedural Asphalt Highway Segments
      const roadGeo = new THREE.PlaneGeometry(CONFIG.ROAD_WIDTH, CONFIG.ROAD_SEGMENT_LENGTH);
      roadGeo.rotateX(-Math.PI / 2);

      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x161821,
        roughness: 0.7,
        metalness: 0.15
      });

      // Road markings texture generation via 2D Canvas
      const markingTexture = this.generateRoadMarkingTexture();
      const markingMat = new THREE.MeshBasicMaterial({
        map: markingTexture,
        transparent: true,
        opacity: 0.95
      });

      const curbGeo = new THREE.BoxGeometry(0.8, 0.4, CONFIG.ROAD_SEGMENT_LENGTH);
      const curbMat = new THREE.MeshStandardMaterial({
        color: 0x00d2ff,
        emissive: 0x003355,
        roughness: 0.4
      });

      for (let i = 0; i < CONFIG.TOTAL_SEGMENTS; i++) {
        const segGroup = new THREE.Group();

        // Asphalt plane
        const roadMesh = new THREE.Mesh(roadGeo, roadMat);
        roadMesh.receiveShadow = true;
        segGroup.add(roadMesh);

        // Lane markings strip
        const markingMesh = new THREE.Mesh(roadGeo, markingMat);
        markingMesh.position.y = 0.02;
        segGroup.add(markingMesh);

        // Guardrails / Glowing Neon Curbs
        const curbL = new THREE.Mesh(curbGeo, curbMat);
        curbL.position.set(-CONFIG.ROAD_WIDTH / 2 - 0.4, 0.2, 0);
        const curbR = new THREE.Mesh(curbGeo, curbMat);
        curbR.position.set(CONFIG.ROAD_WIDTH / 2 + 0.4, 0.2, 0);
        segGroup.add(curbL);
        segGroup.add(curbR);

        // Position segment sequentially along Z axis
        const zPos = i * CONFIG.ROAD_SEGMENT_LENGTH;
        segGroup.position.set(0, 0, zPos);
        this.scene.add(segGroup);
        this.roadSegments.push(segGroup);
      }

      // 2. City Skyline Buildings (Endless repeating grid along highway sides)
      const buildingColors = [0x0d1224, 0x11172e, 0x161e3d, 0x0a0e1c];
      const windowMats = [
        new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
        new THREE.MeshBasicMaterial({ color: 0xff0066 }),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 })
      ];

      for (let i = 0; i < 70; i++) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const xDist = side * (CONFIG.ROAD_WIDTH / 2 + 15 + Math.random() * 55);
        const zDist = (Math.random() - 0.2) * (CONFIG.TOTAL_SEGMENTS * CONFIG.ROAD_SEGMENT_LENGTH);
        const height = 25 + Math.random() * 75;
        const width = 12 + Math.random() * 18;
        const depth = 12 + Math.random() * 18;

        const bGeo = new THREE.BoxGeometry(width, height, depth);
        const bMat = new THREE.MeshStandardMaterial({
          color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
          roughness: 0.5,
          metalness: 0.3
        });

        const building = new THREE.Mesh(bGeo, bMat);
        building.position.set(xDist, height / 2 - 2, zDist);

        // Neon roof strip on some buildings
        if (Math.random() > 0.4) {
          const roofStripGeo = new THREE.BoxGeometry(width * 0.95, 0.8, depth * 0.95);
          const roofStrip = new THREE.Mesh(roofStripGeo, windowMats[Math.floor(Math.random() * windowMats.length)]);
          roofStrip.position.y = height / 2 + 0.4;
          building.add(roofStrip);
        }

        this.scene.add(building);
        this.sceneryObjects.push(building);
      }

      // 3. Cybernetic Tunnel Arches / Overhead Speed Gates
      const archMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x007799,
        roughness: 0.2
      });

      for (let i = 0; i < 6; i++) {
        const arch = this.createOverheadArch(archMat);
        arch.position.set(0, 0, i * 160 + 50);
        this.scene.add(arch);
        this.sceneryObjects.push(arch);
      }
    }

    generateRoadMarkingTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer solid neon edge lines
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.fillRect(16, 0, 8, canvas.height);
      ctx.fillRect(canvas.width - 24, 0, 8, canvas.height);

      // 3 dashed divider lines for 4 lanes
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;

      const laneDividers = [canvas.width * 0.28, canvas.width * 0.5, canvas.width * 0.72];
      const dashLength = 70;
      const gapLength = 60;

      laneDividers.forEach(x => {
        for (let y = 0; y < canvas.height; y += dashLength + gapLength) {
          ctx.fillRect(x - 3, y, 6, dashLength);
        }
      });

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    }

    createOverheadArch(material) {
      const archGroup = new THREE.Group();
      const beamGeo = new THREE.BoxGeometry(CONFIG.ROAD_WIDTH + 6, 0.8, 0.8);
      const pillarGeo = new THREE.BoxGeometry(0.8, 12, 0.8);

      const topBeam = new THREE.Mesh(beamGeo, material);
      topBeam.position.y = 11;
      archGroup.add(topBeam);

      const leftPillar = new THREE.Mesh(pillarGeo, material);
      leftPillar.position.set(-CONFIG.ROAD_WIDTH / 2 - 2.5, 5.5, 0);
      archGroup.add(leftPillar);

      const rightPillar = leftPillar.clone();
      rightPillar.position.x = CONFIG.ROAD_WIDTH / 2 + 2.5;
      archGroup.add(rightPillar);

      return archGroup;
    }

    // ========================================================================
    // PLAYER SPORTS CAR
    // ========================================================================
    createPlayerCar() {
      // Signature Cyberpunk Metallic Cyan Hypercar
      this.playerCar = CarFactory.createCarMesh(0x00f0ff, true);
      this.playerCar.position.set(CONFIG.LANES[2], 0, 0); // Start in Lane 3
      this.scene.add(this.playerCar);

      this.playerLateralVelocity = 0;
      this.playerRollAngle = 0;
    }

    // ========================================================================
    // TRAFFIC & OBSTACLES SYSTEM
    // ========================================================================
    spawnTrafficCar() {
      const colors = [0xff0055, 0xffaa00, 0x9900ff, 0x00ff88, 0xdddddd];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const enemyMesh = CarFactory.createCarMesh(randomColor, false);

      // Choose a random lane
      const lane = CONFIG.LANES[Math.floor(Math.random() * CONFIG.LANES.length)];
      // Spawn ahead of player
      const spawnZ = this.playerCar.position.z + 180 + Math.random() * 80;

      // Enemy moves forward at 110-180 km/h (slower than player)
      const enemySpeed = 110 + Math.random() * 60;

      enemyMesh.position.set(lane, 0, spawnZ);
      enemyMesh.userData = {
        speed: enemySpeed,
        passed: false
      };

      this.scene.add(enemyMesh);
      this.trafficCars.push(enemyMesh);
    }

    // ========================================================================
    // CONTROLS & INPUT SYSTEM
    // ========================================================================
    setupControls() {
      // Keyboard Events
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        this.sound.resume();

        switch (e.code) {
          case 'KeyW':
          case 'ArrowUp':
            this.keys.forward = true;
            break;
          case 'KeyS':
          case 'ArrowDown':
            this.keys.backward = true;
            break;
          case 'KeyA':
          case 'ArrowLeft':
            this.keys.left = true;
            break;
          case 'KeyD':
          case 'ArrowRight':
            this.keys.right = true;
            break;
          case 'Space':
          case 'ShiftLeft':
          case 'ShiftRight':
            this.keys.nitro = true;
            break;
          case 'KeyP':
          case 'Escape':
            this.togglePause();
            break;
        }
      });

      window.addEventListener('keyup', (e) => {
        switch (e.code) {
          case 'KeyW':
          case 'ArrowUp':
            this.keys.forward = false;
            break;
          case 'KeyS':
          case 'ArrowDown':
            this.keys.backward = false;
            break;
          case 'KeyA':
          case 'ArrowLeft':
            this.keys.left = false;
            break;
          case 'KeyD':
          case 'ArrowRight':
            this.keys.right = false;
            break;
          case 'Space':
          case 'ShiftLeft':
          case 'ShiftRight':
            this.keys.nitro = false;
            break;
        }
      });

      // Mobile Touch Listeners
      const bindTouch = (btn, key) => {
        if (!btn) return;
        const start = (ev) => {
          ev.preventDefault();
          this.sound.resume();
          this.keys[key] = true;
        };
        const end = (ev) => {
          ev.preventDefault();
          this.keys[key] = false;
        };
        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('touchcancel', end, { passive: false });
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
      };

      bindTouch(this.dom.touchLeft, 'left');
      bindTouch(this.dom.touchRight, 'right');
      bindTouch(this.dom.touchGas, 'forward');
      bindTouch(this.dom.touchBrake, 'backward');
      bindTouch(this.dom.touchNitro, 'nitro');
    }

    // ========================================================================
    // UI BUTTON LISTENERS & STATE TRANSITIONS
    // ========================================================================
    setupUIListeners() {
      // Start Game
      this.dom.startBtn.addEventListener('click', () => {
        this.sound.init();
        this.sound.resume();
        this.dom.startMenu.classList.add('hidden');
        this.startCountdown();
      });

      // Pause Game
      this.dom.pauseBtn.addEventListener('click', () => this.togglePause());
      this.dom.resumeBtn.addEventListener('click', () => this.togglePause());

      // Restart Game
      this.dom.restartBtn.addEventListener('click', () => this.restartGame());
      this.dom.pauseRestartBtn.addEventListener('click', () => {
        this.dom.pauseMenu.classList.add('hidden');
        this.restartGame();
      });

      // Sound Toggle
      this.dom.soundToggleBtn.addEventListener('click', () => {
        const enabled = this.sound.toggle();
        this.dom.soundIcon.textContent = enabled ? '🔊' : '🔇';
      });
    }

    startCountdown() {
      this.state = 'COUNTDOWN';
      this.dom.countdownOverlay.classList.remove('hidden');
      this.dom.hud.classList.remove('hidden');

      let count = 3;
      this.dom.countdownText.textContent = count;
      this.sound.playBeep(450, 0.2);

      const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
          this.dom.countdownText.textContent = count;
          this.sound.playBeep(450, 0.2);
        } else if (count === 0) {
          this.dom.countdownText.textContent = 'GO!';
          this.dom.countdownText.style.color = '#00ff88';
          this.sound.playBeep(900, 0.4);
        } else {
          clearInterval(countdownInterval);
          this.dom.countdownOverlay.classList.add('hidden');
          this.dom.countdownText.style.color = 'var(--primary-neon)';
          this.state = 'RACING';
        }
      }, 850);
    }

    togglePause() {
      if (this.state === 'RACING') {
        this.state = 'PAUSED';
        this.dom.pauseMenu.classList.remove('hidden');
      } else if (this.state === 'PAUSED') {
        this.state = 'RACING';
        this.dom.pauseMenu.classList.add('hidden');
      }
    }

    restartGame() {
      // Reset variables
      this.speed = 0;
      this.score = 0;
      this.distance = 0;
      this.nitro = 100;
      this.nearMisses = 0;
      this.topSpeedReached = 0;
      this.cameraShake = 0;

      // Reset Player position
      this.playerCar.position.set(CONFIG.LANES[2], 0, 0);
      this.playerCar.rotation.set(0, 0, 0);

      // Clean up traffic
      this.trafficCars.forEach(car => this.scene.remove(car));
      this.trafficCars = [];

      // Reset overlays & menus
      this.dom.gameOverMenu.classList.add('hidden');
      this.dom.pauseMenu.classList.add('hidden');
      this.dom.speedFx.classList.remove('active');
      this.dom.damageFlash.classList.remove('active');

      this.startCountdown();
    }

    triggerGameOver() {
      this.state = 'GAMEOVER';
      this.sound.playCrash();

      // Screen flash
      this.dom.damageFlash.classList.add('active');
      setTimeout(() => this.dom.damageFlash.classList.remove('active'), 500);

      // Camera spin/crash shake effect
      this.cameraShake = 1.8;

      // Update GameOver Dialog Stats
      this.dom.finalScore.textContent = Math.floor(this.score).toLocaleString();
      this.dom.finalDist.textContent = (this.distance / 1000).toFixed(2) + ' KM';
      this.dom.finalTopSpeed.textContent = Math.floor(this.topSpeedReached) + ' KM/H';
      this.dom.finalMisses.textContent = this.nearMisses;

      setTimeout(() => {
        this.dom.gameOverMenu.classList.remove('hidden');
      }, 700);
    }

    // ========================================================================
    // PHYSICS & SIMULATION UPDATE LOOP
    // ========================================================================
    update(delta) {
      if (this.state !== 'RACING') {
        // Still update wheels idling or subtle camera float
        return;
      }

      this.totalTime += delta;

      // 1. Acceleration / Nitro / Braking Dynamics
      const maxNormal = CONFIG.MAX_NORMAL_SPEED;
      const maxNitro = CONFIG.MAX_NITRO_SPEED;

      // Nitro triggering
      if (this.keys.nitro && this.nitro > 2 && (this.keys.forward || this.speed > 50)) {
        if (!this.isNitroActive) {
          this.sound.playNitroWhoosh();
        }
        this.isNitroActive = true;
        this.nitro = Math.max(0, this.nitro - CONFIG.NITRO_DRAIN_RATE * delta);
        this.targetSpeed = maxNitro;
      } else {
        this.isNitroActive = false;
        // Natural idle recharge
        if (this.nitro < 100) {
          this.nitro = Math.min(100, this.nitro + CONFIG.NITRO_RECHARGE_RATE * delta);
        }

        if (this.keys.forward) {
          this.targetSpeed = maxNormal;
        } else if (this.keys.backward) {
          this.targetSpeed = 0;
        } else {
          // Coast down slowly
          this.targetSpeed = 0;
        }
      }

      // Smooth Speed Interpolation
      if (this.speed < this.targetSpeed) {
        const accelRate = this.isNitroActive ? CONFIG.ACCELERATION * 1.8 : CONFIG.ACCELERATION;
        this.speed += accelRate * delta;
        if (this.speed > this.targetSpeed) this.speed = this.targetSpeed;
      } else if (this.speed > this.targetSpeed) {
        const decelRate = this.keys.backward ? CONFIG.BRAKE_POWER : CONFIG.COAST_FRICTION;
        this.speed -= decelRate * delta;
        if (this.speed < this.targetSpeed) this.speed = this.targetSpeed;
      }

      // Keep record of top speed
      if (this.speed > this.topSpeedReached) {
        this.topSpeedReached = this.speed;
      }

      // 2. Lateral Steering Dynamics (Lane changing & responsive drift tilt)
      const steerFactor = Math.min(1.0, this.speed / 70); // Low steer authority at near zero
      let steerInput = 0;
      if (this.keys.left) steerInput -= 1;
      if (this.keys.right) steerInput += 1;

      const targetLateralVel = steerInput * CONFIG.STEER_SPEED * steerFactor;
      this.playerLateralVelocity += (targetLateralVel - this.playerLateralVelocity) * 12 * delta;
      this.playerCar.position.x += this.playerLateralVelocity * delta;

      // Road boundary clamp with bounce resistance
      const maxRoadX = CONFIG.ROAD_WIDTH / 2 - 1.5;
      if (this.playerCar.position.x > maxRoadX) {
        this.playerCar.position.x = maxRoadX;
        this.playerLateralVelocity = -3;
      } else if (this.playerCar.position.x < -maxRoadX) {
        this.playerCar.position.x = -maxRoadX;
        this.playerLateralVelocity = 3;
      }

      // Dynamic car chassis body roll when cornering
      const targetRoll = -this.playerLateralVelocity * 0.035;
      this.playerCar.rotation.z += (targetRoll - this.playerCar.rotation.z) * 10 * delta;
      this.playerCar.rotation.y = -this.playerLateralVelocity * 0.015;

      // 3. World Advancement (Player moves along +Z)
      const speedMPS = (this.speed * 1000) / 3600; // km/h to meters/sec
      const distanceTravelled = speedMPS * delta;
      this.playerCar.position.z += distanceTravelled;
      this.distance += distanceTravelled;

      // Score accumulation based on speed + nitro bonus
      const speedMultiplier = this.isNitroActive ? 2.5 : 1.0;
      this.score += (this.speed * 0.25 * speedMultiplier) * delta;

      // Rotate player wheels relative to speed
      if (this.playerCar.userData.wheels) {
        const wheelTurnAngle = (distanceTravelled / 0.4); // delta radians
        this.playerCar.userData.wheels.forEach(w => {
          w.rotation.x += wheelTurnAngle;
        });
      }

      // 4. Nitro Thrusters Visuals & Speed Blur FX
      if (this.playerCar.userData.nitroFlames) {
        this.playerCar.userData.nitroFlames.forEach(f => {
          f.visible = this.isNitroActive;
          if (this.isNitroActive) {
            const flicker = 0.8 + Math.random() * 0.4;
            f.scale.set(flicker, flicker, flicker * 1.3);
          }
        });
      }

      if (this.isNitroActive) {
        this.dom.speedFx.classList.add('active');
      } else {
        this.dom.speedFx.classList.remove('active');
      }

      // 5. Endless Road & Scenery Recycling
      this.recycleWorldElements();

      // 6. Traffic Spawning & AI Traversal
      if (this.totalTime - this.lastSpawnTime > CONFIG.SPAWN_INTERVAL) {
        this.spawnTrafficCar();
        this.lastSpawnTime = this.totalTime;
      }

      this.updateTraffic(delta);

      // 7. Audio Engine Modulation
      this.sound.updateEngine(this.speed, CONFIG.MAX_NORMAL_SPEED, this.isNitroActive);

      // 8. Dynamic Cinematic Chase Camera
      this.updateCamera(delta);

      // 9. Update HUD Telemetry
      this.updateHUD();
    }

    // ========================================================================
    // WORLD RECYCLING (Continuous Endless Highway)
    // ========================================================================
    recycleWorldElements() {
      const playerZ = this.playerCar.position.z;

      // Recycle road segments behind the player to far ahead
      this.roadSegments.forEach(seg => {
        if (seg.position.z < playerZ - CONFIG.ROAD_SEGMENT_LENGTH * 1.5) {
          seg.position.z += CONFIG.TOTAL_SEGMENTS * CONFIG.ROAD_SEGMENT_LENGTH;
        }
      });

      // Recycle roadside buildings and scenery arches
      const worldSpan = CONFIG.TOTAL_SEGMENTS * CONFIG.ROAD_SEGMENT_LENGTH;
      this.sceneryObjects.forEach(obj => {
        if (obj.position.z < playerZ - 80) {
          obj.position.z += worldSpan;
          // Randomize building heights or positions slightly for continuous variety
          if (obj.geometry && obj.geometry.type === 'BoxGeometry' && obj.position.y > 5) {
            const side = Math.random() > 0.5 ? 1 : -1;
            obj.position.x = side * (CONFIG.ROAD_WIDTH / 2 + 15 + Math.random() * 55);
          }
        }
      });

      // Directional light follows player to preserve dynamic shadows
      this.dirLight.position.z = playerZ - 20;
      this.dirLight.target.position.z = playerZ + 40;
      this.dirLight.target.updateMatrixWorld();
    }

    // ========================================================================
    // TRAFFIC CARS & COLLISION DETECTION
    // ========================================================================
    updateTraffic(delta) {
      const playerZ = this.playerCar.position.z;
      const playerX = this.playerCar.position.x;
      const pDim = CONFIG.CAR_DIMENSIONS;

      for (let i = this.trafficCars.length - 1; i >= 0; i--) {
        const car = this.trafficCars[i];
        const carSpeedMPS = (car.userData.speed * 1000) / 3600;

        // Move traffic forward at its own pace
        car.position.z += carSpeedMPS * delta;

        // Rotate enemy wheels
        if (car.userData.wheels) {
          car.userData.wheels.forEach(w => {
            w.rotation.x += (carSpeedMPS * delta) / 0.4;
          });
        }

        // --- NEAR MISS DETECTION (Asphalt Style Reward) ---
        const distZ = Math.abs(car.position.z - playerZ);
        const distX = Math.abs(car.position.x - playerX);

        if (!car.userData.passed && car.position.z < playerZ) {
          car.userData.passed = true;
          // If close enough laterally without colliding
          if (distX < pDim.width * 1.5 && distX >= pDim.width * 0.85) {
            this.nearMisses++;
            this.score += 750;
            this.nitro = Math.min(100, this.nitro + 25); // Nitro recharge reward
            this.sound.playNearMiss();
          }
        }

        // --- AABB 3D COLLISION DETECTION ---
        const collisionThresholdZ = (pDim.length + 0.2);
        const collisionThresholdX = (pDim.width * 0.82);

        if (distZ < collisionThresholdZ && distX < collisionThresholdX) {
          // CRASH!
          this.triggerGameOver();
          return;
        }

        // Despawn traffic left far behind
        if (car.position.z < playerZ - 90) {
          this.scene.remove(car);
          this.trafficCars.splice(i, 1);
        }
      }
    }

    // ========================================================================
    // CHASE CAMERA FOLLOW & SPEED FOV EXPANSION
    // ========================================================================
    updateCamera(delta) {
      const playerPos = this.playerCar.position;

      // Camera base offsets (Follow from behind and slightly elevated)
      const targetCamZ = playerPos.z - 8.6;
      const targetCamY = 3.6;
      // Subtle camera lag/sway on X axis for cinematic weight
      const targetCamX = playerPos.x * 0.75;

      this.camera.position.x += (targetCamX - this.camera.position.x) * 8 * delta;
      this.camera.position.y += (targetCamY - this.camera.position.y) * 8 * delta;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * 20 * delta;

      // Look slightly ahead of player car
      const lookTarget = new THREE.Vector3(playerPos.x * 0.4, 1.4, playerPos.z + 18);
      this.camera.lookAt(lookTarget);

      // Dynamic FOV expands at higher speeds (sense of hyper-speed)
      const speedRatio = this.speed / CONFIG.MAX_NITRO_SPEED;
      const targetFOV = 68 + speedRatio * 22;
      this.camera.fov += (targetFOV - this.camera.fov) * 5 * delta;
      this.camera.updateProjectionMatrix();

      // Camera shake for crashes or heavy nitro
      if (this.cameraShake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShake;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShake;
        this.cameraShake = Math.max(0, this.cameraShake - delta * 3.5);
      }
    }

    // ========================================================================
    // TELEMETRY & HUD DOM UPDATES
    // ========================================================================
    updateHUD() {
      // 1. Speedometer Number
      const displaySpeed = Math.floor(this.speed);
      this.dom.speedDisplay.textContent = displaySpeed;

      // 2. Radial Gauge Arc (Circumference ~ 314)
      const gaugeRatio = Math.min(1.0, this.speed / CONFIG.MAX_NITRO_SPEED);
      const strokeOffset = 314 - (gaugeRatio * 314);
      this.dom.speedGaugeBar.style.strokeDashoffset = strokeOffset;
      if (this.isNitroActive) {
        this.dom.speedGaugeBar.style.stroke = 'var(--nitro-cyan)';
      } else {
        this.dom.speedGaugeBar.style.stroke = 'var(--primary-neon)';
      }

      // 3. Gear Calculation
      let gear = 1;
      if (this.speed > 290) gear = 6;
      else if (this.speed > 220) gear = 5;
      else if (this.speed > 160) gear = 4;
      else if (this.speed > 100) gear = 3;
      else if (this.speed > 45) gear = 2;
      this.dom.gearDisplay.textContent = gear;

      // 4. Nitro Bar Fill
      const nitroClamped = Math.max(0, Math.min(100, this.nitro));
      this.dom.nitroBarFill.style.width = nitroClamped + '%';
      this.dom.nitroPercent.textContent = Math.floor(nitroClamped) + '%';

      // 5. Score & Distance
      this.dom.scoreDisplay.textContent = Math.floor(this.score).toString().padStart(6, '0');
      this.dom.distanceDisplay.textContent = (this.distance / 1000).toFixed(1) + ' KM';
    }

    // ========================================================================
    // MAIN ANIMATION LOOP
    // ========================================================================
    animate() {
      requestAnimationFrame(this.animate);
      const delta = Math.min(this.clock.getDelta(), 0.1); // Prevent physics tunneling on tab switch
      this.update(delta);
      this.renderer.render(this.scene, this.camera);
    }
  }

  // Auto-boot game upon DOM load
  window.addEventListener('DOMContentLoaded', () => {
    new CyberPulseGame();
  });
})();
