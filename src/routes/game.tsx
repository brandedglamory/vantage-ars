import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { PublicFrame } from "@/components/public/site-frame";
import {
  BOARD_SIZE,
  DIFFICULTIES,
  FINAL_LEVEL,
  PACKETS_PER_LEVEL,
  createGame,
  isOpposite,
  levelProgress,
  speedFor,
  step,
  type Difficulty,
  type Direction,
  type GameState,
  type LossReason,
} from "@/lib/game/signal-sweep";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: "Signal Sweep · Vantage-ARS" },
      {
        name: "description",
        content:
          "A ten-sector signal-routing arcade game from Vantage-ARS. Collect packets, dodge jammers, and keep the trail alive.",
      },
    ],
  }),
  component: GamePage,
});

type RunState = "ready" | "running" | "paused" | "over" | "won";

const BEST_KEY_PREFIX = "vantage-signal-sweep-best-";
const BEST_SCORE_EVENT = "vantage-signal-sweep-best-change";
const PREFS_KEY = "vantage-signal-sweep-prefs";
const PREFS_EVENT = "vantage-signal-sweep-prefs-change";
const DEFAULT_PREFS: Prefs = { difficulty: "operator", muted: false };

type Prefs = { difficulty: Difficulty; muted: boolean };

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const difficulty: Difficulty =
      parsed.difficulty === "cadet" ||
      parsed.difficulty === "operator" ||
      parsed.difficulty === "overclock"
        ? parsed.difficulty
        : "operator";
    return { difficulty, muted: parsed.muted === true };
  } catch {
    return DEFAULT_PREFS;
  }
}

let prefsCache: Prefs | null = null;

function getPrefsSnapshot(): Prefs {
  if (prefsCache) return prefsCache;
  if (typeof window === "undefined") return DEFAULT_PREFS;
  prefsCache = readPrefs();
  return prefsCache;
}

function writePrefs(prefs: Prefs) {
  prefsCache = prefs;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience; the run still works without storage.
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

function subscribePrefs(callback: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== PREFS_KEY && event.key !== null) return;
    prefsCache = null;
    callback();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(PREFS_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PREFS_EVENT, callback);
  };
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  arrowup: "up",
  w: "up",
  arrowright: "right",
  d: "right",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
};

function bestKey(difficulty: Difficulty): string {
  return `${BEST_KEY_PREFIX}${difficulty}`;
}

function readBest(difficulty: Difficulty): number {
  try {
    return Number(window.localStorage.getItem(bestKey(difficulty))) || 0;
  } catch {
    return 0;
  }
}

function writeBest(difficulty: Difficulty, score: number) {
  try {
    window.localStorage.setItem(bestKey(difficulty), String(score));
    window.dispatchEvent(new Event(BEST_SCORE_EVENT));
  } catch {
    // A restricted browser may block storage. The current run still keeps its score.
  }
}

function subscribeBest(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(BEST_SCORE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(BEST_SCORE_EVENT, callback);
  };
}

type SoundName = "start" | "packet" | "surge" | "level" | "crash" | "win" | "pause";
type Tone = { frequency: number; at: number; duration: number; gain: number; type?: OscillatorType };

