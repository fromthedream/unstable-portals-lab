import pytest

from backend.app.database import SessionLocal
from backend.app.models import Portal


@pytest.fixture(autouse=True)
def cleanup_test_portals():
    yield

    db = SessionLocal()

    test_portals = (
        db.query(Portal)
        .filter(Portal.code.like("P-TEST-%"))
        .all()
    )

    for portal in test_portals:
        db.delete(portal)

    db.commit()
    db.close()