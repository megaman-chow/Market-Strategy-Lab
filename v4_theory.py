"""
V4 Unified Field Theory — Symbolic Research Scaffold

Requirements:
    pip install sympy

Run:
    python v4_theory.py

This records the original equation, provides a normalized comparison
action, audits engineering dimensions, and demonstrates a scalar-field
Euler–Lagrange derivation.

It is a research scaffold, not a completed or validated unified theory.
"""

from dataclasses import dataclass
from typing import Dict, List, Tuple

import sympy as sp


# ================================================================
# 1. V4 FIELD REGISTRY
# ================================================================

@dataclass(frozen=True)
class FieldDefinition:
    symbol: str
    meaning: str
    mass_dimension: sp.Rational
    status: str


FIELD_REGISTRY = (
    FieldDefinition(
        "g_mu_nu", "Spacetime metric",
        sp.Rational(0), "Required geometry"
    ),
    FieldDefinition(
        "R", "Ricci scalar / spacetime curvature",
        sp.Rational(2), "Present in source equation"
    ),
    FieldDefinition(
        "F_mu_nu", "Unspecified gauge-field strength",
        sp.Rational(2), "Definition required"
    ),
    FieldDefinition(
        "G_mu_nu", "Unspecified gauge-field strength",
        sp.Rational(2), "Definition required"
    ),
    FieldDefinition(
        "W_mu_nu", "Unspecified gauge-field strength",
        sp.Rational(2), "Definition required"
    ),
    FieldDefinition(
        "psi_i", "Fermion fields",
        sp.Rational(3, 2), "Representations required"
    ),
    FieldDefinition(
        "H", "Scalar / Higgs-like field",
        sp.Rational(1), "Representation required"
    ),
    FieldDefinition(
        "lambda_ij", "Yukawa-like coupling matrix",
        sp.Rational(0), "Index structure required"
    ),
)


# ================================================================
# 2. ORIGINAL V4 EQUATION
# ================================================================

# These symbols stand for the contractions and terms in the image.
R, F2, G2, W2 = sp.symbols(
    "R F2 G2 W2", real=True
)

K_fermion, K_higgs, V_higgs, Y_yukawa = sp.symbols(
    "K_fermion K_higgs V_higgs Y_yukawa",
    real=True
)

# Original Lagrangian density, retaining the equation's structure:
#
# L = R - F_mu_nu F^mu_nu - G_mu_nu G^mu_nu
#       - W_mu_nu W^mu_nu
#       + sum_i psi_bar_i D psi_i
#       + (D_mu H)^dagger D^mu H
#       - V(H)
#       - lambda_ij psi_bar_i H psi_j

ORIGINAL_LAGRANGIAN_DENSITY = (
    R
    - F2
    - G2
    - W2
    + K_fermion
    + K_higgs
    - V_higgs
    - Y_yukawa
)


# ================================================================
# 3. NORMALIZED COMPARISON ACTION
# ================================================================

# Natural units: hbar = c = 1.
#
# This comparison action uses conventional Standard Model gauge
# groups. It does NOT assume that F, G and W in the original
# equation have already been identified with these fields.

Mpl, Lambda = sp.symbols(
    "M_Pl Lambda", positive=True, real=True
)

B2, W_SM2, G_SM2 = sp.symbols(
    "B2 W_SM2 G_SM2", real=True
)

K_fermion_std, K_higgs_std = sp.symbols(
    "K_fermion_std K_higgs_std", real=True
)

V_higgs_std, L_yukawa_std = sp.symbols(
    "V_higgs_std L_yukawa_std", real=True
)

BASELINE_LAGRANGIAN_DENSITY = (
    (Mpl**2 / 2) * (R - 2 * Lambda)
    - sp.Rational(1, 4) * B2
    - sp.Rational(1, 4) * W_SM2
    - sp.Rational(1, 4) * G_SM2
    + K_fermion_std
    + K_higgs_std
    - V_higgs_std
    - L_yukawa_std
)


# ================================================================
# 4. FOUR-DIMENSIONAL MASS-DIMENSION AUDIT
# ================================================================

# In four dimensions, a conventional Lagrangian density has
# engineering mass dimension 4.
#
# [R] = 2
# [field strength squared] = 4
# [fermion] = 3/2
# [H] = 1
# [D_mu] = 1

DIMENSIONS: Dict[sp.Symbol, sp.Rational] = {
    R: sp.Rational(2),
    F2: sp.Rational(4),
    G2: sp.Rational(4),
    W2: sp.Rational(4),
    K_fermion: sp.Rational(4),
    K_higgs: sp.Rational(4),
    V_higgs: sp.Rational(4),
    Y_yukawa: sp.Rational(4),

    Mpl: sp.Rational(1),
    Lambda: sp.Rational(2),

    B2: sp.Rational(4),
    W_SM2: sp.Rational(4),
    G_SM2: sp.Rational(4),
    K_fermion_std: sp.Rational(4),
    K_higgs_std: sp.Rational(4),
    V_higgs_std: sp.Rational(4),
    L_yukawa_std: sp.Rational(4),
}


