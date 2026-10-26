export type SceneName = 'hero-extraction' | 'espresso' | 'milk' | 'latte';
export type SceneUpdateSource = 'initial' | 'scroll' | 'resize' | 'preference' | 'request';

export interface SceneProgressDetail {
  scene: SceneName;
  progress: number;
  active: boolean;
  direction: -1 | 0 | 1;
  reducedMotion: boolean;
  source: SceneUpdateSource;
}

type SceneMount = HTMLElement & { dataset: DOMStringMap & { scene: SceneName } };

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export function initSceneStory(motionPreference: MediaQueryList): void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const story = document.querySelector<HTMLElement>('[data-craft-story]');
  const tagline = document.querySelector<HTMLElement>('[data-tagline]');
  const mounts = new Map<SceneName, SceneMount>();
  document.querySelectorAll<SceneMount>('[data-scene]').forEach((mount) => mounts.set(mount.dataset.scene, mount));

  const steps = Array.from(document.querySelectorAll<HTMLElement>('[data-craft-step]'));
  const layers = Array.from(document.querySelectorAll<HTMLElement>('.scene-layer[data-scene]'));
  const words = Array.from(document.querySelectorAll<HTMLElement>('.tagline-word'));

  let frame: number | null = null;
  let pendingSource: SceneUpdateSource = 'initial';
  let previousScrollY = window.scrollY;
  let direction: -1 | 0 | 1 = 0;
  let activeStep = -1;
  let litWordCount = -1;

  function emit(
    mount: SceneMount,
    progress: number,
    active: boolean,
    source: SceneUpdateSource,
    force = false,
  ): void {
    const rounded = Math.round(clamp(progress) * 1000) / 1000;
    const previousProgress = Number(mount.dataset.progress ?? 0);
    const wasActive = mount.dataset.sceneState === 'active';
    mount.dataset.progress = rounded.toFixed(3);
    mount.dataset.sceneState = motionPreference.matches ? 'static' : active ? 'active' : 'idle';

    if (!force && Math.abs(previousProgress - rounded) < 0.002 && wasActive === active) return;
    const detail: SceneProgressDetail = {
      scene: mount.dataset.scene,
      progress: rounded,
      active,
      direction,
      reducedMotion: motionPreference.matches,
      source,
    };
    mount.dispatchEvent(new CustomEvent<SceneProgressDetail>('scavo:scene', { bubbles: true, detail }));
  }

  function setActiveStep(nextStep: number): void {
    if (nextStep === activeStep) return;
    activeStep = nextStep;
    steps.forEach((step, index) => step.classList.toggle('is-active', index === nextStep));
    layers.forEach((layer) => {
      const selected = layer.dataset.scene === steps[nextStep]?.dataset.sceneTarget;
      layer.classList.toggle('is-active', selected);
    });
  }

  function updateTagline(): void {
    if (!tagline || words.length === 0) return;
    const rect = tagline.getBoundingClientRect();
    const viewport = window.innerHeight;
    const distance = Math.max(rect.height + viewport * 0.45, 1);
    const progress = clamp((viewport * 0.85 - rect.top) / distance);
    const count = Math.min(words.length, Math.floor(progress * (words.length + 1)));
    if (count === litWordCount) return;
    litWordCount = count;
    words.forEach((word, index) => word.classList.toggle('is-lit', index < count));
  }

  function updateHero(source: SceneUpdateSource): void {
    const mount = mounts.get('hero-extraction');
    if (!hero || !mount) return;
    const rect = hero.getBoundingClientRect();
    const progress = clamp(-rect.top / Math.max(hero.offsetHeight * 0.85, 1));
    const active = rect.bottom > 0 && rect.top < window.innerHeight;
    emit(mount, progress, active, source, source !== 'scroll');
  }

  function updateCraft(source: SceneUpdateSource): void {
    if (!story || steps.length === 0) return;
    const viewport = window.innerHeight;
    const focusY = window.scrollY + viewport * 0.55;
    const storyRect = story.getBoundingClientRect();
    const storyVisible = storyRect.bottom > 0 && storyRect.top < viewport;
    const measurements = steps.map((step) => {
      const rect = step.getBoundingClientRect();
      return { top: rect.top + window.scrollY, height: Math.max(rect.height, 1) };
    });

    let nextStep = measurements.findIndex((measurement, index) => {
      const next = measurements[index + 1];
      return focusY >= measurement.top && (!next || focusY < next.top);
    });
    if (nextStep < 0) nextStep = focusY < measurements[0].top ? 0 : steps.length - 1;
    setActiveStep(nextStep);

    steps.forEach((step, index) => {
      const scene = step.dataset.sceneTarget as SceneName | undefined;
      const mount = scene ? mounts.get(scene) : undefined;
      if (!mount) return;
      const measurement = measurements[index];
      const progress = clamp((focusY - measurement.top) / measurement.height);
      const mountRect = mount.getBoundingClientRect();
      const mountVisible = mountRect.bottom > 0 && mountRect.top < viewport;
      emit(mount, progress, storyVisible && mountVisible && index === nextStep, source, source !== 'scroll');
    });
  }

  function update(): void {
    frame = null;
    if (motionPreference.matches) return;
    const currentScrollY = window.scrollY;
    direction = currentScrollY > previousScrollY ? 1 : currentScrollY < previousScrollY ? -1 : 0;
    previousScrollY = currentScrollY;
    updateTagline();
    updateHero(pendingSource);
    updateCraft(pendingSource);
    pendingSource = 'scroll';
  }

  function requestUpdate(source: SceneUpdateSource = 'scroll'): void {
    if (motionPreference.matches) return;
    if (source !== 'scroll') pendingSource = source;
    if (frame !== null) return;
    frame = requestAnimationFrame(update);
  }

  function applyMotionPreference(): void {
    if (!motionPreference.matches) {
      litWordCount = -1;
      activeStep = -1;
      requestUpdate('preference');
      return;
    }

    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    words.forEach((word) => word.classList.add('is-lit'));
    mounts.forEach((mount) => emit(mount, 1, false, 'preference', true));
  }

  window.addEventListener('scroll', () => requestUpdate('scroll'), { passive: true });
  window.addEventListener('resize', () => requestUpdate('resize'), { passive: true });
  motionPreference.addEventListener('change', applyMotionPreference);

  document.addEventListener('scavo:scene-ready', (event: Event) => {
    const scene = (event as CustomEvent<{ scene?: SceneName }>).detail?.scene;
    const mount = scene ? mounts.get(scene) : undefined;
    if (!mount) return;
    emit(mount, Number(mount.dataset.progress ?? 0), mount.dataset.sceneState === 'active', 'request', true);
  });

  if (motionPreference.matches) applyMotionPreference();
  else requestUpdate('initial');
}
