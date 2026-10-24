"""Shared statistics helpers for the anomaly rules (pure, stdlib only)."""
import math
import statistics


def robust_z(value: float, history: list[float], mad_floor: float = 0.0) -> tuple[float, float, float]:
    """(robust z, median, MAD) with z = (value - median) / (1.4826 * MAD); MAD floored at mad_floor."""
    med = statistics.median(history)
    mad = max(statistics.median([abs(h - med) for h in history]), mad_floor)
    return (value - med) / (1.4826 * mad), med, mad


def normal_sf(z: float) -> float:
    """One-sided upper-tail p-value of a standard normal: P(Z >= z) = 0.5 * erfc(z / sqrt 2)."""
    return 0.5 * math.erfc(z / math.sqrt(2))


def benjamini_hochberg(pvals: list[float], q: float) -> list[bool]:
    """Benjamini-Hochberg step-up: reject the k smallest p-values, k = max{rank : p_(rank) <= rank / m * q}.
    Controls the expected share of false alarms among flags at q."""
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    k = max((rank for rank, i in enumerate(order, start=1) if pvals[i] <= rank / m * q), default=0)
    reject = [False] * m
    for rank, i in enumerate(order, start=1):
        reject[i] = rank <= k
    return reject
