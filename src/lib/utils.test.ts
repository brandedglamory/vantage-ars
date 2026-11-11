import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cn, formatCurrency, formatDate, truncate, slugify, capitalize, isEmpty } from "./utils";

describe("utils", () => {
  it("merges class names", () => {
    assert.equal(cn("foo", "bar"), "foo bar");
    assert.equal(cn("foo", { bar: true }), "foo bar");
  });

  it("formats currency in ZAR", () => {
    const result = formatCurrency(1000);
    assert.ok(result.includes("1"));
    assert.ok(result.includes("000"));
  });

  it("formats dates", () => {
    const date = new Date("2024-01-15");
    const result = formatDate(date);
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });

  it("truncates strings", () => {
    assert.equal(truncate("hello world", 5), "hello...");
    assert.equal(truncate("hi", 10), "hi");
  });

  it("slugifies strings", () => {
    assert.equal(slugify("Hello World!"), "hello-world");
    assert.equal(slugify("  Multiple   Spaces  "), "multiple-spaces");
  });

  it("capitalizes strings", () => {
    assert.equal(capitalize("hello"), "Hello");
    assert.equal(capitalize(""), "");
  });

  it("checks if empty", () => {
    assert.equal(isEmpty(null), true);
    assert.equal(isEmpty(undefined), true);
    assert.equal(isEmpty(""), true);
    assert.equal(isEmpty("   "), true);
    assert.equal(isEmpty([]), true);
    assert.equal(isEmpty({}), true);
    assert.equal(isEmpty("hello"), false);
    assert.equal(isEmpty([1, 2]), false);
    assert.equal(isEmpty({ a: 1 }), false);
  });
});
