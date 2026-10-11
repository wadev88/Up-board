# Saboteur Testing Journal

## Target

`src/auto_remove.js` controls the 24-hour post lifecycle.

## Sabotage

The expiration comparison was tested as a boundary: a post at exactly 24 hours must be `expired`, while a post one second before 24 hours must be `expiring`.

## Result

The unit tests in `src/tests/test_unit.test.js` cover both sides of the boundary and the three-hour `expiring` boundary. Changing `timeLeft <= 0` to `timeLeft < 0` makes the exact-24-hour test fail, so the test suite detects this sabotage.

The original implementation was restored after the check.