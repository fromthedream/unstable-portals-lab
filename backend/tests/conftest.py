import pytest

from backend.app.database import SessionLocal
from backend.app.models import Event, Portal


@pytest.fixture(autouse=True)
def cleanup_test_portals():
    db = SessionLocal()

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

    db.query(Event).filter(
        Event.portal_code.like("P-TEST-%"),
    ).delete()

    db.commit()
    db.close()