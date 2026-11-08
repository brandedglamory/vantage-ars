import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autonomyEnabled } from "./autonomy-switch";

describe("autonomy switch", () => {
  it("runs by default when nothing is configured", () => {
    assert.equal(autonomyEnabled(undefined), true);
    assert.equal(autonomyEnabled(""), true);
    assert.equal(autonomyEnabled("on"), true);
  });

  it("stays on for a stray value rather than silently disarming", () => {
    assert.equal(autonomyEnabled("ON"), true);
    assert.equal(autonomyEnabled("live"), true);
  });

  it("is disarmed only by an explicit off value", () => {
    for (const value of ["off", "OFF", " false ", "0", "no", "paused"]) {
      assert.equal(autonomyEnabled(value), false, value);
    }
  });
});