const SOUNDS: Record<SoundName, Tone[]> = {
  start: [
    { frequency: 440, at: 0, duration: 0.07, gain: 0.035 },
    { frequency: 660, at: 0.08, duration: 0.09, gain: 0.04 },
  ],
  packet: [
    { frequency: 720, at: 0, duration: 0.055, gain: 0.035 },
    { frequency: 980, at: 0.05, duration: 0.07, gain: 0.025 },
  ],
  surge: [
    { frequency: 660, at: 0, duration: 0.06, gain: 0.04 },
    { frequency: 880, at: 0.055, duration: 0.07, gain: 0.04 },
    { frequency: 1320, at: 0.11, duration: 0.11, gain: 0.035 },
  ],
  level: [
    { frequency: 392, at: 0, duration: 0.07, gain: 0.035 },
    { frequency: 523, at: 0.075, duration: 0.07, gain: 0.035 },
    { frequency: 784, at: 0.15, duration: 0.14, gain: 0.04 },
  ],
  crash: [
    { frequency: 190, at: 0, duration: 0.18, gain: 0.045, type: "sawtooth" },
    { frequency: 96, at: 0.12, duration: 0.26, gain: 0.04, type: "sawtooth" },
  ],
  win: [
    { frequency: 523, at: 0, duration: 0.08, gain: 0.035 },
    { frequency: 659, at: 0.08, duration: 0.08, gain: 0.035 },
    { frequency: 784, at: 0.16, duration: 0.08, gain: 0.04 },
    { frequency: 1046, at: 0.24, duration: 0.24, gain: 0.045 },
  ],
  pause: [{ frequency: 330, at: 0, duration: 0.09, gain: 0.03 }],
};

/** Tiny synthesised effects; no audio files and no autoplay before a gesture. */
function useGameAudio(muted: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(
    () => () => {
      if (contextRef.current) void contextRef.current.close();
    },
    [],
  );

  return useCallback((sound: SoundName) => {
    if (mutedRef.current) return;
    try {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const context = contextRef.current ?? new Context();
      contextRef.current = context;
      if (context.state === "suspended") void context.resume();
      const now = context.currentTime;
      for (const tone of SOUNDS[sound]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + tone.at;
        oscillator.type = tone.type ?? "sine";
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + tone.duration + 0.02);
      }
    } catch {
      // Audio is optional. A blocked context must never interrupt the run.
    }
  }, []);
}

