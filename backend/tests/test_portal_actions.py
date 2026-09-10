from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import Portal


client = TestClient(app)


def test_critical_portal_cannot_be_observed():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-CRITICAL",
        name="Critical Test",
        destination_world="Test World",
        energy=100,
        stability=30,
        creatures_inside=0,
        status="OPEN",
        collapse_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-CRITICAL/actions",
        json={"action": "observe"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "error": (
            "Нельзя отправить критический портал под наблюдение. "
            "Требуется стабилизация."
        ),
    }

    db.close()


def test_close_portal_with_creatures_requires_confirmation():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-CREATURES",
        name="Creature Test",
        destination_world="Test World",
        energy=50,
        stability=70,
        creatures_inside=3,
        status="OPEN",
        collapse_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-CREATURES/actions",
        json={"action": "close"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "warning": (
            "В портале находятся существа. "
            "Для закрытия требуется подтверждение оператора."
        ),
    }

    db.refresh(portal)

    assert portal.status == "OPEN"
    assert portal.creatures_inside == 3

    db.close()


def test_add_and_remove_creatures():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-CREATURE-ACTIONS",
        name="Creature Actions Test",
        destination_world="Test World",
        energy=50,
        stability=70,
        creatures_inside=2,
        status="OPEN",
        collapse_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-CREATURE-ACTIONS/actions",
        json={
            "action": "add_creatures",
            "amount": 3,
        },
    )

    assert response.status_code == 200
    assert response.json()["creatures_inside"] == 5

    response = client.post(
        "/portals/P-TEST-CREATURE-ACTIONS/actions",
        json={
            "action": "remove_creatures",
            "amount": 2,
        },
    )

    assert response.status_code == 200
    assert response.json()["creatures_inside"] == 3

    db.refresh(portal)

    assert portal.creatures_inside == 3

    db.close()


def test_closed_portal_cannot_manage_creatures():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-CLOSED-CREATURES",
        name="Closed Creature Test",
        destination_world="Test World",
        energy=50,
        stability=70,
        creatures_inside=2,
        status="CLOSED",
        collapse_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-CLOSED-CREATURES/actions",
        json={
            "action": "add_creatures",
            "amount": 1,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "error": "Управлять существами можно только у открытого портала"
    }

    db.close()


def test_stabilize_portal_updates_parameters():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-STABILIZE",
        name="Stabilize Test",
        destination_world="Test World",
        energy=80,
        stability=60,
        creatures_inside=0,
        status="OPEN",
        collapse_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-STABILIZE/actions",
        json={"action": "stabilize"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "STABILIZED"
    assert data["stability"] == 80
    assert data["energy"] == 74

    db.refresh(portal)

    assert portal.stability == 80
    assert portal.energy == 74

    db.close()


def test_reopen_collapsed_portal_worsens_parameters():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-REOPEN",
        name="Reopen Test",
        destination_world="Test World",
        energy=80,
        stability=70,
        creatures_inside=0,
        status="COLLAPSED",
        collapse_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-REOPEN/actions",
        json={"action": "open"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "OPEN"
    assert data["stability"] == 50
    assert data["energy"] == 86

    db.refresh(portal)

    assert portal.status == "OPEN"
    assert portal.stability == 50
    assert portal.energy == 86

    db.close()


def test_reopen_collapsed_portal_clamps_low_energy():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-REOPEN-LOW-ENERGY",
        name="Low Energy Test",
        destination_world="Test World",
        energy=7,
        stability=30,
        creatures_inside=0,
        status="COLLAPSED",
        collapse_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-REOPEN-LOW-ENERGY/actions",
        json={"action": "open"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "OPEN"
    assert data["energy"] == 0
    assert data["energy"] >= 0
    assert data["collapse_at"]
    assert data["risk"] is not None
    assert data["risk_level"] is not None

    db.refresh(portal)

    assert portal.status == "OPEN"
    assert portal.energy == 0

    db.close()


def test_closed_portal_has_no_risk():
    db = SessionLocal()

    portal = Portal(
        code="P-TEST-CLOSED-RISK",
        name="Closed Risk Test",
        destination_world="Test World",
        energy=100,
        stability=30,
        creatures_inside=0,
        status="OPEN",
        collapse_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    db.add(portal)
    db.commit()

    response = client.post(
        "/portals/P-TEST-CLOSED-RISK/actions",
        json={"action": "close"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "CLOSED"
    assert response.json()["risk"] is None
    assert response.json()["risk_level"] is None

    db.close()