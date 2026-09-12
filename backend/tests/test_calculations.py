import pytest

from backend.app.calculations import (
    calculate_collapse_minutes,
    calculate_risk,
    calculate_urgency,
    get_risk_level,
)


# Проверяет базовый расчёт риска.
def test_risk_calculation():
    risk = calculate_risk(
        energy=50,
        stability=50,
        minutes_remaining=20,
    )

    assert risk == pytest.approx(54.1666667)


# Проверяет рост риска при низкой энергии.
def test_low_energy_increases_risk():
    low_energy_risk = calculate_risk(
        energy=0,
        stability=50,
        minutes_remaining=20,
    )
    normal_energy_risk = calculate_risk(
        energy=50,
        stability=50,
        minutes_remaining=20,
    )

    assert low_energy_risk > normal_energy_risk


# Проверяет рост риска при высокой энергии.
def test_high_energy_increases_risk():
    high_energy_risk = calculate_risk(
        energy=100,
        stability=50,
        minutes_remaining=20,
    )
    normal_energy_risk = calculate_risk(
        energy=50,
        stability=50,
        minutes_remaining=20,
    )

    assert high_energy_risk > normal_energy_risk


# Проверяет расчёт времени до коллапса.
def test_collapse_time_calculation():
    minutes = calculate_collapse_minutes(
        energy=50,
        stability=100,
    )

    assert minutes == 15.0


# Проверяет изменение срочности в зависимости от времени.
def test_urgency_changes_with_time():
    assert calculate_urgency(45) == 25
    assert calculate_urgency(20) == 50
    assert calculate_urgency(8) == 75
    assert calculate_urgency(3) == 100


# Проверяет соответствие риска уровням опасности.
def test_risk_level():
    assert get_risk_level(20) == "LOW"
    assert get_risk_level(40) == "MEDIUM"
    assert get_risk_level(70) == "HIGH"
    assert get_risk_level(90) == "CRITICAL"