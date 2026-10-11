"""Load test for NFR-01 (feed p95 ≤ 2 s) and NFR-11 (300 concurrent users, p95 ≤ 3 s,
errors < 0.1%).

Runs N virtual users against a running API for a fixed duration. Each virtual user loops over a
realistic read mix (dashboard, category feed, repairs, notifications) with think time.

    python scripts/loadtest.py --base http://localhost:8000/api/v1 --users 300 --duration 60 \
        --email demo.student@up.ac.th --password "$DEMO_PASSWORD"

Exit code 1 when an NFR threshold is missed. Run against a staging stack, never production.
"""

import argparse
import asyncio
import random
import statistics
import sys
import time
from collections import defaultdict

import httpx

MIX = [
    ("dashboard", "/dashboard", 4),
    ("feed", "/posts?category=general&page_size=20", 3),
    ("repairs", "/repairs?page_size=20", 2),
    ("notifications", "/notifications/unread-count", 1),
]
FEED_ENDPOINTS = {"dashboard", "feed", "repairs"}


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, round(pct / 100 * (len(ordered) - 1)))
    return ordered[index]


async def virtual_user(
    client: httpx.AsyncClient,
    token: str,
    deadline: float,
    results: dict,
    think: tuple[float, float],
) -> None:
    names, paths, weights = zip(*[(n, p, w) for n, p, w in MIX], strict=True)
    headers = {"Authorization": f"Bearer {token}"}
    await asyncio.sleep(random.uniform(0, think[1]))  # ramp-up spread  # noqa: S311
    while time.perf_counter() < deadline:
        i = random.choices(range(len(names)), weights=weights)[0]  # noqa: S311
        start = time.perf_counter()
        try:
            response = await client.get(paths[i], headers=headers)
            ok = response.status_code == 200
        except httpx.HTTPError:
            ok = False
        results[names[i]].append((time.perf_counter() - start, ok))
        await asyncio.sleep(random.uniform(*think))  # think time  # noqa: S311


async def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--base", default="http://localhost:8000/api/v1")
    parser.add_argument("--users", type=int, default=300)
    parser.add_argument("--duration", type=int, default=60)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument(
        "--think",
        type=float,
        nargs=2,
        default=(5.0, 15.0),
        metavar=("MIN", "MAX"),
        help="seconds between a user's requests (default 5–15 s = realistic browsing; "
        "use 0.5 1.5 for a stress test)",
    )
    args = parser.parse_args()

    limits = httpx.Limits(max_connections=args.users, max_keepalive_connections=args.users)
    async with httpx.AsyncClient(base_url=args.base, timeout=30, limits=limits) as client:
        login = await client.post(
            "/auth/login", json={"email": args.email, "password": args.password}
        )
        login.raise_for_status()
        token = login.json()["access_token"]  # 15-min token is enough for a short run

        results: dict[str, list[tuple[float, bool]]] = defaultdict(list)
        deadline = time.perf_counter() + args.duration
        started = time.perf_counter()
        await asyncio.gather(
            *(
                virtual_user(client, token, deadline, results, tuple(args.think))
                for _ in range(args.users)
            )
        )
        elapsed = time.perf_counter() - started

    all_samples = [s for samples in results.values() for s in samples]
    total = len(all_samples)
    errors = sum(1 for _, ok in all_samples if not ok)
    latencies = [t for t, _ in all_samples]
    feed_latencies = [t for name in FEED_ENDPOINTS for t, _ in results[name]]

    print(f"\nThink time: {args.think[0]}–{args.think[1]} s  users: {args.users}")
    print(f"duration: {elapsed:.0f}s  requests: {total}  throughput: {total / elapsed:.1f} req/s")
    print(f"{'endpoint':<15}{'count':>7}{'p50 ms':>9}{'p95 ms':>9}{'p99 ms':>9}{'errors':>8}")
    for name, *_ in MIX:
        times = [t for t, _ in results[name]]
        errs = sum(1 for _, ok in results[name] if not ok)
        print(
            f"{name:<15}{len(times):>7}{statistics.median(times) * 1000 if times else 0:>9.0f}"
            f"{percentile(times, 95) * 1000:>9.0f}{percentile(times, 99) * 1000:>9.0f}{errs:>8}"
        )

    error_rate = errors / total if total else 1.0
    p95_all, p95_feed = percentile(latencies, 95), percentile(feed_latencies, 95)
    checks = [
        ("NFR-11 p95 (all) ≤ 3.0 s", p95_all <= 3.0, f"{p95_all:.2f} s"),
        ("NFR-11 error rate < 0.1%", error_rate < 0.001, f"{error_rate:.3%}"),
        ("NFR-01 feed p95 ≤ 2.0 s", p95_feed <= 2.0, f"{p95_feed:.2f} s"),
    ]
    print()
    for label, passed, value in checks:
        print(f"{'PASS' if passed else 'FAIL'}  {label:<28} measured {value}")
    return 0 if all(passed for _, passed, _ in checks) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
