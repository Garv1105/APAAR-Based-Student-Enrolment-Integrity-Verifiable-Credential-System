from test_api import pending_rows, upload


def test_public_stats_counts_and_suppression(client, dbconn):
    assert upload(client, "inst-a", "A1.csv").status_code == 201
    assert upload(client, "inst-b", rows=pending_rows(3)).status_code == 201
    s = client.get("/v1/public/stats").json()
    active = dbconn.execute("SELECT count(*) n FROM enrolments WHERE status='active'").fetchone()["n"]
    approved = dbconn.execute("SELECT count(*) n FROM institutions WHERE status='approved'").fetchone()["n"]
    assert s["students_recorded"] == active and s["institutions_reporting"] == 2 and s["institutions_approved"] == approved
    by = {x["state"]: x for x in s["states"]}
    assert by["Maharashtra"]["students"] is None and by["Maharashtra"]["reporting"] == 1
    assert by["Karnataka"]["students"] == active - 3 >= 10
    assert s["states_covered"] == 2 and by["Bihar"]["institutions"] == 0
    assert upload(client, "inst-d", rows=pending_rows(2, prog="CE")).status_code == 201
    s2 = client.get("/v1/public/stats").json()
    assert s2["institutions_reporting"] == 2 <= s2["institutions_approved"]


def test_public_search_filters_and_limits(client):
    get = lambda **p: client.get("/v1/public/institutions", params=p)  # noqa: E731
    everyone = get(q="1-0000").json()
    assert {r["login_id"] for r in everyone} >= {"inst-a", "inst-b", "inst-c"} and all(r["kind"] == "institution" for r in everyone)
    a = next(r for r in everyone if r["login_id"] == "inst-a")
    assert get(q=a["name"][:6].lower()).json()[0]["name"] == a["name"]
    assert [r["login_id"] for r in get(state=a["state"]).json()] == ["inst-a"]
    assert get(q="x").json() == [] and get().json() == []
    assert get(q="%%").json() == []
    assert len(get(q="1-0000", limit=2).json()) == 2 and len(get(q="1-0000", limit=500).json()) <= 20
    uni = get(kind="university").json()
    assert [u["login_id"] for u in uni] == ["univ"] and uni[0]["state"] is None
    assert "password" not in str(everyone).lower()
