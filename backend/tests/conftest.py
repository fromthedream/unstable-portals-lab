import pytest

from backend.app.database import SessionLocal
from backend.app.models import CreatureBank, Event, Portal


@pytest.fixture(autouse=True)
def cleanup_test_portals():
    db = SessionLocal()
    bank = db.query(CreatureBank).filter(CreatureBank.id == 1).first()
    original_free_creatures = (
        bank.free_creatures
        if bank is not None
        else 20
    )

    db.query(Event).filter(
        Event.portal_code.like("P-TEST-%"),
    ).delete()
    db.commit()
    db.close()

    yield

    db = SessionLocal()

    test_portals = (
        db.query(Portal)
        .filter(Portal.code.like("P-TEST-%"))
        .all()
    )

    for portal in test_portals:
        db.delete(portal)

    bank = db.query(CreatureBank).filter(CreatureBank.id == 1).first()
    if bank is None:
        db.add(CreatureBank(id=1, free_creatures=original_free_creatures))
    else:
        bank.free_creatures = original_free_creatures

    db.query(Event).filter(
        Event.portal_code.like("P-TEST-%"),
    ).delete()

    db.commit()
    db.close()