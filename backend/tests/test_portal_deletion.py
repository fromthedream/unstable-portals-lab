from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import CreatureBank, Event, Portal


client = TestClient(app)


@pytest.fixture
def isolated_portals():
    db = SessionLocal()
    original_portals = [
        {
            column.name: getattr(portal, column.name)
            for column in Portal.__table__.columns
        }
        for portal in db.query(Portal).all()
    ]
    original_event_ids = {
        event.id
        for event in db.query(Event.id).all()
    }
    original_bank = db.query(CreatureBank).filter(CreatureBank.id == 1).first()
    original_free_creatures = (
        original_bank.free_creatures
        if original_bank is not None
        else 20
    )

    db.query(Portal).delete(synchronize_session=False)
    db.commit()
    db.close()

    yield

    db = SessionLocal()
    db.query(Portal).delete(synchronize_session=False)
    if original_event_ids:
        db.query(Event).filter(
            ~Event.id.in_(original_event_ids)
        ).delete(synchronize_session=False)
    bank = db.query(CreatureBank).filter(CreatureBank.id == 1).first()
    if bank is None:
        db.add(CreatureBank(id=1, free_creatures=original_free_creatures))
    else:
        bank.free_creatures = original_free_creatures
    db.bulk_insert_mappings(Portal, original_portals)
    db.commit()
    db.close()


def add_portal(db, code: str) -> Portal:
    portal = Portal(
        code=code,
        name=f"Portal {code}",
        destination_world="Test World",
        energy=50,
        stability=70,
        creatures_inside=0,
        status="OPEN",
        collapse_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(portal)
    db.commit()
    db.refresh(portal)
    return portal


def test_delete_portal_saves_deletion_event(isolated_portals):
    db = SessionLocal()
    portal = add_portal(db, "P-TEST-DELETE")

    response = client.post(
        "/portals/P-TEST-DELETE/actions",
        json={"action": "delete"},
    )

    assert response.json() == {
        "id": "P-TEST-DELETE",
        "status": "DELETED",
    }
    assert db.query(Portal).filter(Portal.id == portal.id).first() is None

    events = client.get("/events").json()
    assert any(
        event["portal_id"] == "P-TEST-DELETE"
        and event["action"] == "Портал удалён"
        for event in events
    )
    db.close()


def test_deleted_portal_is_absent_from_portals(isolated_portals):
    db = SessionLocal()
    add_portal(db, "P-TEST-ABSENT")

    client.post(
        "/portals/P-TEST-ABSENT/actions",
        json={"action": "delete"},
    )

    portal_codes = {portal["id"] for portal in client.get("/portals").json()}
    assert "P-TEST-ABSENT" not in portal_codes
    db.close()


def test_events_work_after_portal_deletion(isolated_portals):
    db = SessionLocal()
    add_portal(db, "P-TEST-EVENTS")

    client.post(
        "/portals/P-TEST-EVENTS/actions",
        json={"action": "delete"},
    )

    response = client.get("/events")

    assert response.status_code == 200
    assert response.json()
    db.close()


def test_deleted_middle_id_is_reused(isolated_portals):
    db = SessionLocal()
    add_portal(db, "P-001")
    add_portal(db, "P-003")

    response = client.post(
        "/portals",
        json={"name": "Reused", "destination_world": "Test World"},
    )

    assert response.json()["id"] == "P-002"
    db.close()


def test_first_missing_id_is_reused(isolated_portals):
    db = SessionLocal()
    add_portal(db, "P-002")

    response = client.post(
        "/portals",
        json={"name": "First Free", "destination_world": "Test World"},
    )

    assert response.json()["id"] == "P-001"
    db.close()


def test_deleted_portal_history_is_kept_for_global_events(isolated_portals):
    db = SessionLocal()
    add_portal(db, "P-001")
    old_portal = add_portal(db, "P-002")

    client.post(
        "/portals/P-002/actions",
        json={"action": "questionable"},
    )
    client.post(
        "/portals/P-002/actions",
        json={"action": "delete"},
    )

    events = client.get("/events").json()
    old_events = [
        event for event in events
        if event["portal_instance_id"] == old_portal.id
    ]

    assert any(event["action"] == "Портал удалён" for event in old_events)
    db.close()


def test_new_same_code_has_separate_history(isolated_portals):
    db = SessionLocal()
    add_portal(db, "P-001")
    old_portal = add_portal(db, "P-002")

    client.post(
        "/portals/P-002/actions",
        json={"action": "questionable"},
    )
    client.post(
        "/portals/P-002/actions",
        json={"action": "delete"},
    )

    created = client.post(
        "/portals",
        json={"name": "New P-002", "destination_world": "Test World"},
    ).json()
    new_instance_id = created["portal_instance_id"] if "portal_instance_id" in created else None

    new_portal = db.query(Portal).filter(Portal.code == "P-002").first()
    assert new_portal is not None
    assert new_instance_id is None or new_instance_id == new_portal.id

    events = client.get("/events").json()
    new_events = [
        event for event in events
        if event["portal_instance_id"] == new_portal.id
    ]
    old_events = [
        event for event in events
        if event["portal_instance_id"] == old_portal.id
    ]

    assert any(event["action"] == "Портал создан" for event in new_events)
    assert all(event["portal_instance_id"] != old_portal.id for event in new_events)
    assert any(event["action"] == "Портал удалён" for event in old_events)
    db.close()


def test_deleting_last_portal_returns_empty_list(isolated_portals):
    db = SessionLocal()
    add_portal(db, "P-001")

    client.post(
        "/portals/P-001/actions",
        json={"action": "delete"},
    )

    assert client.get("/portals").json() == []
    db.close()