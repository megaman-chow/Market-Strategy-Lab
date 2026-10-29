
"""
V4 Unified Field Theory — Matter Sector
Version 0.4

Install:
    python -m pip install sympy

Run:
    python v4_matter.py
    python v4_matter.py --self-test

This module derives a scalar-field equation coupled to a
fermion-bilinear source and prints the corresponding Dirac equation.

The scalar example is a toy model. The complete V4 Higgs doublet,
fermion representations and gauge interactions remain to be defined.
"""

import argparse
import sympy as sp


# ============================================================
# 1. SPACETIME CONVENTIONS
# ============================================================

t, x, y, z = sp.symbols("t x y z", real=True)

COORDS = (t, x, y, z)

# Metric signature (+---).
ETA = sp.diag(1, -1, -1, -1)


# ============================================================
# 2. SCALAR FIELD AND POTENTIAL
# ============================================================

h = sp.Function("h")(*COORDS)

m_h_squared, lambda_h, y_coupling = sp.symbols(
    "m_h_squared lambda_h y_coupling",
    real=True,
)

# The fermion bilinear is treated as an independent source.
fermion_bilinear = sp.Symbol(
    "bar_psi_psi",
    real=True,
)

# V(h) = (1/2) m_h^2 h^2 + (1/4) lambda_h h^4
V_h = (
    sp.Rational(1, 2) * m_h_squared * h**2
    + sp.Rational(1, 4) * lambda_h * h**4
)


# ============================================================
# 3. BUILD THE TOY MATTER LAGRANGIAN
# ============================================================

# L = 1/2 partial_mu h partial^mu h
#     - V(h)
#     - y_coupling * h * bar_psi * psi

kinetic_h = sp.Rational(1, 2) * sum(
    ETA[mu, mu] * sp.diff(h, COORDS[mu])**2
    for mu in range(4)
)

L_h = (
    kinetic_h
    - V_h
    - y_coupling * h * fermion_bilinear
)


# ============================================================
# 4. EULER-LAGRANGE DERIVATION
# ============================================================

def euler_lagrange_density(lagrangian, field):
    """
    Calculate:
        dL/dh - partial_mu[dL/d(partial_mu h)]

    The equation of motion is the resulting expression = 0.
    """

    result = sp.diff(lagrangian, field)

    for coordinate in COORDS:
        field_derivative = sp.diff(field, coordinate)

        result -= sp.diff(
            sp.diff(lagrangian, field_derivative),
            coordinate,
        )

    return sp.simplify(result)


# The conventional Euler-Lagrange expression is negative
# the displayed equation below. Multiplying an equation by
# -1 does not change its solutions.

euler_lagrange_h = euler_lagrange_density(L_h, h)

box_h = sum(
    ETA[mu, mu] * sp.diff(h, COORDS[mu], 2)
    for mu in range(4)
)

scalar_equation = sp.simplify(-euler_lagrange_h)

expected_scalar_equation = (
    box_h
    + m_h_squared * h
    + lambda_h * h**3
    + y_coupling * fermion_bilinear
)


# ============================================================
# 5. HIGGS-DOUBLEt EQUATION: GENERAL COVARIANT FORM
# ============================================================

HIGGS_DOUBLEt_EQUATION = (
    "D_mu D^mu H + dV/dH^dagger "
    "+ dYukawaDensity/dH^dagger = 0"
)

# Here YukawaDensity denotes the interaction expression
# subtracted from the Lagrangian, including its conjugate
# terms as appropriate for the chosen fermion representations.
#
# This is a formal equation, not a completed component-level
# derivation. Its source terms require explicit representations.


# ============================================================
# 6. DIRAC EQUATION: TOY FERMION SECTOR
# ============================================================

DIRAC_EQUATION = (
    "(i gamma^mu D_mu - m_f - y_coupling*h) psi = 0"
)

# The gamma matrices, spinor components and gauge-covariant
# derivatives are not expanded by this scalar-sector module.


# ============================================================
# 7. REPORT AND TESTS
# ============================================================

def self_test():
    residual = sp.simplify(
        scalar_equation - expected_scalar_equation
    )

    assert residual == 0, (
        "Scalar Euler-Lagrange equation did not match "
        "the expected expression."
    )

    print("V4 matter-sector self-test passed.")
    print("Scalar equation matches the expected Euler-Lagrange result.")


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Verify the scalar-field derivation.",
    )

    args = parser.parse_args()

    print("V4 — Matter Sector")
    print("==================")

    print("\nScalar potential V(h):")
    print(sp.pretty(V_h))

    print("\nToy scalar Lagrangian:")
    print(sp.pretty(L_h))

    print("\nScalar equation of motion (set equal to zero):")
    print(sp.pretty(scalar_equation))

    print("\nEquivalent covariant form:")
    print(
        "Box(h) + m_h_squared*h "
        "+ lambda_h*h**3 "
        "+ y_coupling*bar_psi_psi = 0"
    )

    print("\nFormal Higgs-doublet equation:")
    print(HIGGS_DOUBLEt_EQUATION)

    print("\nFormal toy fermion equation:")
    print(DIRAC_EQUATION)

    print(
        "\nScope: the scalar equation is derived symbolically. "
        "The full Higgs doublet and spinor equations still require "
        "explicit gauge and representation definitions."
    )

    if args.self_test:
        self_test()


if __name__ == "__main__":
    main()
