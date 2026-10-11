const assert = require("node:assert/strict");
const test = require("node:test");
const { fizzbuzz } = require("../fizzbuzz");

test("returns the number as text when it is not divisible by three or five", () => {
  assert.equal(fizzbuzz(1), "1");
});

test("returns Fizz for multiples of three", () => {
  assert.equal(fizzbuzz(3), "Fizz");
});

test("returns Buzz for multiples of five", () => {
  assert.equal(fizzbuzz(5), "Buzz");
});

test("returns FizzBuzz for multiples of three and five", () => {
  assert.equal(fizzbuzz(15), "FizzBuzz");
});
test("returns the number as text for a non-multiple greater than five", () => {
  assert.equal(fizzbuzz(7), "7");
});

test("rejects input that is not a positive integer", () => {
  assert.throws(() => fizzbuzz(0), RangeError);
  assert.throws(() => fizzbuzz(-3), RangeError);
  assert.throws(() => fizzbuzz(1.5), RangeError);
});
