import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOARD_SIZE,
  FINAL_LEVEL,
  PACKETS_PER_LEVEL,
  PACKET_POINTS,
  SURGE_POINTS,
  createGame,
  isOpposite,
  levelFor,
  levelProgress,
  placeObstacles,
  placePacket,
  speedFor,
  step,
  type GameState,
} from "./signal-sweep.ts";

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
    direction: "right",
    packet: { x: 10, y: 10, surge: false },
    obstacles: [],
    score: 0,
    packets: 0,
    level: 1,
    ...overrides,
  };
}

const zero = () => 0;

describe("signal sweep opening board", () => {
  it("starts with a three-cell trail and a packet straight ahead", () => {
    const game = createGame();
    assert.equal(game.snake.length, 3);
    assert.deepEqual(game.snake[0], { x: 9, y: 10 });
    assert.equal(game.direction, "right");
    assert.deepEqual(game.packet, { x: 14, y: 10, surge: false });
    assert.equal(game.score, 0);
    assert.equal(game.level, 1);
    assert.equal(game.obstacles.length, 0);
  });

  it("counts sectors and progress from packets", () => {
    assert.equal(levelFor(0), 1);
    assert.equal(levelFor(4), 1);
    assert.equal(levelFor(5), 2);
    assert.equal(levelFor(PACKETS_PER_LEVEL * FINAL_LEVEL), FINAL_LEVEL);
    assert.equal(levelProgress(0), 0);
    assert.equal(levelProgress(4), 4);
    assert.equal(levelProgress(5), 0);
  });

  it("gets faster with each sector and then holds a floor", () => {
    for (const difficulty of ["cadet", "operator", "overclock"] as const) {
      assert.ok(speedFor(difficulty, 2) < speedFor(difficulty, 1), difficulty);
      assert.equal(speedFor(difficulty, FINAL_LEVEL + 5), speedFor(difficulty, 99));
    }
  });
});

describe("turning and moving", () => {
  it("moves one cell and keeps the trail length constant", () => {
    const result = step(state(), "right", "operator", zero);
    assert.deepEqual(result.state.snake[0], { x: 6, y: 5 });
    assert.equal(result.state.snake.length, 3);
    assert.deepEqual(result.events, ["move"]);
  });

  it("refuses to reverse into its own neck", () => {
    assert.equal(isOpposite("right", "left"), true);
    const result = step(state(), "left", "operator", zero);
    assert.equal(result.state.direction, "right");
    assert.deepEqual(result.state.snake[0], { x: 6, y: 5 });
  });

  it("lets the moving tail cell be reused safely", () => {
    const game = state({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
      ],
      direction: "right",
    });
    const result = step(game, "right", "operator", zero);
    assert.deepEqual(result.events, ["move"]);
    assert.deepEqual(result.state.snake[0], { x: 6, y: 5 });
    assert.equal(result.state.snake.length, 4);
  });
});

describe("packets and scoring", () => {
  it("grows, scores ten, and places the next packet off the trail", () => {
    const game = state({ packet: { x: 6, y: 5, surge: false } });
    const result = step(game, "right", "operator", zero);
    assert.ok(result.events.includes("eat"));
    assert.equal(result.state.score, PACKET_POINTS);
    assert.equal(result.state.packets, 1);
    assert.equal(result.state.snake.length, 4);
    assert.ok(result.state.snake.some((part) => part.x === 6 && part.y === 5));
    assert.ok(
      !result.state.snake.some(
        (part) => part.x === result.state.packet.x && part.y === result.state.packet.y,
      ),
      "the packet must not spawn under the trail",
    );
  });

  it("scores thirty for a surge packet", () => {
    const game = state({ packet: { x: 6, y: 5, surge: true } });
    const result = step(game, "right", "operator", zero);
    assert.equal(result.state.score, SURGE_POINTS);
  });

  it("makes every fifth packet a surge packet", () => {
    let game = state();
    const collected = [];
    for (let index = 0; index < PACKETS_PER_LEVEL; index += 1) {
      game = { ...game, packet: { x: game.snake[0]!.x + 1, y: game.snake[0]!.y, surge: false } };
      game = step(game, "right", "operator", zero).state;
      collected.push(game.packet.surge);
    }
    assert.deepEqual(collected, [false, false, false, true, false]);
  });

  it("adds jammers when a sector is cleared", () => {
    const game = state({
      packets: PACKETS_PER_LEVEL - 1,
      packet: { x: 6, y: 5, surge: true },
    });
    const result = step(game, "right", "operator", zero);
    assert.equal(result.state.level, 2);
    assert.equal(result.state.obstacles.length, 2);
    assert.ok(result.events.includes("level"));
    for (const obstacle of result.state.obstacles) {
      assert.ok(
        !result.state.snake.some((part) => part.x === obstacle.x && part.y === obstacle.y),
        "a jammer must not overlap the trail",
      );
      assert.ok(
        !(result.state.packet.x === obstacle.x && result.state.packet.y === obstacle.y),
        "a jammer must not overlap the packet",
      );
    }
  });

  it("wins after clearing the final sector", () => {
    const game = state({
      packets: PACKETS_PER_LEVEL * FINAL_LEVEL - 1,
      level: FINAL_LEVEL,
      packet: { x: 6, y: 5, surge: false },
    });
    const result = step(game, "right", "operator", zero);
    assert.ok(result.events.includes("win"));
    assert.equal(result.state.packets, PACKETS_PER_LEVEL * FINAL_LEVEL);
    assert.equal(result.state.level, FINAL_LEVEL);
  });
});

describe("collisions", () => {
  it("ends at a wall", () => {
    const game = state({
      snake: [
        { x: BOARD_SIZE - 1, y: 5 },
        { x: BOARD_SIZE - 2, y: 5 },
        { x: BOARD_SIZE - 3, y: 5 },
      ],
    });
    const result = step(game, "right", "operator", zero);
    assert.deepEqual(result.events, ["crash"]);
    assert.equal(result.reason, "wall");
    assert.deepEqual(result.state.snake[0], { x: BOARD_SIZE - 1, y: 5 });
  });

  it("ends on the trail", () => {
    const game = state({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
        { x: 4, y: 4 },
      ],
      direction: "down",
    });
    const result = step(game, "down", "operator", zero);
    assert.deepEqual(result.events, ["crash"]);
    assert.equal(result.reason, "self");
  });

  it("ends on a jammer", () => {
    const game = state({ obstacles: [{ x: 6, y: 5 }] });
    const result = step(game, "right", "operator", zero);
    assert.deepEqual(result.events, ["crash"]);
    assert.equal(result.reason, "jammer");
  });
});

describe("placement helpers", () => {
  it("never places a packet on a blocked cell", () => {
    const snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const obstacles = [{ x: 2, y: 0 }];
    const packet = placePacket(snake, obstacles, true, zero);
    assert.ok(packet);
    assert.equal(packet.surge, true);
    assert.ok(!snake.some((part) => part.x === packet.x && part.y === packet.y));
    assert.ok(!obstacles.some((part) => part.x === packet.x && part.y === packet.y));
  });

  it("keeps new jammers clear of the head and its short forward path", () => {
    const snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    const placed = placeObstacles(snake, [], { x: 15, y: 15 }, "right", 4, zero);
    assert.equal(placed.length, 4);
    for (const obstacle of placed) {
      assert.ok(!(obstacle.y === 10 && obstacle.x >= 10 && obstacle.x <= 13));
      assert.ok(Math.abs(obstacle.x - 10) + Math.abs(obstacle.y - 10) >= 4);
    }
  });
});
