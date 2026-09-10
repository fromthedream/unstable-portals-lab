from datetime import datetime, timedelta, timezone
import random

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, or_, text
from sqlalchemy.orm import Session

from .portal_service import get_portal_state, update_expired_portals

from .calculations import calculate_collapse_minutes
from .database import Base, SessionLocal, engine
from .models import CreatureBank, Event, Portal
from .schemas import PortalAction, PortalCreate

Base.metadata.create_all(bind=engine)

if "portal_code" not in {
    column["name"] for column in inspect(engine).get_columns("events")
}:
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE events ADD COLUMN portal_code VARCHAR(10)")
        )

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5173",
        "http://localhost:5174",
        "https://unstable-portals-lab.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def get_creature_bank(db: Session) -> CreatureBank:
    """Return the singleton Creature Bank, creating it on first access."""
    bank = db.query(CreatureBank).filter(CreatureBank.id == 1).first()

    if bank is None:
        bank = CreatureBank(id=1, free_creatures=20)
        db.add(bank)
        db.flush()

    return bank


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/portals")
def create_portal(
    portal_data: PortalCreate,
    db: Session = Depends(get_db),
):
    """Create a portal while allocating the first free public code."""
    energy = random.randint(30, 100)
    stability = random.randint(30, 80)
    bank = get_creature_bank(db)
    creatures_inside = min(random.randint(0, 5), bank.free_creatures)
    bank.free_creatures -= creatures_inside

    collapse_minutes = calculate_collapse_minutes(
        energy=energy,
        stability=stability,
    )

    existing_codes = {
        code
        for (code,) in db.query(Portal.code).all()
    }
    portal_number = 1

    while f"P-{portal_number:03d}" in existing_codes:
        portal_number += 1

    portal_code = f"P-{portal_number:03d}"
    current_instance_ids = [
        instance_id
        for (instance_id,) in db.query(Portal.id).all()
    ]
    historical_instance_ids = [
        instance_id
        for (instance_id,) in db.query(Event.portal_id).all()
        if instance_id is not None
    ]
    next_instance_id = max(
        [*current_instance_ids, *historical_instance_ids],
        default=0,
    ) + 1

    portal = Portal(
        id=next_instance_id,
        code=portal_code,
        name=portal_data.name,
        destination_world=portal_data.destination_world,
        energy=energy,
        stability=stability,
        creatures_inside=creatures_inside,
        status="OPEN",
        collapse_at=datetime.now(timezone.utc)
        + timedelta(minutes=collapse_minutes),
    )

    db.add(portal)
    db.flush()

    event = Event(
        portal_id=portal.id,
        portal_code=portal.code,
        action="Портал создан",
    )

    db.add(event)
    db.commit()
    db.refresh(portal)

    return {
        "id": portal.code,
        "portal_instance_id": portal.id,
        "name": portal.name,
        "destination_world": portal.destination_world,
        "energy": portal.energy,
        "stability": portal.stability,
        "creatures_inside": portal.creatures_inside,
        "status": portal.status,
        "collapse_at": portal.collapse_at,
}
@app.get("/portals")
def get_portals(db: Session = Depends(get_db)):
    update_expired_portals(db)

    portals = (
        db.query(Portal)
        .order_by(Portal.id.asc())
        .all()
    )

    return [
        get_portal_state(portal)
        for portal in portals
    ]


@app.get("/creatures")
def get_creature_stock(db: Session = Depends(get_db)):
    bank = get_creature_bank(db)
    db.commit()
    return {"free_creatures": bank.free_creatures}
@app.get("/events")
def get_events(db: Session = Depends(get_db)):
    """Return event history, including events whose portal was deleted."""
    events = (
        db.query(Event, Portal.code)
        .outerjoin(Portal, Event.portal_id == Portal.id)
        .filter(or_(Event.portal_code.isnot(None), Portal.id.isnot(None)))
        .order_by(Event.created_at.desc())
        .all()
    )

    return [
        {
            "timestamp": (
                event.created_at.replace(tzinfo=timezone.utc)
                if event.created_at.tzinfo is None
                else event.created_at.astimezone(timezone.utc)
            ).isoformat(),
            "portal_id": event.portal_code or portal_code,
            "portal_instance_id": event.portal_id,
            "action": event.action,
        }
        for event, portal_code in events
    ]