function GamePage() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const gameRef = useRef(game);
  const directionRef = useRef<Direction>("right");
  const [runState, setRunState] = useState<RunState>("ready");
  const [lossReason, setLossReason] = useState<LossReason | null>(null);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, () => DEFAULT_PREFS);
  const { difficulty, muted } = prefs;
  const best = useSyncExternalStore(
    subscribeBest,
    () => readBest(difficulty),
    () => 0,
  );
  const play = useGameAudio(muted);
  const config = DIFFICULTIES[difficulty];
  const speed = speedFor(difficulty, game.level);
  const progress = levelProgress(game.packets);
  const progressPercent = (progress / PACKETS_PER_LEVEL) * 100;
  const nextSurgeIn =
    game.packets % PACKETS_PER_LEVEL === 0
      ? PACKETS_PER_LEVEL
      : PACKETS_PER_LEVEL - (game.packets % PACKETS_PER_LEVEL);
  const locked = runState === "running" || runState === "paused";

  const commit = useCallback(
    (next: GameState) => {
      gameRef.current = next;
      setGame(next);
      if (next.score > readBest(difficulty)) writeBest(difficulty, next.score);
    },
    [difficulty],
  );

  const start = useCallback(() => {
    directionRef.current = "right";
    const next = createGame();
    gameRef.current = next;
    setGame(next);
    setLossReason(null);
    setRunState("running");
    play("start");
  }, [play]);

  const steer = useCallback(
    (next: Direction) => {
      if (runState !== "running" || isOpposite(directionRef.current, next)) return;
      directionRef.current = next;
    },
    [runState],
  );

  useEffect(() => {
    if (runState !== "running") return;
    const timer = window.setInterval(() => {
      const before = gameRef.current;
      const result = step(before, directionRef.current, difficulty);

      if (result.events.includes("crash")) {
        setLossReason(result.reason ?? null);
        setRunState("over");
        play("crash");
        return;
      }

      commit(result.state);
      if (result.events.includes("eat")) play(before.packet.surge ? "surge" : "packet");
      if (result.events.includes("level")) play("level");
      if (result.events.includes("win")) {
        setRunState("won");
        play("win");
      }
    }, speed);
    return () => window.clearInterval(timer);
  }, [commit, difficulty, play, runState, speed]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const key = event.key.toLowerCase();
      const direction = KEY_DIRECTIONS[key];

      if (direction) {
        event.preventDefault();
        steer(direction);
      } else if (key === " " || key === "p") {
        if (runState === "running" || runState === "paused") {
          event.preventDefault();
          setRunState(runState === "running" ? "paused" : "running");
          play("pause");
        }
      } else if (key === "enter") {
        if (runState === "paused") {
          setRunState("running");
          play("pause");
        } else if (runState !== "running") {
          start();
        }
      } else if (key === "m") {
        event.preventDefault();
        const next = !muted;
        writePrefs({ difficulty, muted: next });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [difficulty, muted, play, runState, start, steer]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && runState === "running") setRunState("paused");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [runState]);

  const togglePause = useCallback(() => {
    if (runState !== "running" && runState !== "paused") return;
    setRunState(runState === "running" ? "paused" : "running");
    play("pause");
  }, [play, runState]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    writePrefs({ difficulty, muted: next });
  }, [difficulty, muted]);

  const selectDifficulty = useCallback(
    (next: Difficulty) => {
      if (locked) return;
      writePrefs({ difficulty: next, muted });
    },
    [locked, muted],
  );

  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onBoardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (runState !== "running") return;
      swipeStart.current = { x: event.clientX, y: event.clientY };
    },
    [runState],
  );
  const onBoardPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start || runState !== "running") return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? "right" : "left");
      else steer(dy > 0 ? "down" : "up");
    },
    [runState, steer],
  );

  const snakeIndex = new Map<string, number>();
  game.snake.forEach((part, index) => snakeIndex.set(`${part.x},${part.y}`, index));
  const obstacleSet = new Set(game.obstacles.map((part) => `${part.x},${part.y}`));
  const headKey = `${game.snake[0]!.x},${game.snake[0]!.y}`;
  const packetKey = `${game.packet.x},${game.packet.y}`;

  const cells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
    const x = index % BOARD_SIZE;
    const y = Math.floor(index / BOARD_SIZE);
    const key = `${x},${y}`;
    const bodyIndex = snakeIndex.get(key);
    const isHead = key === headKey;
    const isBody = bodyIndex !== undefined && bodyIndex > 0;
    const isObstacle = obstacleSet.has(key);
    const isPacket = key === packetKey;
    const alternate = (x + y) % 2 === 1;
    const bodyOpacity = isBody
      ? 0.5 + 0.5 * (1 - (bodyIndex ?? 0) / Math.max(1, game.snake.length - 1))
      : 1;

    return (
      <div
        key={key}
        aria-hidden="true"
        style={isBody ? { opacity: bodyOpacity } : undefined}
        className={`relative flex items-center justify-center rounded-[3px] ${
          isHead
            ? "z-10 bg-accent shadow-[0_0_18px_rgba(72,217,255,0.8)]"
            : isBody
              ? "bg-[#1c9dbc] shadow-[0_0_8px_rgba(72,217,255,0.2)]"
              : isObstacle
                ? "border border-danger/40 bg-[#28131d] after:size-[50%] after:rotate-45 after:border after:border-danger/60 after:bg-danger/20 after:content-['']"
                : isPacket
                  ? game.packet.surge
                    ? "z-10 after:size-[62%] after:animate-pulse after:rounded-full after:bg-[#ffca78] after:shadow-[0_0_20px_rgba(255,202,120,0.95)] after:content-['']"
                    : "after:size-[40%] after:rotate-45 after:rounded-[2px] after:bg-[#ffca78] after:shadow-[0_0_14px_rgba(255,202,120,0.9)] after:content-['']"
                  : alternate
                    ? "bg-white/[0.022]"
                    : "bg-white/[0.012]"
        }`}
      >
        {isHead ? <span className="size-[30%] rounded-full bg-[#06131c]" /> : null}
      </div>
    );
  });

  const statusLabel =
    runState === "running"
      ? "Live run"
      : runState === "paused"
        ? "Paused"
        : runState === "over"
          ? "Signal lost"
          : runState === "won"
            ? "Sector clear"
            : "Standby";

  const lossCopy =
    lossReason === "wall"
      ? "The trail reached the edge of the sector."
      : lossReason === "jammer"
        ? "A jammer node broke the route."
        : "Your own signal trail crossed the path.";

  const overlay: Record<
    Exclude<RunState, "running">,
    { eyebrow: string; title: string; copy: string; action: string; icon: ReactNode }
  > = {
    ready: {
      eyebrow: "READY WHEN YOU ARE",
      title: "Route the signal.",
      copy: "Collect data packets, dodge jammer nodes, and clear ten sectors. Every fifth packet is a surge.",
      action: "Start run",
      icon: <Play className="size-4" />,
    },
    paused: {
      eyebrow: "SIGNAL HELD",
      title: "Take a breath.",
      copy: "The board is frozen exactly where you left it. Resume when the route is clear in your head.",
      action: "Resume run",
      icon: <Play className="size-4" />,
    },
    over: {
      eyebrow: "CONNECTION LOST",
      title: "Run complete.",
      copy: `${lossCopy} Reset the trail and take another route through the field.`,
      action: "Play again",
      icon: <RotateCcw className="size-4" />,
    },
    won: {
      eyebrow: "NETWORK STABLE",
      title: "All sectors clear!",
      copy: "Every sector is routed and the signal field is stable. That is a complete run.",
      action: "Run it again",
      icon: <RotateCcw className="size-4" />,
    },
  };
  const message = overlay[runState as Exclude<RunState, "running">];

  return (
    <PublicFrame>
      <section className="mx-auto max-w-6xl py-10 sm:py-14">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-accent uppercase">
              <Radio className="size-3.5" aria-hidden="true" /> Vantage arcade · 01
            </p>
            <h1 className="mt-3 font-serif text-5xl tracking-tight sm:text-6xl">Signal Sweep</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Ten sectors, one trail. Gather every packet, survive the jammer field, and keep the
              signal alive long enough to stabilise the network.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-2 text-xs text-subtle">
            <span className="size-2 rounded-full bg-ok shadow-[0_0_10px_rgba(95,227,173,0.7)]" />
            Offline-ready · no account needed
          </div>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
          <section
            aria-label="Signal Sweep game"
            className="min-w-0 rounded-2xl border border-border bg-surface/65 p-3 shadow-[0_24px_70px_-45px_rgba(72,217,255,0.35)] sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] text-subtle uppercase">
                <span
                  className={`size-2 rounded-full ${runState === "running" ? "animate-pulse bg-ok" : runState === "over" ? "bg-danger" : runState === "won" ? "bg-warn" : "bg-subtle/50"}`}
                />
                {statusLabel}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.12em] text-subtle uppercase">
                  Level {String(game.level).padStart(2, "0")} / {FINAL_LEVEL}
                </span>
                <button
                  type="button"
                  onClick={toggleMuted}
                  aria-label={muted ? "Unmute game sound" : "Mute game sound"}
                  title={muted ? "Unmute game sound" : "Mute game sound"}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-subtle transition hover:border-accent/50 hover:text-accent"
                >
                  {muted ? (
                    <VolumeX className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div
              role="img"
              aria-label={`Signal Sweep board. Level ${game.level} of ${FINAL_LEVEL}. Score ${game.score}. ${game.packets} packets routed. Packet at column ${game.packet.x + 1}, row ${game.packet.y + 1}${game.packet.surge ? " and it is a surge packet" : ""}. ${game.obstacles.length} jammer nodes.`}
              onPointerDown={onBoardPointerDown}
              onPointerUp={onBoardPointerUp}
              onPointerCancel={() => {
                swipeStart.current = null;
              }}
              className="relative mx-auto aspect-square w-full max-w-[560px] touch-none overflow-hidden rounded-xl border border-[#244257] bg-[#07111b] p-[2.4%]"
            >
              <div className="grid h-full w-full grid-cols-20 grid-rows-20 gap-[0.55%]">{cells}</div>
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_30%,rgba(0,0,0,0.18))]" />
              <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(72,217,255,0.018)_0px,rgba(72,217,255,0.018)_1px,transparent_1px,transparent_4px)] opacity-60" />
              {runState !== "running" ? (
                <div
                  className={`absolute inset-0 z-20 flex items-center justify-center p-4 text-center ${
                    runState === "paused"
                      ? "bg-[#06101b]/48"
                      : "bg-[#06101b]/90 backdrop-blur-[2px]"
                  }`}
                >
                  <div className="max-h-full w-full max-w-sm overflow-y-auto">
                    <p className="font-mono text-[9px] tracking-[0.22em] text-accent uppercase">
                      {message.eyebrow}
                    </p>
                    <h2 className="mt-2 font-serif text-2xl sm:mt-3 sm:text-5xl">{message.title}</h2>
                    <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted sm:mt-3 sm:text-sm">
                      {message.copy}
                    </p>

                    {runState === "over" || runState === "won" ? (
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-white/[0.025] p-2 text-left sm:mt-5 sm:p-3">
                        <div>
                          <p className="font-mono text-[8px] tracking-[0.16em] text-subtle uppercase">
                            Score
                          </p>
                          <p className="mt-1 font-mono text-base tabular-nums text-fg sm:text-lg">
                            {game.score}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[8px] tracking-[0.16em] text-subtle uppercase">
                            Packets
                          </p>
                          <p className="mt-1 font-mono text-base tabular-nums text-fg sm:text-lg">
                            {game.packets}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[8px] tracking-[0.16em] text-subtle uppercase">
                            Sector
                          </p>
                          <p className="mt-1 font-mono text-base tabular-nums text-fg sm:text-lg">
                            {game.level}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-3 py-1.5 font-mono text-[9px] tracking-[0.14em] text-accent uppercase sm:mt-4">
                        <Crosshair className="size-3" aria-hidden="true" />
                        {config.label} · {config.tagline}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={runState === "paused" ? togglePause : start}
                      className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-accent-fg transition hover:brightness-110 sm:mt-6 sm:min-h-12"
                    >
                      {message.icon}
                      {message.action}
                    </button>
                    <p className="mt-2 hidden font-mono text-[9px] tracking-[0.14em] text-subtle uppercase sm:mt-3 sm:block">
                      Press Enter to {runState === "paused" ? "resume" : "start"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <p className="text-xs text-subtle">
                Arrow keys / WASD steer · Swipe the board · Space pauses · M mutes
              </p>
              {runState === "running" || runState === "paused" ? (
                <button
                  type="button"
                  onClick={togglePause}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-fg"
                >
                  {runState === "running" ? (
                    <Pause className="size-3.5" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  {runState === "running" ? "Pause" : "Resume"}
                </button>
              ) : null}
            </div>
            <p className="sr-only" aria-live="polite">
              {runState === "running"
                ? `Score ${game.score}. Level ${game.level} of ${FINAL_LEVEL}. ${game.packets} packets routed.`
                : statusLabel}
            </p>
          </section>

          <aside className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface/65 p-4">
                <p className="font-mono text-[9px] tracking-[0.18em] text-subtle uppercase">
                  Current score
                </p>
                <p
                  aria-live="polite"
                  className="mt-2 font-mono text-3xl tabular-nums text-fg"
                >
                  {String(game.score).padStart(3, "0")}
                </p>
                <p className="mt-1 text-[11px] text-subtle">{game.packets} packets routed</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface/65 p-4">
                <p className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.18em] text-subtle uppercase">
                  <Trophy className="size-3 text-warn" /> Best · {config.label}
                </p>
                <p className="mt-2 font-mono text-3xl tabular-nums text-fg">
                  {String(best).padStart(3, "0")}
                </p>
                <p className="mt-1 text-[11px] text-subtle">Saved on this device</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface/65 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] tracking-[0.18em] text-subtle uppercase">
                  Sector progress
                </p>
                <span className="font-mono text-[10px] tracking-[0.1em] text-accent">
                  {game.level} / {FINAL_LEVEL}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`Sector ${game.level} progress`}
                aria-valuemin={0}
                aria-valuemax={PACKETS_PER_LEVEL}
                aria-valuenow={progress}
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1c9dbc] to-accent transition-[width] duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-subtle">
                {game.packet.surge
                  ? "Surge packet live: worth 30 points."
                  : `Next surge packet in ${nextSurgeIn} packet${nextSurgeIn === 1 ? "" : "s"}.`}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/65 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.18em] text-subtle uppercase">
                  <Crosshair className="size-3 text-accent" /> Signal profile
                </p>
                {locked ? (
                  <span className="font-mono text-[9px] tracking-[0.12em] text-subtle uppercase">
                    Locked
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2">
                {(Object.keys(DIFFICULTIES) as Difficulty[]).map((id) => {
                  const item = DIFFICULTIES[id];
                  const active = id === difficulty;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      disabled={locked}
                      onClick={() => selectDifficulty(id)}
                      className={`rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? "border-accent/60 bg-accent/10"
                          : "border-border bg-raised/40 hover:border-accent/40"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-fg">{item.label}</span>
                        <span className="font-mono text-[9px] tracking-[0.1em] text-subtle uppercase">
                          {item.baseMs} ms
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-subtle">{item.tagline}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-subtle">{config.description}</p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/65 p-5">
              <div className="flex items-center gap-2 text-accent">
                <Zap className="size-4" />
                <h2 className="text-sm font-semibold text-fg">How to play</h2>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-muted">
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-accent">01</span>
                  <span>
                    Steer into the amber packet to score{" "}
                    <strong className="font-semibold text-fg">10 points</strong>. Every fifth packet
                    is a surge worth <strong className="font-semibold text-fg">30</strong>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-accent">02</span>
                  <span>
                    Clear five packets to advance a sector. Clear all{" "}
                    <strong className="font-semibold text-fg">{FINAL_LEVEL} sectors</strong> to win.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-accent">03</span>
                  <span>
                    Avoid the walls, the red jammer diamonds, and your own trail. Each sector is
                    faster than the last.
                  </span>
                </li>
              </ol>
            </div>

            <div className="rounded-2xl border border-border bg-surface/65 p-5">
              <p className="font-mono text-[9px] tracking-[0.18em] text-subtle uppercase">
                Steering controls
              </p>
              <div className="mx-auto mt-3 grid w-fit grid-cols-3 gap-2" aria-label="Touch controls">
                <span />
                <ControlButton label="Steer up" direction="up" onPress={steer}>
                  <ArrowUp />
                </ControlButton>
                <span />
                <ControlButton label="Steer left" direction="left" onPress={steer}>
                  <ArrowLeft />
                </ControlButton>
                <ControlButton label="Steer down" direction="down" onPress={steer}>
                  <ArrowDown />
                </ControlButton>
                <ControlButton label="Steer right" direction="right" onPress={steer}>
                  <ArrowRight />
                </ControlButton>
              </div>
              <p className="mt-3 text-center text-[11px] text-subtle">
                Tap the arrows or swipe the board.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-accent/15 bg-accent/[0.04] p-4 text-xs leading-relaxed text-subtle">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              Runs locally in your browser. Your best score and preferences stay on this device; no
              data is sent anywhere.
            </div>
          </aside>
        </div>
      </section>
    </PublicFrame>
  );
}

function ControlButton({
  label,
  direction,
  onPress,
  children,
}: {
  label: string;
  direction: Direction;
  onPress: (direction: Direction) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onPress(direction)}
      className="flex size-12 items-center justify-center rounded-xl border border-border bg-raised/60 text-muted transition hover:border-accent/60 hover:bg-accent/10 hover:text-accent active:scale-95"
    >
      {children}
    </button>
  );
}