def dimension_of_monomial(expr):
    """Return a monomial's engineering mass dimension."""

    expr = sp.sympify(expr)

    if expr.is_Number:
        return sp.Rational(0)

    if expr.is_Symbol:
        return DIMENSIONS.get(expr)

    if expr.is_Mul:
        dimensions = [
            dimension_of_monomial(arg)
            for arg in expr.args
        ]

        if any(d is None for d in dimensions):
            return None

        return sum(dimensions, sp.Rational(0))

    if expr.is_Pow and expr.exp.is_Number:
        base_dimension = dimension_of_monomial(expr.base)

        if base_dimension is None:
            return None

        return base_dimension * expr.exp

    return None


def check_term_dimensions(terms):
    """Report dimensions for individual action-density terms."""

    results = []

    for label, term in terms:
        dimension = dimension_of_monomial(term)

        if dimension is None:
            results.append(
                f"{label}: dimension unknown"
            )
        elif dimension != 4:
            results.append(
                f"{label}: dimension {dimension}; expected 4"
            )
        else:
            results.append(
                f"{label}: OK (dimension 4)"
            )

    return results


ORIGINAL_TERMS = [
    ("R", R),
    ("-F_mu_nu F^mu_nu", -F2),
    ("-G_mu_nu G^mu_nu", -G2),
    ("-W_mu_nu W^mu_nu", -W2),
    ("Fermion kinetic term", K_fermion),
    ("Higgs kinetic term", K_higgs),
    ("-V(H)", -V_higgs),
    ("-Yukawa term", -Y_yukawa),
]

BASELINE_TERMS = [
    ("M_Pl^2 R / 2", Mpl**2 * R / 2),
    ("-M_Pl^2 Lambda", -Mpl**2 * Lambda),
    ("-B^2 / 4", -B2 / 4),
    ("-W^2 / 4", -W_SM2 / 4),
    ("-G^2 / 4", -G_SM2 / 4),
    ("Fermion kinetic term", K_fermion_std),
    ("Higgs kinetic term", K_higgs_std),
    ("-V(H)", -V_higgs_std),
    ("-Yukawa interaction", -L_yukawa_std),
]


# ================================================================
# 5. EULER–LAGRANGE EQUATION
# ================================================================

def euler_lagrange_density(lagrangian, field, coordinates):
    """
    Compute the Euler–Lagrange expression:

        dL/d(field) - sum_mu d_mu[dL/d(d_mu field)]

    This helper works for explicit scalar fields and first
    derivatives. It is not a general tensor or spinor engine.
    """

    result = sp.diff(lagrangian, field)

    for coordinate in coordinates:
        field_derivative = sp.diff(field, coordinate)

        result -= sp.diff(
            sp.diff(lagrangian, field_derivative),
            coordinate
        )

    return sp.simplify(result)


def scalar_field_demo():
    """
    Illustrative scalar-field calculation.

    This is a real scalar demonstration, NOT the complete complex
    Higgs doublet in the original V4 equation.

    V(h) = m^2 h^2 / 2 + lambda_h h^4 / 4

    Metric signature: (-, +, +, +).
    """

    t, x, y, z = sp.symbols(
        "t x y z", real=True
    )

    coordinates = (t, x, y, z)

    h = sp.Function("h")(*coordinates)

    m2, lambda_h = sp.symbols(
        "m2 lambda_h", real=True
    )

    metric = sp.diag(-1, 1, 1, 1)

    derivatives = [
        sp.diff(h, coordinate)
        for coordinate in coordinates
    ]

    kinetic = -sp.Rational(1, 2) * sum(
        metric[i, i] * derivatives[i]**2
        for i in range(4)
    )

    potential = (
        sp.Rational(1, 2) * m2 * h**2
        + sp.Rational(1, 4) * lambda_h * h**4
    )

    lagrangian = kinetic - potential

    equation = euler_lagrange_density(
        lagrangian,
        h,
        coordinates
    )

    return lagrangian, potential, sp.factor(equation)


# ================================================================
# 6. RUN THE V4 RESEARCH MODULE
# ================================================================

def main():
    print("=" * 60)
    print("V4 — UNIFIED FIELD THEORY")
    print("Symbolic Research Scaffold")
    print("=" * 60)

    print("\n1. Original equation's Lagrangian density:")
    print(sp.pretty(ORIGINAL_LAGRANGIAN_DENSITY))

    print("\nOriginal equation in LaTeX:")
    print(sp.latex(ORIGINAL_LAGRANGIAN_DENSITY))

    print("\n2. Original equation: dimensional audit")

    for result in check_term_dimensions(ORIGINAL_TERMS):
        print("  ", result)

    print("\n3. Normalized comparison baseline:")
    print(sp.pretty(BASELINE_LAGRANGIAN_DENSITY))

    print("\n4. Baseline: dimensional audit")

    for result in check_term_dimensions(BASELINE_TERMS):
        print("  ", result)

    lagrangian, potential, equation = scalar_field_demo()

    print("\n5. Scalar-field example")
    print("\nLagrangian:")
    print(sp.pretty(lagrangian))

    print("\nPotential:")
    print(sp.pretty(potential))

    print("\nEuler–Lagrange equation (set expression equal to zero):")
    print(sp.pretty(equation))

    print("\n6. Next theory-development requirements")
    print("  - Define F, G and W and their gauge groups.")
    print("  - Specify field representations and covariant derivatives.")
    print("  - Fix metric, sign and normalization conventions.")
    print("  - Derive the full tensor, gauge and spinor field equations.")

    print(
        "\nThis code formalizes a starting point; "
        "it does not establish a new physical theory."
    )


if __name__ == "__main__":
    main()