@app.post("/portals/{code}/actions")
def portal_action(
    code: str,
    action_data: PortalAction,
    db: Session = Depends(get_db),
):
    """Apply a validated portal action and persist its event."""
    portal = (
        db.query(Portal)
        .filter(Portal.code == code)
        .first()
    )

    if portal is None:
        return {
            "error": "Портал не найден"
        }

    action = action_data.action

    if action == "delete":
        # Save the event before deletion; portal_code keeps it visible afterward.
        event = Event(
            portal_id=portal.id,
            portal_code=portal.code,
            action="Портал удалён",
        )

        db.add(event)
        db.delete(portal)
        db.commit()

        return {
            "id": code,
            "status": "DELETED",
        }

    # Управление существами
    if action in {"add_creatures", "remove_creatures"}:
        if portal.status not in {
            "OPEN",
            "STABILIZED",
            "OBSERVATION",
            "QUESTIONABLE",
        }:
            return {
                "error": "Управлять существами можно только у открытого портала"
            }

        if action_data.amount <= 0:
            return {
                "error": "Количество существ должно быть больше нуля"
            }

        bank = get_creature_bank(db)

        if action == "add_creatures":
            if bank.free_creatures < action_data.amount:
                return {
                    "error": "В общем запасе недостаточно существ"
                }

            bank.free_creatures -= action_data.amount
            portal.creatures_inside += action_data.amount

            event_message = (
                f"В портал добавлено существ: {action_data.amount}"
            )

        else:
            if action_data.amount > portal.creatures_inside:
                return {
                    "error": (
                        "Нельзя извлечь больше существ, "
                        "чем находится в портале"
                    )
                }

            portal.creatures_inside -= action_data.amount
            bank.free_creatures += action_data.amount

            event_message = (
                f"Из портала извлечено существ: {action_data.amount}"
            )

        event = Event(
            portal_id=portal.id,
            portal_code=portal.code,
            action=event_message,
        )

        db.add(event)
        db.commit()
        db.refresh(portal)

        return get_portal_state(portal)

    # Переходы между состояниями
    transitions = {
        "OPEN": {
            "stabilize": "STABILIZED",
            "observe": "OBSERVATION",
            "questionable": "QUESTIONABLE",
            "close": "CLOSED",
        },
        "STABILIZED": {
            "observe": "OBSERVATION",
            "questionable": "QUESTIONABLE",
            "close": "CLOSED",
        },
        "OBSERVATION": {
            "stabilize": "STABILIZED",
            "questionable": "QUESTIONABLE",
            "close": "CLOSED",
        },
        "QUESTIONABLE": {
            "stabilize": "STABILIZED",
            "observe": "OBSERVATION",
            "close": "CLOSED",
        },
        "CLOSED": {
            "open": "OPEN",
        },
        "COLLAPSED": {
            "open": "OPEN",
        },
    }

    new_status = transitions.get(
        portal.status,
        {},
    ).get(action)

    if new_status is None:
        return {
            "error": "Это действие недоступно для текущего состояния портала"
        }

    if action == "observe":
        current_state = get_portal_state(portal)

        if current_state["risk_level"] == "CRITICAL":
            return {
                "error": (
                    "Нельзя отправить критический портал под наблюдение. "
                    "Требуется стабилизация."
                )
            }

    # Закрытие портала с существами требует подтверждения
    if action == "close" and portal.creatures_inside > 0:
        if not action_data.confirm:
            return {
                "warning": (
                    "В портале находятся существа. "
                    "Для закрытия требуется подтверждение оператора."
                )
            }

    # Стабилизация
    if action == "stabilize":
        portal.stability = min(
            100,
            portal.stability + 20,
        )

        portal.energy = round(
            portal.energy + (50 - portal.energy) * 0.2
        )

        collapse_minutes = calculate_collapse_minutes(
            energy=portal.energy,
            stability=portal.stability,
        )

        portal.collapse_at = (
            datetime.now(timezone.utc)
            + timedelta(minutes=collapse_minutes)
        )

    # Открытие закрытого или схлопнувшегося портала
    if action == "open":
        if portal.status == "COLLAPSED":
            portal.stability = max(
                30,
                portal.stability - 20,
            )

            portal.energy = max(
                0,
                round(portal.energy + (portal.energy - 50) * 0.2),
            )

        collapse_minutes = calculate_collapse_minutes(
            energy=portal.energy,
            stability=portal.stability,
        )

        portal.collapse_at = (
            datetime.now(timezone.utc)
            + timedelta(minutes=collapse_minutes)
        )

    portal.status = new_status

    event_messages = {
        "stabilize": "Портал стабилизирован",
        "observe": "Портал переведён под наблюдение",
        "questionable": "Портал помечен как требующий внимания",
        "close": "Портал закрыт",
        "open": "Портал открыт",
    }

    event = Event(
        portal_id=portal.id,
        portal_code=portal.code,
        action=event_messages[action],
    )

    db.add(event)
    db.commit()
    db.refresh(portal)

    return get_portal_state(portal)