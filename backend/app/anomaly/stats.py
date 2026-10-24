"""Shared statistics helpers for the anomaly rules (pure, stdlib only)."""
import statistics


def robust_z(value: float, history: list[float], mad_floor: float = 0.0) -> tuple[float, float, float]:
    """(robust z, median, MAD) with z = (value - median) / (1.4826 * MAD); MAD floored at mad_floor."""
    med = statistics.median(history)
    mad = max(statistics.median([abs(h - med) for h in history]), mad_floor)
    return (value - med) / (1.4826 * mad), med, mad
