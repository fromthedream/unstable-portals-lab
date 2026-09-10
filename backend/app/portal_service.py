from datetime import datetime, timezone
from .models import Event, Portal

from .calculations import (
    calculate_risk,
    calculate_urgency,
    get_risk_level,
)
from .models import Portal


def get_minutes_remaining(portal: Portal) -> float:
    collapse_at = portal.collapse_at

    if collapse_at.tzinfo is None:
        collapse_at = collapse_at.replace(tzinfo=timezone.utc)

    remaining_seconds = (
        collapse_at - datetime.now(timezone.utc)
    ).total_seconds()

    return max(0, remaining_seconds / 60)


def get_recommendation(status: str, risk_level: str) -> str:
    if status in {"CLOSED", "COLLAPSED"}:
        return "Портал закрыт"

    recommendations = {
        "CRITICAL": "Немедленно стабилизировать",
        "HIGH": "Рекомендуется стабилизировать",
        "MEDIUM": "Рекомендуется наблюдение",
        "LOW": "Портал стабилен, вмешательство не требуется",
    }

    return recommendations[risk_level]


def get_portal_state(portal: Portal) -> dict:
    """Build the API view of a portal, including its current risk state."""
    minutes_remaining = get_minutes_remaining(portal)

    if portal.status in {"CLOSED", "COLLAPSED"}:
        risk = None
        risk_level = None
        urgency = None
    else:
        urgency = calculate_urgency(minutes_remaining)

        risk = calculate_risk(
            energy=portal.energy,
            stability=portal.stability,
            minutes_remaining=minutes_remaining,
        )

        risk_level = get_risk_level(risk)

    recommendation = get_recommendation(
        portal.status,
        risk_level,
    )

    return {
        "id": portal.code,
        "portal_instance_id": portal.id,
        "name": portal.name,
        "destination_world": portal.destination_world,
        "energy": portal.energy,
        "stability": portal.stability,
        "creatures_inside": portal.creatures_inside,
        "status": portal.status,
        "collapse_at": portal.collapse_at.isoformat() + "Z",
        "time_to_collapse": round(minutes_remaining, 1),
        "urgency": urgency,
        "risk": round(risk, 1) if risk is not None else None,
        "risk_level": risk_level,
        "recommendation": recommendation,
    }
def update_expired_portals(db):
    """Move active portals past collapse_at to COLLAPSED and log the change."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expired_portals = (
        db.query(Portal)
        .filter(
            Portal.status.notin_(["CLOSED", "COLLAPSED"]),
            Portal.collapse_at <= now,
        )
        .all()
    )

    for portal in expired_portals:
        portal.status = "COLLAPSED"

        event = Event(
            portal_id=portal.id,
            portal_code=portal.code,
            action="Портал схлопнулся",
        )

        db.add(event)

    if expired_portals:
        db.commit()