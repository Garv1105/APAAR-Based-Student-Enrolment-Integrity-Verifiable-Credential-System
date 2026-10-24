"""Anomaly detection (D3 and v2, docs/ANOMALY_V2_SPEC.md). Pure functions only; DB glue lives in app/risk.py.
Re-exports the original anomaly.py interface so existing imports keep working."""
from . import peer, stats  # noqa: F401  (A1)
from .rules import (APAAR_RUN_MIN, DEADLINE_MINUTES, DOB_CLUSTER_MIN, DQS_WEIGHTS, LABEL, MAD_FLOOR, MIX_MIN_NEW,
                    MIX_MIN_SHARE_JUMP, SPIKE_MIN_JUMP, SPIKE_Z, dqs, inspection_queue, institution_flags, longest_consecutive_run,
                    max_dob_cluster, programme_flags, robust_z)

__all__ = ["APAAR_RUN_MIN", "DEADLINE_MINUTES", "DOB_CLUSTER_MIN", "DQS_WEIGHTS", "LABEL", "MAD_FLOOR", "MIX_MIN_NEW",
           "MIX_MIN_SHARE_JUMP", "SPIKE_MIN_JUMP", "SPIKE_Z", "dqs", "inspection_queue", "institution_flags",
           "longest_consecutive_run", "max_dob_cluster", "programme_flags", "robust_z"]
