def calculate_urgency(minutes_remaining: float) -> int:
    if minutes_remaining > 60:
        return 0
    if minutes_remaining > 30:
        return 25
    if minutes_remaining > 10:
        return 50
    if minutes_remaining > 5:
        return 75
    return 100


def calculate_risk(
    energy: int,
    stability: int,
    minutes_remaining: float,
) -> float:
    """Calculate risk from instability, energy deviation, and time pressure."""
    instability = 100 - stability
    energy_pressure = min(
        100,
        50 + abs(energy - 50),
    )
    time_pressure = max(
        0,
        min(100, 100 - minutes_remaining / 60 * 100),
    )

    return (
        0.45 * instability
        + 0.30 * energy_pressure
        + 0.25 * time_pressure
    )


def get_risk_level(risk: float) -> str:
    if risk < 30:
        return "LOW"
    if risk < 60:
        return "MEDIUM"
    if risk < 80:
        return "HIGH"
    return "CRITICAL"


def calculate_collapse_minutes(
    energy: int,
    stability: int,
) -> float:
    minutes = (
        10
        + (stability - 50) * 0.1
        - abs(energy - 50) * 0.15
    )

    return max(5, min(20, minutes))