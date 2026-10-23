"""One test per error code (PRD P2 exit criterion) plus false-positive controls."""
import itertools
import json
from datetime import date
from pathlib import Path

import pytest

from app import crypto
from app.validation import Ctx, caps_for, missing_columns, validate_batch

SEED = json.loads((Path(__file__).resolve().parent.parent / "data/seed/registry.json").read_text())
CATS = {c["code"]: c for c in SEED["seat_categories"]}
REG = {
    "100000000001": {"name": "Asha Rao", "dob": "2008-03-14"},
    "100000000002": {"name": "Ravi Kumar", "dob": "2007-11-02"},
    "100000000003": {"name": "Meera Iyer", "dob": "2008-01-20"},
}


def ctx(**kw):
    base = dict(
        institution_id="1-0000000001", institution_status="approved",
        year={"code": "2026-27", "window_start": date(2026, 7, 1), "window_end": date(2026, 10, 31)},
        programmes={"CSE": {"id": "1-0000000001:CSE", "approved_intake": 60, "duration_years": 4}},
        seat_categories=CATS, registry_lookup=REG.get,
    )
    base.update(kw)
    return Ctx(**base)


_SEQ = itertools.count(1)


def row(**kw):
    """A clean row; each call gets its own student ID (IDs must be unique per institution)."""
    r = {"apaar_id": "100000000001", "apaar_reason": "", "institution_student_id": f"DIT/CSE/{next(_SEQ):04d}",
         "student_name": "Asha Rao", "dob": "2008-03-14", "guardian_name": "Ramesh Rao",
         "programme_code": "CSE", "academic_year": "2026-27", "year_of_study": "1",
         "seat_category": "REGULAR", "is_supernumerary": "N", "is_lateral_entry": "N",
         "is_nri": "N", "is_oci": "N", "is_fn": "N", "is_ciwg": "N",
         "admission_date": "2026-08-10", "declared_intake": ""}
    r.update(kw)
    return r


def codes(outcome):
    return {i["code"] for i in outcome["issues"]}


def one(r, c=None):
    return validate_batch([r], c or ctx())[0]


def test_clean_row_accepted_and_counted():
    c = ctx()
    o = validate_batch([row()], c)[0]
    assert o["accepted"] and codes(o) == set() and o["apaar_status"] == "VERIFIED"
    assert c.counters == {("1-0000000001:CSE", "REGULAR"): 1}


@pytest.mark.parametrize("variant", ["ASHA  RAO", "Ms. Asha Rao", "Rao Asha", "asha rao."])
def test_name_noise_does_not_raise_e104(variant):
    assert codes(one(row(student_name=variant))) == set()


def test_e001_schema():
    o = one(row(dob="14/03/2008"))
    assert codes(o) == {"E001"} and not o["accepted"]
    assert missing_columns(["apaar_id"])  # batch-level header check


def test_e101_missing_apaar_no_reason():
    o = one(row(apaar_id=""))
    assert codes(o) == {"E101"} and not o["accepted"]


def test_e101w_missing_apaar_with_reason_is_counted():
    c = ctx()
    o = validate_batch([row(apaar_id="", apaar_reason="REFUSED")], c)[0]
    assert codes(o) == {"E101W"} and o["accepted"] and o["apaar_status"] == "REFUSED"
    assert c.counters[("1-0000000001:CSE", "REGULAR")] == 1  # F10: still counted


def test_e102_invalid_format():
    assert codes(one(row(apaar_id="12345"))) == {"E102"}
    assert codes(one(row(apaar_id="10000000000A"))) == {"E102"}


def test_e103_not_in_registry():
    assert codes(one(row(apaar_id="999999999999"))) == {"E103"}


def test_e104_mismatch_is_warning():
    o = one(row(student_name="Asha Sharma"))
    assert codes(o) == {"E104"} and o["accepted"] and o["apaar_status"] == "MISMATCH"
    assert codes(one(row(dob="2008-03-15"))) == {"E104"}


def test_e201_duplicate_in_file():
    out = validate_batch([row(), row(institution_student_id="DIT/CSE/0099")], ctx())
    assert codes(out[0]) == set() and codes(out[1]) == {"E201"} and not out[1]["accepted"]


def test_e201_without_apaar_uses_name_and_dob():
    r = row(apaar_id="", apaar_reason="PENDING")
    out = validate_batch([r, {**r, "institution_student_id": "DIT/CSE/9999"}], ctx())
    assert codes(out[1]) == {"E101W", "E201"}


def test_e105_missing_student_id():
    o = one(row(institution_student_id="  "))
    assert codes(o) == {"E105"} and not o["accepted"]


