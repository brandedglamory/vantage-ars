/**
 * Signal Sweep's rules, kept free of React so the route only has to render.
 *
 * The board is a fixed 20 by 20 sector. The player routes a signal trail,
 * collects one packet at a time, and clears ten sectors. Every fifth packet is
 * a surge packet worth more. From the second sector onward the grid gains
 * jammer nodes that end the run on contact.
 *
 * All randomness is injected so the tests can describe an exact board.
 */

export const BOARD_SIZE = 20;
export const PACKETS_PER_LEVEL = 5;
export const FINAL_LEVEL = 10;
export const PACKET_POINTS = 10;
export const SURGE_POINTS = 30;

export type Point = { x: number; y: number };
export type Direction = "up" | "right" | "down" | "left";
export type Difficulty = "cadet" | "operator" | "overclock";
export type LossReason = "wall" | "self" | "jammer";
export type StepEvent = "move" | "eat" | "level" | "crash" | "win";

export type Packet = Point & { surge: boolean };

export type GameState = {
  snake: Point[];
  direction: Direction;
  packet: Packet;
  obstacles: Point[];
  score: number;
  packets: number;
  level: number;
};

export type DifficultyConfig = {
  label: string;
  tagline: string;
  description: string;
  baseMs: number;
  minMs: number;
  stepMs: number;
  obstacleStart: number;
  obstaclesPerLevel: number;
  obstacleCap: number;
};

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  cadet: {
    label: "Cadet",
    tagline: "Learn the route",
    description: "A slower clock and a late, sparse jammer field.",
    baseMs: 200,
    minMs: 112,
    stepMs: 10,
    obstacleStart: 3,
    obstaclesPerLevel: 1,
    obstacleCap: 12,
  },
  operator: {
    label: "Operator",
    tagline: "The standard run",
    description: "A balanced clock with jammers from the second sector.",
    baseMs: 160,
    minMs: 82,
    stepMs: 10,
    obstacleStart: 2,
    obstaclesPerLevel: 2,
    obstacleCap: 20,
  },
  overclock: {
    label: "Overclock",
    tagline: "No margin",
    description: "A fast clock and a dense jammer field from the start.",
    baseMs: 118,
    minMs: 58,
    stepMs: 9,
    obstacleStart: 2,
    obstaclesPerLevel: 3,
    obstacleCap: 28,
  },
};

export const START_SNAKE: readonly Point[] = [
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
];

const VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  right: "left",
  down: "up",
  left: "right",
};

export function isOpposite(a: Direction, b: Direction): boolean {
  return OPPOSITE[a] === b;
}

export function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function speedFor(difficulty: Difficulty, level: number): number {
  const config = DIFFICULTIES[difficulty];
  return Math.max(config.minMs, config.baseMs - (level - 1) * config.stepMs);
}

/** Packets collected inside the current sector, from 0 to 4. */
export function levelProgress(packets: number): number {
  return packets % PACKETS_PER_LEVEL;
}

export function levelFor(packets: number): number {
  return Math.min(FINAL_LEVEL, Math.floor(packets / PACKETS_PER_LEVEL) + 1);
}

function randomIndex(length: number, rng: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(rng() * length)));
}

/** Cells that are not the trail, a jammer, or the current packet. */
export function openCells(
  snake: readonly Point[],
  obstacles: readonly Point[],
  packet: Point | null,
): Point[] {
  const blocked = new Set(snake.map(pointKey));
  for (const obstacle of obstacles) blocked.add(pointKey(obstacle));
  if (packet) blocked.add(pointKey(packet));
  const cells: Point[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!blocked.has(`${x},${y}`)) cells.push({ x, y });
    }
  }
  return cells;
}

/** A packet never lands under the trail or inside a jammer. */
export function placePacket(
  snake: readonly Point[],
  obstacles: readonly Point[],
  surge: boolean,
  rng: () => number = Math.random,
): Packet | null {
  const cells = openCells(snake, obstacles, null);
  if (cells.length === 0) return null;
  return { ...cells[randomIndex(cells.length, rng)]!, surge };
}

/**
 * Pick new jammer cells for a sector. They keep their distance from the head
 * and its immediate forward path, so a new sector never drops a wall directly
 * on the player.
 */
