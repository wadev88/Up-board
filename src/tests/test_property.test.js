const assert = require("node:assert/strict");
const test = require("node:test");
const fc = require("fast-check");
const { fizzbuzz } = require("../fizzbuzz");

test("FizzBuzz always returns the correct divisibility property", () => {
  assert.doesNotThrow(() => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100000 }), (number) => {
        const result = fizzbuzz(number);

        if (number % 15 === 0) return result === "FizzBuzz";
        if (number % 3 === 0) return result === "Fizz";
        if (number % 5 === 0) return result === "Buzz";
        return String(result) === String(number);
      }),
    );
  });
});