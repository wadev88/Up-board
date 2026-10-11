function isMultiple(number, divisor) {
  return number % divisor === 0;
}

function fizzbuzz(number) {
  if (!Number.isInteger(number) || number < 1) {
    throw new RangeError("number must be a positive integer");
  }
  if (isMultiple(number, 15)) return "FizzBuzz";
  if (isMultiple(number, 3)) return "Fizz";
  if (isMultiple(number, 5)) return "Buzz";
  return String(number);
}

module.exports = { fizzbuzz };
