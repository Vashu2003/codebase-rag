"""Service layer that calls into calc — exercises cross-file references."""

from calc import add


def total(items):
    # references `add`, which is defined in calc.py -> a graph edge
    return add(sum(items), 0)
