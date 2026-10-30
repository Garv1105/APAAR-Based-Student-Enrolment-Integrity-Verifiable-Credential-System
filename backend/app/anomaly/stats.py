import math
import statistics


def robust_z(value: float, history: list[float], mad_floor: float = 0.0) -> tuple[float, float, float]:
    med = statistics.median(history)
    mad = max(statistics.median([abs(h - med) for h in history]), mad_floor)
    return (value - med) / (1.4826 * mad), med, mad


def normal_sf(z: float) -> float:
    return 0.5 * math.erfc(z / math.sqrt(2))


def benjamini_hochberg(pvals: list[float], q: float) -> list[bool]:
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    k = max((rank for rank, i in enumerate(order, start=1) if pvals[i] <= rank / m * q), default=0)
    reject = [False] * m
    for rank, i in enumerate(order, start=1):
        reject[i] = rank <= k
    return reject