def test_e205_duplicate_student_id_in_file_and_institution():
    out = validate_batch([row(institution_student_id="DIT/CSE/0042"),
                          row(apaar_id="100000000002", student_name="Ravi Kumar", dob="2007-11-02",
                              institution_student_id=" dit/cse/0042 ")], ctx())  # case/space-insensitive
    assert codes(out[0]) == set() and codes(out[1]) == {"E205"} and not out[1]["accepted"]
    assert out[1]["issues"][0]["params"]["detail"] == "row 1 of this file"
    c = ctx(own_active_student_ids={"dit/cse/0042"})
    o = one(row(institution_student_id="DIT/CSE/0042"), c)
    assert codes(o) == {"E205"} and o["issues"][0]["params"]["detail"] == "an active enrolment at this institution"


def test_identical_rows_raise_both_duplicate_codes():
    r = row()
    assert codes(validate_batch([r, r], ctx())[1]) == {"E201", "E205"}


def test_e202_duplicate_in_institution():
    c = ctx(own_active_bi={crypto.apaar_bi("100000000001")})
    assert codes(one(row(), c)) == {"E202"}


def test_e203_cross_institution_is_flag_and_accepted():
    c = ctx(other_active_bi={crypto.apaar_bi("100000000001")})
    o = one(row(), c)
    assert codes(o) == {"E203"} and o["accepted"]
    assert o["issues"][0]["params"]["detail"] == ""  # F4: carries nothing about the other side


def test_every_code_has_english_template_and_fix_hint():
    import string

    from app.codes import CODES, PLACEHOLDERS
    from app.i18n import catalogue, render
    en = catalogue("en")
    for code in CODES:
        assert code in en and en[code]["template"] and en[code]["fix_hint"], code
        used = {f for _, f, _, _ in string.Formatter().parse(en[code]["template"]) if f}
        assert used <= PLACEHOLDERS, (code, used)
        render(code, {"field": "x", "detail": "y"})
    assert set(en) - {"_locale"} == set(CODES)


def test_e301_excess_over_intake_flags_rows_beyond_cap():
    c = ctx(counters={("1-0000000001:CSE", "REGULAR"): 59})
    out = validate_batch([row(), row(apaar_id="100000000002", student_name="Ravi Kumar", dob="2007-11-02")], c)
    assert codes(out[0]) == set() and codes(out[1]) == {"E301"} and out[1]["accepted"]


def test_e302_supernumerary_pool_and_ciwg_subcap():
    assert caps_for(60, CATS) == {"REGULAR": 60, "SN_FN_OCI_CIWG": 9, "SN_FN_OCI_CIWG:CIWG": 3}
    sn = dict(seat_category="SN_FN_OCI_CIWG", is_supernumerary="Y")
    c = ctx(counters={("1-0000000001:CSE", "SN_FN_OCI_CIWG"): 9})
    assert codes(one(row(**sn, is_fn="Y"), c)) == {"E302"}
    c = ctx(counters={("1-0000000001:CSE", "SN_FN_OCI_CIWG"): 4, ("1-0000000001:CSE", "SN_FN_OCI_CIWG:CIWG"): 3})
    assert codes(one(row(**sn, is_ciwg="Y"), c)) == {"E302"}
    c = ctx(counters={("1-0000000001:CSE", "SN_FN_OCI_CIWG"): 4, ("1-0000000001:CSE", "SN_FN_OCI_CIWG:CIWG"): 3})
    assert codes(one(row(**sn, is_oci="Y"), c)) == set()  # sub-cap only applies to CIWG rows


def test_e303_declared_intake_mismatch_once_per_programme():
    out = validate_batch([row(declared_intake="90"),
                          row(apaar_id="100000000002", student_name="Ravi Kumar", dob="2007-11-02", declared_intake="90")], ctx())
    assert codes(out[0]) == {"E303"} and codes(out[1]) == set()
    assert codes(one(row(declared_intake="60"))) == set()


def test_e304_closed_institution_and_unknown_programme():
    assert codes(one(row(), ctx(institution_status="closed"))) == {"E304"}
    assert codes(one(row(programme_code="XYZ"))) == {"E304"}
    assert codes(one(row(academic_year="2025-26"))) == {"E304"}


def test_e401_inconsistent_category():
    assert codes(one(row(is_fn="Y", is_oci="Y"))) == {"E401"}
    assert codes(one(row(is_nri="Y", is_fn="Y"))) == {"E401"}
    assert codes(one(row(seat_category="SN_FN_OCI_CIWG", is_supernumerary="N", is_fn="Y"))) == {"E401"}
    assert codes(one(row(seat_category="SN_FN_OCI_CIWG", is_supernumerary="Y"))) == {"E401"}


def test_e402_implausible_age():
    reg = {**REG, "100000000009": {"name": "Kid Test", "dob": "2013-01-01"}}
    o = one(row(apaar_id="100000000009", student_name="Kid Test", dob="2013-01-01"), ctx(registry_lookup=reg.get))
    assert codes(o) == {"E402"} and o["accepted"]


def test_e403_admission_outside_window():
    assert codes(one(row(admission_date="2026-12-15"))) == {"E403"}


def test_e404_lateral_entry_year():
    assert codes(one(row(is_lateral_entry="Y", year_of_study="1"))) == {"E404"}
    assert codes(one(row(is_lateral_entry="Y", year_of_study="2"))) == set()