export function placeObstacles(
  snake: readonly Point[],
  obstacles: readonly Point[],
  packet: Point,
  direction: Direction,
  count: number,
  rng: () => number = Math.random,
): Point[] {
  if (count <= 0) return [];
  const head = snake[0]!;
  const vector = VECTORS[direction];
  const guard = new Set<string>();
  for (let step = 0; step <= 3; step += 1) {
    guard.add(`${head.x + vector.x * step},${head.y + vector.y * step}`);
  }
  const blocked = new Set([...snake.map(pointKey), pointKey(packet)]);

  const candidates: Point[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const key = `${x},${y}`;
      if (blocked.has(key) || guard.has(key)) continue;
      if (obstacles.some((part) => part.x === x && part.y === y)) continue;
      if (Math.abs(x - head.x) + Math.abs(y - head.y) < 4) continue;
      candidates.push({ x, y });
    }
  }

  const placed: Point[] = [];
  while (placed.length < count && candidates.length > 0) {
    const index = randomIndex(candidates.length, rng);
    placed.push(candidates[index]!);
    candidates.splice(index, 1);
  }
  return placed;
}

function targetObstacleCount(difficulty: Difficulty, level: number): number {
  const config = DIFFICULTIES[difficulty];
  if (level < config.obstacleStart) return 0;
  const sectors = level - config.obstacleStart + 1;
  return Math.min(config.obstacleCap, sectors * config.obstaclesPerLevel);
}

/** A deterministic-ready opening board: the first packet sits straight ahead. */
export function createGame(): GameState {
  const snake = START_SNAKE.map((part) => ({ ...part }));
  return {
    snake,
    direction: "right",
    packet: { x: 14, y: 10, surge: false },
    obstacles: [],
    score: 0,
    packets: 0,
    level: 1,
  };
}

export type StepResult = {
  state: GameState;
  events: StepEvent[];
  reason?: LossReason;
};

/**
 * Advance one tick. An opposite input is ignored rather than reversing the
 * trail into itself. The current tail cell is free because it moves away on a
 * normal tick.
 */
export function step(
  state: GameState,
  requested: Direction,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): StepResult {
  const direction = isOpposite(requested, state.direction) ? state.direction : requested;
  const vector = VECTORS[direction];
  const head = { x: state.snake[0]!.x + vector.x, y: state.snake[0]!.y + vector.y };
  const eating = samePoint(head, state.packet);

  if (head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE) {
    return { state, events: ["crash"], reason: "wall" };
  }
  if (state.obstacles.some((obstacle) => samePoint(obstacle, head))) {
    return { state, events: ["crash"], reason: "jammer" };
  }

  const trailingBody = eating ? state.snake : state.snake.slice(0, -1);
  if (trailingBody.some((part) => samePoint(part, head))) {
    return { state, events: ["crash"], reason: "self" };
  }

  if (!eating) {
    return {
      state: {
        ...state,
        direction,
        snake: [head, ...state.snake.slice(0, -1)],
      },
      events: ["move"],
    };
  }

  const packets = state.packets + 1;
  const level = levelFor(packets);
  const score = state.score + (state.packet.surge ? SURGE_POINTS : PACKET_POINTS);
  const snake = [head, ...state.snake];
  const events: StepEvent[] = ["eat"];
  let obstacles = state.obstacles;

  if (level > state.level) {
    const target = targetObstacleCount(difficulty, level);
    const extra = Math.max(0, target - obstacles.length);
    obstacles = [
      ...obstacles,
      ...placeObstacles(snake, obstacles, state.packet, direction, extra, rng),
    ];
    events.push("level");
  }

  if (packets >= PACKETS_PER_LEVEL * FINAL_LEVEL) {
    return {
      state: {
        ...state,
        direction,
        snake,
        obstacles,
        score,
        packets,
        level: FINAL_LEVEL,
        packet: { ...state.packet, surge: false },
      },
      events: [...events, "win"],
    };
  }

  const nextPacket = placePacket(snake, obstacles, (packets + 1) % PACKETS_PER_LEVEL === 0, rng);

  if (!nextPacket) {
    return {
      state: {
        ...state,
        direction,
        snake,
        obstacles,
        score,
        packets,
        level,
        packet: { ...state.packet, surge: false },
      },
      events: [...events, "win"],
    };
  }

  return {
    state: { ...state, direction, snake, obstacles, score, packets, level, packet: nextPacket },
    events,
  };
}
